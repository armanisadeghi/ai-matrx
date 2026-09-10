-- Row R1 of common-docs/projects/archived-items-law/STATUS.md.
--
-- THE ARCHIVED-ITEMS LAW (Arman, 2026-09-09 — common-docs/policies/archived-items.md):
-- every list reader carries a tri-state archive filter and the default hides archived rows.
--
-- Applied live 2026-09-09 via the Supabase MCP in two steps (both reproduced below):
--   1. archived_items_law_tristate_shared_and_dm_readers
--   2. archived_items_law_tristate_readers_client_doors
--
-- Step 2 exists because step 1's signature change made
-- platform.enforce_definer_client_grants stop matching the pre-existing
-- platform.definer_client_grant_grandfather rows, so the ddl_command_end trigger revoked
-- anon/authenticated EXECUTE — the guard working exactly as designed. Verified after:
--   agx_get_shared_for_chat(text)   {postgres,service_role,anon,authenticated}
--   agx_get_shared_with_me(text)    {postgres,service_role,anon,authenticated}
--   get_dm_conversations_with_details(uuid,int,timestamptz,uuid,text)
--                                   {postgres,service_role,authenticated}   (PUBLIC/anon revoked, as before)
--
-- Behaviour proof (live, as user 4cf62e4e-2679-484f-b652-034e697418df):
--   agx_get_shared_for_chat()  16 · ('archived') 2 · ('all') 18   — an exact partition
--   agx_get_shared_with_me()   16 · ('archived') 2 · ('all') 18
--   get_dm_conversations_with_details: in a rolled-back transaction that archived one
--   participant row, 'archived' returned exactly that one and the default excluded it.
--
-- ── Step 1 ──────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agx_get_shared_for_chat();
DROP FUNCTION IF EXISTS public.agx_get_shared_for_chat(text);

