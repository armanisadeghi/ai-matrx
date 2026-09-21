-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on docproc.page_extraction_page_runs.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "page_extraction_page_runs_user_id_is_the_caller_insert" on docproc.page_extraction_page_runs;
drop policy if exists "page_extraction_page_runs_user_id_is_the_caller_update" on docproc.page_extraction_page_runs;
