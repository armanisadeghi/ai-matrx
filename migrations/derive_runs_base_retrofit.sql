-- derive_runs base retrofit
-- Strategy: personal; org already NOT NULL (stamp_run_org BEFORE INSERT already handles new rows)
-- 14 rows; user_id nullable (system rows ok); organization_id NOT NULL already

-- Add missing standard columns
ALTER TABLE public.derive_runs
  ADD COLUMN IF NOT EXISTS created_by  uuid,
  ADD COLUMN IF NOT EXISTS updated_by  uuid,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS version     int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;
-- metadata already exists (nullable jsonb)

-- Backfill actor from user_id (may be null for system rows - that's OK)
UPDATE public.derive_runs
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- org is already NOT NULL - no backfill needed

-- Attach standard triggers (keep existing stamp_run_org and emit_run_lifecycle)
DROP TRIGGER IF EXISTS trg_derive_runs_touch_row ON public.derive_runs;
CREATE TRIGGER trg_derive_runs_touch_row
  BEFORE INSERT OR UPDATE ON public.derive_runs
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_derive_runs_stamp_actor ON public.derive_runs;
CREATE TRIGGER trg_derive_runs_stamp_actor
  BEFORE INSERT OR UPDATE ON public.derive_runs
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_derive_runs_version_capture ON public.derive_runs;
CREATE TRIGGER trg_derive_runs_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.derive_runs
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('derive_run');

-- Register entity type
INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('derive_run', 'Derive Run', 'public', 'derive_runs')
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
  FROM public.derive_runs;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'derive_runs: % rows have NULL organization_id', v_null_org;
  END IF;
  -- null created_by allowed for system rows (user_id was null)
  RAISE NOTICE 'derive_runs retrofit OK: total=%, null_org=%, null_cb=%', v_total, v_null_org, v_null_cb;
END $$;
