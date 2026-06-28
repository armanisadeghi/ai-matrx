-- agent_run base retrofit — HOT TABLE, additive only
-- org already NOT NULL; 59 rows; 13 null user_id = system rows (OK)
-- Already has: updated_at (via stamp_run_org), organization_id NOT NULL

-- Add missing standard columns only
ALTER TABLE public.agent_run
  ADD COLUMN IF NOT EXISTS created_by  uuid,
  ADD COLUMN IF NOT EXISTS updated_by  uuid,
  ADD COLUMN IF NOT EXISTS version     int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS metadata    jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill actor from user_id (null for system rows - that is OK)
UPDATE public.agent_run
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- org already NOT NULL - no backfill needed

-- Drop legacy set_updated_at trigger; _touch_row replaces it
DROP TRIGGER IF EXISTS agent_run_set_updated_at ON public.agent_run;

-- Attach _touch_row (replaces legacy updated_at trigger)
DROP TRIGGER IF EXISTS trg_agent_run_touch_row ON public.agent_run;
CREATE TRIGGER trg_agent_run_touch_row
  BEFORE INSERT OR UPDATE ON public.agent_run
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- Attach _stamp_actor
DROP TRIGGER IF EXISTS trg_agent_run_stamp_actor ON public.agent_run;
CREATE TRIGGER trg_agent_run_stamp_actor
  BEFORE INSERT OR UPDATE ON public.agent_run
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Version capture (history)
DROP TRIGGER IF EXISTS trg_agent_run_version_capture ON public.agent_run;
CREATE TRIGGER trg_agent_run_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_run
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('agent_run');

-- Register entity type
INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('agent_run', 'Agent Run', 'public', 'agent_run')
ON CONFLICT (token) DO NOTHING;

-- Self-verify (null_cb allowed for system rows)
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
  FROM public.agent_run;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'agent_run: % rows have NULL organization_id', v_null_org;
  END IF;
  RAISE NOTICE 'agent_run retrofit OK: total=%, null_org=%, null_cb=% (system rows)', v_total, v_null_org, v_null_cb;
END $$;
