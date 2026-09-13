-- dd186_anon_columns_views — THE 21 ANON-READABLE VIEWS
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY.)
--
-- ═══ WHY A VIEW IS NOT A TABLE HERE ════════════════════════════════════════════════════════════
-- A view with `security_invoker` OFF runs as its OWNER, so it does not consult the caller's RLS at
-- all. Five of these 21 are in that state, and they were the only relations on this database
-- serving a signed-out visitor rows their base table's policy denies. Measured 2026-09-13 over
-- HTTPS with the published publishable key and no JWT:
--
--   GET /rest/v1/definition?select=id  (Accept-Profile: agent)  → content-range */0   — 0 rows
--   GET /rest/v1/card?select=id,name   (Accept-Profile: agent)  → 200, real agent rows
--
-- `agent.definition` gives anon nothing; `agent.card` over the top of it gives anon everything.
--
-- ═══ THE THREE THAT ARE CLOSED ═════════════════════════════════════════════════════════════════
-- `agent.card`, `agent.menu_surface`, `ai.model_config` — a four-repository census of every
-- signed-out surface (matrx-frontend's public routes and unauthenticated API routes, matrx-extend's
-- pre-login paths, matrx-local's pre-login clients, and aidream, which reads as the service role or
-- through matrx-orm and never as anon) finds NO signed-out reader for any of them. Their real
-- readers are signed-in: `features/surfaces/**` (the bind guard, the manifest sync, the surfaces
-- service), `components/mermaid/hooks/useDiagramAgents.ts` (which asks for `id, name`), and the two
-- admin model editors. Every one of those runs as `authenticated`, which keeps its own SELECT grant
-- on all three — nothing signed-in changes. anon's grant is revoked, because the correct bound for
-- an RLS-bypassing view with no signed-out reader is zero.
--
-- ═══ THE TWO THAT STAY, BECAUSE THEY ARE THE DESIGN ════════════════════════════════════════════
-- `ai.model_public` and `ai.model_offering` are the anonymous model catalog — declared as such in
-- `features/ai-models/hooks/useModelCatalog.ts`: "user → ai.model_public (anon + authenticated;
-- masked, points pricing)". They are kept and column-bounded. Neither carries a name from the
-- revoked list today, so no live client shape changes; what changes is the DEFAULT — a column added
-- to either view tomorrow is closed to a signed-out visitor instead of published by the same edit.
--
-- ═══ THE REMAINING SIXTEEN ═════════════════════════════════════════════════════════════════════
-- `security_invoker = true` (they respect the caller's RLS) and all sixteen return zero rows to
-- anon today. Column-bounded on the same rule as the tables, for the same reason: the default.
--
-- ═══ WHAT THIS FILE DOES NOT DO, SAID PLAINLY ══════════════════════════════════════════════════
-- It does not turn `security_invoker` on for the five. That would change what SIGNED-IN readers
-- see through them as well, which is a row-surface decision with its own census and its own
-- register row — not something a column-bounding lane may do on its way past. The two views that
-- stay therefore still bypass RLS for `anon`; they are meant to be world-readable, so the bypass
-- costs nothing today, and it is written down here rather than left for the next lane to rediscover.


-- agent.card — CLOSED to anon (RLS-bypassing view, no signed-out reader in any repository)
revoke select on agent.card from anon;

-- agent.mandate_exemplar — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on agent.mandate_exemplar from anon;
grant select (id, mandate_id, label, variables, user_input, reference_output, reference_artifact, source, captured_agent_id, captured_model_id, position, is_active, created_at, updated_at, deleted_at, visibility, agent_id, status, agent_version, input_contract_hash, output_contract_hash, source_conversation_id) on agent.mandate_exemplar to anon;

-- agent.menu_surface — CLOSED to anon (RLS-bypassing view, no signed-out reader in any repository)
revoke select on agent.menu_surface from anon;

-- ai.model_config — CLOSED to anon (RLS-bypassing view, no signed-out reader in any repository)
revoke select on ai.model_config from anon;

-- ai.model_offering — revoked: (none; bounded so a new column is closed by default)
revoke select on ai.model_offering from anon;
grant select (offering_id, model_id, model_name, model_common_name, priority, is_available, usage_basis, points_per_million_input, points_per_million_output, points_per_million_cached_input, effective_capabilities, token_billed, served_via, served_via_endpoint_id, model_is_deprecated) on ai.model_offering to anon;

-- ai.model_public — revoked: (none; bounded so a new column is closed by default)
revoke select on ai.model_public from anon;
grant select (id, name, common_name, capabilities, context_window, max_tokens, is_primary, is_premium, mid_fallback_id, guest_fallback_id, release_date, description, cost_rating, speed_rating, maker, usage_basis, token_billed, points_per_million_input, points_per_million_output, is_deprecated, retired_at, successor_id) on ai.model_public to anon;

-- platform.v_feature_knob_overdue — revoked: (none; bounded so a new column is closed by default)
revoke select on platform.v_feature_knob_overdue from anon;
grant select (feature, key, label, value, default_value, unit, basis, review_due, days_overdue) on platform.v_feature_knob_overdue to anon;

-- public.current_user_is_admin — revoked: user_id
revoke select on public.current_user_is_admin from anon;
grant select (is_admin, admin_level) on public.current_user_is_admin to anon;

-- public.pdf_unified_pages — revoked: (none; bounded so a new column is closed by default)
revoke select on public.pdf_unified_pages from anon;
grant select (page_id, processed_document_id, file_id, page_number, page_index, raw_text, cleaned_text, section_kind, section_title, is_continuation, width, height, extract_rotation, used_ocr, image_cld_file_id, file_page_id, user_status, user_rotation, excluded_at, user_modified, thumbnail_url) on public.pdf_unified_pages to anon;

-- public.v_context_item_suggestions — revoked: user_id, organization_id
revoke select on public.v_context_item_suggestions from anon;
grant select (id, scope_type_id, suggested_key, display_name, rationale, example_value, example_source_kind, example_source_id, confidence, status, created_at, decided_at, decided_by, suppressed_until, scope_type_label, scope_type_label_plural, scope_type_icon, scope_type_slug) on public.v_context_item_suggestions to anon;

-- public.v_kg_alerts — revoked: user_id, organization_id
revoke select on public.v_kg_alerts from anon;
grant select (id, source_kind, source_id, target_scope_id, target_slot_key, kind, severity, description, suggested_action, evidence, confidence, status, created_at, decided_at, decided_by, viewed_at, scope_name) on public.v_kg_alerts to anon;

-- public.v_kg_sweep_effectiveness — revoked: organization_id
revoke select on public.v_kg_sweep_effectiveness from anon;
grant select (sweep_run_row_id, sweep_run_id, trigger_type, scope_type_id, run_status, suggestions_created, entities_selected, llm_calls, cost_usd, started_at, completed_at, suggestions_tracked, pending, accepted, rejected, deferred, expired) on public.v_kg_sweep_effectiveness to anon;

-- public.v_kg_value_matches — revoked: user_id, organization_id
revoke select on public.v_kg_value_matches from anon;
grant select (id, source_kind, source_id, kg_entity_id, target_scope_id, target_context_item_id, target_slot_key, matched_value, current_value_snapshot, mention_count, evidence_chunk_id, confidence, created_at, scope_name, scope_slug, scope_type_label, scope_type_icon, item_label, item_key) on public.v_kg_value_matches to anon;

-- public.v_ner_canonicalizer_shadow — revoked: user_id, organization_id
revoke select on public.v_ner_canonicalizer_shadow from anon;
grant select (id, source_kind, source_id, run_id, input_pair_count, agent_input_json, agent_output_json, agent_merge_group_count, deterministic_groups_json, deterministic_merge_group_count, comparison_json, agreed_merge_surface_count, agent_only_merge_surface_count, deterministic_only_merge_surface_count, agent_model, agent_cost_usd, agent_elapsed_ms, agent_error, status, created_at) on public.v_ner_canonicalizer_shadow to anon;

-- public.v_scope_suggestion_stats — revoked: organization_id, user_id
revoke select on public.v_scope_suggestion_stats from anon;
grant select (status, is_starred, n) on public.v_scope_suggestion_stats to anon;

-- public.v_scope_suggestions — revoked: user_id, organization_id
revoke select on public.v_scope_suggestions from anon;
grant select (id, stage, source_kind, source_id, kg_entity_id, target_scope_id, target_item_id, target_slot, suggested_value, current_value_snapshot, match_kind, confidence, status, context_snippet, decision_note, is_starred, viewed_at, created_at, decided_at, decided_by, suppressed_until, org_name, org_slug, scope_type_id, scope_type_label, scope_type_slug, scope_type_icon, scope_name, scope_slug, item_label, item_key) on public.v_scope_suggestions to anon;

-- public.v_scope_suggestions_new — revoked: user_id, organization_id
revoke select on public.v_scope_suggestions_new from anon;
grant select (id, source_kind, source_id, scope_type_id, scope_type_label, suggested_name, suggested_slot_values, reasoning, confidence, status, created_at, decided_at, decided_by, suppressed_until, resolved_scope_type_label, scope_type_icon, scope_type_slug) on public.v_scope_suggestions_new to anon;

-- research.rs_source_keywords — revoked: (none; bounded so a new column is closed by default)
revoke select on research.rs_source_keywords from anon;
grant select (id, topic_id, url, title, description, hostname, source_type, origin, rank, page_age, thumbnail_url, extra_snippets, raw_search_result, is_included, is_stale, scrape_status, discovered_at, last_seen_at, keyword_id, rank_for_keyword) on research.rs_source_keywords to anon;

-- workflow.card — revoked: version, created_by, organization_id
revoke select on workflow.card from anon;
grant select (id, name, description, category, tags, variables, step_count, is_active, created_at, updated_at, card_visibility) on workflow.card to anon;

-- workflow.v_definition_catalog — revoked: organization_id, created_by
revoke select on workflow.v_definition_catalog from anon;
grant select (id, name, description, category, tags, is_favorite, is_active, is_archived, visibility, created_at, updated_at, engram_state, step_count, last_run_id, last_run_status, last_run_at, run_count) on workflow.v_definition_catalog to anon;

-- workflow.v_engram_confirmed_run — revoked: organization_id
revoke select on workflow.v_engram_confirmed_run from anon;
grant select (run_id, definition_id, definition_hash, completed_at) on workflow.v_engram_confirmed_run to anon;

-- ═══ THE ASSERTION ═════════════════════════════════════════════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel, ', ' order by rel) into bad
  from unnest(array['agent.card','agent.menu_surface','ai.model_config']) rel
  where has_table_privilege('anon', rel, 'SELECT')
     or exists (select 1 from pg_attribute a
                 where a.attrelid = rel::regclass and a.attnum > 0 and not a.attisdropped
                   and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'));
  if bad is not null then
    raise exception using message = 'DD-186 (views): anon still reads the closed views: ' || bad;
  end if;

  select string_agg(rel || '.' || a.attname, ', ' order by rel, a.attname) into bad
  from unnest(array['agent.mandate_exemplar','ai.model_offering','ai.model_public','platform.v_feature_knob_overdue','public.current_user_is_admin','public.pdf_unified_pages','public.v_context_item_suggestions','public.v_kg_alerts','public.v_kg_sweep_effectiveness','public.v_kg_value_matches','public.v_ner_canonicalizer_shadow','public.v_scope_suggestion_stats','public.v_scope_suggestions','public.v_scope_suggestions_new','research.rs_source_keywords','workflow.card','workflow.v_definition_catalog','workflow.v_engram_confirmed_run']) rel
  join pg_attribute a on a.attrelid = rel::regclass and a.attnum > 0 and not a.attisdropped
  where a.attname = any (array['created_by','updated_by','deleted_by','changed_by','user_id',
      'owner_id','owner_user_id','author_id','organization_id','org_id','version','metadata',
      'is_system','email','ip_address','fingerprint','phone','token','api_key','secret','password'])
    and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT');
  if bad is not null then
    raise exception using message = 'DD-186 (views): a signed-out visitor still reads: ' || bad;
  end if;

  -- and the two that stay must still answer, or this file broke the model picker
  if not has_column_privilege('anon', 'ai.model_public', 'id', 'SELECT')
     or not has_column_privilege('anon', 'ai.model_offering', 'model_id', 'SELECT') then
    raise exception using message = 'DD-186 (views): the anonymous model catalog lost its columns.';
  end if;
end $$;

