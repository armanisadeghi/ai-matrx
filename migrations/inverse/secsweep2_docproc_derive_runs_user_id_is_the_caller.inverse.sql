-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on docproc.derive_runs.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "derive_runs_user_id_is_the_caller_insert" on docproc.derive_runs;
drop policy if exists "derive_runs_user_id_is_the_caller_update" on docproc.derive_runs;
