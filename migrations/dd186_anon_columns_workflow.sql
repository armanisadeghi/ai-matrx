-- dd186_anon_columns_workflow — THE SIGNED-OUT COLUMN SURFACE OF THE `workflow` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 8 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
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


-- workflow.comparison — revoked: verdict_by, organization_id, created_by, updated_by, version, metadata
revoke select on workflow.comparison from anon;
grant select (id, title, status, request, shared_inputs, arms, verdict_winner, verdict_notes, verdict_at, metrics, error, completed_at, created_at, updated_at, deleted_at, visibility) on workflow.comparison to anon;

-- workflow.definition — revoked: metadata, version, organization_id, created_by, updated_by
revoke select on workflow.definition from anon;
grant select (id, name, description, nodes, edges, viewport, channels, strict_channels, entry_nodes, is_active, is_archived, is_favorite, tags, category, project_id, task_id, source_definition_id, source_snapshot_at, created_at, updated_at, max_concurrent_runs, visibility, deleted_at, variables, updated_by_tier, updated_by_system, engram_state, confirmed_success_count, promotion_threshold_k, grounding_score, compiled_at, demoted_at, demotion_reason, engram_version_tags, engram_counter_since, card_visibility, input_kind, output_kind) on workflow.definition to anon;

-- workflow.run — revoked: organization_id, metadata, created_by, updated_by, version
revoke select on workflow.run from anon;
grant select (id, thread_id, parent_run_id, definition_id, definition_version_id, definition_hash, status, input, output, error, interrupt_payload, steps_executed, last_checkpoint_id, project_id, task_id, conversation_id, agent_id, agent_version_id, created_at, started_at, completed_at, max_recovery_retries, recovery_retry_count, event_seq, visibility, deleted_at, updated_at, request_attribution_complete) on workflow.run to anon;

-- workflow.runtime_surface — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on workflow.runtime_surface from anon;
grant select (id, definition_id, name, audience, profile, is_default, schema_version, config, created_at, updated_at, deleted_at, visibility) on workflow.runtime_surface to anon;

-- workflow.template — revoked: created_by, organization_id, updated_by, version, metadata
revoke select on workflow.template from anon;
grant select (id, name, description, category, definition, preview_image_url, popularity, is_published, created_at, updated_at, visibility, deleted_at) on workflow.template to anon;

-- workflow.trigger — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on workflow.trigger from anon;
grant select (id, definition_id, definition_version_id, name, description, kind, cron_expression, timezone, webhook_secret, default_inputs, max_steps, is_active, last_fired_at, last_run_id, next_run_at, fire_count, project_id, task_id, created_at, updated_at, visibility, deleted_at, callback_url, event_source) on workflow.trigger to anon;

-- workflow.trigger_event — revoked: organization_id
revoke select on workflow.trigger_event from anon;
grant select (id, trigger_id, entity_key, payload, status, claim_at, claimed_at, attempts, max_attempts, run_id, last_error, created_at, updated_at) on workflow.trigger_event to anon;

-- workflow.work_item — revoked: (none; bounded so a new column is closed by default)
revoke select on workflow.work_item from anon;
grant select (id, run_id, set_name, seq, canonical_key, payload, state, attempts, max_attempts, wave, discovered_by, claim_holder, claimed_at, lease_expires_at, error, created_at, completed_at) on workflow.work_item to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['workflow.comparison','workflow.definition','workflow.run','workflow.runtime_surface','workflow.template','workflow.trigger','workflow.trigger_event','workflow.work_item']) rel
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
      message = 'DD-186 (workflow): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

