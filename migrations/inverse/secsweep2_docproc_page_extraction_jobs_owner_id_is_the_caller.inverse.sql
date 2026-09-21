-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on docproc.page_extraction_jobs.owner_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "page_extraction_jobs_owner_id_is_the_caller_insert" on docproc.page_extraction_jobs;
drop policy if exists "page_extraction_jobs_owner_id_is_the_caller_update" on docproc.page_extraction_jobs;
