-- chair-step: DOORS-ONLY inverse -- re-opens the client write door on iam.org_industries, which
-- VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST write
-- surface on a IDENTITY-semantics table that no client code uses. Only run it to undo a closure
-- that broke a real path, and say which path.

drop policy if exists "org_industries_client_insert_refused" on iam.org_industries;
drop policy if exists "org_industries_client_update_refused" on iam.org_industries;
drop policy if exists "org_industries_client_delete_refused" on iam.org_industries;
