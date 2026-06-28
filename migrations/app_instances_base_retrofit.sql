-- app_instances_base_retrofit.sql
-- Strategy: personal (already has organization_id with 0 nulls)
-- Legacy updated_at triggers: set_app_instances_updated_at, trigger_app_instances_updated_at (drop both)

-- Step 1: Add missing standard columns
ALTER TABLE public.app_instances
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int not null default 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

-- Step 2: Drop legacy updated_at triggers before backfill
DROP TRIGGER IF EXISTS set_app_instances_updated_at ON public.app_instances;
DROP TRIGGER IF EXISTS trigger_app_instances_updated_at ON public.app_instances;

-- Step 3: Backfill created_by from user_id (guard IS NULL)
UPDATE public.app_instances
  SET created_by = user_id
  WHERE created_by IS NULL AND user_id IS NOT NULL;

-- Backfill organization_id (already 0 nulls — but ensure personal org for any stragglers)
UPDATE public.app_instances ai
  SET organization_id = (
    SELECT id FROM public.organizations
    WHERE is_personal = true AND created_by = ai.user_id
    ORDER BY created_at LIMIT 1
  )
  WHERE ai.organization_id IS NULL AND ai.user_id IS NOT NULL;

-- System org fallback for any remaining nulls
UPDATE public.app_instances
  SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  WHERE organization_id IS NULL;

-- Step 4: Attach _touch_row + _stamp_actor
DROP TRIGGER IF EXISTS _touch_row ON public.app_instances;
CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.app_instances
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS _stamp_actor ON public.app_instances;
CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.app_instances
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Step 5: Attach _version_capture
DROP TRIGGER IF EXISTS _version_capture ON public.app_instances;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.app_instances
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('app_instance');

-- Step 6: Register in platform.entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'app_instance', 'public', 'app_instances', 'App Instance', 'private', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'app_instance');

-- Step 7: Self-verify
DO $$
DECLARE
  v_null_org int;
  v_null_creator int;
  v_has_touch int;
  v_has_stamp int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.app_instances WHERE organization_id IS NULL;
  SELECT count(*) INTO v_null_creator FROM public.app_instances WHERE created_by IS NULL AND user_id IS NOT NULL;
  SELECT count(*) INTO v_has_touch FROM pg_trigger WHERE tgrelid='public.app_instances'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_has_stamp FROM pg_trigger WHERE tgrelid='public.app_instances'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'app_instances: % null organization_id rows', v_null_org; END IF;
  IF v_null_creator > 0 THEN RAISE EXCEPTION 'app_instances: % null created_by rows (user_id not null)', v_null_creator; END IF;
  IF v_has_touch = 0 THEN RAISE EXCEPTION 'app_instances: _touch_row trigger missing'; END IF;
  IF v_has_stamp = 0 THEN RAISE EXCEPTION 'app_instances: _stamp_actor trigger missing'; END IF;
  RAISE NOTICE 'app_instances: retrofit verified OK (null_org=%, null_creator=%)', v_null_org, v_null_creator;
END $$;
