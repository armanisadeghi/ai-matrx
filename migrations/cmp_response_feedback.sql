-- ============================================================
-- cmp_response_feedback — user feedback on agent responses
--
-- Generic table for capturing per-response user feedback (thumbs +
-- optional long-form text). The conversation_id + (optional) request_id
-- pair locates the specific response. We don't FK to cx_message because
-- a) request_id resolves the streamed turn unambiguously, b) message
-- ids are server-assigned post-stream and may not yet exist when the
-- user first lands feedback.
--
-- Most-recent-wins per (user, conversation, request_id) — upsert on
-- save, so a user can update their rating + text without orphan rows.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cmp_response_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  request_id      text,
  /** "up", "down", or null when only text feedback was given. */
  rating          text CHECK (rating IN ('up', 'down')),
  comment         text,
  /** Optional grouping into a comparison set (for battle-page feedback). */
  comparison_set_id uuid REFERENCES public.cmp_comparison_sets(id) ON DELETE SET NULL,
  /** Free-form bag for future fields (e.g. judge_score, tag, source). */
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cmp_response_feedback_unique
    UNIQUE (user_id, conversation_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_cmp_response_feedback_by_user
  ON public.cmp_response_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cmp_response_feedback_by_conv
  ON public.cmp_response_feedback(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cmp_response_feedback_by_set
  ON public.cmp_response_feedback(comparison_set_id)
  WHERE comparison_set_id IS NOT NULL;

-- ------------------------------------------------------------
-- updated_at touch
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cmp_response_feedback_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cmp_response_feedback_touch ON public.cmp_response_feedback;
CREATE TRIGGER trg_cmp_response_feedback_touch
  BEFORE UPDATE ON public.cmp_response_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.cmp_response_feedback_touch_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.cmp_response_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmp_feedback_select_owner"   ON public.cmp_response_feedback;
DROP POLICY IF EXISTS "cmp_feedback_insert_owner"   ON public.cmp_response_feedback;
DROP POLICY IF EXISTS "cmp_feedback_update_owner"   ON public.cmp_response_feedback;
DROP POLICY IF EXISTS "cmp_feedback_delete_owner"   ON public.cmp_response_feedback;
DROP POLICY IF EXISTS "cmp_feedback_service_role"   ON public.cmp_response_feedback;

CREATE POLICY "cmp_feedback_select_owner"
ON public.cmp_response_feedback FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "cmp_feedback_insert_owner"
ON public.cmp_response_feedback FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "cmp_feedback_update_owner"
ON public.cmp_response_feedback FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "cmp_feedback_delete_owner"
ON public.cmp_response_feedback FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "cmp_feedback_service_role"
ON public.cmp_response_feedback FOR ALL TO service_role
USING (true) WITH CHECK (true);

COMMIT;
