-- user_memory base retrofit
-- Strategy: personal (user_id owner); 1 row; no org col currently
-- Already has: updated_at (via user_memory_updated_at trigger)

-- Add missing standard columns
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS version         int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill actor
UPDATE public.user_memory
SET created_by = user_id
WHERE created_by IS NULL;

-- Backfill org from personal org
UPDATE public.user_memory
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true
    AND created_by = user_memory.user_id
  ORDER BY created_at
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Drop legacy updated_at trigger; _touch_row replaces it
DROP TRIGGER IF EXISTS user_memory_updated_at ON public.user_memory;

-- Attach standard triggers
DROP TRIGGER IF EXISTS trg_user_memory_touch_row ON public.user_memory;
CREATE TRIGGER trg_user_memory_touch_row
  BEFORE INSERT OR UPDATE ON public.user_memory
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_user_memory_stamp_actor ON public.user_memory;
CREATE TRIGGER trg_user_memory_stamp_actor
  BEFORE INSERT OR UPDATE ON public.user_memory
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_user_memory_version_capture ON public.user_memory;
CREATE TRIGGER trg_user_memory_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.user_memory
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('user_memory');

-- Register entity type
INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('user_memory', 'User Memory', 'public', 'user_memory')
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
  FROM public.user_memory;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'user_memory: % rows have NULL organization_id', v_null_org;
  END IF;
  IF v_null_cb > 0 THEN
    RAISE EXCEPTION 'user_memory: % rows have NULL created_by', v_null_cb;
  END IF;
  RAISE NOTICE 'user_memory retrofit OK: total=%, null_org=%, null_cb=%', v_total, v_null_org, v_null_cb;
END $$;
