-- Web artifact files: immutable CONTENT, mutable ACCESS METADATA.
-- APPLIED LIVE 2026-07-29 via Supabase MCP (this file is the record).
--
-- files.reject_web_artifact_file_mutation() blocked EVERY update to files
-- referenced by web.snapshot / web.screenshot — including visibility — which
-- froze 12,413 crawl artifacts at visibility='personal' (invisible to every
-- org member but the crawler; page-workspace content 403s). Arman's ruling
-- 2026-07-29: crawl artifacts are "absolutely never personal".
--
-- The guard now permits updates that leave content/identity/deletion columns
-- untouched (file_path, file_name, mime_type, size_bytes, checksum,
-- storage_uri, current_version, deleted_at, parent_file_id, derivation_kind)
-- and still rejects any change to those. NOTE: `version` (row
-- optimistic-concurrency counter) is bumped by platform._touch_row BEFORE
-- this guard fires, so it must stay unprotected.
--
-- Companion data backfill (applied in the same session, not repeated here to
-- keep this file idempotent-safe): snapshot markdown/body + screenshot files
-- with visibility='personal' → 'internal' (7,094 + 5,319 rows).

create or replace function files.reject_web_artifact_file_mutation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'files', 'web'
as $function$
begin
  if (new.file_path      is not distinct from old.file_path)
    and (new.file_name    is not distinct from old.file_name)
    and (new.mime_type    is not distinct from old.mime_type)
    and (new.size_bytes   is not distinct from old.size_bytes)
    and (new.checksum     is not distinct from old.checksum)
    and (new.storage_uri  is not distinct from old.storage_uri)
    and (new.current_version is not distinct from old.current_version)
    and (new.deleted_at   is not distinct from old.deleted_at)
    and (new.parent_file_id is not distinct from old.parent_file_id)
    and (new.derivation_kind is not distinct from old.derivation_kind)
  then
    return new;
  end if;
  if exists (
    select 1 from web.snapshot s
    where s.body_file_id = old.id or s.markdown_file_id = old.id
  ) or exists (
    select 1 from web.screenshot s
    where s.file_id = old.id
  ) then
    raise exception 'referenced web artifact file % is immutable (content/identity/deletion columns)', old.id
      using errcode = '55000';
  end if;
  return new;
end;
$function$;
