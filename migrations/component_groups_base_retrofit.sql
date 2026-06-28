-- component_groups_base_retrofit.sql
-- Strategy: personal (no org_id col yet; has is_public)
-- Legacy trigger: set_updated_at (drop via retrofit_entity)

-- Step 1: retrofit_entity handles org/actor/triggers
SELECT platform.retrofit_entity(
  'component_groups',
  'component_group',
  'personal',
  'user_id',
  null,
  null,
  'set_updated_at'
);

-- Step 2: Remaining standard columns
ALTER TABLE public.component_groups
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility platform.visibility not null default 'private';

-- Sync visibility from is_public
UPDATE public.component_groups
  SET visibility = 'public'
  WHERE is_public IS TRUE AND visibility = 'private';

-- Step 3: version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.component_groups;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.component_groups
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('component_group');

-- Step 4: Register in platform.entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'component_group', 'public', 'component_groups', 'Component Group', 'private', true, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'component_group');

-- Step 5: Self-verify
DO $$
DECLARE v_null_org int; v_has_touch int; v_has_stamp int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.component_groups WHERE organization_id IS NULL;
  SELECT count(*) INTO v_has_touch FROM pg_trigger WHERE tgrelid='public.component_groups'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_has_stamp FROM pg_trigger WHERE tgrelid='public.component_groups'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'component_groups: % null org', v_null_org; END IF;
  IF v_has_touch = 0 THEN RAISE EXCEPTION 'component_groups: _touch_row missing'; END IF;
  IF v_has_stamp = 0 THEN RAISE EXCEPTION 'component_groups: _stamp_actor missing'; END IF;
  RAISE NOTICE 'component_groups: verified OK';
END $$;
