-- user_markdown_samples base retrofit
-- Strategy: personal (user_id owner); 0 rows; no org col currently
-- Already has: updated_at (via user_markdown_samples_set_updated_at trigger)

ALTER TABLE public.user_markdown_samples
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS version         int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.user_markdown_samples
SET created_by = user_id
WHERE created_by IS NULL;

UPDATE public.user_markdown_samples
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true
    AND created_by = user_markdown_samples.user_id
  ORDER BY created_at
  LIMIT 1
)
WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS user_markdown_samples_set_updated_at ON public.user_markdown_samples;

DROP TRIGGER IF EXISTS trg_user_markdown_samples_touch_row ON public.user_markdown_samples;
CREATE TRIGGER trg_user_markdown_samples_touch_row
  BEFORE INSERT OR UPDATE ON public.user_markdown_samples
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_user_markdown_samples_stamp_actor ON public.user_markdown_samples;
CREATE TRIGGER trg_user_markdown_samples_stamp_actor
  BEFORE INSERT OR UPDATE ON public.user_markdown_samples
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_user_markdown_samples_version_capture ON public.user_markdown_samples;
CREATE TRIGGER trg_user_markdown_samples_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.user_markdown_samples
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('user_markdown_sample');

INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('user_markdown_sample', 'User Markdown Sample', 'public', 'user_markdown_samples')
ON CONFLICT (token) DO NOTHING;

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
  FROM public.user_markdown_samples;
  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'user_markdown_samples: % rows NULL organization_id', v_null_org;
  END IF;
  RAISE NOTICE 'user_markdown_samples retrofit OK: total=%, null_org=%, null_cb=%', v_total, v_null_org, v_null_cb;
END $$;
