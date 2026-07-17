-- GC association edges when a processed_document is HARD-deleted.
--
-- Every other platform entity (files, folders, derive_runs, page_extraction_*)
-- carries platform._gc_entity_associations triggers so its association edges
-- can't dangle after the row is gone. docproc.processed_documents was the ONE
-- entity missing it — so `delete_library_document` (the explicit "delete
-- document" action that hard-deletes the row + pages + chunks) left any
-- `processed_document → conversation` attachment edge pointing at a row that no
-- longer exists. That is exactly how conversation 632e8260… ended up attached
-- to the vanished doc 7f89ea5f… (2026-07-17).
--
-- HARD-delete only, deliberately: a hard delete means the expensive artifact is
-- truly gone, so its edges MUST be cleaned. A SOFT delete (deleted_at) is
-- recoverable and the read paths already filter deleted_at AND re-canonicalize a
-- pd-edge through its file, so keeping the edge on soft-delete preserves the
-- user's attachment across a restore — losing it would be the "don't lose
-- associations" failure we are guarding against. The `source_file` lineage edge
-- is separately maintained by docproc.sync_processed_doc_file_association.
--
-- Idempotent.

drop trigger if exists _gc_assoc_harddelete on docproc.processed_documents;
create trigger _gc_assoc_harddelete
  after delete on docproc.processed_documents
  for each row execute function platform._gc_entity_associations('processed_document');
