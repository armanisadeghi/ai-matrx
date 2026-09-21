-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on transcripts.studio_runs.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "studio_runs_user_id_is_the_caller_insert" on transcripts.studio_runs;
drop policy if exists "studio_runs_user_id_is_the_caller_update" on transcripts.studio_runs;
