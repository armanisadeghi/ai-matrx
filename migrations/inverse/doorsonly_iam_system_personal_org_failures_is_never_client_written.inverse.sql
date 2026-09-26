-- retired: graveyard.system_personal_org_failures (ex iam.system_personal_org_failures, 0 rows) DROPPED 2026-09-26 by the database estate-reduction program (backup /Users/armanisadeghi/db-estate-backups/2026-09-26/graveyard.system_personal_org_failures.dump); this file creates, moves, or asserts a table that no longer exists and must never run again
-- chair-step: DOORS-ONLY inverse -- re-opens the client write door on iam.system_personal_org_failures, which
-- VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST write
-- surface on a IDENTITY-semantics table that no client code uses. Only run it to undo a closure
-- that broke a real path, and say which path.

drop policy if exists "system_personal_org_failures_client_insert_refused" on iam.system_personal_org_failures;
drop policy if exists "system_personal_org_failures_client_update_refused" on iam.system_personal_org_failures;
drop policy if exists "system_personal_org_failures_client_delete_refused" on iam.system_personal_org_failures;
