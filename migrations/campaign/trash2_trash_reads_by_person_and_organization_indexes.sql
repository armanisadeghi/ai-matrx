-- lane TRASH-2 — the two Trash reads on the largest kind are index reads, not sorts.
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.
--
-- files.files carries ~248k archived rows (75k in one organization). Personal Trash reads
-- `created_by = me and deleted_at is not null order by deleted_at desc`; Organization Trash reads
-- `organization_id = org and deleted_at is not null order by deleted_at desc`. Both used to be
-- bitmap scans + top-N sorts over every archived row of the owner / organization (26 ms / 87 ms on
-- production 2026-09-25 and growing linearly); these partial indexes make both a bounded index walk.
-- Partial on `deleted_at is not null`, so live-file writes never touch them.
--
-- INVERSE: migrations/inverse/trash2_trash_reads_by_person_and_organization_indexes_down.sql
-- lane: TRASH-2

create index concurrently if not exists files_trash_owner_deleted_idx
  on files.files (created_by, deleted_at desc, id) where deleted_at is not null;

create index concurrently if not exists files_trash_org_deleted_idx
  on files.files (organization_id, deleted_at desc, id) where deleted_at is not null;
