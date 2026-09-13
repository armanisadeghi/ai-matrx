-- dd186_anon_columns_rag — THE SIGNED-OUT COLUMN SURFACE OF THE `rag` SCHEMA
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


-- rag.context_item_suggestions — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on rag.context_item_suggestions from anon;
grant select (id, scope_type_id, suggested_key, display_name, rationale, example_value, example_source_kind, example_source_id, confidence, status, created_at, decided_at, decided_by, suppressed_until, sweep_run_id, updated_at, deleted_at, visibility) on rag.context_item_suggestions to anon;

-- rag.kg_alerts — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on rag.kg_alerts from anon;
grant select (id, source_kind, source_id, target_scope_id, target_slot_key, kind, severity, description, suggested_action, evidence, confidence, status, created_at, decided_at, decided_by, viewed_at, deleted_at, updated_at, visibility) on rag.kg_alerts to anon;

-- rag.kg_sweep_queue — revoked: organization_id, metadata, created_by, updated_by, version
revoke select on rag.kg_sweep_queue from anon;
grant select (id, change_type, entity_id, scope_type_id, status, enqueued_at, claim_at, claimed_at, sweep_run_id, updated_at, deleted_at, visibility, created_at) on rag.kg_sweep_queue to anon;

-- rag.kg_sweep_run — revoked: organization_id, user_id, metadata, created_by, updated_by, version
revoke select on rag.kg_sweep_run from anon;
grant select (id, run_id, trigger_type, trigger_entity_id, scope_type_id, status, change_count, documents_considered, entities_enumerated, entities_excluded_resolved, entities_after_dedup, entities_selected, entities_deferred, batches, llm_calls, tokens_in, tokens_out, cost_usd, suggestions_created, started_at, completed_at, error, created_at, updated_at, deleted_at, visibility) on rag.kg_sweep_run to anon;

-- rag.kg_value_matches — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on rag.kg_value_matches from anon;
grant select (id, source_kind, source_id, kg_entity_id, target_scope_id, target_context_item_id, target_slot_key, matched_value, current_value_snapshot, mention_count, evidence_chunk_id, confidence, created_at, deleted_at, updated_at, visibility) on rag.kg_value_matches to anon;

-- rag.ner_canonicalizer_shadow — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on rag.ner_canonicalizer_shadow from anon;
grant select (id, source_kind, source_id, run_id, input_pair_count, agent_input_json, agent_output_json, agent_merge_group_count, deterministic_groups_json, deterministic_merge_group_count, comparison_json, agreed_merge_surface_count, agent_only_merge_surface_count, deterministic_only_merge_surface_count, agent_model, agent_cost_usd, agent_elapsed_ms, agent_error, status, created_at, updated_at, deleted_at, visibility) on rag.ner_canonicalizer_shadow to anon;

-- rag.scope_suggestions — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on rag.scope_suggestions from anon;
grant select (id, source_kind, source_id, scope_type_id, scope_type_label, suggested_name, suggested_slot_values, reasoning, confidence, status, created_at, decided_at, decided_by, suppressed_until, sweep_run_id, deleted_at, updated_at, visibility) on rag.scope_suggestions to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['rag.context_item_suggestions','rag.kg_alerts','rag.kg_sweep_queue','rag.kg_sweep_run','rag.kg_value_matches','rag.ner_canonicalizer_shadow','rag.scope_suggestions']) rel
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
      message = 'DD-186 (rag): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

