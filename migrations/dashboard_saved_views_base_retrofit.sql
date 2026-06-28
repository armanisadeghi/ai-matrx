-- dashboard_saved_views_base_retrofit
-- Strategy: personal (user_id owner, 2 rows)
-- Applied as dashboard_saved_views_base_retrofit_v2 due to migration timestamp collision on first attempt

-- Step 1: Add missing standard columns
ALTER TABLE public.dashboard_saved_views
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS version         int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Step 2: Drop legacy updated_at trigger before backfill
DROP TRIGGER IF EXISTS set_updated_at ON public.dashboard_saved_views;

-- Step 3: Backfill actor
UPDATE public.dashboard_saved_views SET created_by = user_id WHERE created_by IS NULL;
UPDATE public.dashboard_saved_views SET updated_by = user_id WHERE updated_by IS NULL;

-- Step 4: Backfill org (personal)
UPDATE public.dashboard_saved_views d
SET organization_id = COALESCE(
  (SELECT o.id FROM public.organizations o
   WHERE o.created_by = d.user_id AND o.is_personal = true
   ORDER BY o.created_at LIMIT 1),
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
)
WHERE organization_id IS NULL;

-- Step 5: Attach _touch_row trigger
DROP TRIGGER IF EXISTS _touch_row ON public.dashboard_saved_views;
CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.dashboard_saved_views
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- Step 6: Attach _stamp_actor trigger
DROP TRIGGER IF EXISTS _stamp_actor ON public.dashboard_saved_views;
CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.dashboard_saved_views
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Step 7: Attach _version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.dashboard_saved_views;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.dashboard_saved_views
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('dashboard_saved_view');

-- Step 8: Register entity type (idempotent)
INSERT INTO platform.entity_types (token, schema_name, table_name, label, notes)
VALUES ('dashboard_saved_view', 'public', 'dashboard_saved_views', 'Dashboard Saved View', 'A saved filter/sort/column configuration for an admin dashboard table')
ON CONFLICT (token) DO NOTHING;

-- Step 9: Self-verify
DO $$
DECLARE
  v_null_org   bigint;
  v_null_actor bigint;
  v_touch      bigint;
  v_stamp      bigint;
BEGIN
  SELECT count(*) INTO v_null_org   FROM public.dashboard_saved_views WHERE organization_id IS NULL;
  SELECT count(*) INTO v_null_actor FROM public.dashboard_saved_views WHERE created_by IS NULL;
  SELECT count(*) INTO v_touch FROM pg_trigger
    WHERE tgrelid='public.dashboard_saved_views'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger
    WHERE tgrelid='public.dashboard_saved_views'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'dashboard_saved_views: % rows have NULL organization_id', v_null_org;
  END IF;
  IF v_null_actor > 0 THEN
    RAISE EXCEPTION 'dashboard_saved_views: % rows have NULL created_by', v_null_actor;
  END IF;
  IF v_touch = 0 THEN
    RAISE EXCEPTION 'dashboard_saved_views: _touch_row trigger not attached';
  END IF;
  IF v_stamp = 0 THEN
    RAISE EXCEPTION 'dashboard_saved_views: _stamp_actor trigger not attached';
  END IF;
  RAISE NOTICE 'dashboard_saved_views: retrofit OK';
END $$;
