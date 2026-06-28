-- field_components_base_retrofit.sql
-- Strategy: personal (no org_id col yet; has is_public)
-- Legacy trigger: set_updated_at (drop via retrofit_entity)

-- Step 1: retrofit_entity handles org/actor/triggers
SELECT platform.retrofit_entity(
  'field_components',
  'field_component',
  'personal',
  'user_id',
  null,
  null,
  'set_updated_at'
);

-- Step 2: Remaining standard columns
ALTER TABLE public.field_components
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility platform.visibility not null default 'private';

-- Sync visibility from is_public
UPDATE public.field_components
  SET visibility = 'public'
  WHERE is_public IS TRUE AND visibility = 'private';

-- Step 3: version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.field_components;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.field_components
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('field_component');

-- Step 4: Register in platform.entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'field_component', 'public', 'field_components', 'Field Component', 'private', true, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'field_component');

-- Step 5: Self-verify
DO $$
DECLARE v_null_org int; v_has_touch int; v_has_stamp int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.field_components WHERE organization_id IS NULL;
  SELECT count(*) INTO v_has_touch FROM pg_trigger WHERE tgrelid='public.field_components'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_has_stamp FROM pg_trigger WHERE tgrelid='public.field_components'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'field_components: % null org', v_null_org; END IF;
  IF v_has_touch = 0 THEN RAISE EXCEPTION 'field_components: _touch_row missing'; END IF;
  IF v_has_stamp = 0 THEN RAISE EXCEPTION 'field_components: _stamp_actor missing'; END IF;
  RAISE NOTICE 'field_components: verified OK';
END $$;
