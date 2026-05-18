-- ============================================================
-- cmp_comparison_sets — generic primitive for grouping N
-- conversations into a "comparison set" (e.g. side-by-side agent
-- runs in /agents/battle, future judge-model eval sets, etc.).
--
-- Two tables:
--   cmp_comparison_sets    — set header (name, owner, scope, free-form metadata)
--   cmp_comparison_entries — one row per conversation in the set,
--                            with display_order + agent snapshot
--
-- Token/cost/timing data is NOT duplicated here. Pulled live from
-- cx_message + the in-memory activeRequests slice. The entries
-- table stores only relationships + comparison-only metadata
-- (judge scores, user notes, tags) in its `metadata` jsonb.
--
-- RLS pattern modeled on agent_app_executions.sql:
--   - Owner-only SELECT/INSERT/UPDATE/DELETE on sets
--   - Entries inherit access via parent set ownership
--   - service_role bypass policy on both
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cmp_comparison_sets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL DEFAULT 'Untitled comparison',
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid,
  project_id      uuid,
  task_id         uuid,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cmp_comparison_entries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_set_id         uuid NOT NULL REFERENCES public.cmp_comparison_sets(id) ON DELETE CASCADE,
  conversation_id           uuid NOT NULL,
  display_order             integer NOT NULL,
  agent_id                  uuid NOT NULL,
  agent_version             integer,
  agent_version_snapshot_id uuid,
  metadata                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cmp_entries_unique_per_set UNIQUE (comparison_set_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_cmp_entries_by_set
  ON public.cmp_comparison_entries(comparison_set_id, display_order);

CREATE INDEX IF NOT EXISTS idx_cmp_sets_by_user
  ON public.cmp_comparison_sets(user_id, created_at DESC);

-- ------------------------------------------------------------
-- updated_at touch on UPDATE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cmp_comparison_sets_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cmp_comparison_sets_touch ON public.cmp_comparison_sets;
CREATE TRIGGER trg_cmp_comparison_sets_touch
  BEFORE UPDATE ON public.cmp_comparison_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.cmp_comparison_sets_touch_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.cmp_comparison_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmp_comparison_entries ENABLE ROW LEVEL SECURITY;

-- ---- cmp_comparison_sets ----
DROP POLICY IF EXISTS "cmp_sets_select_owner"   ON public.cmp_comparison_sets;
DROP POLICY IF EXISTS "cmp_sets_insert_owner"   ON public.cmp_comparison_sets;
DROP POLICY IF EXISTS "cmp_sets_update_owner"   ON public.cmp_comparison_sets;
DROP POLICY IF EXISTS "cmp_sets_delete_owner"   ON public.cmp_comparison_sets;
DROP POLICY IF EXISTS "cmp_sets_service_role"   ON public.cmp_comparison_sets;

CREATE POLICY "cmp_sets_select_owner"
ON public.cmp_comparison_sets FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "cmp_sets_insert_owner"
ON public.cmp_comparison_sets FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "cmp_sets_update_owner"
ON public.cmp_comparison_sets FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "cmp_sets_delete_owner"
ON public.cmp_comparison_sets FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "cmp_sets_service_role"
ON public.cmp_comparison_sets FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ---- cmp_comparison_entries (inherits access via parent set) ----
DROP POLICY IF EXISTS "cmp_entries_select_owner"   ON public.cmp_comparison_entries;
DROP POLICY IF EXISTS "cmp_entries_insert_owner"   ON public.cmp_comparison_entries;
DROP POLICY IF EXISTS "cmp_entries_update_owner"   ON public.cmp_comparison_entries;
DROP POLICY IF EXISTS "cmp_entries_delete_owner"   ON public.cmp_comparison_entries;
DROP POLICY IF EXISTS "cmp_entries_service_role"   ON public.cmp_comparison_entries;

CREATE POLICY "cmp_entries_select_owner"
ON public.cmp_comparison_entries FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cmp_comparison_sets s
    WHERE s.id = comparison_set_id AND s.user_id = auth.uid()
  )
);

CREATE POLICY "cmp_entries_insert_owner"
ON public.cmp_comparison_entries FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cmp_comparison_sets s
    WHERE s.id = comparison_set_id AND s.user_id = auth.uid()
  )
);

CREATE POLICY "cmp_entries_update_owner"
ON public.cmp_comparison_entries FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cmp_comparison_sets s
    WHERE s.id = comparison_set_id AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cmp_comparison_sets s
    WHERE s.id = comparison_set_id AND s.user_id = auth.uid()
  )
);

CREATE POLICY "cmp_entries_delete_owner"
ON public.cmp_comparison_entries FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cmp_comparison_sets s
    WHERE s.id = comparison_set_id AND s.user_id = auth.uid()
  )
);

CREATE POLICY "cmp_entries_service_role"
ON public.cmp_comparison_entries FOR ALL TO service_role
USING (true) WITH CHECK (true);

COMMIT;
