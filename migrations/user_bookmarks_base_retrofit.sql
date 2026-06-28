-- user_bookmarks base retrofit
-- Strategy: personal (user_id owner); 0 rows; no org col currently
-- Simple join-like table (user_id + canvas_id), but personal = add org

-- Add missing standard columns
ALTER TABLE public.user_bookmarks
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz,
  ADD COLUMN IF NOT EXISTS version         int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill (table is empty but include for future re-runs)
UPDATE public.user_bookmarks
SET created_by = user_id
WHERE created_by IS NULL;

UPDATE public.user_bookmarks
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true
    AND created_by = user_bookmarks.user_id
  ORDER BY created_at
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Attach standard triggers
DROP TRIGGER IF EXISTS trg_user_bookmarks_touch_row ON public.user_bookmarks;
CREATE TRIGGER trg_user_bookmarks_touch_row
  BEFORE INSERT OR UPDATE ON public.user_bookmarks
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_user_bookmarks_stamp_actor ON public.user_bookmarks;
CREATE TRIGGER trg_user_bookmarks_stamp_actor
  BEFORE INSERT OR UPDATE ON public.user_bookmarks
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_user_bookmarks_version_capture ON public.user_bookmarks;
CREATE TRIGGER trg_user_bookmarks_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.user_bookmarks
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('user_bookmark');

-- Register entity type
INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('user_bookmark', 'User Bookmark', 'public', 'user_bookmarks')
ON CONFLICT (token) DO NOTHING;

-- Self-verify
DO $$
DECLARE
  v_null_org  int;
  v_null_cb   int;
  v_total     int;
BEGIN
  SELECT
    count(*) FILTER (WHERE organization_id IS NULL),
    count(*) FILTER (WHERE created_by IS NULL),
    count(*)
  INTO v_null_org, v_null_cb, v_total
  FROM public.user_bookmarks;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'user_bookmarks: % rows have NULL organization_id', v_null_org;
  END IF;
  IF v_null_cb > 0 AND v_total > 0 THEN
    RAISE EXCEPTION 'user_bookmarks: % rows have NULL created_by', v_null_cb;
  END IF;
  RAISE NOTICE 'user_bookmarks retrofit OK: total=%, null_org=%, null_cb=%', v_total, v_null_org, v_null_cb;
END $$;
