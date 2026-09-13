-- dd186_anon_columns_transcripts — THE SIGNED-OUT COLUMN SURFACE OF THE `transcripts` SCHEMA
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


-- transcripts.studio_cleaned_segments — revoked: (none; bounded so a new column is closed by default)
revoke select on transcripts.studio_cleaned_segments from anon;
grant select (id, session_id, run_id, pass_index, t_start, t_end, text, trigger_cause, superseded_at, created_at, recording_segment_id, processor_key) on transcripts.studio_cleaned_segments to anon;

-- transcripts.studio_concept_items — revoked: (none; bounded so a new column is closed by default)
revoke select on transcripts.studio_concept_items from anon;
grant select (id, session_id, run_id, pass_index, t_start, t_end, kind, label, description, confidence, created_at) on transcripts.studio_concept_items to anon;

-- transcripts.studio_module_segments — revoked: (none; bounded so a new column is closed by default)
revoke select on transcripts.studio_module_segments from anon;
grant select (id, session_id, run_id, pass_index, module_id, block_type, t_start, t_end, payload, created_at) on transcripts.studio_module_segments to anon;

-- transcripts.studio_raw_segments — revoked: (none; bounded so a new column is closed by default)
revoke select on transcripts.studio_raw_segments from anon;
grant select (id, session_id, recording_segment_id, chunk_index, t_start, t_end, text, speaker, source, created_at) on transcripts.studio_raw_segments to anon;

-- transcripts.studio_session_settings — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on transcripts.studio_session_settings from anon;
grant select (session_id, cleaning_shortcut_id, cleaning_interval_ms, concept_shortcut_id, concept_interval_ms, module_id, module_shortcut_id, module_interval_ms, column_widths, show_prior_modules, created_at, updated_at, context_items, custom_slots, deleted_at) on transcripts.studio_session_settings to anon;

-- transcripts.studio_sessions — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on transcripts.studio_sessions from anon;
grant select (id, project_id, transcript_id, title, status, module_id, started_at, ended_at, total_duration_ms, audio_storage_path, created_at, updated_at, assistant_conversation_id, source, assistant_conversations, visibility, deleted_at) on transcripts.studio_sessions to anon;

-- transcripts.transcripts — revoked: metadata, organization_id, created_by, updated_by, version
revoke select on transcripts.transcripts from anon;
grant select (id, title, description, segments, audio_file_path, video_file_path, source_type, tags, folder_name, created_at, updated_at, is_draft, draft_saved_at, project_id, task_id, deleted_at, visibility) on transcripts.transcripts to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['transcripts.studio_cleaned_segments','transcripts.studio_concept_items','transcripts.studio_module_segments','transcripts.studio_raw_segments','transcripts.studio_session_settings','transcripts.studio_sessions','transcripts.transcripts']) rel
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
      message = 'DD-186 (transcripts): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

