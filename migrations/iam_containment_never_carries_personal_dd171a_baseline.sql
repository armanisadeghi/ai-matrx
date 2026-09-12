-- iam_containment_never_carries_personal_dd171a_baseline — THE BEFORE SNAPSHOT AND THE RED (DD-171).
--
-- THE DEFECT, MEASURED LIVE (V-44, reproduced by this lane 2026-09-12 in a rolled-back transaction
-- with the SAME identities, same counts to the row)
-- ---------------------------------------------------------------------------------------------
-- DD-165 walled every STAFF arm behind `visibility >= 'internal'`. It never touched CONTAINMENT.
-- A child row inherits its container's reach with no look at its own visibility, so:
--
--     files.files, rows marked `personal` by somebody else, readable today:
--       plain member  kelvin.kiprop96@gmail.com ....... 8,815
--       org admin     arman@titaniumsuccess.com ....... 9,700
--       platform adm  admin@admin.com ................. 8,994
--     files.folders, same probe: org admin 5
--     through platform.reachability (a row placed inside a container someone else can read):
--       chat.conversation  member 5 / org admin 7 / platform admin 5
--       workbench.notes    member 5 / org admin 10 / platform admin 6
--       files.files        member 2 / org admin 12 / platform admin 6
--
-- The plain member is the proof this is not a staff-door question at all: no admin.admins row, no
-- org-admin role, and 8,815 other people's private files.
--
-- CHAIR RULING (DD-171, 2026-09-12; supersedes the earlier "a chat in a shared room is Rule 9
-- union" note): a row whose `visibility` is `personal` is reachable only by its OWNER and by
-- explicit direct grants ON THAT ROW. Containment carries the container's reach to rows at
-- `internal` and above only — union never widens a personal row.
--
-- THE CENSUS THIS ROUND CLOSES (measured against the live catalogue, 2026-09-12)
-- -----------------------------------------------------------------------------
-- Containment reaches a child in two shapes, and this file records both:
--   1. the PARENT-FK arm `iam.entity_read_expr` emits — 20 active tokens carry a typed
--      `platform.visibility` column AND a composition/containment parent, holding 14,805
--      `personal` rows between them (file 14,780, folder 19, web_site 4, agent 1, task 1);
--   2. the `platform.reachability` conveyance the kernel walks — 5 tokens with a visibility
--      column have `personal` rows sitting inside a container today (file 103, working_document
--      40, fc_card 19, note 14, conversation 12 = 188 rows).
--
-- This file MOVES NOTHING. It records the RED so dd171d can prove RED -> GREEN against numbers
-- that were written down before anything changed, not numbers remembered afterwards.

create table if not exists iam.dd171_containment_baseline (
  phase         text not null,
  token         text not null,
  axis          text not null,           -- 'parent_fk' | 'reachability'
  principal     text not null,
  reads_others_personal bigint not null,
  measured_at   timestamptz not null default now(),
  primary key (phase, token, axis, principal)
);
comment on table iam.dd171_containment_baseline is
  'DD-171 (2026-09-12): rows of other people''s visibility=personal data that each identity could read '
  'through a CONTAINMENT lane, recorded BEFORE the fix and again AFTER it. Written by '
  'iam_containment_never_carries_personal_dd171a_baseline.sql and asserted by …dd171d_gate.sql. '
  'The AFTER phase must be 0 on every row; the BEFORE phase is the exposure that was closed.';

do $$
declare
  i record; r record; v_q text; v_n bigint; v_rows bigint;
begin
  if exists (select 1 from iam.dd171_containment_baseline where phase = 'BEFORE') then
    raise notice 'dd171a: the containment RED is already on record';
  else
    create temp table _dd171_ids(label text, uid uuid) on commit drop;
    insert into _dd171_ids
    select 'platform_admin', u.id from auth.users u where u.email = 'admin@admin.com'
    union all select 'org_admin', u.id from auth.users u where u.email = 'arman@titaniumsuccess.com'
    union all select 'member',    u.id from auth.users u where u.email = 'kelvin.kiprop96@gmail.com'
    union all select 'owner',     u.id from auth.users u where u.email = 'arman@armansadeghi.com';
    if (select count(*) from _dd171_ids) <> 4 then
      raise exception 'dd171a: only % of the 4 forcing identities resolved — an unrun forcing test is not a forcing test',
        (select count(*) from _dd171_ids);
    end if;

    -- AXIS 1 — the parent-FK containment arm.
    for r in
      select et.token, et.schema_name, et.table_name
        from platform.entity_types et
       where et.is_active
         and not coalesce(et.suppress_platform_admin_lane, false)
         and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
         and exists (select 1 from platform.entity_relationships er
                      where er.child_type = et.token and er.kind in ('composition','containment'))
         and exists (select 1 from information_schema.columns c
                      where c.table_schema = et.schema_name and c.table_name = et.table_name
                        and c.column_name = 'visibility' and c.udt_schema = 'platform' and c.udt_name = 'visibility')
       order by et.token
    loop
      select p.qual into v_q from pg_policies p
       where p.schemaname = r.schema_name and p.tablename = r.table_name and p.policyname = 'std_select';
      continue when v_q is null;
      for i in select * from _dd171_ids loop
        perform set_config('request.jwt.claims', json_build_object('sub', i.uid, 'role','authenticated')::text, true);
        execute format(
          'select count(*)::bigint from (select * from %I.%I) s
            where s.visibility = ''personal''::platform.visibility
              and s.created_by is distinct from %L::uuid and (%s)',
          r.schema_name, r.table_name, i.uid, v_q) into v_n;
        insert into iam.dd171_containment_baseline(phase, token, axis, principal, reads_others_personal)
        values ('BEFORE', r.token, 'parent_fk', i.label, v_n);
      end loop;
    end loop;

    -- AXIS 2 — the platform.reachability conveyance.
    for r in
      select distinct rr.item_type as token, et.schema_name, et.table_name
        from platform.reachability rr
        join platform.entity_types et on et.token = rr.item_type and et.is_active
       where to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
         and exists (select 1 from information_schema.columns c
                      where c.table_schema = et.schema_name and c.table_name = et.table_name
                        and c.column_name = 'visibility' and c.udt_schema = 'platform' and c.udt_name = 'visibility')
       order by 1
    loop
      select p.qual into v_q from pg_policies p
       where p.schemaname = r.schema_name and p.tablename = r.table_name and p.policyname = 'std_select';
      continue when v_q is null;
      for i in select * from _dd171_ids loop
        perform set_config('request.jwt.claims', json_build_object('sub', i.uid, 'role','authenticated')::text, true);
        execute format(
          'select count(*)::bigint from (select * from %I.%I) s
            where s.visibility = ''personal''::platform.visibility
              and s.created_by is distinct from %L::uuid
              and exists (select 1 from platform.reachability rr
                           where rr.item_type = %L and rr.item_id = s.id)
              and (%s)',
          r.schema_name, r.table_name, i.uid, r.token, v_q) into v_n;
        insert into iam.dd171_containment_baseline(phase, token, axis, principal, reads_others_personal)
        values ('BEFORE', r.token, 'reachability', i.label, v_n);
      end loop;
    end loop;
    perform set_config('request.jwt.claims', '', true);

    select coalesce(sum(reads_others_personal),0) into v_rows
      from iam.dd171_containment_baseline
     where phase = 'BEFORE' and principal <> 'owner';

    -- A forcing test that finds nothing to close is a broken measurement, not a clean system.
    if v_rows = 0 then
      raise exception 'dd171a: the RED probe found NOTHING readable through containment — either this '
        'is already fixed or the measurement is wrong. Refusing to record a baseline of zero.';
    end if;
    raise notice 'dd171a RED: % (token, axis, identity) readings, % other-people''s personal rows '
      'reachable through containment by the three non-owner identities',
      (select count(*) from iam.dd171_containment_baseline where phase = 'BEFORE'), v_rows;
  end if;
end $$;

-- THE FLEET-WIDE ACCESS BASELINE. The fix lands in iam.has_access_for_base and
-- iam.accessible_entity_ids — the kernel EVERY generated policy calls — so the gate cannot be
-- scoped to the 20 regenerated tokens. Same 179-token cast and same 7 principals DD-165 used, so
-- the two rounds are directly comparable.
do $$
declare
  v_before uuid; v_as timestamptz := now();
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- a second platform admin, info@aimatrx.com
    'c5e92166-e148-4e73-926e-83af0c453665',  -- the member whose personal rows must stay personal
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- organization admin of that member's org, NOT a platform admin
    '392afd39-d59c-4418-866b-451e9d93fead',  -- plain member of the same organization
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- non-member, test@test.com
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['feature_doc','comparison_set','cmp_feedback','agent','agent_exemplar','agent_mandate_note','message_template','agent_prompt_remediation','agent_shortcut','agent_template','ai_api','ai_endpoint','ai_model_alias','ai_model','ai_offering','ai_provider','ai_setting','voice','app','billing_spend_guardrail','browser_login_recipe','browser_site_policy','canvas_item','shared_canvas_item','code_folder','code_file','code_repository','commerce_certified_printer','commerce_ebay_category','commerce_ebay_category_aspect','commerce_ebay_category_tree','commerce_ebay_marketplace_policy','commerce_ebay_notification_destination','commerce_ebay_notification_topic','commerce_marketplace_rate_budget','commerce_print_order','meet_meeting','notification_event_override','notification_event_type','content_ir_kind','content_ir_kind_instance','scope','system_context_item','crm_blocklist_entry','contact_medium','crm_deal','crm_enrichment_call','crm_outreach_list','party','crm_registry_ingest_run','crm_registry_source','crm_saved_view','crm_sending_identity','crm_sending_policy','assessment','fc_card','fc_set','game_room','learn_doc','study_media','esign_campaign','esign_consent_disclosure','esign_envelope','esign_provider_binding','wbx_capture','wbx_demo','wbx_guidance','wbx_highlight','wbx_pattern','wbx_screenshot','wbx_seo_audit','file','folder','growth_loop_run','hindsight_regression_case','hindsight_replay_step','hr_access_role','hr_careers_portal','hr_field_policy','hr_jurisdiction','hr_jurisdiction_rule','hr_jurisdiction_rule_class','hr_jurisdiction_rule_org_decision','hr_posting','hr_provider_binding','hr_record_class','hr_retention_rule','hr_workflow_definition','hr_workflow_flow_type','access_request','iam_api_key','wc_claim','mandate_binding','mandate','provision','mandate_reference','mandate_scan','mandate_treatment','marketing_initiative','ops_proof_check','ops_proof_scenario','pdf_redaction_audit','plan_entity','plan_node','plan_profile','approach','category','comment','custom_entity_definition','custom_field_definition','custom_field_target','domain_classification','flexible_data','guided_checklist_run','platform_outcome_event','platform_outsider_consumer','purpose','route_manifest_entry','rulebook','pc_article','pc_episode','pc_show','pc_studio_run','library_doc','research_context_bundle','research_template','research_topic','youtube_search','youtube_video','global_origin','global_request','runtime_operation_stream','runtime_operation_stream_batch','sch_task','seo_collection_run','seo_engine_schedule','seo_geo_place','seo_gsc_dig_rule','seo_keyword','seo_keyword_class_rule','seo_keyword_edge','seo_keyword_facet','seo_keyword_market','seo_keyword_place','seo_keyword_topic','seo_rank_target','seo_source_request','seo_starter_pack','seo_starter_pack_item','seo_story_angle','seo_topic','skill','skill_render_definition','tool_bundle','tool','studio_session','transcript','ui_surface_agent_pref','ui_surface_config','invitation_code','user_profile','web_analysis_item','web_brand','web_listing_publisher','web_offering_template','web_provider','web_site','note_folder','note','product_capture_item','workflow','workflow_run','workflow_runtime_surface','workflow_template','workflow_trigger','project','task','thread','war_room'];
begin
  if (select count(*) from iam.access_delta_run where label = 'DD-171a BEFORE') > 0 then
    raise notice 'dd171a: the access baseline is already on record';
    return;
  end if;
  v_before := iam.access_delta_snapshot('DD-171a BEFORE', v_principals, v_tokens, 400000,
    'DD-171: containment never carries a personal row — fleet baseline before the kernel moves', v_as);
  raise notice 'dd171a: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;
end $$;
