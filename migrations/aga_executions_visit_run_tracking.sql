-- ============================================================
-- Phase 1d follow-up — visit + run lifecycle tracking on aga_executions
-- ============================================================
-- Splits the existing all-or-nothing execution row into two kinds:
--   * 'visit'  — user opened an agent app (no run yet)
--   * 'run'    — user clicked Run; row is INSERTed at run-start with
--                success NULL, then UPDATEd to success=true/false on
--                completion or error
--
-- The success-rate rollup is updated to count only kind='run' rows where
-- `success IS NOT NULL` (so the run-start INSERT doesn't pre-bump totals
-- and visits don't pollute).
--
-- The rate-limit BEFORE-INSERT trigger now fires only for kind='run' so
-- visits never count against an app's quota.
--
-- Idempotent: rerunnable.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Add `kind` column ('visit' | 'run').
-- ------------------------------------------------------------
ALTER TABLE public.aga_executions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'run';

-- Constraint added separately so the IF NOT EXISTS works regardless of
-- whether the column already existed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.aga_executions'::regclass
       AND conname  = 'aga_executions_kind_check'
  ) THEN
    ALTER TABLE public.aga_executions
      ADD CONSTRAINT aga_executions_kind_check
      CHECK (kind IN ('visit', 'run'));
  END IF;
END$$;

-- ------------------------------------------------------------
-- 2. Index for analytics queries that filter by kind.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_aga_executions_app_kind_created
  ON public.aga_executions(app_id, kind, created_at DESC);

-- ------------------------------------------------------------
-- 3. Success-rate rollup: only count completed runs.
--
-- The original trigger counted every row regardless of `success` IS NULL
-- and regardless of `kind`. After this migration:
--   - Visit rows are ignored entirely (early return).
--   - Run rows with success NULL (in-flight) don't bump totals.
--   - Once the client UPDATEs success to true/false, the trigger fires
--     again and the row is counted.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_agent_app_success_rate()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_success_count INTEGER;
  v_total_count   INTEGER;
  v_rate          NUMERIC(5,4);
BEGIN
  IF NEW.kind <> 'run' THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE success = true),
    COUNT(*) FILTER (WHERE success IS NOT NULL)
  INTO v_success_count, v_total_count
  FROM public.aga_executions
  WHERE app_id = NEW.app_id AND kind = 'run';

  IF v_total_count > 0 THEN
    v_rate := (v_success_count::NUMERIC / v_total_count);
    UPDATE public.aga_apps
       SET success_rate      = v_rate,
           total_executions  = v_total_count,
           last_execution_at = GREATEST(
             COALESCE(last_execution_at, '-infinity'::timestamptz),
             NEW.created_at
           )
     WHERE id = NEW.app_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 4. Rate-limit BEFORE-INSERT trigger: skip visit rows.
--
-- The function body itself is unchanged from the original
-- create_agent_app_rate_limits_table.sql migration. We only re-attach the
-- trigger with a WHEN clause so kind='visit' inserts bypass it entirely.
-- (Visits aren't billable execution attempts.)
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_agent_app_rate_limit ON public.aga_executions;
CREATE TRIGGER trg_agent_app_rate_limit
  BEFORE INSERT ON public.aga_executions
  FOR EACH ROW
  WHEN (NEW.kind = 'run')
  EXECUTE FUNCTION public.enforce_agent_app_rate_limit();

-- ------------------------------------------------------------
-- 5. INSERT RLS for guest visits.
--
-- The original `agent_app_executions_insert_anon` policy required the app
-- to be both `status='published'` AND `is_public=true`. That's the right
-- gate for run-start writes from /p/<slug>, but it also gates visit
-- writes. We keep the published+public gate intact — the API route uses
-- the admin client so it bypasses RLS regardless. This block is just a
-- belt-and-suspenders comment to make the contract obvious to future
-- agents.
-- ------------------------------------------------------------

COMMIT;

COMMENT ON COLUMN public.aga_executions.kind IS
  'Lifecycle kind: ''visit'' (page opened, no run) or ''run'' (run-start INSERT, then success UPDATEd to true/false on completion/error).';
