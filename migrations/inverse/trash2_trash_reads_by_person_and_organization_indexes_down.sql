-- INVERSE of migrations/campaign/trash2_trash_reads_by_person_and_organization_indexes.sql
-- AUTOCOMMIT FILE: DROP INDEX CONCURRENTLY, statement by statement.
-- lane: TRASH-2

drop index concurrently if exists files.files_trash_owner_deleted_idx;
drop index concurrently if exists files.files_trash_org_deleted_idx;
