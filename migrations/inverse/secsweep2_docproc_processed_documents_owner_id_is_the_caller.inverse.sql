-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on docproc.processed_documents.owner_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "processed_documents_owner_id_is_the_caller_insert" on docproc.processed_documents;
drop policy if exists "processed_documents_owner_id_is_the_caller_update" on docproc.processed_documents;
