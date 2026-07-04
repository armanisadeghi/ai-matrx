-- note_folders_created_by_name_unique.sql
--
-- workbench.note_folders.createFolder claimed to be a get-or-create on
-- (created_by, name) but had NO unique constraint — only the pkey. So two
-- Quick-Saves to a new folder name raced select-then-insert and silently
-- created duplicate folders (1 such pair existed live as of 2026-07-03).
--
-- Notes reference their folder by the denormalized `folder_name` STRING (see
-- renameFolder, which rewrites notes.folder_name), NOT by folder id — so the
-- folder row id is loosely coupled and one row per (user, name) is the true
-- model. Folder nesting (parent_id) is entirely unused (0 of 40 rows nested),
-- so the natural key is simply (created_by, name).
--
-- Fix: collapse the duplicate group to its newest row, then add a FULL unique
-- index (created_by, name). Full (not partial on deleted_at) so ON CONFLICT can
-- infer it via supabase-js upsert — safe because 0 rows are soft-deleted, and
-- delete+recreate-by-name now REVIVES the row in the service (matches the
-- name-keyed model) rather than minting a second one.
--
-- Re-runnable: DELETE no-ops once deduped; index is IF NOT EXISTS.

-- 1. Dedup — keep the newest row per (created_by, name). No parent_id repoint
--    needed (nesting unused) and notes reference by name, not id, so nothing
--    is orphaned.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY created_by, name
           ORDER BY updated_at DESC NULLS LAST,
                    created_at DESC NULLS LAST,
                    id DESC
         ) AS rn
  FROM workbench.note_folders
)
DELETE FROM workbench.note_folders f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;

-- 2. Full unique index backing the (created_by, name) natural key.
CREATE UNIQUE INDEX IF NOT EXISTS note_folders_created_by_name_unique
  ON workbench.note_folders (created_by, name);
