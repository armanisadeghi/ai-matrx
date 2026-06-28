-- Phase 2 of the communication-schema reorg: relocate the 13 messaging tables
-- public.* -> communication.* (clean cut, no shim). Requires `communication` exposed to
-- PostgREST (done). Idempotent; applied via Supabase MCP on txzxabzwovsujtloxrus.
-- SET SCHEMA carries columns/PK/indexes/constraints/inbound-FKs/RLS-policies/triggers/sequences.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['emails','dm_conversations','dm_messages','dm_conversation_participants',
    'sms_consent','sms_conversations','sms_media','sms_messages','sms_notification_preferences',
    'sms_notifications','sms_phone_numbers','sms_rate_limits','sms_webhook_logs']
  LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA communication', t);
    END IF;
  END LOOP;
END $$;

-- Registry schema_name (entity_types drives RLS/has_access schema resolution)
UPDATE platform.entity_types SET schema_name='communication'
 WHERE token IN ('dm_conversation','dm_message','dm_participant','sms_conversation',
   'sms_message','sms_message_media','sms_consent','sms_notification','sms_notification_preference','sms_phone_number');
UPDATE public.shareable_resource_registry SET schema_name='communication' WHERE resource_type='dm_conversation';

-- Repoint functions that schema-qualified the old public.<table> names (and fix the
-- pre-existing public.user_preferences -> users.user_preferences drift in the SSR fns).
CREATE OR REPLACE FUNCTION public.get_ssr_agent_shell_data(p_user_id uuid)
 RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'is_admin', (SELECT EXISTS(SELECT 1 FROM public.admins WHERE user_id = p_user_id)),
    'preferences_exists', (SELECT EXISTS(SELECT 1 FROM users.user_preferences WHERE user_id = p_user_id)),
    'preferences', (SELECT preferences FROM users.user_preferences WHERE user_id = p_user_id LIMIT 1),
    'ai_models', (SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json)
      FROM (SELECT * FROM ai.model WHERE is_deprecated = false ORDER BY common_name ASC) m),
    'agent_context_menu', (SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (SELECT placement_type, categories_flat FROM public.agent_context_menu_view) c),
    'sms_unread_total', (SELECT COALESCE(SUM(unread_count), 0)::int
      FROM communication.sms_conversations WHERE user_id = p_user_id AND status = 'active')
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_ssr_shell_data(p_user_id uuid)
 RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'is_admin', (SELECT EXISTS(SELECT 1 FROM public.admins WHERE user_id = p_user_id)),
    'preferences_exists', (SELECT EXISTS(SELECT 1 FROM users.user_preferences WHERE user_id = p_user_id)),
    'preferences', (SELECT preferences FROM users.user_preferences WHERE user_id = p_user_id LIMIT 1),
    'ai_models', (SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json)
      FROM (SELECT * FROM ai.model WHERE is_deprecated = false ORDER BY common_name ASC) m),
    'context_menu', (SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (SELECT placement_type, categories_flat FROM public.context_menu_unified_view) c),
    'sms_unread_total', (SELECT COALESCE(SUM(unread_count), 0)::int
      FROM communication.sms_conversations WHERE user_id = p_user_id AND status = 'active')
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_user_dashboard_metrics()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    'research_reports', (select count(*) from public.rs_topic        where created_by = uid),
    'podcasts',         (select count(*) from public.pc_episodes     where user_id = uid),
    'messages',         (select count(*) from communication.dm_messages where sender_id = uid and deleted_at is null)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.sms_handle_opt_out_keywords()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  opt_out_keywords TEXT[] := ARRAY['STOP', 'UNSUBSCRIBE', 'END', 'QUIT', 'STOPALL', 'CANCEL', 'REVOKE', 'OPTOUT'];
  opt_in_keywords TEXT[] := ARRAY['START', 'UNSTOP', 'YES', 'SUBSCRIBE'];
  msg_body TEXT;
BEGIN
  IF NEW.direction = 'inbound' THEN
    msg_body := UPPER(TRIM(COALESCE(NEW.body, '')));
    IF msg_body = ANY(opt_out_keywords) THEN
      UPDATE communication.sms_consent SET
        status = 'opted_out', opted_out_at = now(), opt_out_method = 'sms_keyword',
        opt_out_keyword = msg_body, updated_at = now()
      WHERE phone_number = NEW.from_number AND status = 'opted_in';
    ELSIF msg_body = ANY(opt_in_keywords) THEN
      UPDATE communication.sms_consent SET
        status = 'opted_in', opted_in_at = now(), opt_in_method = 'sms_keyword',
        opt_in_keyword = msg_body, updated_at = now()
      WHERE phone_number = NEW.from_number AND status = 'opted_out';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sms_update_conversation_on_message()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE communication.sms_conversations SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.body, 100),
    last_message_direction = NEW.direction,
    message_count = message_count + 1,
    unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;

-- Deprecated-relations registry (mirror of scripts/dead-relations.json)
INSERT INTO platform.deprecated_relations (old_ref, new_ref, archived_as, reason, deprecated_at)
SELECT 'public.'||t, 'communication.'||t, NULL,
       'moved to communication schema (messaging domain, 2026 reorg, clean cut)', now()
FROM unnest(ARRAY['emails','dm_conversations','dm_messages','dm_conversation_participants',
  'sms_consent','sms_conversations','sms_media','sms_messages','sms_notification_preferences',
  'sms_notifications','sms_phone_numbers','sms_rate_limits','sms_webhook_logs']) t
ON CONFLICT (old_ref) DO UPDATE SET new_ref=EXCLUDED.new_ref, reason=EXCLUDED.reason, deprecated_at=now();
