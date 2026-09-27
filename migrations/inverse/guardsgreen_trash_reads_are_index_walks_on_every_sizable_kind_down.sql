-- chair-step: lane GUARDS-GREEN inverse — drops the six partial Trash indexes the up adds (no data touched; the Trash reads fall back to the filters they used before).
-- INVERSE of migrations/campaign/guardsgreen_trash_reads_are_index_walks_on_every_sizable_kind.sql
-- AUTOCOMMIT FILE: DROP INDEX CONCURRENTLY, statement by statement.
-- lane: GUARDS-GREEN

drop index concurrently if exists chat.conversation_trash_org_shared_deleted_idx;
drop index concurrently if exists chat.conversation_trash_owner_deleted_idx;
drop index concurrently if exists files.folders_trash_org_shared_deleted_idx;
drop index concurrently if exists files.folders_trash_owner_deleted_idx;
drop index concurrently if exists docproc.processed_documents_trash_org_shared_deleted_idx;
drop index concurrently if exists docproc.processed_documents_trash_owner_deleted_idx;
