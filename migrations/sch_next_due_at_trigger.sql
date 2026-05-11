-- migrations/sch_next_due_at_trigger.sql
--
-- DB-level invariant: `sch_task.next_due_at` is always the MIN of its
-- enabled triggers' next_due_at. Today the application maintains this by
-- hand (spec §11: "Not yet built — application maintains it today"); after
-- this migration the DB does it on every INSERT / UPDATE / DELETE of
-- sch_trigger.
--
-- Why it matters: the scanner's primary filter is
-- `sch_task.next_due_at <= now()` (per spec §2, sch_task_user_due_idx is
-- partial on `enabled = true`). If application code ever forgets to bump
-- the cache, tasks silently stop firing. Moving the invariant to the DB
-- eliminates that class of bug across every surface (web, extension,
-- aidream, future).
--
-- Related plan: ~/.claude/plans/please-review-this-so-squishy-tome.md

BEGIN;

CREATE OR REPLACE FUNCTION public.sch_recompute_task_next_due_at(p_task_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sch_task
     SET next_due_at = (
       SELECT MIN(t.next_due_at)
         FROM public.sch_trigger t
        WHERE t.task_id = p_task_id
          AND t.enabled = true
          AND t.next_due_at IS NOT NULL
     )
   WHERE id = p_task_id;
$$;

COMMENT ON FUNCTION public.sch_recompute_task_next_due_at IS
  'Recomputes sch_task.next_due_at = MIN(sch_trigger.next_due_at WHERE enabled). Called by the AFTER trigger on sch_trigger. SECURITY DEFINER so the trigger can update the parent task even when called from a context that lacks direct UPDATE rights on sch_task — RLS still gates whether the row mutation that fired the trigger was allowed in the first place.';

CREATE OR REPLACE FUNCTION public.sch_trigger_cascade_next_due_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sch_recompute_task_next_due_at(OLD.task_id);
    RETURN OLD;
  END IF;

  PERFORM public.sch_recompute_task_next_due_at(NEW.task_id);

  -- If a trigger's task_id is reassigned (rare), refresh the previous
  -- parent too so its cache doesn't strand.
  IF TG_OP = 'UPDATE' AND OLD.task_id IS DISTINCT FROM NEW.task_id THEN
    PERFORM public.sch_recompute_task_next_due_at(OLD.task_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sch_trigger_cascade_next_due_at ON public.sch_trigger;

CREATE TRIGGER sch_trigger_cascade_next_due_at
AFTER INSERT OR UPDATE OR DELETE ON public.sch_trigger
FOR EACH ROW
EXECUTE FUNCTION public.sch_trigger_cascade_next_due_at();

-- One-time backfill for any rows that drifted before the trigger existed.
UPDATE public.sch_task t
   SET next_due_at = sub.min_due
  FROM (
    SELECT task_id, MIN(next_due_at) AS min_due
      FROM public.sch_trigger
     WHERE enabled = true
       AND next_due_at IS NOT NULL
     GROUP BY task_id
  ) sub
 WHERE t.id = sub.task_id
   AND (t.next_due_at IS DISTINCT FROM sub.min_due);

COMMIT;
