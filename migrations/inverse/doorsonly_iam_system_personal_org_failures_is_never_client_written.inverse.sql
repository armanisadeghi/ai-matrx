-- chair-step: DOORS-ONLY inverse -- re-opens the client write door on iam.system_personal_org_failures, which
-- VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST write
-- surface on a IDENTITY-semantics table that no client code uses. Only run it to undo a closure
-- that broke a real path, and say which path.

drop policy if exists "system_personal_org_failures_client_insert_refused" on iam.system_personal_org_failures;
drop policy if exists "system_personal_org_failures_client_update_refused" on iam.system_personal_org_failures;
drop policy if exists "system_personal_org_failures_client_delete_refused" on iam.system_personal_org_failures;
