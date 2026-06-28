-- sandbox_instances_base_retrofit.sql
-- Strategy: personal (already has org_id with 0 nulls, already has deleted_at)
-- Legacy triggers: sandbox_instances_updated_at (drop via retrofit_entity),
--   _mirror_proj + _mirror_task + sandbox_instances_set_expires (preserved)

-- Step 1: retrofit_entity handles org/actor/triggers
SELECT platform.retrofit_entity(
  'sandbox_instances',
  'sandbox_instance',
  'personal',
  'user_id',
  null,
  null,
  'sandbox_instances_updated_at'
);

-- Step 2: Remaining standard columns (deleted_at already exists)
ALTER TABLE public.sandbox_instances
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;
-- is_public exists but no visibility col requested for sandbox_instances

-- Step 3: version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.sandbox_instances;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.sandbox_instances
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('sandbox_instance');

-- Step 4: Register in platform.entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'sandbox_instance', 'public', 'sandbox_instances', 'Sandbox Instance', 'private', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'sandbox_instance');

-- Step 5: Self-verify
DO $$
DECLARE v_null_org int; v_has_touch int; v_has_stamp int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.sandbox_instances WHERE organization_id IS NULL;
  SELECT count(*) INTO v_has_touch FROM pg_trigger WHERE tgrelid='public.sandbox_instances'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_has_stamp FROM pg_trigger WHERE tgrelid='public.sandbox_instances'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'sandbox_instances: % null org', v_null_org; END IF;
  IF v_has_touch = 0 THEN RAISE EXCEPTION 'sandbox_instances: _touch_row missing'; END IF;
  IF v_has_stamp = 0 THEN RAISE EXCEPTION 'sandbox_instances: _stamp_actor missing'; END IF;
  RAISE NOTICE 'sandbox_instances: verified OK';
END $$;
