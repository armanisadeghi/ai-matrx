-- web_crawl_artifact_live_reconcile.sql  (P4 / D-H)
--
-- Reconciles the stale web_crawl_artifact_* migration files against LIVE
-- production function bodies (verified via pg_get_functiondef, 2026-07-23).
-- The repo SQL had drifted from production in three ways; this file records
-- the truth so the next reader is not misled.
--
-- 1. REAL BODY DRIFT — web.assert_crawl_artifact_file: every on-disk copy
--    still checks `f.visibility::text = 'private'`, but the platform-wide
--    visibility rename (private -> personal, 2026-07-21) was applied live.
--    Live body restated below (applying is a no-op).
--
-- 2. DEAD-ON-DISK OBJECTS — defined by web_crawl files but ABSENT live
--    (dropped/replaced by later access waves). DROP IF EXISTS below makes a
--    fresh replay match production:
--      files.can_read_web_artifact           (web_crawl_artifact_file_access.sql)
--      files.has_web_site_edge               (…fail_closed / …zz_canonical_finalize)
--      platform.enforce_managed_file_web_site_association + its trigger
--        associations_enforce_managed_file_web_site ON platform.associations
--
-- 3. SUPERSEDED-NOT-DRIFTED — web_crawl files also carry OLD bodies of
--    functions whose canonical on-disk home moved to newer migrations that DO
--    match live. Read these instead:
--      public.search_files        -> search_files_stable_pagination.sql
--      public.count_user_files    -> files_listing_owner_grant_only.sql
--      public.get_user_file_tree  -> files_listing_owner_grant_only.sql
--      public.get_org_file_list   -> get_org_file_list_discoverable.sql
--      iam.has_access_for         -> access_wave_c1_single_resolver_body.sql
--                                    (+ aidream db/migrations/0159/0160)
--    Verified matching live 2026-07-23: files.has_access_for,
--    files.is_crawl_artifact, files.is_discoverable_for, iam.is_discoverable,
--    files.reject_web_artifact_file_mutation,
--    web.validate_screenshot_artifact_file, web.validate_snapshot_artifact_files
--    (latest web_crawl on-disk copies are correct for these).
--
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Live truth for web.assert_crawl_artifact_file ('personal', not 'private')
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION web.assert_crawl_artifact_file(
  p_file_id uuid,
  p_organization_id uuid,
  p_site_id uuid,
  p_session_id uuid,
  p_mime_prefix text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'files', 'web'
AS $function$
begin
  if p_file_id is null then return; end if;
  if not exists (
    select 1
    from files.files f
    join web.site ws
      on ws.id = p_site_id
     and ws.organization_id = p_organization_id
     and ws.deleted_at is null
    join web.crawl_session cs
      on cs.id = p_session_id
     and cs.site_id = ws.id
     and cs.organization_id = ws.organization_id
     and cs.deleted_at is null
    where f.id = p_file_id
      and f.organization_id = ws.organization_id
      and f.deleted_at is null
      and f.visibility::text = 'personal'
      and f.mime_type like p_mime_prefix || '%'
      and f.metadata @> '{"system_artifact": true, "system_immutable": true, "artifact_domain": "web_crawl"}'::jsonb
      and f.metadata ->> 'web_site_id' = ws.id::text
      and f.metadata ->> 'crawl_session_id' = cs.id::text
  ) then
    raise exception 'invalid canonical crawl artifact file %', p_file_id
      using errcode = '23514';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Drop the dead-on-disk objects (no-ops live; fixes fresh replays)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS associations_enforce_managed_file_web_site ON platform.associations;
DROP FUNCTION IF EXISTS platform.enforce_managed_file_web_site_association();
DROP FUNCTION IF EXISTS files.can_read_web_artifact(uuid);
DROP FUNCTION IF EXISTS files.has_web_site_edge(uuid);
