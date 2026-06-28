-- kg_value_matches base retrofit
-- Strategy: personal (user_id owner). Rows: 3. Missing: created_by, updated_by, updated_at, version, metadata. Has: deleted_at, organization_id (nullable)

ALTER TABLE public.kg_value_matches
  ADD COLUMN IF NOT EXISTS created_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version      int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill created_by from user_id
UPDATE public.kg_value_matches
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- Backfill organization_id from personal org
UPDATE public.kg_value_matches t
SET organization_id = (
  SELECT o.id FROM public.organizations o
  WHERE o.is_personal = true AND o.created_by = t.user_id
  ORDER BY o.created_at LIMIT 1
)
WHERE t.organization_id IS NULL AND t.user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_kg_value_matches_touch ON public.kg_value_matches;
CREATE TRIGGER trg_kg_value_matches_touch
  BEFORE INSERT OR UPDATE ON public.kg_value_matches
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_kg_value_matches_stamp ON public.kg_value_matches;
CREATE TRIGGER trg_kg_value_matches_stamp
  BEFORE INSERT OR UPDATE ON public.kg_value_matches
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DO $$
DECLARE v_null_org int; v_null_cb int; v_touch int; v_stamp int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.kg_value_matches WHERE organization_id IS NULL;
  SELECT count(*) INTO v_null_cb  FROM public.kg_value_matches WHERE created_by IS NULL;
  SELECT count(*) INTO v_touch FROM pg_trigger WHERE tgrelid='public.kg_value_matches'::regclass AND tgname='trg_kg_value_matches_touch' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger WHERE tgrelid='public.kg_value_matches'::regclass AND tgname='trg_kg_value_matches_stamp' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'kg_value_matches: % null org', v_null_org; END IF;
  IF v_null_cb  > 0 THEN RAISE EXCEPTION 'kg_value_matches: % null created_by', v_null_cb; END IF;
  IF v_touch = 0 THEN RAISE EXCEPTION 'kg_value_matches: _touch_row trigger missing'; END IF;
  IF v_stamp = 0 THEN RAISE EXCEPTION 'kg_value_matches: _stamp_actor trigger missing'; END IF;
  RAISE NOTICE 'kg_value_matches retrofit OK';
END $$;
