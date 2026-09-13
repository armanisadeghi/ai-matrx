-- dd186_anon_columns_agent — THE SIGNED-OUT COLUMN SURFACE OF THE `agent` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 7 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
-- reaching `anon` — in almost every case the generated `pub_read` (`deleted_at is null and
-- visibility = 'public'`). That ROW decision was made by the DD-173 base-contract campaign and is
-- not touched here. The COLUMN decision had never been made by anyone: every one of them answered
-- `select=*` to the published publishable key over HTTPS, so a table became a publishing decision
-- the moment a column was added to it. DD-182 found exactly this on `public.catalog_entries`
-- (a platform admin's uuid in `updated_by`, served to the internet, while the SAME feature's other
-- public path stripped it on purpose). This file is that finding applied to the rest of the surface.
--
-- WHAT IS REVOKED, and it is a closed list of exact column NAMES — never a name pattern, because a
-- gate that guesses is a gate that gets switched off:
--   who   — created_by, updated_by, deleted_by, changed_by, ratified_by, certified_by,
--           human_verified_by, verdict_by, synced_by, last_checked_by, check_claimed_by,
--           user_id, owner_id, owner_user_id, author_id, organization_id, org_id
--   books — version, metadata, is_system
--   contact/secret — email, contact_email, ip_address, fingerprint, phone, phone_number,
--           token, access_token, refresh_token, api_key, secret, password, password_hash
-- Deliberately NOT revoked: `visibility` and `deleted_at` (the gate's own columns — a row a
-- signed-out visitor can see always reads 'public'/null, so they carry no information, and clients
-- legitimately filter on them, which PostgREST cannot do without the column privilege); and names
-- that only LOOK like the list — `max_tokens`, `token_billed`, `total_tokens_used`, `min_tier`,
-- `emitted_fingerprint` (a content hash), and `content_ir.kind_surface.token`, whose values are
-- 'flashcards' and 'mermaid'.
--
-- THE MECHANISM, and why it is the durable one: each relation's TABLE-level grant is revoked and
-- replaced by a COLUMN-level grant naming exactly what stays. A column added to one of these
-- tables tomorrow is therefore NOT readable by a signed-out visitor — the default flips from
-- published to closed, which is the actual class fix. `pnpm check:anon-column-surface` fails on a
-- difference in either direction.
--
-- NOTHING SIGNED-IN CHANGES: grants are per-role, `authenticated` keeps every privilege it holds.
-- SECURITY DEFINER doors run as their owner and never consult the caller's table privileges.


-- agent.cmp_comparison_sets — revoked: organization_id, metadata, created_by, updated_by, version
revoke select on agent.cmp_comparison_sets from anon;
grant select (id, name, project_id, task_id, created_at, updated_at, deleted_at, visibility) on agent.cmp_comparison_sets to anon;

-- agent.cmp_response_feedback — revoked: metadata, organization_id, created_by, updated_by, version
revoke select on agent.cmp_response_feedback from anon;
grant select (id, conversation_id, request_id, rating, comment, comparison_set_id, created_at, updated_at, overall, rank, deleted_at, visibility) on agent.cmp_response_feedback to anon;

-- agent.definition — revoked: organization_id, version, created_by, updated_by, metadata
revoke select on agent.definition from anon;
grant select (id, agent_type, name, description, messages, variable_definitions, model_id, model_tiers, settings, output_schema, tools, custom_tools, context_policies, category, tags, is_active, is_archived, is_favorite, task_id, source_agent_id, source_snapshot_at, created_at, updated_at, mcp_servers, rag_awareness_mode, rag_awareness_fragment, rag_awareness_refreshed_at, tool_config, default_rag_boost, skill_config, matrx_actions, ui_gates, visibility, card_visibility, deleted_at, updated_by_tier, updated_by_system, auto_context_disabled, input_kind, input_contract, input_contract_hash, output_contract_hash) on agent.definition to anon;

-- agent.exemplar — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on agent.exemplar from anon;
grant select (id, mandate_id, label, variables, user_input, reference_output, reference_artifact, source, captured_agent_id, captured_model_id, position, is_active, created_at, updated_at, deleted_at, visibility, agent_id, status, agent_version, input_contract_hash, output_contract_hash, source_conversation_id) on agent.exemplar to anon;

-- agent.message_template — revoked: metadata, organization_id, created_by, updated_by, version
revoke select on agent.message_template from anon;
grant select (id, label, content, role, created_at, updated_at, tags, deleted_at, visibility) on agent.message_template to anon;

-- agent.shortcut — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on agent.shortcut from anon;
grant select (id, category_id, label, description, icon_name, keyboard_shortcut, sort_order, agent_id, enabled_features, scope_mappings, display_mode, allow_chat, auto_run, show_pre_execution_gate, is_active, created_at, updated_at, agent_version_id, use_latest, show_variable_panel, variables_panel_style, show_definition_messages, show_definition_message_content, hide_reasoning, hide_tool_results, pre_execution_message, bypass_gate_seconds, default_user_input, default_variables, context_overrides, llm_overrides, context_mappings, response_density, json_extraction, surface_name, value_mappings, visibility, deleted_at) on agent.shortcut to anon;

-- agent.template — revoked: organization_id, version, created_by, updated_by, metadata
revoke select on agent.template from anon;
grant select (id, name, description, category, tags, is_featured, use_count, messages, variable_definitions, model_id, model_tiers, settings, output_schema, tools, custom_tools, context_policies, mcp_servers, is_archived, source_agent_id, created_at, updated_at, tool_config, visibility, deleted_at, auto_context_disabled) on agent.template to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['agent.cmp_comparison_sets','agent.cmp_response_feedback','agent.definition','agent.exemplar','agent.message_template','agent.shortcut','agent.template']) rel
    join pg_attribute a on a.attrelid = rel::regclass and a.attnum > 0 and not a.attisdropped
    where a.attname = any (array['created_by','updated_by','deleted_by','changed_by','ratified_by',
        'certified_by','human_verified_by','verdict_by','synced_by','last_checked_by',
        'check_claimed_by','user_id','owner_id','owner_user_id','author_id','organization_id',
        'org_id','created_by_user_id','version','metadata','is_system','email','contact_email',
        'ip_address','fingerprint','phone','phone_number','access_token','refresh_token','api_key',
        'secret','password','password_hash']
        || case when rel = 'content_ir.kind_surface' then array[]::text[] else array['token'] end)
      and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
  ) t;
  if bad is not null then
    raise exception using
      message = 'DD-186 (agent): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

