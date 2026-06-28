-- ner_canonicalizer_shadow base retrofit
-- Strategy: personal (user_id owner). Rows: 49. Missing: created_by, updated_by, updated_at, version, metadata, deleted_at. Has: organization_id (nullable)

ALTER TABLE public.ner_canonicalizer_shadow
  ADD COLUMN IF NOT EXISTS created_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version      int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;

UPDATE public.ner_canonicalizer_shadow
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

UPDATE public.ner_canonicalizer_shadow t
SET organization_id = (
  SELECT o.id FROM public.organizations o
  WHERE o.is_personal = true AND o.created_by = t.user_id
  ORDER BY o.created_at LIMIT 1
)
WHERE t.organization_id IS NULL AND t.user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_ner_shadow_touch ON public.ner_canonicalizer_shadow;
CREATE TRIGGER trg_ner_shadow_touch
  BEFORE INSERT OR UPDATE ON public.ner_canonicalizer_shadow
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_ner_shadow_stamp ON public.ner_canonicalizer_shadow;
CREATE TRIGGER trg_ner_shadow_stamp
  BEFORE INSERT OR UPDATE ON public.ner_canonicalizer_shadow
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DO $$
DECLARE v_null_org int; v_null_cb int; v_touch int; v_stamp int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.ner_canonicalizer_shadow WHERE organization_id IS NULL;
  SELECT count(*) INTO v_null_cb  FROM public.ner_canonicalizer_shadow WHERE created_by IS NULL;
  SELECT count(*) INTO v_touch FROM pg_trigger WHERE tgrelid='public.ner_canonicalizer_shadow'::regclass AND tgname='trg_ner_shadow_touch' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger WHERE tgrelid='public.ner_canonicalizer_shadow'::regclass AND tgname='trg_ner_shadow_stamp' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'ner_canonicalizer_shadow: % null org', v_null_org; END IF;
  IF v_null_cb  > 0 THEN RAISE EXCEPTION 'ner_canonicalizer_shadow: % null created_by', v_null_cb; END IF;
  IF v_touch = 0 THEN RAISE EXCEPTION 'ner_canonicalizer_shadow: _touch_row missing'; END IF;
  IF v_stamp = 0 THEN RAISE EXCEPTION 'ner_canonicalizer_shadow: _stamp_actor missing'; END IF;
  RAISE NOTICE 'ner_canonicalizer_shadow retrofit OK';
END $$;
