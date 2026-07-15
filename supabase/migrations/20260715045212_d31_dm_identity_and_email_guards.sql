-- D31: prevent authenticated callers from supplying another user's identity
-- to SECURITY DEFINER messaging and auth-directory RPCs.

create or replace function public.get_dm_unread_count(
  p_conversation_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_last_read timestamptz;
  v_count integer;
begin
  if auth.role() <> 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'cannot read another user''s unread count' using errcode = '42501';
  end if;

  select participant.last_read_at
    into v_last_read
  from communication.dm_conversation_participants as participant
  where participant.conversation_id = p_conversation_id
    and participant.user_id = p_user_id
    and participant.deleted_at is null;

  if not found then
    raise exception 'conversation participant required' using errcode = '42501';
  end if;

  select count(*)::integer
    into v_count
  from communication.dm_messages as message
  where message.conversation_id = p_conversation_id
    and message.sender_id is distinct from p_user_id
    and message.deleted_at is null
    and (v_last_read is null or message.created_at > v_last_read);

  return v_count;
end;
$function$;

create or replace function public.get_dm_user_info(p_user_id uuid)
returns table(user_id uuid, email text, display_name text, avatar_url text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.role() <> 'service_role'
     and p_user_id is distinct from auth.uid()
     and coalesce(public.is_platform_admin(), false) is not true
     and not exists (
       select 1
       from communication.dm_conversation_participants as caller_participant
       join communication.dm_conversation_participants as target_participant
         on target_participant.conversation_id = caller_participant.conversation_id
        and target_participant.user_id = p_user_id
        and target_participant.deleted_at is null
       where caller_participant.user_id = auth.uid()
         and caller_participant.deleted_at is null
     )
     and not exists (
       select 1
       from iam.memberships as caller_membership
       join iam.memberships as target_membership
         on target_membership.organization_id = caller_membership.organization_id
        and target_membership.user_id = p_user_id
        and target_membership.status = 'active'
        and target_membership.deleted_at is null
       where caller_membership.user_id = auth.uid()
         and caller_membership.status = 'active'
         and caller_membership.deleted_at is null
     ) then
    raise exception 'messaging relationship required' using errcode = '42501';
  end if;

  return query
  select
    account.id,
    account.email::text,
    coalesce(
      account.raw_user_meta_data ->> 'full_name',
      account.raw_user_meta_data ->> 'name',
      split_part(account.email, '@', 1)
    )::text,
    coalesce(
      account.raw_user_meta_data ->> 'avatar_url',
      account.raw_user_meta_data ->> 'picture'
    )::text
  from auth.users as account
  where account.id = p_user_id;
end;
$function$;

create or replace function public.get_user_emails_by_ids(user_ids uuid[])
returns table(id uuid, email text, display_name text)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.role() <> 'service_role'
     and coalesce(public.is_platform_admin(), false) is not true then
    raise exception 'platform admin required' using errcode = '42501';
  end if;

  if coalesce(cardinality(user_ids), 0) > 500 then
    raise exception 'at most 500 users may be requested' using errcode = '22023';
  end if;

  return query
  select
    account.id,
    account.email::text,
    coalesce(
      account.raw_user_meta_data ->> 'full_name',
      account.raw_user_meta_data ->> 'name',
      ''
    )::text
  from auth.users as account
  where account.id = any(user_ids);
end;
$function$;

revoke execute on function public.get_dm_unread_count(uuid, uuid) from public, anon;
revoke execute on function public.get_dm_user_info(uuid) from public, anon;
revoke execute on function public.get_user_emails_by_ids(uuid[]) from public, anon;

grant execute on function public.get_dm_unread_count(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_dm_user_info(uuid) to authenticated, service_role;
grant execute on function public.get_user_emails_by_ids(uuid[]) to authenticated, service_role;
