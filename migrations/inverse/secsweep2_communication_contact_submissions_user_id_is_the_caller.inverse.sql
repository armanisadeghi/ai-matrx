-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on communication.contact_submissions.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "contact_submissions_user_id_is_the_caller_insert" on communication.contact_submissions;
drop policy if exists "contact_submissions_user_id_is_the_caller_update" on communication.contact_submissions;
