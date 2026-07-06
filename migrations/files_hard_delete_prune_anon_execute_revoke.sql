-- files_hard_delete_prune_anon_execute_revoke.sql (2026-07-06)
--
-- Close the anon execution hole on the two hard-mutation RPCs that return
-- S3 storage locations to service callers.
--
-- Both functions treat `auth.uid() IS NULL` as "trusted service-role caller":
-- they SKIP the iam.has_access() authorization check and RETURN the S3
-- storage locations for the purge. But EXECUTE was granted to PUBLIC and
-- `anon` — and an anonymous PostgREST request also runs with
-- `auth.uid() IS NULL`. Net effect before this migration: an UNAUTHENTICATED
-- caller could hard-delete any file / prune any file's versions AND receive
-- the server-only S3 locations (the exact disclosure the storage_uri
-- isolation campaign eradicates).
--
-- Fix: only `authenticated` (safe branch: authz-checked, no locations in the
-- payload) and `service_role` (the Python backend's purge path) may execute.
--
-- Idempotent: REVOKE/GRANT are safe to re-run.

REVOKE EXECUTE ON FUNCTION public.hard_delete_file(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hard_delete_file(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prune_old_versions(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prune_old_versions(uuid, integer) FROM anon;

GRANT EXECUTE ON FUNCTION public.hard_delete_file(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prune_old_versions(uuid, integer) TO authenticated, service_role;
