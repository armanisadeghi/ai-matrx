-- content_template_base_retrofit.sql
-- Strategy: personal (already has organization_id with 0 nulls, already has metadata)
-- Already has: organization_id, metadata, is_public
-- Legacy triggers: _mirror_proj (keep), set_updated_at (drop via _touch_row)

-- Step 1: Add missing standard columns (metadata already exists)
ALTER TABLE public.content_template
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int not null default 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS visibility platform.visibility not null default 'private';

-- Step 2: Drop legacy updated_at trigger before backfill (keep _mirror_proj — out of scope)
DROP TRIGGER IF EXISTS set_updated_at ON public.content_template;

-- Step 3: Backfill
UPDATE public.content_template
  SET created_by = user_id
  WHERE created_by IS NULL AND user_id IS NOT NULL;

-- org already populated; system fallback for any nulls
UPDATE public.content_template
  SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  WHERE organization_id IS NULL;

-- Sync visibility from is_public
UPDATE public.content_template
  SET visibility = 'public'
  WHERE is_public IS TRUE AND visibility = 'private';

-- Step 4: Attach _touch_row + _stamp_actor
DROP TRIGGER IF EXISTS _touch_row ON public.content_template;
CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.content_template
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS _stamp_actor ON public.content_template;
CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.content_template
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Step 5: Attach _version_capture
DROP TRIGGER IF EXISTS _version_capture ON public.content_template;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.content_template
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('content_template');

-- Step 6: Register in platform.entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'content_template', 'public', 'content_template', 'Content Template', 'private', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'content_template');

-- Step 7: Self-verify
DO $$
DECLARE
  v_null_org int;
  v_null_creator int;
  v_has_touch int;
  v_has_stamp int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.content_template WHERE organization_id IS NULL;
  SELECT count(*) INTO v_null_creator FROM public.content_template WHERE created_by IS NULL AND user_id IS NOT NULL;
  SELECT count(*) INTO v_has_touch FROM pg_trigger WHERE tgrelid='public.content_template'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_has_stamp FROM pg_trigger WHERE tgrelid='public.content_template'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'content_template: % null organization_id rows', v_null_org; END IF;
  IF v_null_creator > 0 THEN RAISE EXCEPTION 'content_template: % null created_by rows (user_id not null)', v_null_creator; END IF;
  IF v_has_touch = 0 THEN RAISE EXCEPTION 'content_template: _touch_row trigger missing'; END IF;
  IF v_has_stamp = 0 THEN RAISE EXCEPTION 'content_template: _stamp_actor trigger missing'; END IF;
  RAISE NOTICE 'content_template: retrofit verified OK (null_org=%, null_creator=%)', v_null_org, v_null_creator;
END $$;
