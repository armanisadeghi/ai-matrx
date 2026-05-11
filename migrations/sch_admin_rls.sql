-- migrations/sch_admin_rls.sql
--
-- Extends each owner-only policy on the sch_* spine with an
-- `OR public.is_platform_admin()` escape hatch so super-admin pages can
-- read/write any user's tasks via the regular browser supabase client.
--
-- This matches the existing pattern on `aga_apps` / `aga_categories` etc.
-- where admin oversight is RLS-level rather than via a separate API route +
-- createAdminClient(). Scheduling is a feature with admin oversight (not a
-- protected resource like `public.admins`), so the lighter pattern is the
-- right fit.
--
-- For `sch_agent_task`, ownership flows through the parent `sch_task`
-- (existing EXISTS subquery); we add the admin OR clause inside that EXISTS
-- so it still cascades through the parent.
--
-- Related plan: ~/.claude/plans/please-review-this-so-squishy-tome.md
-- Spec:        docs/SCHEDULING.md §9 (RLS), §11 (admin not yet built)

BEGIN;

-- ============================================================================
-- 1. sch_task — direct owner column
-- ============================================================================
DROP POLICY IF EXISTS sch_task_owner ON public.sch_task;
DROP POLICY IF EXISTS sch_task_owner_or_admin ON public.sch_task;

CREATE POLICY sch_task_owner_or_admin
ON public.sch_task
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_platform_admin()
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_platform_admin()
);

-- ============================================================================
-- 2. sch_agent_task — ownership through parent sch_task
-- ============================================================================
DROP POLICY IF EXISTS sch_agent_task_owner ON public.sch_agent_task;
DROP POLICY IF EXISTS sch_agent_task_owner_or_admin ON public.sch_agent_task;

CREATE POLICY sch_agent_task_owner_or_admin
ON public.sch_agent_task
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sch_task t
    WHERE t.id = sch_agent_task.id
      AND (t.user_id = auth.uid() OR public.is_platform_admin())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sch_task t
    WHERE t.id = sch_agent_task.id
      AND (t.user_id = auth.uid() OR public.is_platform_admin())
  )
);

-- ============================================================================
-- 3. sch_trigger — direct owner column (denormalized)
-- ============================================================================
DROP POLICY IF EXISTS sch_trigger_owner ON public.sch_trigger;
DROP POLICY IF EXISTS sch_trigger_owner_or_admin ON public.sch_trigger;

CREATE POLICY sch_trigger_owner_or_admin
ON public.sch_trigger
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_platform_admin()
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_platform_admin()
);

-- ============================================================================
-- 4. sch_run — direct owner column (denormalized)
-- ============================================================================
DROP POLICY IF EXISTS sch_run_owner ON public.sch_run;
DROP POLICY IF EXISTS sch_run_owner_or_admin ON public.sch_run;

CREATE POLICY sch_run_owner_or_admin
ON public.sch_run
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_platform_admin()
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_platform_admin()
);

COMMIT;
