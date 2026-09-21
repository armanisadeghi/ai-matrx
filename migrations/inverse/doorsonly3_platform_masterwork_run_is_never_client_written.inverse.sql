-- chair-step: DOORS-ONLY-3 inverse -- drops the three restrictive refusal policies on
-- platform.masterwork_run, putting the client write surface back. Running this makes the base table
-- writable over PostgREST again for every signed-in user, which is exactly what the chair
-- ruling closed. Only run it to undo a closure that broke a real path, and say which path.

drop policy if exists "masterwork_run_client_insert_refused" on platform.masterwork_run;
drop policy if exists "masterwork_run_client_update_refused" on platform.masterwork_run;
drop policy if exists "masterwork_run_client_delete_refused" on platform.masterwork_run;
