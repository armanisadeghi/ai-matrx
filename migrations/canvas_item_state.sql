-- canvas_item_state — per-viewer interactive state for materialized artifacts.
--
-- Generic persistence layer (Wave C of the artifact unification): types WITHOUT
-- a dedicated domain table (progress, comparison, math_problem, decision-tree,
-- etc.) store a user's interaction state (answers, checkmarks, progress) here,
-- keyed by (canvas_id, user_id). PER-VIEWER by design: a shared artifact lets
-- each viewer keep their own state, matching how the custom domain tables
-- (user_flashcard_reviews, quiz_sessions) already work.
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE) so re-applying is safe.

CREATE TABLE IF NOT EXISTS public.canvas_item_state (
  canvas_id  uuid NOT NULL REFERENCES public.canvas_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canvas_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_item_state_user ON public.canvas_item_state (user_id);

ALTER TABLE public.canvas_item_state ENABLE ROW LEVEL SECURITY;

-- A user reads/writes ONLY their own state rows (any artifact they can reach).
DROP POLICY IF EXISTS canvas_item_state_select ON public.canvas_item_state;
CREATE POLICY canvas_item_state_select ON public.canvas_item_state
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS canvas_item_state_insert ON public.canvas_item_state;
CREATE POLICY canvas_item_state_insert ON public.canvas_item_state
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS canvas_item_state_update ON public.canvas_item_state;
CREATE POLICY canvas_item_state_update ON public.canvas_item_state
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS canvas_item_state_delete ON public.canvas_item_state;
CREATE POLICY canvas_item_state_delete ON public.canvas_item_state
  FOR DELETE USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canvas_item_state TO authenticated;

CREATE OR REPLACE FUNCTION public.canvas_item_state_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canvas_item_state_touch_trg ON public.canvas_item_state;
CREATE TRIGGER canvas_item_state_touch_trg
  BEFORE UPDATE ON public.canvas_item_state
  FOR EACH ROW EXECUTE FUNCTION public.canvas_item_state_touch();
