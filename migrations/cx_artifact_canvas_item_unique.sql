-- cx_artifact: dedupe guard on canvas_item_id.
-- Closes the discovery-index TOCTOU race in upsertDiscoveryIndex (lookup-then-insert
-- with no DB-level uniqueness) — concurrent stream-commit + reconcile could double-insert.
-- Partial unique: NULL canvas_item_id rows (manual/non-materialized cx_artifact entries)
-- are exempt. Idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cx_artifact_canvas_item_id
  ON public.cx_artifact (canvas_item_id)
  WHERE canvas_item_id IS NOT NULL;
