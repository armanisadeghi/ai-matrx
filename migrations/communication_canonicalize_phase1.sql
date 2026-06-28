-- Phase 1 of the communication-schema reorg: canonicalize the messaging tables IN PLACE
-- in public (base columns, org backfill, visibility, canonical RLS via iam.apply_rls,
-- entity_types + composition registration, history triggers), so the SET SCHEMA move in
-- Phase 2 is a pure relocation. Idempotent; applied via Supabase MCP on txzxabzwovsujtloxrus.
--
-- Canonical model:
--   dm_conversations           entity     token dm_conversation
--   dm_messages                component  token dm_message            parent dm_conversation (conversation_id)
--   dm_conversation_participants component token dm_participant        parent dm_conversation (conversation_id)
--   sms_conversations          entity     token sms_conversation
--   sms_messages               component  token sms_message           parent sms_conversation (conversation_id)
--   sms_media                  component  token sms_message_media      parent sms_message (message_id)
--   sms_consent / sms_phone_numbers / sms_notification_preferences / sms_notifications  entity (already retrofitted)
--   sms_rate_limits / sms_webhook_logs / emails  infra/log (service-role/form RLS — not base entities)
--
-- Multi-party DM access: dm_conversation_participants rows are mirrored into public.permissions
-- grants on the conversation (trigger dm_participant_sync_grant), so canonical has_access resolves
-- for every active participant regardless of which surface adds/removes them.

-- ============================================================ SMS config cluster
ALTER TABLE public.sms_consent                   ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.sms_phone_numbers             ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.sms_notification_preferences  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.sms_notifications             ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
-- sms_notifications was missing updated_at/version + touch trigger
ALTER TABLE public.sms_notifications ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sms_notifications ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
DROP TRIGGER IF EXISTS trg_touch_row ON public.sms_notifications;
CREATE TRIGGER trg_touch_row BEFORE INSERT OR UPDATE ON public.sms_notifications FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
SELECT iam.apply_rls('public','sms_consent','sms_consent','entity');
SELECT iam.apply_rls('public','sms_phone_numbers','sms_phone_number','entity');
SELECT iam.apply_rls('public','sms_notification_preferences','sms_notification_preference','entity');
SELECT iam.apply_rls('public','sms_notifications','sms_notification','entity');

-- ============================================================ SMS conversation cluster
ALTER TABLE public.sms_conversations ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';

ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
UPDATE public.sms_messages m SET organization_id = c.organization_id
  FROM public.sms_conversations c WHERE m.conversation_id = c.id AND m.organization_id IS NULL;
UPDATE public.sms_messages SET created_by = sent_by_user_id WHERE created_by IS NULL AND sent_by_user_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_sms_messages_updated ON public.sms_messages;
DROP TRIGGER IF EXISTS trg_touch_row ON public.sms_messages;
DROP TRIGGER IF EXISTS trg_stamp_actor ON public.sms_messages;
DROP TRIGGER IF EXISTS trg_version_capture ON public.sms_messages;
CREATE TRIGGER trg_touch_row       BEFORE INSERT OR UPDATE ON public.sms_messages FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER trg_stamp_actor     BEFORE INSERT OR UPDATE ON public.sms_messages FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
CREATE TRIGGER trg_version_capture AFTER INSERT OR UPDATE OR DELETE ON public.sms_messages FOR EACH ROW EXECUTE FUNCTION platform._version_capture('sms_message');

ALTER TABLE public.sms_media ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.sms_media ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.sms_media ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.sms_media ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sms_media ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE public.sms_media ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
UPDATE public.sms_media md SET organization_id = m.organization_id, created_by = m.created_by
  FROM public.sms_messages m WHERE md.message_id = m.id AND md.organization_id IS NULL;
DROP TRIGGER IF EXISTS trg_touch_row ON public.sms_media;
DROP TRIGGER IF EXISTS trg_stamp_actor ON public.sms_media;
DROP TRIGGER IF EXISTS trg_version_capture ON public.sms_media;
CREATE TRIGGER trg_touch_row       BEFORE INSERT OR UPDATE ON public.sms_media FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER trg_stamp_actor     BEFORE INSERT OR UPDATE ON public.sms_media FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
CREATE TRIGGER trg_version_capture AFTER INSERT OR UPDATE OR DELETE ON public.sms_media FOR EACH ROW EXECUTE FUNCTION platform._version_capture('sms_message_media');

INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'sms_message','public','sms_messages','SMS Message','private',true,true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='sms_message');
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'sms_message_media','public','sms_media','SMS Media','private',true,true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='sms_message_media');
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'sms_message','sms_conversation','conversation_id','composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships WHERE child_type='sms_message' AND kind='composition');
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'sms_message_media','sms_message','message_id','composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships WHERE child_type='sms_message_media' AND kind='composition');

SELECT iam.apply_rls('public','sms_conversations','sms_conversation','entity');
SELECT iam.apply_rls('public','sms_messages','sms_message','component');
SELECT iam.apply_rls('public','sms_media','sms_message_media','component');

