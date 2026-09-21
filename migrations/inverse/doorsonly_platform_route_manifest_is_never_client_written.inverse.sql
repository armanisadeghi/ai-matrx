-- chair-step: DOORS-ONLY inverse -- re-opens the client write door on platform.route_manifest, which
-- VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST write
-- surface on a ROUTE-semantics table that no client code uses. Only run it to undo a closure
-- that broke a real path, and say which path.

drop policy if exists "route_manifest_client_insert_refused" on platform.route_manifest;
drop policy if exists "route_manifest_client_update_refused" on platform.route_manifest;
drop policy if exists "route_manifest_client_delete_refused" on platform.route_manifest;
