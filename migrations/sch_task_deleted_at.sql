-- migrations/sch_task_deleted_at.sql
--
-- Decouple "paused" from "deleted" on sch_task.
--
-- Before this migration, the FE "Delete schedule" action sets
-- enabled = false (the same state as the Pause/Resume toggle). That makes
-- it impossible to distinguish "user pressed Delete and expects the row
-- gone" from "user paused this task and expects to see it again". On
-- reload, soft-deleted rows reappear because listAgentTasks has no way to
-- filter them out without also hiding paused tasks.
--
-- Fix:
--   * sch_task.deleted_at TIMESTAMPTZ NULL — set when the user soft-deletes.
--   * Partial index on (user_id, updated_at DESC) WHERE deleted_at IS NULL
--     so the common "my schedules, newest first" list query stays fast.
--   * Scanner query already filters enabled=true; package's soft_delete_task
--     also flips enabled to false (belt-and-suspenders against any stale
--     state where deleted_at is non-null but enabled is somehow true).
--
-- No backfill required — existing rows get deleted_at = NULL by default,
-- which is exactly the "not deleted" state. Tasks the user previously
-- "deleted" via the buggy code path will reappear once -- the FE will
-- need to filter them out manually, OR the user can re-delete them via
-- the now-working flow. We do NOT auto-backfill because there's no
-- reliable signal in the existing data to identify which enabled=false
-- rows were paused vs. deleted.

BEGIN;

ALTER TABLE public.sch_task
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS sch_task_user_id_active_idx
    ON public.sch_task (user_id, updated_at DESC)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.sch_task.deleted_at IS
    'When non-null, the task has been soft-deleted by the user and should be hidden from list queries. RLS still applies; we never hard-delete because sch_run.task_id FK would orphan run history.';

COMMIT;
