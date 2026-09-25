-- LANE TRASH-COVERAGE — EVERY KIND A SCREEN ARCHIVES IS RESTORABLE FROM TRASH.
--
-- Owner rule (Arman, 2026-09-20): archive, never delete — and an archive without a restore is a lie.
--
-- THE ONE TRASH. `public.trash_list` / `public.trash_counts` iterate `platform.entity_types` rows
-- with `user_artifact_kind IS NOT NULL AND is_active`, and restore is the generic
-- `public.entity_undelete(token, id)` (clears `deleted_at`, gated by `iam.has_access(..,'editor')`).
-- A kind with `user_artifact_kind` NULL is archived by its screen and then never seen again.
--
-- THE CENSUS (matrx-frontend features/app/components/lib, 2026-09-25): every `.update({deleted_at: …})`
-- traced to its table, joined to the registry. 33 soft-deleted, person-owned (rls_variant entity,
-- not a component) kinds carry no user_artifact_kind — plus `tool` (system variant; the MCP tools
-- admin archives it). Each has the standard shape: uuid `id`, `deleted_at`, `created_by`,
-- `organization_id`. Components (restored through their parent), platform catalogs
-- (ai.provider/endpoint/api/offering/model_alias/setting, esign/web provider, mandate, exemplar,
-- mcp_config) and notification preferences (a setting row revived by re-toggling) are
-- deliberately NOT registered — see PROGRESS-TRASH-COVERAGE.md.
--
-- The kind names reuse each row's own token (no coined vocabulary); two tokens collide with an
-- existing kind or read as another feature's word and are qualified: content.document ->
-- 'content_document' (udt_documents already owns 'document'), crm.party -> 'crm_party'.
--
-- ALSO: code folders were archived with `is_active = false` (no `deleted_at`), so neither Trash
-- nor any restore could see them. The screen now writes `deleted_at` (frontend change, same lane);
-- the one folder archived the old way is moved to the canonical shape here.
--
-- Additive, reversible. INVERSE: migrations/inverse/trashcoverage_every_archived_kind_is_restorable_from_trash_down.sql
-- lane: TRASH-COVERAGE

set local lock_timeout = '30s';

do $up$
declare
  v_n int;
begin
  update platform.entity_types e
     set user_artifact_kind = v.kind
    from (values
      ('pc_show', 'pc_show'),
      ('pc_episode', 'pc_episode'),
      ('pc_studio_run', 'pc_studio_run'),
      ('research_template', 'research_template'),
      ('tool', 'tool'),
      ('assessment', 'assessment'),
      ('study_goal', 'study_goal'),
      ('study_media', 'study_media'),
      ('study_plan', 'study_plan'),
      ('study_session', 'study_session'),
      ('code_file', 'code_file'),
      ('code_folder', 'code_folder'),
      ('user_markdown_sample', 'user_markdown_sample'),
      ('agent_run', 'agent_run'),
      ('web_brand', 'web_brand'),
      ('web_site', 'web_site'),
      ('commerce_certified_printer', 'commerce_certified_printer'),
      ('comparison_set', 'comparison_set'),
      ('crm_deal', 'crm_deal'),
      ('crm_outreach_list', 'crm_outreach_list'),
      ('party', 'crm_party'),
      ('document', 'content_document'),
      ('seo_engine_schedule', 'seo_engine_schedule'),
      ('seo_gsc_dig_rule', 'seo_gsc_dig_rule'),
      ('seo_keyword_class_rule', 'seo_keyword_class_rule'),
      ('plan_entity', 'plan_entity'),
      ('plan_node', 'plan_node'),
      ('fc_card', 'fc_card'),
      ('content_ir_kind_instance', 'content_ir_kind_instance'),
      ('skill_render_definition', 'skill_render_definition'),
      ('interview_session', 'interview_session'),
      ('billing_spend_guardrail', 'billing_spend_guardrail'),
      ('studio_session', 'studio_session')
    ) as v(token, kind)
   where e.token = v.token
     and e.user_artifact_kind is null
     and e.has_soft_delete
     and e.is_active;
  get diagnostics v_n = row_count;
  if v_n <> 33 then
    raise exception 'trashcoverage: expected to register 33 kinds, registered %', v_n;
  end if;

  -- The one code folder archived the old way (is_active=false, no deleted_at) joins the trash.
  update code.code_file_folders
     set deleted_at = coalesce(updated_at, now()), is_active = true
   where id = '6d97f7ee-6e2d-446a-a40b-d518c66c06d1'
     and is_active = false
     and deleted_at is null;
end
$up$;