CREATE FUNCTION public.agx_get_shared_for_chat(p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, name text, permission_level text, owner_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, perm.permission_level::text, u.email
  FROM agent.definition a
  INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = (select auth.uid())
  LEFT JOIN auth.users u ON u.id = a.created_by
  WHERE a.created_by != (select auth.uid()) AND a.is_active AND a.deleted_at IS NULL
    AND (CASE lower(coalesce(p_archived, 'active'))
           WHEN 'all' THEN TRUE
           WHEN 'archived' THEN a.is_archived IS TRUE
           ELSE a.is_archived IS NOT TRUE END)
  ORDER BY a.name;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_get_shared_for_chat(text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.agx_get_shared_with_me();
DROP FUNCTION IF EXISTS public.agx_get_shared_with_me(text);

CREATE FUNCTION public.agx_get_shared_with_me(p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, name text, description text, agent_type text, category text, tags text[], owner_id uuid, owner_email text, permission_level text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, a.description, a.agent_type, a.category, a.tags, a.created_by, u.email, perm.permission_level::text, a.created_at, a.updated_at
  FROM agent.definition a
  INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = (select auth.uid())
  LEFT JOIN auth.users u ON u.id = a.created_by
  WHERE a.created_by != (select auth.uid()) AND a.deleted_at IS NULL
    AND (CASE lower(coalesce(p_archived, 'active'))
           WHEN 'all' THEN TRUE
           WHEN 'archived' THEN a.is_archived IS TRUE
           ELSE a.is_archived IS NOT TRUE END)
  ORDER BY a.name;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_get_shared_with_me(text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_dm_conversations_with_details(uuid, integer, timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS public.get_dm_conversations_with_details(uuid, integer, timestamp with time zone, uuid, text);

CREATE FUNCTION public.get_dm_conversations_with_details(
  p_user_id uuid,
  p_limit integer DEFAULT 50,
  p_before_sort_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_before_conversation_id uuid DEFAULT NULL::uuid,
  p_archived text DEFAULT 'active'::text
)
 RETURNS TABLE(conversation_id uuid, conversation_type text, group_name text, group_image_url text, conversation_created_at timestamp with time zone, conversation_updated_at timestamp with time zone, last_message_content text, last_message_sender_id uuid, last_message_at timestamp with time zone, unread_count integer, participants jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (auth.role() = 'service_role' or p_user_id = auth.uid()) then
    raise exception 'access denied: caller is not the target user' using errcode = '42501';
  end if;

  return query
  with page as (
    select
      conversation.id,
      conversation.type,
      conversation.group_name,
      conversation.group_image_url,
      conversation.created_at,
      conversation.updated_at,
      last_message.content as last_message_content,
      last_message.sender_id as last_message_sender_id,
      last_message.created_at as last_message_at,
      coalesce(last_message.created_at, conversation.updated_at) as sort_at
    from communication.dm_conversations as conversation
    join communication.dm_conversation_participants as caller_participant
      on caller_participant.conversation_id = conversation.id
     and caller_participant.user_id = p_user_id
     and caller_participant.deleted_at is null
    left join lateral (
      select
        message.content,
        message.sender_id,
        message.created_at
      from communication.dm_messages as message
      where message.conversation_id = conversation.id
        and message.deleted_at is null
      order by message.created_at desc
      limit 1
    ) as last_message on true
    where (case lower(coalesce(p_archived, 'active'))
             when 'all' then true
             when 'archived' then coalesce(caller_participant.is_archived, false) is true
             else coalesce(caller_participant.is_archived, false) is false end)
      and (
        p_before_sort_at is null
        or (coalesce(last_message.created_at, conversation.updated_at), conversation.id)
           < (p_before_sort_at, p_before_conversation_id)
      )
    order by sort_at desc, conversation.id desc
    limit p_limit
  )
  select
    page.id,
    page.type,
    page.group_name,
    page.group_image_url,
    page.created_at,
    page.updated_at,
    page.last_message_content,
    page.last_message_sender_id,
    page.last_message_at,
    public.get_dm_unread_count(page.id, p_user_id),
    coalesce(participant_list.participants, '[]'::jsonb)
  from page
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', participant.id,
        'conversation_id', participant.conversation_id,
        'user_id', participant.user_id,
        'role', coalesce(participant.role, 'member'),
        'joined_at', participant.joined_at,
        'last_read_at', participant.last_read_at,
        'is_muted', coalesce(participant.is_muted, false),
        'is_archived', coalesce(participant.is_archived, false),
        'user', jsonb_build_object(
          'user_id', account.id,
          'email', account.email,
          'display_name', coalesce(
            account.raw_user_meta_data ->> 'full_name',
            account.raw_user_meta_data ->> 'name',
            split_part(account.email, '@', 1)
          ),
          'avatar_url', coalesce(
            account.raw_user_meta_data ->> 'avatar_url',
            account.raw_user_meta_data ->> 'picture'
          )
        )
      )
      order by participant.joined_at, participant.id
    ) as participants
    from communication.dm_conversation_participants as participant
    join auth.users as account on account.id = participant.user_id
    where participant.conversation_id = page.id
      and participant.deleted_at is null
  ) as participant_list on true
  order by page.sort_at desc, page.id desc;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dm_conversations_with_details(uuid, integer, timestamp with time zone, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dm_conversations_with_details(uuid, integer, timestamp with time zone, uuid, text) TO authenticated, service_role;

-- ── Step 2 — re-declare the client doors the definer guard just revoked ─────────────

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
VALUES
  ('public', 'agx_get_shared_for_chat', 'p_archived text',
   'archived-items-law R1',
   'Agent picker reads agents shared WITH the caller for chat. Definer so iam.permissions resolves inside the function rather than granting the client the permissions table; the body identity-locks to auth.uid(). Re-declared when the signature gained p_archived (THE ARCHIVED-ITEMS LAW tri-state, default active).'),
  ('public', 'agx_get_shared_with_me', 'p_archived text',
   'archived-items-law R1',
   'Shared-with-me agent list. Same definer rationale and identity lock as agx_get_shared_for_chat. Re-declared when the signature gained p_archived (THE ARCHIVED-ITEMS LAW tri-state, default active).'),
  ('public', 'get_dm_conversations_with_details', 'p_user_id uuid, p_limit integer, p_before_sort_at timestamp with time zone, p_before_conversation_id uuid, p_archived text',
   'archived-items-law R1',
   'DM conversation list for the signed-in user; the body raises 42501 unless p_user_id = auth.uid() or the caller is service_role. anon and PUBLIC stay revoked. Re-declared when the signature gained p_archived (THE ARCHIVED-ITEMS LAW tri-state, default active).')
ON CONFLICT DO NOTHING;

DELETE FROM platform.definer_client_grant_grandfather
 WHERE schema_name = 'public'
   AND ((function_name IN ('agx_get_shared_for_chat', 'agx_get_shared_with_me') AND argtypes = '')
     OR (function_name = 'get_dm_conversations_with_details' AND argtypes = '2950 23 1184 2950'));

GRANT EXECUTE ON FUNCTION public.agx_get_shared_for_chat(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agx_get_shared_with_me(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dm_conversations_with_details(uuid, integer, timestamp with time zone, uuid, text) TO authenticated, service_role;
