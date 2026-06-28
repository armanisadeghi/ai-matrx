-- kg_alerts base retrofit
-- Strategy: personal (user_id owner, org_id from personal org)
-- Rows: 18. Missing: created_by, updated_by, updated_at, version, metadata. Has: deleted_at, organization_id (nullable)

ALTER TABLE public.kg_alerts
  ADD COLUMN IF NOT EXISTS created_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version      int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill created_by from user_id
UPDATE public.kg_alerts
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- Backfill organization_id from personal org (user_id IS NOT NULL for all 18 rows)
UPDATE public.kg_alerts t
SET organization_id = (
  SELECT o.id FROM public.organizations o
  WHERE o.is_personal = true AND o.created_by = t.user_id
  ORDER BY o.created_at LIMIT 1
)
WHERE t.organization_id IS NULL AND t.user_id IS NOT NULL;

-- Attach _touch_row and _stamp_actor
DROP TRIGGER IF EXISTS trg_kg_alerts_touch ON public.kg_alerts;
CREATE TRIGGER trg_kg_alerts_touch
  BEFORE INSERT OR UPDATE ON public.kg_alerts
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_kg_alerts_stamp ON public.kg_alerts;
CREATE TRIGGER trg_kg_alerts_stamp
  BEFORE INSERT OR UPDATE ON public.kg_alerts
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Self-verify
DO $$
DECLARE
  v_null_org    int;
  v_null_cb     int;
  v_touch_ok    int;
  v_stamp_ok    int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.kg_alerts WHERE organization_id IS NULL;
  SELECT count(*) INTO v_null_cb  FROM public.kg_alerts WHERE created_by IS NULL;
  SELECT count(*) INTO v_touch_ok FROM pg_trigger WHERE tgrelid='public.kg_alerts'::regclass AND tgname='trg_kg_alerts_touch' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp_ok FROM pg_trigger WHERE tgrelid='public.kg_alerts'::regclass AND tgname='trg_kg_alerts_stamp' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'kg_alerts: % null org_ids remain', v_null_org; END IF;
  IF v_null_cb  > 0 THEN RAISE EXCEPTION 'kg_alerts: % null created_by remain (only OK if system rows)', v_null_cb; END IF;
  IF v_touch_ok = 0 THEN RAISE EXCEPTION 'kg_alerts: _touch_row trigger missing'; END IF;
  IF v_stamp_ok = 0 THEN RAISE EXCEPTION 'kg_alerts: _stamp_actor trigger missing'; END IF;
  RAISE NOTICE 'kg_alerts retrofit OK: 0 null org, 0 null created_by, triggers attached';
END $$;
