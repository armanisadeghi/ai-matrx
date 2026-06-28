-- page_extraction_page_runs base retrofit
-- Strategy: child of page_extraction_runs (via run_id); org already NOT NULL (stamp_run_org handles inserts)
-- 85 rows; user_id nullable; organization_id NOT NULL already

-- Add missing standard columns
ALTER TABLE public.page_extraction_page_runs
  ADD COLUMN IF NOT EXISTS created_by  uuid,
  ADD COLUMN IF NOT EXISTS updated_by  uuid,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS version     int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS metadata    jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill actor from user_id (may be null for system rows)
UPDATE public.page_extraction_page_runs
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- org is already NOT NULL - no backfill needed

-- Attach standard triggers (keep existing stamp_run_org, emit_run_lifecycle, rollup triggers)
DROP TRIGGER IF EXISTS trg_page_extraction_page_runs_touch_row ON public.page_extraction_page_runs;
CREATE TRIGGER trg_page_extraction_page_runs_touch_row
  BEFORE INSERT OR UPDATE ON public.page_extraction_page_runs
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_page_extraction_page_runs_stamp_actor ON public.page_extraction_page_runs;
CREATE TRIGGER trg_page_extraction_page_runs_stamp_actor
  BEFORE INSERT OR UPDATE ON public.page_extraction_page_runs
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_page_extraction_page_runs_version_capture ON public.page_extraction_page_runs;
CREATE TRIGGER trg_page_extraction_page_runs_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.page_extraction_page_runs
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('page_extraction_page_run');

-- Register entity type
INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('page_extraction_page_run', 'Page Extraction Page Run', 'public', 'page_extraction_page_runs')
ON CONFLICT (token) DO NOTHING;

-- Self-verify
DO $$
DECLARE
  v_null_org  int;
  v_null_cb   int;
  v_total     int;
BEGIN
  SELECT
    count(*) FILTER (WHERE organization_id IS NULL),
    count(*) FILTER (WHERE created_by IS NULL),
    count(*)
  INTO v_null_org, v_null_cb, v_total
  FROM public.page_extraction_page_runs;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'page_extraction_page_runs: % rows have NULL organization_id', v_null_org;
  END IF;
  RAISE NOTICE 'page_extraction_page_runs retrofit OK: total=%, null_org=%, null_cb=%', v_total, v_null_org, v_null_cb;
END $$;
