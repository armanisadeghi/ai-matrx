-- lock: platform
-- lane: ARGS-RULED-2
-- based-on: public.get_cx_conversations_shared_with_me() c0633db2bfb1ff42bb9030306e8228fe497e6e446e7a203d0f3054a159e0a214
--
-- ARGS-RULED-2 — "CHATS SHARED WITH ME" LISTS THE CHATS SHARED WITH ME.
--
-- public.get_cx_conversations_shared_with_me (the chat sidebar's "Shared with me", via
-- /api/cx-chat/shared) filtered `resource_type = 'cx_conversation'`. The sharing doors write
-- 'conversation' — measured on the MAIN database 2026-09-24: iam.permissions holds rows for
-- 'conversation' and none for 'cx_conversation' — so the list was empty for every person, and it
-- never read an organization share at all. Measured RED from admin@admin.com's seat: a chat shared
-- with her by name came back as nothing.
--
-- THE FIX returns the same lane public.cvx_list_scoped('shared') serves: by name, or to an
-- organization the caller belongs to, one row per chat (her own grant wins), never her own chats.
-- The signature and return shape are unchanged, so the route and the sidebar are untouched.
--
-- Seat suite: scripts/campaign-tests/argsruled2_shared_with_me_green.sql (+ red twin). Inverse:
-- migrations/inverse/argsruled2_chats_shared_with_me_are_listed_down.sql.

set lock_timeout = '4s';

create or replace function public.get_cx_conversations_shared_with_me()
 RETURNS TABLE(id uuid, title text, status text, message_count integer, created_at timestamp with time zone, updated_at timestamp with time zone, permission_level text, owner_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- THE TOKEN THE SHARING DOORS WRITE (ARGS-RULED-2, 2026-09-24). Every share of a chat is written
  -- as resource_type 'conversation' (public.share_resource_with_user / _with_org); this function
  -- read 'cx_conversation', a token retired when the table moved to chat.conversation, so it
  -- returned nothing to anybody. It now returns the SAME lane public.cvx_list_scoped('shared')
  -- serves: a grant to me by name, or to an organization I am a member of — one row per chat, my
  -- own grant winning over my organization's — never a chat I own.
  RETURN QUERY
  SELECT DISTINCT ON (c.id)
         c.id, c.title, c.status, c.message_count, c.created_at, c.updated_at,
         p.permission_level::text, u.email::text AS owner_email
    FROM iam.permissions p
    JOIN chat.conversation c ON c.id = p.resource_id
    JOIN auth.users u ON u.id = c.created_by
   WHERE p.resource_type = 'conversation'
     AND (p.granted_to_user_id = (SELECT auth.uid())
          OR p.granted_to_organization_id IN (SELECT om.organization_id FROM iam.organization_member om
                                               WHERE om.user_id = (SELECT auth.uid())))
     AND c.created_by IS DISTINCT FROM (SELECT auth.uid())
     AND c.deleted_at IS NULL
     AND c.status IS DISTINCT FROM 'archived'
   ORDER BY c.id, (p.granted_to_user_id IS NULL), c.updated_at DESC;
END;
$function$
;
