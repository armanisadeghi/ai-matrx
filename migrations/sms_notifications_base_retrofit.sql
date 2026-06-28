-- sms_notifications base retrofit
-- Classification: Base-3 ledger (append-only event log: sent_at, no updated_at, no version)
-- Empty table (0 rows). No legacy triggers.
-- No _touch_row (no updated_at), no version, no deleted_at per ledger pattern.

ALTER TABLE public.sms_notifications
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

ALTER TABLE public.sms_notifications
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

DROP TRIGGER IF EXISTS trg_stamp_actor ON public.sms_notifications;
CREATE TRIGGER trg_stamp_actor
  BEFORE INSERT OR UPDATE ON public.sms_notifications
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_version_capture ON public.sms_notifications;
CREATE TRIGGER trg_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.sms_notifications
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('sms_notification');

INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('sms_notification', 'SMS Notification', 'public', 'sms_notifications')
ON CONFLICT (token) DO NOTHING;
