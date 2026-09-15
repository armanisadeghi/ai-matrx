-- workbench.notes.content_preview — the first 240 characters of the body, kept
-- by Postgres, so every LIST read (sidebar, phone list, recents, trash) can show
-- a preview without pulling the full body of every note on every route entry
-- and every refresh (notes audit N-24, 2026-09-14). The body itself is read
-- once, on open, by fetchNoteContent.
--
-- A STORED generated column: written by the database on every INSERT/UPDATE of
-- `content`, never by a client, never drifting. `left()` is immutable.

ALTER TABLE workbench.notes
  ADD COLUMN IF NOT EXISTS content_preview text
    GENERATED ALWAYS AS (left(content, 240)) STORED;

COMMENT ON COLUMN workbench.notes.content_preview IS
  'First 240 characters of content, maintained by Postgres (generated, stored). List reads select this instead of content.';

-- PostgREST caches the schema; a new column 42703s until it reloads.
NOTIFY pgrst, 'reload schema';
