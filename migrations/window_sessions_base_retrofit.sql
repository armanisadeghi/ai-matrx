-- window_sessions base retrofit
-- Strategy: personal (user_id NOT NULL); has id uuid PK; 0 rows (empty table)
-- No metadata or deleted_at columns exist
-- Legacy trigger replaced: trg_ws_updated_at

ALTER TABLE public.window_sessions
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int not null default 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

DROP TRIGGER IF EXISTS trg_ws_updated_at ON public.window_sessions;

-- No rows to backfill (empty table); new rows stamped by triggers

DROP TRIGGER IF EXISTS trg_touch_row ON public.window_sessions;
CREATE TRIGGER trg_touch_row
  BEFORE INSERT OR UPDATE ON public.window_sessions
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_stamp_actor ON public.window_sessions;
CREATE TRIGGER trg_stamp_actor
  BEFORE INSERT OR UPDATE ON public.window_sessions
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_version_capture ON public.window_sessions;
CREATE TRIGGER trg_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.window_sessions
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('window_session');

INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('window_session', 'Window Session', 'public', 'window_sessions')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE v_null_org int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.window_sessions WHERE organization_id IS NULL;
  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'window_sessions: % rows still have NULL organization_id', v_null_org;
  END IF;
END $$;
