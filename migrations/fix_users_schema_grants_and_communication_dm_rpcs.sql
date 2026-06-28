-- Post-reorg fixes (2026-06-28):
-- 1) users.user_preferences direct PostgREST reads/writes need schema USAGE
-- 2) DM RPCs/triggers still referenced bare dm_* after communication_move_phase2
-- 3) get_user_dashboard_metrics still counted public.dm_messages

-- ── users schema exposure for PostgREST clients ───────────────────────────────
GRANT USAGE ON SCHEMA users TO authenticated, anon, service_role;

-- ── Dashboard metrics: communication.dm_messages ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('agents',0,'conversations',0,'knowledge_files',0,'published_apps',0,
      'notes',0,'tasks',0,'transcripts',0,'scopes',0,'shortcuts',0,'research_reports',0,'podcasts',0,'messages',0);
  end if;
  return jsonb_build_object(
    'agents',           (select count(*) from agent.definition      where created_by = uid and coalesce(is_archived, false) = false),
    'conversations',    (select count(*) from chat.conversation      where created_by = uid and deleted_at is null),
    'knowledge_files',  (select count(*) from files.files            where created_by = uid and deleted_at is null),
    'published_apps',   (select count(*) from app.definition         where created_by = uid and status = 'published'),
    'notes',            (select count(*) from workbench.notes        where created_by = uid and deleted_at is null),
    'tasks',            (select count(*) from workspace.tasks        where created_by = uid),
    'transcripts',      (select count(*) from transcripts.transcripts where user_id = uid and coalesce(is_deleted, false) = false),
    'scopes',           (select count(*) from context.scopes         where created_by = uid),
    'shortcuts',        (select count(*) from agent.shortcut         where created_by = uid and coalesce(is_active, false) = true),
    'research_reports', (select count(*) from research.rs_topic      where created_by = uid),
    'podcasts',         (select count(*) from public.pc_episodes     where user_id = uid),
    'messages',         (select count(*) from communication.dm_messages where sender_id = uid and deleted_at is null)
  );
end;
$function$;

-- ── DM RPCs: schema-qualify communication.* ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dm_conversations_with_details(p_user_id uuid)
 RETURNS TABLE(conversation_id uuid, conversation_type text, group_name text, group_image_url text, conversation_created_at timestamp with time zone, conversation_updated_at timestamp with time zone, last_message_content text, last_message_sender_id uuid, last_message_at timestamp with time zone, unread_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'communication'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS conversation_id,
    c.type AS conversation_type,
    c.group_name,
    c.group_image_url,
    c.created_at AS conversation_created_at,
    c.updated_at AS conversation_updated_at,
    m.content AS last_message_content,
    m.sender_id AS last_message_sender_id,
    m.msg_created_at AS last_message_at,
    get_dm_unread_count(c.id, p_user_id) AS unread_count
  FROM communication.dm_conversations c
  JOIN communication.dm_conversation_participants cp ON cp.conversation_id = c.id
  LEFT JOIN LATERAL (
    SELECT
      dm.content,
      dm.sender_id,
      dm.created_at AS msg_created_at
    FROM communication.dm_messages dm
    WHERE dm.conversation_id = c.id
    AND dm.deleted_at IS NULL
    ORDER BY dm.created_at DESC
    LIMIT 1
  ) m ON true
  WHERE cp.user_id = p_user_id
  AND cp.is_archived = false
  ORDER BY COALESCE(m.msg_created_at, c.updated_at) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dm_unread_count(p_conversation_id uuid, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'communication'
AS $function$
DECLARE
  v_last_read TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  SELECT last_read_at INTO v_last_read
  FROM communication.dm_conversation_participants
  WHERE conversation_id = p_conversation_id
  AND user_id = p_user_id;

  SELECT COUNT(*) INTO v_count
  FROM communication.dm_messages
  WHERE conversation_id = p_conversation_id
  AND sender_id != p_user_id
  AND deleted_at IS NULL
  AND (v_last_read IS NULL OR created_at > v_last_read);

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_dm_direct_conversation(p_user1_id uuid, p_user2_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'communication'
AS $function$
DECLARE
  v_conversation_id UUID;
BEGIN
  SELECT c.id INTO v_conversation_id
  FROM communication.dm_conversations c
  WHERE c.type = 'direct'
  AND EXISTS (
    SELECT 1 FROM communication.dm_conversation_participants cp1
    WHERE cp1.conversation_id = c.id AND cp1.user_id = p_user1_id
  )
  AND EXISTS (
    SELECT 1 FROM communication.dm_conversation_participants cp2
    WHERE cp2.conversation_id = c.id AND cp2.user_id = p_user2_id
  )
  AND (
    SELECT COUNT(*) FROM communication.dm_conversation_participants cp
    WHERE cp.conversation_id = c.id
  ) = 2
  LIMIT 1;

  RETURN v_conversation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_dm_participant(p_conversation_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'communication'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM communication.dm_conversation_participants
    WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_dm_conversation_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'communication'
AS $function$
BEGIN
  UPDATE communication.dm_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;
