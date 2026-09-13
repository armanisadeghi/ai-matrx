-- dd186_anon_columns_files — THE SIGNED-OUT COLUMN SURFACE OF THE `files` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 9 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
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


-- files.analysis — revoked: owner_id, metadata
revoke select on files.analysis from anon;
grant select (file_id, mime_type, status, analyzer_version, detectors_run, progress, classification, page_count, summary_counts, text_source_map, thumbnail_url, started_at, completed_at, updated_at, deleted_at) on files.analysis to anon;

-- files.analysis_result — revoked: (none; bounded so a new column is closed by default)
revoke select on files.analysis_result from anon;
grant select (id, file_id, detector_kind, detector_version, confidence_tier, status, text_sources, elapsed_ms, summary, payload, payload_uri, payload_bytes, error, created_at, page_id) on files.analysis_result to anon;

-- files.file_rag_jobs — revoked: user_id, organization_id
revoke select on files.file_rag_jobs from anon;
grant select (id, file_id, status, trigger_source, scheduled_for, started_at, completed_at, attempt_count, skipped_reason, error, created_at, updated_at) on files.file_rag_jobs to anon;

-- files.files — revoked: created_by, metadata, organization_id, updated_by, version
revoke select on files.files from anon;
grant select (id, file_path, file_name, mime_type, size_bytes, checksum, visibility, current_version, parent_folder_id, created_at, updated_at, deleted_at, parent_file_id, derivation_kind, derivation_metadata, duplicate_of_file_id, canonical_processed_document_id, width, height, duration_ms) on files.files to anon;

-- files.folders — revoked: created_by, metadata, organization_id, is_system, updated_by
revoke select on files.folders from anon;
grant select (id, folder_path, folder_name, parent_id, visibility, created_at, updated_at, deleted_at) on files.folders to anon;

-- files.idempotency — revoked: owner_id
revoke select on files.idempotency from anon;
grant select (idempotency_key, request_hash, endpoint, status_code, response_body, resource_id, resource_type, created_at, expires_at) on files.idempotency to anon;

-- files.uploads_inflight — revoked: owner_id, metadata
revoke select on files.uploads_inflight from anon;
grant select (id, file_id, file_path, bucket, key, multipart_upload_id, upload_length, upload_offset, visibility, mime_type, file_name, idempotency_key, parts, status, expires_at, created_at, updated_at) on files.uploads_inflight to anon;

-- files.webhook_deliveries — revoked: (none; bounded so a new column is closed by default)
revoke select on files.webhook_deliveries from anon;
grant select (id, webhook_id, attempt, status, http_status, latency_ms, error_message, next_attempt_at, created_at, completed_at, activity_log_id, net_request_id, signature, dispatched_at) on files.webhook_deliveries to anon;

-- files.webhooks — revoked: owner_id, secret, organization_id
revoke select on files.webhooks from anon;
grant select (id, target_url, description, is_active, event_types, resource_types, last_attempt_at, last_success_at, consecutive_failures, max_consecutive_failures, created_at, updated_at) on files.webhooks to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['files.analysis','files.analysis_result','files.file_rag_jobs','files.files','files.folders','files.idempotency','files.uploads_inflight','files.webhook_deliveries','files.webhooks']) rel
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
      message = 'DD-186 (files): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

