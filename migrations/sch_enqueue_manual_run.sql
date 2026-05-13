-- migrations/sch_enqueue_manual_run.sql
--
-- "Run now" RPC. Inserts a queued sch_run row for the given task, with
-- ownership validation. Used by the matrx-frontend FE today
-- (features/scheduling/service/queries.ts::runTaskNow) and will be used
-- by @matrx/scheduler-client when shipped.
--
-- Behavior:
--   - Requires an authenticated caller (auth.uid() IS NOT NULL).
--   - Looks up the task's owner; raises P0002 if the task does not exist.
--   - Authorization: caller must own the task OR be a super_admin
--     (public.is_super_admin()). Otherwise raises 42501 forbidden.
--   - Stamps user_id from the task row (not the caller — important for
--     super_admin running tasks on behalf of other users).
--   - Inserts (status='queued', surface=NULL, queue='default',
--     trigger_id=NULL, due_at=now()).
--   - surface=NULL is significant: the claiming scanner stamps its own
--     surface when it picks the run up. The parent task's `surfaces`
--     array still gates which scanners are eligible (see
--     queries.py::find_queued_runs).
--   - Returns the new run id.
--
-- The partial unique index sch_run_unique_active_per_task guarantees we
-- don't double-enqueue when another run is already in flight for the
-- same task — the INSERT will raise SQLSTATE 23505, which propagates to
-- the caller as a clean "already queued" failure.
--
-- This DDL was previously applied directly to the live DB. Backfilling
-- here so fresh-DB resets keep the RPC intact. CREATE OR REPLACE is
-- idempotent. The function body matches the live definition verified
-- via pg_get_functiondef on 2026-05-12 — DO NOT change the error codes
-- or column set without updating the FE callsite.

CREATE OR REPLACE FUNCTION public.sch_enqueue_manual_run(p_task_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_task_user_id uuid;
  v_run_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_task_user_id FROM public.sch_task WHERE id = p_task_id;
  IF v_task_user_id IS NULL THEN
    RAISE EXCEPTION 'task not found: %', p_task_id USING ERRCODE = 'P0002';
  END IF;
  IF v_task_user_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: caller does not own task' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sch_run (task_id, trigger_id, user_id, status, surface, queue, due_at)
  VALUES (p_task_id, NULL, v_task_user_id, 'queued', NULL, 'default', now())
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

COMMENT ON FUNCTION public.sch_enqueue_manual_run(uuid) IS
  '"Run now" — enqueue a manual sch_run for a task the caller owns (or is super_admin for). Returns the new run id. Raises 42501 if not authenticated / not authorized; P0002 if task not found. surface=NULL means the claiming scanner stamps its own.';
