-- auto_ingest_cost_event base retrofit
-- Strategy: ledger/append-only (idempotency_key TEXT PK, no uuid id, no version/deleted_at)
-- 272 rows; user_id NOT NULL; organization_id nullable -> backfill from personal org

-- Add missing standard columns (ledger: only created_by, no version/updated_by/deleted_at)
ALTER TABLE public.auto_ingest_cost_event
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS metadata   jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill actor
UPDATE public.auto_ingest_cost_event
SET created_by = user_id
WHERE created_by IS NULL;

-- Backfill org from personal org
UPDATE public.auto_ingest_cost_event
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true
    AND created_by = auto_ingest_cost_event.user_id
  ORDER BY created_at
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Stamp actor trigger only (ledger: no touch_row since no updated_at/version)
DROP TRIGGER IF EXISTS trg_auto_ingest_cost_event_stamp_actor ON public.auto_ingest_cost_event;
CREATE TRIGGER trg_auto_ingest_cost_event_stamp_actor
  BEFORE INSERT ON public.auto_ingest_cost_event
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Register entity type
INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('auto_ingest_cost_event', 'Auto Ingest Cost Event', 'public', 'auto_ingest_cost_event')
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
  FROM public.auto_ingest_cost_event;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'auto_ingest_cost_event: % rows have NULL organization_id', v_null_org;
  END IF;
  IF v_null_cb > 0 THEN
    RAISE EXCEPTION 'auto_ingest_cost_event: % rows have NULL created_by', v_null_cb;
  END IF;
  RAISE NOTICE 'auto_ingest_cost_event retrofit OK: total=%, null_org=%, null_cb=%', v_total, v_null_org, v_null_cb;
END $$;
