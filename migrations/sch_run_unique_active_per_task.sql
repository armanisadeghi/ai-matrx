-- migrations/sch_run_unique_active_per_task.sql
--
-- Atomic-claim primitive for matrx-scheduler. Both the Python scanner
-- (packages/matrx-scheduler/matrx_scheduler/queries.py::claim_task) and
-- the planned @matrx/scheduler-client TS client INSERT a row into
-- sch_run with status='queued' | 'claimed' | 'running' to claim a task.
-- The partial unique index below guarantees AT MOST ONE active run per
-- task at any time — race losers receive SQLSTATE 23505 from Postgres
-- (postgres-js error.code === '23505') and back off.
--
-- Without this index, two scanner instances (or scanner + manual "Run
-- now" RPC) could double-execute a task with no detection: each INSERT
-- would simply succeed, leaving multiple non-terminal runs side by side,
-- and the surface would launch the agent twice.
--
-- This DDL was previously applied directly to the live DB. Backfilling
-- here so fresh-DB resets keep the claim primitive intact. Idempotent
-- via IF NOT EXISTS — safe to apply against a DB that already has it.
--
-- See queries.py docstring for the catch logic:
--   "INSERT into sch_run. The partial unique index
--    `sch_run_unique_active_per_task` ... raises a unique violation on
--    the second concurrent claimer — we catch it and return None."

CREATE UNIQUE INDEX IF NOT EXISTS sch_run_unique_active_per_task
  ON public.sch_run (task_id)
  WHERE status IN ('queued', 'claimed', 'running');

COMMENT ON INDEX public.sch_run_unique_active_per_task IS
  'Atomic-claim primitive for matrx-scheduler — at most one non-terminal run per task. Race losers see SQLSTATE 23505.';
