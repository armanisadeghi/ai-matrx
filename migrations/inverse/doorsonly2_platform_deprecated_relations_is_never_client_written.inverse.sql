-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on platform.deprecated_relations,
-- which VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST
-- write surface on a CATALOGUE-semantics table that no client code writes. Only run it to undo a
-- closure that broke a real path, and say which path.

drop policy if exists "deprecated_relations_client_insert_refused" on platform.deprecated_relations;
drop policy if exists "deprecated_relations_client_update_refused" on platform.deprecated_relations;
drop policy if exists "deprecated_relations_client_delete_refused" on platform.deprecated_relations;
