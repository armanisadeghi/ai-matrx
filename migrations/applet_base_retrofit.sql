-- applet_base_retrofit.sql
-- Strategy: personal (no org_id col yet; has is_public; NO updated_at)
-- 4 of 6 rows had orphaned user_id (deleted auth.users) — null them first
-- FK: applet_user_id_fkey → auth.users ON DELETE SET NULL NOT VALID

-- Step 1: Add updated_at (retrofit_entity requires it for _touch_row)
ALTER TABLE public.applet
  ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();

-- Step 2: Null orphaned user_id rows (users deleted from auth.users)
UPDATE public.applet
  SET user_id = NULL
  WHERE user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = applet.user_id);

-- Step 3: retrofit_entity (no legacy updated_at trigger to drop)
SELECT platform.retrofit_entity(
  'applet',
  'applet',
  'personal',
  'user_id',
  null,
  null,
  null
);

-- Step 4: Remaining standard columns
ALTER TABLE public.applet
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility platform.visibility not null default 'private';

-- Sync visibility from is_public
UPDATE public.applet
  SET visibility = 'public'
  WHERE is_public IS TRUE AND visibility = 'private';

-- Step 5: version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.applet;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.applet
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('applet');

-- Step 6: Register in platform.entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'applet', 'public', 'applet', 'Applet', 'private', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'applet');

-- Step 7: Self-verify
DO $$
DECLARE
  v_null_org int;
  v_has_touch int;
  v_has_stamp int;
  v_has_vcap int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.applet WHERE organization_id IS NULL;
  SELECT count(*) INTO v_has_touch FROM pg_trigger WHERE tgrelid='public.applet'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_has_stamp FROM pg_trigger WHERE tgrelid='public.applet'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;
  SELECT count(*) INTO v_has_vcap FROM pg_trigger WHERE tgrelid='public.applet'::regclass AND tgname='_version_capture' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'applet: % null organization_id', v_null_org; END IF;
  IF v_has_touch = 0 THEN RAISE EXCEPTION 'applet: _touch_row missing'; END IF;
  IF v_has_stamp = 0 THEN RAISE EXCEPTION 'applet: _stamp_actor missing'; END IF;
  IF v_has_vcap = 0 THEN RAISE EXCEPTION 'applet: _version_capture missing'; END IF;
  RAISE NOTICE 'applet: retrofit verified OK (null_org=%)', v_null_org;
END $$;
