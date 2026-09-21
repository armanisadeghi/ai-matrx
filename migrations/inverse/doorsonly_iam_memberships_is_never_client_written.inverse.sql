-- chair-step: DOORS-ONLY inverse -- re-opens the client write door on iam.memberships, which
-- VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST write
-- surface on a MEMBERSHIP-semantics table that no client code uses. Only run it to undo a closure
-- that broke a real path, and say which path.

drop policy if exists "memberships_client_insert_refused" on iam.memberships;
drop policy if exists "memberships_client_update_refused" on iam.memberships;
drop policy if exists "memberships_client_delete_refused" on iam.memberships;
