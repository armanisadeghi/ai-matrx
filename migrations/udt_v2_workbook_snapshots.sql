-- ============================================================================
-- udt_v2_workbook_snapshots — Phase 4 storage for the lossless workbook surface
-- ============================================================================
--
-- WHY
-- ---
-- `udt_workbooks` (added in udt_v2_backbone) is the metadata table — workbook
-- name, source, ownership, scope. It does NOT store the workbook's actual
-- content (sheets, cells, formatting, formulas).
--
-- This migration adds the content store:
--   udt_workbook_snapshots — one row per saved snapshot of a workbook's state.
--
-- WHY SNAPSHOTS, NOT DOC-PER-WORKBOOK
-- -----------------------------------
-- A workbook's runtime state (Univer / Luckysheet / similar JSON) is large
-- and grows with the document. We keep an append-only chain of snapshots so:
--   - "Open workbook" loads the LATEST snapshot.
--   - "History / restore" can walk previous snapshots (mirrors the row-history
--     pattern from udt_dataset_row_versions but coarser-grained).
--   - Saves debounce on the client (e.g. 3s after the last edit) — we don't
--     write a snapshot per keystroke.
--
-- This is intentionally simpler than a Yjs/CRDT update log; concurrent editing
-- in v1 is last-write-wins (the client that saves last overwrites). Real CRDT
-- collab (per-cell delta merging, presence cursors) is a follow-up phase that
-- can layer on top — those updates would live in a separate per-doc log, with
-- snapshots remaining the canonical "current state."
--
-- SAFETY
-- ------
-- Pure-additive. New table only. No changes to udt_workbooks or any other
-- existing object. RLS mirrors udt_workbooks: snapshots are visible to anyone
-- who can view the parent workbook; writable by the workbook's owner OR a
-- has_permission('udt_workbooks', workbook_id, 'editor') grantee.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS udt_workbook_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id   UUID NOT NULL REFERENCES udt_workbooks(id) ON DELETE CASCADE,
  -- The serialized document state. The shape is dictated by the editor
  -- library (Univer ICommandService snapshot, Luckysheet config, etc.) and
  -- is OPAQUE to the DB. We store it as JSONB so it's queryable for
  -- migration / audit but never schema-checked.
  snapshot      JSONB NOT NULL,
  -- Human-readable label for the snapshot — e.g. auto-save vs named save.
  label         TEXT,
  -- Origin tracker: 'autosave' | 'manual' | 'imported' | 'restored'. Free
  -- text so we don't have to ALTER the enum every time a new ingest path
  -- appears.
  origin        TEXT NOT NULL DEFAULT 'autosave',
  created_by    UUID,                        -- NULL on system writes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_udt_workbook_snapshots_workbook
  ON udt_workbook_snapshots(workbook_id, created_at DESC);

ALTER TABLE udt_workbook_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS udt_workbook_snapshots_select ON udt_workbook_snapshots;
CREATE POLICY udt_workbook_snapshots_select ON udt_workbook_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM udt_workbooks w
      WHERE w.id = udt_workbook_snapshots.workbook_id
        AND (
          w.user_id = auth.uid()
          OR w.is_public = true
          OR has_permission('udt_workbooks', w.id, 'viewer'::permission_level)
        )
    )
  );

DROP POLICY IF EXISTS udt_workbook_snapshots_insert ON udt_workbook_snapshots;
CREATE POLICY udt_workbook_snapshots_insert ON udt_workbook_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM udt_workbooks w
      WHERE w.id = udt_workbook_snapshots.workbook_id
        AND (
          w.user_id = auth.uid()
          OR has_permission('udt_workbooks', w.id, 'editor'::permission_level)
        )
    )
  );

-- Snapshots are append-only by design. UPDATE / DELETE policies are
-- intentionally NOT created — RLS denies by default. The cascade delete on
-- `workbook_id` is the only way snapshots disappear: deleting the parent
-- workbook deletes its history along with it.

-- Realtime publication for live workbook reload across clients.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'udt_workbook_snapshots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE udt_workbook_snapshots;
  END IF;
END$$;

COMMIT;
