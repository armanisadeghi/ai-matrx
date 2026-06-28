-- user_feedback base retrofit
-- Strategy: personal (user_id NOT NULL); has id uuid PK; 289 rows
-- Legacy triggers: set_updated_at (replaced), trg_enforce_testing_before_close (preserved)
-- No metadata or deleted_at columns exist yet

ALTER TABLE public.user_feedback
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int not null default 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

-- Drop only the updated_at trigger; preserve trg_enforce_testing_before_close
DROP TRIGGER IF EXISTS set_updated_at ON public.user_feedback;

UPDATE public.user_feedback
SET created_by = user_id
WHERE created_by IS NULL;

UPDATE public.user_feedback uf
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true AND created_by = uf.user_id
  ORDER BY created_at LIMIT 1
)
WHERE organization_id IS NULL;

UPDATE public.user_feedback
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_touch_row ON public.user_feedback;
CREATE TRIGGER trg_touch_row
  BEFORE INSERT OR UPDATE ON public.user_feedback
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_stamp_actor ON public.user_feedback;
CREATE TRIGGER trg_stamp_actor
  BEFORE INSERT OR UPDATE ON public.user_feedback
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_version_capture ON public.user_feedback;
CREATE TRIGGER trg_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.user_feedback
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('user_feedback');

INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('user_feedback', 'User Feedback', 'public', 'user_feedback')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE v_null_org int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.user_feedback WHERE organization_id IS NULL;
  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'user_feedback: % rows still have NULL organization_id', v_null_org;
  END IF;
END $$;
