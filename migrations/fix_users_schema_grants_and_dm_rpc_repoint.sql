-- Fix dashboard runtime errors after schema moves (2026-06-28):
-- 1) users.user_preferences: authenticated lacked USAGE on schema users (42501)
-- 2) get_user_dashboard_metrics still referenced public.dm_messages (regressed by research_canon_05)
-- 3) DM RPC/trigger functions still referenced unqualified dm_* tables after communication move

-- ── users schema PostgREST grants (mirror communication_schema.sql) ──────────
CREATE SCHEMA IF NOT EXISTS users;
GRANT USAGE ON SCHEMA users TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA users TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA users TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA users TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA users
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA users
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA users
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon, service_role;

-- ── Dashboard metrics (communication.dm_messages + research.rs_topic) ────────
CREATE OR REPLACE FUNCTION public.get_user_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'agents', 0, 'conversations', 0, 'knowledge_files', 0, 'published_apps', 0,
      'notes', 0, 'tasks', 0, 'transcripts', 0, 'scopes', 0, 'shortcuts', 0,
      'research_reports', 0, 'podcasts', 0, 'messages', 0
    );
  END IF;
  RETURN jsonb_build_object(
    'agents',           (SELECT count(*) FROM agent.definition       WHERE created_by = uid AND coalesce(is_archived, false) = false),
    'conversations',    (SELECT count(*) FROM chat.conversation       WHERE created_by = uid AND deleted_at IS NULL),
    'knowledge_files',  (SELECT count(*) FROM files.files             WHERE created_by = uid AND deleted_at IS NULL),
    'published_apps',   (SELECT count(*) FROM app.definition          WHERE created_by = uid AND status = 'published'),
    'notes',            (SELECT count(*) FROM workbench.notes         WHERE created_by = uid AND deleted_at IS NULL),
    'tasks',            (SELECT count(*) FROM workspace.tasks         WHERE created_by = uid),
    'transcripts',      (SELECT count(*) FROM transcripts.transcripts WHERE user_id = uid AND coalesce(is_deleted, false) = false),
    'scopes',           (SELECT count(*) FROM context.scopes          WHERE created_by = uid),
    'shortcuts',        (SELECT count(*) FROM agent.shortcut          WHERE created_by = uid AND coalesce(is_active, false) = true),
    'research_reports', (SELECT count(*) FROM research.rs_topic       WHERE created_by = uid),
    'podcasts',         (SELECT count(*) FROM public.pc_episodes      WHERE user_id = uid),
    'messages',         (SELECT count(*) FROM communication.dm_messages WHERE sender_id = uid AND deleted_at IS NULL)
  );
END;
$function$;

-- ── DM RPCs → communication.* ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dm_unread_count(p_conversation_id uuid, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_last_read timestamptz;
  v_count integer;
BEGIN
  SELECT last_read_at INTO v_last_read
  FROM communication.dm_conversation_participants
  WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id;

  SELECT count(*) INTO v_count
  FROM communication.dm_messages
  WHERE conversation_id = p_conversation_id
    AND sender_id != p_user_id
    AND deleted_at IS NULL
    AND (v_last_read IS NULL OR created_at > v_last_read);

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dm_conversations_with_details(p_user_id uuid)
 RETURNS TABLE(
   conversation_id uuid,
   conversation_type text,
   group_name text,
   group_image_url text,
   conversation_created_at timestamptz,
   conversation_updated_at timestamptz,
   last_message_content text,
   last_message_sender_id uuid,
   last_message_at timestamptz,
   unread_count integer
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  JOIN communication.dm_conversation_participants cp
    ON cp.conversation_id = c.id
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
  ORDER BY coalesce(m.msg_created_at, c.updated_at) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_dm_direct_conversation(p_user1_id uuid, p_user2_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conversation_id uuid;
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
      SELECT count(*) FROM communication.dm_conversation_participants cp
      WHERE cp.conversation_id = c.id
    ) = 2
  LIMIT 1;

  RETURN v_conversation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_dm_participant(p_conversation_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
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
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE communication.dm_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;
