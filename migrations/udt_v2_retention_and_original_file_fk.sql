-- ============================================================================
-- udt_v2_retention_and_original_file_fk
-- ============================================================================
--
-- Two unrelated-but-small additions, kept together so we don't churn the
-- migration history with single-statement files:
--
--   1. Weekly pg_cron job that trims udt_dataset_row_versions per the policy:
--      "keep ALL versions ≤ 2 weeks old, AND ALWAYS keep the most recent 2
--      versions per row regardless of age." (Wave H, decided 2026-06-05.)
--      A version row is deleted only when BOTH conditions are true:
--        - older than 14 days, AND
--        - not in the top-2-by-recency for its row_id.
--
--   2. FK on udt_workbooks.original_file_id → cld_files(id). The column has
--      existed since udt_v2_backbone but the FK was deliberately deferred
--      until the workbook surface landed (it's here now). ON DELETE SET NULL
--      so deleting the source file does NOT cascade-delete the workbook —
--      losing the link to the original is acceptable; losing the workbook is
--      not.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Retention trimmer for udt_dataset_row_versions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.udt_dataset_row_versions_trim()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
  v_started timestamptz := clock_timestamp();
BEGIN
  WITH ranked AS (
    SELECT
      id,
      row_id,
      changed_at,
      ROW_NUMBER() OVER (PARTITION BY row_id ORDER BY changed_at DESC) AS recency_rank,
      (changed_at < (now() - INTERVAL '14 days')) AS is_older_than_two_weeks
    FROM udt_dataset_row_versions
  ),
  to_delete AS (
    SELECT id
    FROM ranked
    WHERE recency_rank > 2
      AND is_older_than_two_weeks
  ),
  deleted AS (
    DELETE FROM udt_dataset_row_versions
    WHERE id IN (SELECT id FROM to_delete)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN jsonb_build_object(
    'function',     'udt_dataset_row_versions_trim',
    'policy',       'keep latest 2 OR within 14d',
    'rows_deleted', v_deleted,
    'duration_ms',  EXTRACT(MILLISECOND FROM (clock_timestamp() - v_started))::int,
    'trimmed_at',   now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.udt_dataset_row_versions_trim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.udt_dataset_row_versions_trim() TO service_role;

-- Cron schedule: Sunday 03:00 UTC. Idempotent — re-running the migration
-- will unschedule the old one before re-adding so the schedule never drifts
-- to two copies.
DO $$
BEGIN
  PERFORM cron.unschedule('udt_dataset_row_versions_trim_weekly');
EXCEPTION WHEN OTHERS THEN
  -- No existing job — fine.
  NULL;
END$$;

SELECT cron.schedule(
  'udt_dataset_row_versions_trim_weekly',
  '0 3 * * 0',   -- minute hour day-of-month month day-of-week
  $cron$ SELECT public.udt_dataset_row_versions_trim(); $cron$
);

-- ---------------------------------------------------------------------------
-- 2. FK: udt_workbooks.original_file_id -> cld_files(id)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'udt_workbooks_original_file_id_fkey'
      AND conrelid = 'public.udt_workbooks'::regclass
  ) THEN
    ALTER TABLE public.udt_workbooks
      ADD CONSTRAINT udt_workbooks_original_file_id_fkey
      FOREIGN KEY (original_file_id)
      REFERENCES public.cld_files(id)
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_udt_workbooks_original_file_id
  ON public.udt_workbooks(original_file_id)
  WHERE original_file_id IS NOT NULL;

COMMIT;
