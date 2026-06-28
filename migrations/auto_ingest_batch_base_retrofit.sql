-- auto_ingest_batch base retrofit
-- Strategy: personal (user_id owner); 0 rows so backfill is no-op
-- Drop legacy touch trigger first so backfill doesn't stamp updated_at
DROP TRIGGER IF EXISTS trg_auto_ingest_batch_touch_updated_at ON public.auto_ingest_batch;

-- Add missing standard columns
ALTER TABLE public.auto_ingest_batch
  ADD COLUMN IF NOT EXISTS created_by    uuid,
  ADD COLUMN IF NOT EXISTS updated_by    uuid,
  ADD COLUMN IF NOT EXISTS version       int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz;
-- metadata already exists (NOT NULL jsonb)

-- Backfill actor (guard on IS NULL for idempotency)
UPDATE public.auto_ingest_batch
SET created_by = user_id
WHERE created_by IS NULL;

-- Backfill org (personal: user's personal org)
UPDATE public.auto_ingest_batch
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true
    AND created_by = auto_ingest_batch.user_id
  ORDER BY created_at
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Attach standard triggers
DROP TRIGGER IF EXISTS trg_auto_ingest_batch_touch_row ON public.auto_ingest_batch;
CREATE TRIGGER trg_auto_ingest_batch_touch_row
  BEFORE INSERT OR UPDATE ON public.auto_ingest_batch
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_auto_ingest_batch_stamp_actor ON public.auto_ingest_batch;
CREATE TRIGGER trg_auto_ingest_batch_stamp_actor
  BEFORE INSERT OR UPDATE ON public.auto_ingest_batch
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_auto_ingest_batch_version_capture ON public.auto_ingest_batch;
CREATE TRIGGER trg_auto_ingest_batch_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.auto_ingest_batch
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('auto_ingest_batch');

-- Register entity type (idempotent)
INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('auto_ingest_batch', 'Auto Ingest Batch', 'public', 'auto_ingest_batch')
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
  FROM public.auto_ingest_batch;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'auto_ingest_batch: % rows have NULL organization_id', v_null_org;
  END IF;
  -- null created_by OK only if total=0 (empty table)
  IF v_null_cb > 0 AND v_total > 0 THEN
    RAISE EXCEPTION 'auto_ingest_batch: % rows have NULL created_by', v_null_cb;
  END IF;
  RAISE NOTICE 'auto_ingest_batch retrofit OK: total=%, null_org=%, null_cb=%', v_total, v_null_org, v_null_cb;
END $$;
