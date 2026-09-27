-- lane: access-ladder T-11, step 0, part b: validate part a's check and index the two lookups the
-- child writers make. Autocommit file (aidream runner): every statement is its own transaction,
-- lock_timeout 2s with retry — one table per transaction by construction.
--
-- files_files_provider_session_idx: chat.coding_session's insert trigger (part c) finds the
-- session's artifacts by (provider_session_id, created_by); without it every new coding session
-- would scan files.files.
-- files_files_parent_record_idx: "every child of this record" (a chat's attachments).
create index concurrently if not exists files_files_provider_session_idx
  on files.files (provider_session_id, created_by)
  where provider_session_id is not null;

create index concurrently if not exists files_files_parent_record_idx
  on files.files (parent_record_type, parent_record_id)
  where parent_record_type is not null;

alter table files.files validate constraint files_parent_record_shape;
