-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on platform.assurance_level,
-- which VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST
-- write surface on a VOCABULARY-semantics table that no client code writes. Only run it to undo a
-- closure that broke a real path, and say which path.

drop policy if exists "assurance_level_client_insert_refused" on platform.assurance_level;
drop policy if exists "assurance_level_client_update_refused" on platform.assurance_level;
drop policy if exists "assurance_level_client_delete_refused" on platform.assurance_level;
