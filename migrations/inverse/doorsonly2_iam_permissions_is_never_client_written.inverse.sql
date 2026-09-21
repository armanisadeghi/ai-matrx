-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on iam.permissions,
-- which VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST
-- write surface on a GRANT-semantics table that no client code writes. Only run it to undo a
-- closure that broke a real path, and say which path.

drop policy if exists "permissions_client_insert_refused" on iam.permissions;
drop policy if exists "permissions_client_update_refused" on iam.permissions;
drop policy if exists "permissions_client_delete_refused" on iam.permissions;
