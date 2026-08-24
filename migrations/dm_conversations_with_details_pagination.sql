-- D247: get_dm_conversations_with_details returned ALL of a user's DM
-- conversations (505 rows for the owner) on ordinary page loads. Add keyset
-- pagination on last-message time (falls back to conversation.updated_at,
-- same tiebreak the existing ORDER BY already uses), with conversation_id as
-- the tiebreaker for equal timestamps.
--
-- p_limit defaults to 50 (first page) — both frontend callers
-- (features/messaging/data/conversationsWithDetails.ts and
-- app/api/messages/conversations/route.ts) are updated in this same change
-- to pass the cursor from the previous page's last row, so no caller is left
-- depending on the old unbounded-return default.
--
-- Cursor filtering + ORDER BY + LIMIT happen in the `page` CTE, BEFORE the
-- per-row get_dm_unread_count() call and the participants jsonb_agg lateral
-- join — so the expensive per-conversation work only runs for the page being
-- returned, not for all 505 rows every time.

drop function if exists public.get_dm_conversations_with_details(uuid);

create function public.get_dm_conversations_with_details(
  p_user_id uuid,
  p_limit integer default 50,
  p_before_sort_at timestamptz default null,
  p_before_conversation_id uuid default null
)
returns table(
  conversation_id uuid,
  conversation_type text,
  group_name text,
  group_image_url text,
  conversation_created_at timestamptz,
  conversation_updated_at timestamptz,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  unread_count integer,
  participants jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
    where coalesce(caller_participant.is_archived, false) is false
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

revoke execute on function public.get_dm_conversations_with_details(uuid, integer, timestamptz, uuid) from public, anon;
grant execute on function public.get_dm_conversations_with_details(uuid, integer, timestamptz, uuid) to authenticated, service_role;
