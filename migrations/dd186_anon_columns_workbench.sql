-- dd186_anon_columns_workbench — THE SIGNED-OUT COLUMN SURFACE OF THE `workbench` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 10 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
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


-- workbench.heatmap_saves — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on workbench.heatmap_saves from anon;
grant select (id, title, description, data, view_settings, created_at, updated_at, deleted_at, visibility) on workbench.heatmap_saves to anon;

-- workbench.note_folders — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on workbench.note_folders from anon;
grant select (id, name, parent_id, path, position, created_at, updated_at, deleted_at, visibility) on workbench.note_folders to anon;

-- workbench.notes — revoked: metadata, organization_id, version, created_by, updated_by
revoke select on workbench.notes from anon;
grant select (id, label, content, folder_name, tags, position, created_at, updated_at, folder_id, file_path, content_hash, sync_version, last_device_id, project_id, task_id, visibility, deleted_at) on workbench.notes to anon;

-- workbench.udt_dataset_row_versions — revoked: changed_by
revoke select on workbench.udt_dataset_row_versions from anon;
grant select (id, row_id, table_id, data, prior_data, change_kind, changed_at) on workbench.udt_dataset_row_versions to anon;

-- workbench.udt_datasets — revoked: version, user_id, organization_id, created_by, updated_by, metadata
revoke select on workbench.udt_datasets from anon;
grant select (id, table_name, description, is_public, created_at, updated_at, row_ordering_config, project_id, task_id, workbook_id, sheet_index, validation_mode, template_id, template_version, visibility, deleted_at) on workbench.udt_datasets to anon;

-- workbench.udt_document_snapshots — revoked: created_by
revoke select on workbench.udt_document_snapshots from anon;
grant select (id, document_id, snapshot, label, origin, created_at) on workbench.udt_document_snapshots to anon;

-- workbench.udt_documents — revoked: user_id, organization_id, metadata, created_by, updated_by, version
revoke select on workbench.udt_documents from anon;
grant select (id, document_name, description, source, original_file_id, project_id, task_id, is_public, created_at, updated_at, visibility, deleted_at) on workbench.udt_documents to anon;

-- workbench.udt_structured_lists — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on workbench.udt_structured_lists from anon;
grant select (id, created_at, updated_at, list_name, description, is_public, public_read, visibility, deleted_at) on workbench.udt_structured_lists to anon;

-- workbench.udt_workbooks — revoked: user_id, organization_id, metadata, created_by, updated_by, version
revoke select on workbench.udt_workbooks from anon;
grant select (id, workbook_name, description, source, original_file_id, project_id, task_id, is_public, created_at, updated_at, visibility, deleted_at) on workbench.udt_workbooks to anon;

-- workbench.working_documents — revoked: version, organization_id, created_by, updated_by, metadata
revoke select on workbench.working_documents from anon;
grant select (id, title, content, created_at, updated_at, kind, deleted_at, visibility) on workbench.working_documents to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['workbench.heatmap_saves','workbench.note_folders','workbench.notes','workbench.udt_dataset_row_versions','workbench.udt_datasets','workbench.udt_document_snapshots','workbench.udt_documents','workbench.udt_structured_lists','workbench.udt_workbooks','workbench.working_documents']) rel
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
      message = 'DD-186 (workbench): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

