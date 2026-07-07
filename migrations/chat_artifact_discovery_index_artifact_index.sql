-- chat.artifact discovery index: add artifact_index to the natural key.
--
-- canvas_items dedupes on (source_system, source_id, artifact_index) but
-- chat.artifact's uq_cx_artifact_source_natural_key omitted artifact_index,
-- so materializing 2+ blocks from one message (especially types that map to
-- the same artifact_type enum, e.g. table + chart → data_table) 23505'd on
-- upsertDiscoveryIndex. Idempotent.

ALTER TABLE chat.artifact
  ADD COLUMN IF NOT EXISTS artifact_index smallint;

COMMENT ON COLUMN chat.artifact.artifact_index IS
  'Stable 1-based index within the source record (= canvas.canvas_items.artifact_index). Part of uq_cx_artifact_source_natural_key.';

-- Backfill from the linked canvas row when present.
UPDATE chat.artifact a
SET artifact_index = ci.artifact_index
FROM canvas.canvas_items ci
WHERE a.canvas_item_id = ci.id
  AND a.artifact_index IS NULL
  AND ci.artifact_index IS NOT NULL;

-- Swap the natural key: create-new-then-drop-old so the table is never unguarded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cx_artifact_source_natural_key_v2
  ON chat.artifact (user_id, source_system, source_id, artifact_index, artifact_type, external_system)
  NULLS NOT DISTINCT;

DROP INDEX IF EXISTS chat.uq_cx_artifact_source_natural_key;

ALTER INDEX IF EXISTS chat.uq_cx_artifact_source_natural_key_v2
  RENAME TO uq_cx_artifact_source_natural_key;
