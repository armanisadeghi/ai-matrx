-- shortcut_categories_base_retrofit
-- Strategy: personal with system-org fallback (user_id nullable — 57/62 rows are system rows)
-- Already has organization_id + metadata. Has project_id + task_id litter — KEEP (additive only).
-- No created_at/updated_at columns at all — add both.

-- Step 1: Add missing standard columns
ALTER TABLE public.shortcut_categories
  ADD COLUMN IF NOT EXISTS created_by  uuid,
  ADD COLUMN IF NOT EXISTS updated_by  uuid,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version     int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

-- No legacy updated_at trigger to drop (none existed)

-- Step 2: Backfill actor — system rows (user_id IS NULL) get NULL created_by (valid: system actor)
UPDATE public.shortcut_categories SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.shortcut_categories SET updated_by = user_id WHERE updated_by IS NULL AND user_id IS NOT NULL;

-- Step 3: Backfill org:
--   rows with user_id → personal org
--   rows without user_id but with organization_id → keep as-is
--   rows with neither → system org
UPDATE public.shortcut_categories sc
SET organization_id = COALESCE(
  (SELECT o.id FROM public.organizations o
   WHERE o.created_by = sc.user_id AND o.is_personal = true
   ORDER BY o.created_at LIMIT 1),
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
)
WHERE organization_id IS NULL AND user_id IS NOT NULL;

-- System rows with no user_id and no org → assign system org
UPDATE public.shortcut_categories
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
WHERE organization_id IS NULL;

-- Step 4: Attach _touch_row trigger
DROP TRIGGER IF EXISTS _touch_row ON public.shortcut_categories;
CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.shortcut_categories
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- Step 5: Attach _stamp_actor trigger
DROP TRIGGER IF EXISTS _stamp_actor ON public.shortcut_categories;
CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.shortcut_categories
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Step 6: Attach _version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.shortcut_categories;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.shortcut_categories
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('shortcut_category');

-- Step 7: Register entity type (idempotent)
INSERT INTO platform.entity_types (token, schema_name, table_name, label, notes)
VALUES ('shortcut_category', 'public', 'shortcut_categories', 'Shortcut Category', 'Agent shortcut placement categories; mostly system-owned, nullable user_id')
ON CONFLICT (token) DO NOTHING;

-- Step 8: Self-verify
DO $$
DECLARE
  v_null_org   bigint;
  v_touch      bigint;
  v_stamp      bigint;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.shortcut_categories WHERE organization_id IS NULL;
  SELECT count(*) INTO v_touch FROM pg_trigger
    WHERE tgrelid='public.shortcut_categories'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger
    WHERE tgrelid='public.shortcut_categories'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'shortcut_categories: % rows have NULL organization_id', v_null_org;
  END IF;
  IF v_touch = 0 THEN
    RAISE EXCEPTION 'shortcut_categories: _touch_row trigger not attached';
  END IF;
  IF v_stamp = 0 THEN
    RAISE EXCEPTION 'shortcut_categories: _stamp_actor trigger not attached';
  END IF;
  RAISE NOTICE 'shortcut_categories: retrofit OK (null_org=%, triggers=OK)', v_null_org;
END $$;
