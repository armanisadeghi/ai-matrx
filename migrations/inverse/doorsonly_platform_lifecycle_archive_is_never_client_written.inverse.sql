-- chair-step: DOORS-ONLY inverse -- re-opens the client write door on platform.lifecycle_archive, which
-- VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST write
-- surface on a AUDIT-semantics table that no client code uses. Only run it to undo a closure
-- that broke a real path, and say which path.

drop policy if exists "lifecycle_archive_client_insert_refused" on platform.lifecycle_archive;
drop policy if exists "lifecycle_archive_client_update_refused" on platform.lifecycle_archive;
drop policy if exists "lifecycle_archive_client_delete_refused" on platform.lifecycle_archive;