-- ============================================================ DM cluster
ALTER TABLE public.dm_conversations ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.dm_conversations ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.dm_conversations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.dm_conversations ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE public.dm_conversations ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.dm_conversations ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
UPDATE public.dm_conversations c SET organization_id = o.id
  FROM public.organizations o WHERE o.is_personal AND o.created_by = c.created_by AND c.organization_id IS NULL;
ALTER TABLE public.dm_conversations ALTER COLUMN organization_id SET NOT NULL;
DROP TRIGGER IF EXISTS set_updated_at ON public.dm_conversations;
DROP TRIGGER IF EXISTS trg_touch_row ON public.dm_conversations;
DROP TRIGGER IF EXISTS trg_stamp_actor ON public.dm_conversations;
DROP TRIGGER IF EXISTS trg_version_capture ON public.dm_conversations;
CREATE TRIGGER trg_touch_row       BEFORE INSERT OR UPDATE ON public.dm_conversations FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER trg_stamp_actor     BEFORE INSERT OR UPDATE ON public.dm_conversations FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
CREATE TRIGGER trg_version_capture AFTER INSERT OR UPDATE OR DELETE ON public.dm_conversations FOR EACH ROW EXECUTE FUNCTION platform._version_capture('dm_conversation');

ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
UPDATE public.dm_messages SET created_by = sender_id WHERE created_by IS NULL AND sender_id IS NOT NULL;
UPDATE public.dm_messages m SET organization_id = c.organization_id
  FROM public.dm_conversations c WHERE m.conversation_id = c.id AND m.organization_id IS NULL;
DROP TRIGGER IF EXISTS trg_touch_row ON public.dm_messages;
DROP TRIGGER IF EXISTS trg_stamp_actor ON public.dm_messages;
DROP TRIGGER IF EXISTS trg_version_capture ON public.dm_messages;
CREATE TRIGGER trg_touch_row       BEFORE INSERT OR UPDATE ON public.dm_messages FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER trg_stamp_actor     BEFORE INSERT OR UPDATE ON public.dm_messages FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
CREATE TRIGGER trg_version_capture AFTER INSERT OR UPDATE OR DELETE ON public.dm_messages FOR EACH ROW EXECUTE FUNCTION platform._version_capture('dm_message');

DROP TRIGGER IF EXISTS set_updated_at ON public.dm_conversation_participants;

INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'dm_conversation','public','dm_conversations','Direct Conversation','private',false,true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='dm_conversation');
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'dm_message','public','dm_messages','Direct Message','private',true,true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='dm_message');
UPDATE platform.entity_types SET is_component=true, schema_name='public', table_name='dm_conversation_participants' WHERE token='dm_participant';
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'dm_message','dm_conversation','conversation_id','composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships WHERE child_type='dm_message' AND kind='composition');
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'dm_participant','dm_conversation','conversation_id','composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships WHERE child_type='dm_participant' AND kind='composition');

INSERT INTO public.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission, is_active)
SELECT 'dm_conversation','public','dm_conversations','id','created_by','visibility','Direct Conversation','/messages/{id}',true,true
WHERE NOT EXISTS (SELECT 1 FROM public.shareable_resource_registry WHERE resource_type='dm_conversation');

INSERT INTO public.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status, created_by)
SELECT 'dm_conversation', p.conversation_id, p.user_id, 'editor', 'active', c.created_by
FROM public.dm_conversation_participants p
JOIN public.dm_conversations c ON c.id = p.conversation_id
WHERE p.deleted_at IS NULL AND p.user_id IS NOT NULL
ON CONFLICT (resource_type, resource_id, granted_to_user_id) DO NOTHING;

SELECT iam.apply_rls('public','dm_conversations','dm_conversation','entity');
SELECT iam.apply_rls('public','dm_messages','dm_message','component');
SELECT iam.apply_rls('public','dm_conversation_participants','dm_participant','component');

-- ============================================================ DM participant <-> grant sync + default org
CREATE OR REPLACE FUNCTION public.dm_participant_sync_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.permissions
     WHERE resource_type='dm_conversation' AND resource_id=OLD.conversation_id AND granted_to_user_id=OLD.user_id;
    RETURN OLD;
  END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.permissions
     WHERE resource_type='dm_conversation' AND resource_id=NEW.conversation_id AND granted_to_user_id=NEW.user_id;
  ELSE
    INSERT INTO public.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status, created_by)
    VALUES ('dm_conversation', NEW.conversation_id, NEW.user_id, 'editor', 'active', COALESCE(NEW.created_by, NEW.user_id))
    ON CONFLICT (resource_type, resource_id, granted_to_user_id) DO UPDATE SET status='active', permission_level='editor';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_dm_participant_sync_grant ON public.dm_conversation_participants;
CREATE TRIGGER trg_dm_participant_sync_grant AFTER INSERT OR UPDATE OR DELETE ON public.dm_conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.dm_participant_sync_grant();

CREATE OR REPLACE FUNCTION public.dm_default_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT o.id INTO NEW.organization_id FROM public.organizations o
     WHERE o.is_personal AND o.created_by = COALESCE(NEW.created_by, (SELECT auth.uid())) LIMIT 1;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_default_org ON public.dm_conversations;
CREATE TRIGGER trg_default_org BEFORE INSERT ON public.dm_conversations
  FOR EACH ROW EXECUTE FUNCTION public.dm_default_org();
