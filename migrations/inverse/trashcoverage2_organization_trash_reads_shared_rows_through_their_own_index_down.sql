-- chair-step: lane TRASH-COVERAGE-2 inverse. Drops the partial index files_trash_org_shared_deleted_idx; Organization Trash reads shared archived files by the organization index again (slower, same rows).
-- AUTOCOMMIT FILE: DROP INDEX CONCURRENTLY cannot run inside a transaction.
-- INVERSE of migrations/campaign/trashcoverage2_organization_trash_reads_shared_rows_through_their_own_index.sql
-- lane: TRASH-COVERAGE-2

drop index concurrently if exists files.files_trash_org_shared_deleted_idx;
