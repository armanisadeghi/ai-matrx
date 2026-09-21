-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on platform.associations,
-- the 84,566-row table every M2M relationship in the platform lives in. Running this restores a
-- direct PostgREST write surface on it. NOTE that the four callers that used to write it
-- directly were moved to public.assoc_add / public.assoc_remove in the same commit and will NOT
-- move back: running this re-opens the hole without restoring any path anybody walks. Only run
-- it to undo a closure that broke a real path, and say which path.

drop policy if exists "associations_client_insert_refused" on platform.associations;
drop policy if exists "associations_client_update_refused" on platform.associations;
drop policy if exists "associations_client_delete_refused" on platform.associations;
