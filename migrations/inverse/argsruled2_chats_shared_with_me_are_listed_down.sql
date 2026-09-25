-- lock: platform
-- lane: ARGS-RULED-2
-- based-on: public.get_cx_conversations_shared_with_me() ea47173506b28fa94443ff0925644b9809af88a2cf9251cfc41a17cdb8967e09
--
-- INVERSE of migrations/campaign/argsruled2_chats_shared_with_me_are_listed.sql: the body back as it was
-- (MAIN, 2026-09-24) — the cx_conversation filter that lists nothing. Rule 27 only.

set lock_timeout = '2s';

create or replace function public.get_cx_conversations_shared_with_me()
 RETURNS TABLE(id uuid, title text, status text, message_count integer, created_at timestamp with time zone, updated_at timestamp with time zone, permission_level text, owner_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id, c.title, c.status, c.message_count, c.created_at, c.updated_at,
    p.permission_level::text, u.email::text as owner_email
  FROM iam.permissions p
  JOIN chat.conversation c ON c.id = p.resource_id
  JOIN auth.users u ON u.id = c.created_by
  WHERE p.resource_type = 'cx_conversation' AND p.granted_to_user_id = (select auth.uid())
    AND c.deleted_at IS NULL AND c.status != 'archived'
  ORDER BY c.updated_at DESC;
END;
$function$

;
