-- canvas_items external link — pointer from a materialized artifact to its
-- custom domain record (Wave D).
--
-- Custom-internal-system types (flashcards → user_flashcard_sets, quiz →
-- quiz_sessions, tasks → ctx_tasks, html → html_pages) store their rich/domain
-- data in their own feature table. The artifact (canvas_items row) keeps a
-- pointer to that record here, mirroring cx_artifact's external_system/_id
-- pattern, so the renderer + adapter can resolve the domain record from the
-- artifact id. Generic types leave these null.
--
-- Idempotent.

ALTER TABLE public.canvas_items ADD COLUMN IF NOT EXISTS external_system text;
ALTER TABLE public.canvas_items ADD COLUMN IF NOT EXISTS external_id text;

CREATE INDEX IF NOT EXISTS idx_canvas_items_external
  ON public.canvas_items (external_system, external_id)
  WHERE external_system IS NOT NULL;
