-- lane: access-ladder T-11 leak fixes, part r (speed only): the two common files lists read in
-- recency order can stop after one page instead of sorting every live file.
--
-- The "all files" list (`deleted_at is null order by updated_at desc limit N`) and the organization
-- list (`organization_id = X and deleted_at is null order by updated_at desc limit N`) had no index
-- in that order, so PostgreSQL sorted every live row the caller could read — and asked the read
-- policy about every one of them (70k rows for the unscoped list) — to return one page. With
-- these, the scan walks newest-first and stops at the page. Rows and access are unchanged.
--
-- CONCURRENTLY: files.files is hot; no write is blocked while the indexes build. This file needs
-- autocommit, so it is applied from aidream: `python db/apply_migrations.py --source matrx-frontend`.

SET lock_timeout = '2s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS files_files_live_updated_idx
  ON files.files (updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS files_files_org_live_updated_idx
  ON files.files (organization_id, updated_at DESC)
  WHERE deleted_at IS NULL AND organization_id IS NOT NULL;
