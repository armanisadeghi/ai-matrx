-- sch_kind_widen
--
-- Widen the sch_task.kind CHECK constraint to support non-agent task
-- kinds. The original constraint allowed only 'agent'; this opens it
-- to:
--   - 'agent'  -- existing matrx-ai agent task (kept for back-compat)
--   - 'tool'   -- generic cross-component RPC: payload = {tool_name, args}
--   - 'ping'   -- example minimal kind, for end-to-end verification
--
-- Each kind has a corresponding child table (sch_<kind>_task) for its
-- type-specific fields. For 'tool' and 'ping' the child table is
-- optional -- args live in sch_task.tags / a future sch_tool_task table.
-- This migration only widens the kind enum; child tables land separately
-- when their kinds graduate beyond verification.
--
-- Idempotent: ALTER ... DROP CONSTRAINT IF EXISTS, then re-add with the
-- wider whitelist. Safe to re-apply against a DB that already has the
-- new constraint.

ALTER TABLE public.sch_task
  DROP CONSTRAINT IF EXISTS sch_task_kind_chk;

ALTER TABLE public.sch_task
  ADD CONSTRAINT sch_task_kind_chk
  CHECK (kind IN ('agent', 'tool', 'ping'));

COMMENT ON CONSTRAINT sch_task_kind_chk ON public.sch_task IS
  'Allowed task kinds. Widened from agent-only on 2026-05-12 to support cross-component tool dispatch (kind=tool) and end-to-end verification (kind=ping).';
