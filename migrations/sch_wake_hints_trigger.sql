-- sch_wake_hints_trigger
--
-- Post-insert and post-update trigger on sch_task. When a row becomes
-- "due now or soon" (next_due_at <= now()) and surfaces[] includes a
-- non-server surface, emit a Postgres NOTIFY on channel
-- 'sch_task_wake'. aidream's wake-hints listener publishes Supabase
-- Broadcast envelopes accordingly.
--
-- Notify payload (JSON): {task_id, user_id, surfaces}
-- Idempotent: CREATE OR REPLACE for function; DROP IF EXISTS + CREATE
-- for trigger.
--
-- Why a DB trigger (not an app-level hook):
--   The sch_task insert path is split across many callers (FE RPC
--   create_agent_task, FE-driven sch_enqueue_manual_run, future
--   matrx-extend / matrx-local writers, ad-hoc SQL). A DB-level trigger
--   is the single point that fires regardless of caller, so wake hints
--   are guaranteed for every task that becomes due. The aidream
--   listener stays decoupled: if it's down, hints are skipped but the
--   durable sch_task row is still picked up by the next polling tick.

CREATE OR REPLACE FUNCTION public.sch_task_wake_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only fire when next_due_at is set and is now or in the past.
  IF NEW.next_due_at IS NULL OR NEW.next_due_at > now() THEN
    RETURN NEW;
  END IF;
  -- Skip server-only tasks (aidream's existing scanner handles them
  -- without needing a wake hint -- it polls every 5s).
  IF NOT (NEW.surfaces && ARRAY['any','chrome-extension-chat','desktop','web','mobile','sandbox']::text[]) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_notify(
    'sch_task_wake',
    json_build_object(
      'task_id', NEW.id,
      'user_id', NEW.user_id,
      'surfaces', NEW.surfaces
    )::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sch_task_wake_trigger ON public.sch_task;
CREATE TRIGGER sch_task_wake_trigger
  AFTER INSERT OR UPDATE OF next_due_at ON public.sch_task
  FOR EACH ROW
  EXECUTE FUNCTION public.sch_task_wake_notify();

COMMENT ON TRIGGER sch_task_wake_trigger ON public.sch_task IS
  'Emits pg_notify on sch_task_wake when a task becomes due and targets non-server surfaces. Listened to by aidream wake-hints module (see aidream/api/cross_component/wake_listener.py).';

COMMENT ON FUNCTION public.sch_task_wake_notify() IS
  'Notify payload: {task_id, user_id, surfaces}. Server-only tasks are skipped (aidream poll handles them). Best-effort hint -- durable sch_task row is source of truth.';
