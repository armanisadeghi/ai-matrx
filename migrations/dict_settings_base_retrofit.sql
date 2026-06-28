-- dict_settings base retrofit
-- Multi-level config (user/org/scope_type/scope): user_id nullable, org nullable.
-- Rows: 0. Strategy: personal where user_id present; otherwise system org fallback.
-- Has: updated_at. Missing: created_by, updated_by, version, metadata, deleted_at.
-- Existing trigger: dict_settings_touch_trg → dict_touch_updated_at (just updated_at → DROP, replace with _touch_row).

ALTER TABLE public.dict_settings
  ADD COLUMN IF NOT EXISTS created_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_by   uuid,
  ADD COLUMN IF NOT EXISTS version      int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;

-- Backfill created_by from user_id (0 rows, so this is a no-op but idempotent)
UPDATE public.dict_settings
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- Backfill organization_id for user-owned rows without org
UPDATE public.dict_settings t
SET organization_id = (
  SELECT o.id FROM public.organizations o
  WHERE o.is_personal = true AND o.created_by = t.user_id
  ORDER BY o.created_at LIMIT 1
)
WHERE t.organization_id IS NULL AND t.user_id IS NOT NULL;

-- Drop legacy updated_at-only trigger
DROP TRIGGER IF EXISTS dict_settings_touch_trg ON public.dict_settings;

-- Attach canonical triggers
DROP TRIGGER IF EXISTS trg_dict_settings_touch ON public.dict_settings;
CREATE TRIGGER trg_dict_settings_touch
  BEFORE INSERT OR UPDATE ON public.dict_settings
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_dict_settings_stamp ON public.dict_settings;
CREATE TRIGGER trg_dict_settings_stamp
  BEFORE INSERT OR UPDATE ON public.dict_settings
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DO $$
DECLARE v_null_org int; v_touch int; v_stamp int; v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM public.dict_settings;
  SELECT count(*) INTO v_null_org FROM public.dict_settings WHERE organization_id IS NULL AND user_id IS NOT NULL;
  SELECT count(*) INTO v_touch FROM pg_trigger WHERE tgrelid='public.dict_settings'::regclass AND tgname='trg_dict_settings_touch' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger WHERE tgrelid='public.dict_settings'::regclass AND tgname='trg_dict_settings_stamp' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'dict_settings: % user-owned rows with null org', v_null_org; END IF;
  IF v_touch = 0 THEN RAISE EXCEPTION 'dict_settings: _touch_row missing'; END IF;
  IF v_stamp = 0 THEN RAISE EXCEPTION 'dict_settings: _stamp_actor missing'; END IF;
  RAISE NOTICE 'dict_settings retrofit OK: % total rows, triggers attached', v_total;
END $$;
