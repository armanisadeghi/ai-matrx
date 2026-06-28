-- content_blocks_base_retrofit.sql
-- Strategy: personal (all 101 rows have null user_id AND null org_id — system seed data → system org)
-- Step 1: retrofit_entity handles org/actor/triggers (legacy trigger: update_content_blocks_updated_at)
SELECT platform.retrofit_entity(
  'content_blocks',
  'content_block',
  'personal',
  'user_id',
  null,
  null,
  'update_content_blocks_updated_at'
);

-- Step 2: Remaining standard columns not added by retrofit_entity
ALTER TABLE public.content_blocks
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

-- Step 3: version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.content_blocks;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.content_blocks
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('content_block');

-- Step 4: Register in platform.entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'content_block', 'public', 'content_blocks', 'Content Block', 'private', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'content_block');

-- Step 5: Self-verify
DO $$
DECLARE
  v_null_org int;
  v_has_touch int;
  v_has_stamp int;
  v_has_vcap int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.content_blocks WHERE organization_id IS NULL;
  SELECT count(*) INTO v_has_touch FROM pg_trigger WHERE tgrelid='public.content_blocks'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_has_stamp FROM pg_trigger WHERE tgrelid='public.content_blocks'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;
  SELECT count(*) INTO v_has_vcap FROM pg_trigger WHERE tgrelid='public.content_blocks'::regclass AND tgname='_version_capture' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'content_blocks: % null organization_id', v_null_org; END IF;
  IF v_has_touch = 0 THEN RAISE EXCEPTION 'content_blocks: _touch_row missing'; END IF;
  IF v_has_stamp = 0 THEN RAISE EXCEPTION 'content_blocks: _stamp_actor missing'; END IF;
  IF v_has_vcap = 0 THEN RAISE EXCEPTION 'content_blocks: _version_capture missing'; END IF;
  RAISE NOTICE 'content_blocks: fully verified OK';
END $$;
