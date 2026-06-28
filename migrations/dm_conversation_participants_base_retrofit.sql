-- dm_conversation_participants base retrofit
-- Child table of dm_conversations (which has no org yet either)
-- Strategy: personal via participant's user_id (dm_conversations has no org to denormalize from)
-- Has id uuid PK, user_id NOT NULL. Missing: created_at, updated_at, metadata
-- No legacy triggers.

ALTER TABLE public.dm_conversation_participants
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int not null default 1,
  ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

UPDATE public.dm_conversation_participants
SET created_by = user_id
WHERE created_by IS NULL;

UPDATE public.dm_conversation_participants dcp
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true AND created_by = dcp.user_id
  ORDER BY created_at LIMIT 1
)
WHERE organization_id IS NULL;

UPDATE public.dm_conversation_participants
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_touch_row ON public.dm_conversation_participants;
CREATE TRIGGER trg_touch_row
  BEFORE INSERT OR UPDATE ON public.dm_conversation_participants
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_stamp_actor ON public.dm_conversation_participants;
CREATE TRIGGER trg_stamp_actor
  BEFORE INSERT OR UPDATE ON public.dm_conversation_participants
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DROP TRIGGER IF EXISTS trg_version_capture ON public.dm_conversation_participants;
CREATE TRIGGER trg_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.dm_conversation_participants
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('dm_participant');

INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('dm_participant', 'DM Conversation Participant', 'public', 'dm_conversation_participants')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE v_null_org int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.dm_conversation_participants WHERE organization_id IS NULL;
  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'dm_conversation_participants: % rows still have NULL organization_id', v_null_org;
  END IF;
END $$;
