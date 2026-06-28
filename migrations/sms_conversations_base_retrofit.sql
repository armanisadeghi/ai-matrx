-- sms_conversations base retrofit
-- Strategy: personal (user_id owner); has id uuid PK
-- Legacy trigger replaced: trg_sms_conversations_updated

ALTER TABLE public.sms_conversations
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int not null default 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

ALTER TABLE public.sms_conversations
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

DROP TRIGGER IF EXISTS trg_sms_conversations_updated ON public.sms_conversations;

UPDATE public.sms_conversations
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

UPDATE public.sms_conversations sc
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true AND created_by = sc.user_id
  ORDER BY created_at LIMIT 1
)
WHERE organization_id IS NULL AND user_id IS NOT NULL;

UPDATE public.sms_conversations
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_touch_row ON public.sms_conversations;
CREATE TRIGGER trg_touch_row
  BEFORE INSERT OR UPDATE ON public.sms_conversations
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_stamp_actor ON public.sms_conversations;
CREATE TRIGGER trg_stamp_actor
  BEFORE INSERT OR UPDATE ON public.sms_conversations
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_version_capture ON public.sms_conversations;
CREATE TRIGGER trg_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.sms_conversations
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('sms_conversation');

INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('sms_conversation', 'SMS Conversation', 'public', 'sms_conversations')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE v_null_org int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.sms_conversations WHERE organization_id IS NULL;
  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'sms_conversations: % rows still have NULL organization_id', v_null_org;
  END IF;
END $$;
