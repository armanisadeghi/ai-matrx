-- Collapse the app-wide DM conversation bootstrap into the canonical RPC.
-- The previous contract returned conversation metadata only, forcing every
-- browser to issue one participant SELECT per conversation and one profile RPC
-- per participant. One transport loss therefore multiplied into hundreds of
-- identical failures.

drop function if exists public.get_dm_conversations_with_details(uuid);

create function public.get_dm_conversations_with_details(p_user_id uuid)
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
  select
    conversation.id,
    conversation.type,
    conversation.group_name,
    conversation.group_image_url,
    conversation.created_at,
    conversation.updated_at,
    last_message.content,
    last_message.sender_id,
    last_message.created_at,
    public.get_dm_unread_count(conversation.id, p_user_id),
    coalesce(participant_list.participants, '[]'::jsonb)
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
    where participant.conversation_id = conversation.id
      and participant.deleted_at is null
  ) as participant_list on true
  where coalesce(caller_participant.is_archived, false) is false
  order by coalesce(last_message.created_at, conversation.updated_at) desc;
end;
$function$;

revoke execute on function public.get_dm_conversations_with_details(uuid) from public, anon;
grant execute on function public.get_dm_conversations_with_details(uuid) to authenticated, service_role;
