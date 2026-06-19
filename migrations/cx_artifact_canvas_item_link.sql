-- cx_artifact → canvas_items link — discovery index pointer (Wave E).
--
-- canvas_items is the content SSOT; cx_artifact is the discovery/index surface
-- (`/artifacts` library + org/project/task context + soft-delete). Materializing
-- an artifact writes BOTH: a canvas_items content row and a cx_artifact index row
-- that points back here. Clicking a library entry resolves canvas_item_id →
-- the same unified renderer. Non-breaking for existing html_pages rows.
--
-- Idempotent.

ALTER TABLE public.cx_artifact ADD COLUMN IF NOT EXISTS canvas_item_id uuid
  REFERENCES public.canvas_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cx_artifact_canvas_item
  ON public.cx_artifact (canvas_item_id)
  WHERE canvas_item_id IS NOT NULL;
