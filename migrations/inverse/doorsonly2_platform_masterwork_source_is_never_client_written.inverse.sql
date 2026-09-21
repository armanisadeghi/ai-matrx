-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on platform.masterwork_source,
-- which VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST
-- write surface on a CONTENT-semantics table that no client code writes. Only run it to undo a
-- closure that broke a real path, and say which path.

drop policy if exists "masterwork_source_client_insert_refused" on platform.masterwork_source;
drop policy if exists "masterwork_source_client_update_refused" on platform.masterwork_source;
drop policy if exists "masterwork_source_client_delete_refused" on platform.masterwork_source;
