-- migrations/sch_security_hardening.sql
--
-- Closes findings from the security audit:
--
--  C-3: Narrow admin RLS escape hatch from is_platform_admin() to
--       is_super_admin() so the DB gate matches the route gate.
--  H-2: CHECK constraints on title / prompt / runtime / concurrent /
--       surfaces cardinality, plus length on cron expression.
--  H-3: sch_trigger.user_id must match the parent sch_task.user_id (so a
--       user can't insert a trigger pointing at someone else's task).
--  L-1: tag-array length cap.
--  M-2: REVOKE EXECUTE on sch_recompute_task_next_due_at from PUBLIC —
--       only the trigger needs it, and trigger functions run regardless
--       of caller grants.
--
-- Belt-and-suspenders. The TS layer should validate first, but the DB is
-- the only line the codebase trusts.

BEGIN;

-- ============================================================================
-- 1. Tighten admin RLS — super_admin only (was is_platform_admin)
-- ============================================================================

DROP POLICY IF EXISTS sch_task_owner_or_admin ON public.sch_task;
CREATE POLICY sch_task_owner_or_admin
ON public.sch_task
FOR ALL
TO authenticated
USING (user_id = auth.uid() OR public.is_super_admin())
WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS sch_agent_task_owner_or_admin ON public.sch_agent_task;
CREATE POLICY sch_agent_task_owner_or_admin
ON public.sch_agent_task
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sch_task t
    WHERE t.id = sch_agent_task.id
      AND (t.user_id = auth.uid() OR public.is_super_admin())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sch_task t
    WHERE t.id = sch_agent_task.id
      AND (t.user_id = auth.uid() OR public.is_super_admin())
  )
);

DROP POLICY IF EXISTS sch_trigger_owner_or_admin ON public.sch_trigger;
CREATE POLICY sch_trigger_owner_or_admin
ON public.sch_trigger
FOR ALL
TO authenticated
USING (user_id = auth.uid() OR public.is_super_admin())
WITH CHECK (
  -- H-3 fix: parent task must belong to the same user (or super-admin).
  (user_id = auth.uid() OR public.is_super_admin())
  AND EXISTS (
    SELECT 1 FROM public.sch_task t
    WHERE t.id = sch_trigger.task_id
      AND (t.user_id = sch_trigger.user_id OR public.is_super_admin())
  )
);

DROP POLICY IF EXISTS sch_run_owner_or_admin ON public.sch_run;
CREATE POLICY sch_run_owner_or_admin
ON public.sch_run
FOR ALL
TO authenticated
USING (user_id = auth.uid() OR public.is_super_admin())
WITH CHECK (
  -- H-1 partial mitigation: the run's task_id must belong to the same
  -- user (or super-admin) — prevents inserting a run for someone else's
  -- task with self user_id.
  (user_id = auth.uid() OR public.is_super_admin())
  AND EXISTS (
    SELECT 1 FROM public.sch_task t
    WHERE t.id = sch_run.task_id
      AND (t.user_id = sch_run.user_id OR public.is_super_admin())
  )
);

-- ============================================================================
-- 2. Input validation — CHECK constraints on the base tables
-- ============================================================================

ALTER TABLE public.sch_task
  DROP CONSTRAINT IF EXISTS sch_task_title_chk;
ALTER TABLE public.sch_task
  ADD CONSTRAINT sch_task_title_chk
  CHECK (length(title) BETWEEN 1 AND 200);

ALTER TABLE public.sch_task
  DROP CONSTRAINT IF EXISTS sch_task_description_chk;
ALTER TABLE public.sch_task
  ADD CONSTRAINT sch_task_description_chk
  CHECK (description IS NULL OR length(description) <= 2000);

ALTER TABLE public.sch_task
  DROP CONSTRAINT IF EXISTS sch_task_surfaces_card_chk;
ALTER TABLE public.sch_task
  ADD CONSTRAINT sch_task_surfaces_card_chk
  CHECK (cardinality(surfaces) BETWEEN 1 AND 7);

ALTER TABLE public.sch_task
  DROP CONSTRAINT IF EXISTS sch_task_tags_card_chk;
ALTER TABLE public.sch_task
  ADD CONSTRAINT sch_task_tags_card_chk
  CHECK (
    cardinality(tags) <= 50
    AND NOT EXISTS (
      SELECT 1 FROM unnest(tags) AS t(v) WHERE length(t.v) > 100
    )
  );

ALTER TABLE public.sch_agent_task
  DROP CONSTRAINT IF EXISTS sch_agent_task_prompt_chk;
ALTER TABLE public.sch_agent_task
  ADD CONSTRAINT sch_agent_task_prompt_chk
  CHECK (length(prompt) BETWEEN 1 AND 10000);

ALTER TABLE public.sch_agent_task
  DROP CONSTRAINT IF EXISTS sch_agent_task_runtime_chk;
ALTER TABLE public.sch_agent_task
  ADD CONSTRAINT sch_agent_task_runtime_chk
  CHECK (max_runtime_seconds BETWEEN 5 AND 86400);

ALTER TABLE public.sch_agent_task
  DROP CONSTRAINT IF EXISTS sch_agent_task_concurrent_chk;
ALTER TABLE public.sch_agent_task
  ADD CONSTRAINT sch_agent_task_concurrent_chk
  CHECK (max_concurrent BETWEEN 1 AND 10);

-- Trigger config size cap (defends croniter / json parser DoS).
ALTER TABLE public.sch_trigger
  DROP CONSTRAINT IF EXISTS sch_trigger_config_chk;
ALTER TABLE public.sch_trigger
  ADD CONSTRAINT sch_trigger_config_chk
  CHECK (
    pg_column_size(config) <= 4096
    AND (
      (type <> 'cron')
      OR (length(coalesce(config->>'expression', '')) BETWEEN 1 AND 200)
    )
  );

-- ============================================================================
-- 3. Lock down sch_recompute_task_next_due_at
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.sch_recompute_task_next_due_at(uuid)
  FROM PUBLIC;
-- The AFTER trigger is owned by postgres and calls the function via
-- SECURITY DEFINER privilege; nobody else needs EXECUTE.

COMMIT;
