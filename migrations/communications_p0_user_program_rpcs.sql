-- Authenticated SMS assistant configuration. The destination kill switch is read-only here;
-- each user may change only their own existing communication preference and agent binding.

drop function if exists communication.get_my_sms_assistant_program();
create function communication.get_my_sms_assistant_program()
returns table (
  destination_id uuid,
  masked_phone text,
  program_key text,
  number_active boolean,
  global_assistant_enabled boolean,
  verified_user_phone text,
  sms_enabled boolean,
  user_assistant_enabled boolean,
  preferred_agent_id uuid,
  preferred_agent_version_id uuid,
  sms_conversation_id uuid,
  chat_conversation_id uuid,
  identity_status text,
  consent_status text,
  ready boolean,
  blocked_reasons text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select
    destination.id,
    '•••' || right(destination.phone_number, 4),
    destination.program_key,
    destination.is_active,
    destination.assistant_enabled,
    preference.phone_number,
    preference.sms_enabled,
    preference.ai_agent_messages,
    preference.preferred_agent_id,
    preference.preferred_agent_version_id,
    transport.id,
    transport.chat_conversation_id,
    coalesce(transport.identity_status, 'not_found'),
    coalesce(consent.status, 'unknown'),
    destination.is_active
      and destination.provider_account_id is not null
      and destination.assistant_enabled
      and preference.sms_enabled
      and preference.ai_agent_messages
      and preference.phone_number is not null
      and preference.preferred_agent_id is not null
      and coalesce(consent.status, 'unknown') <> 'opted_out',
    array_remove(array[
      case when not destination.is_active or destination.provider_account_id is null
        then 'destination_not_ready' end,
      case when not destination.assistant_enabled then 'globally_paused' end,
      case when not preference.sms_enabled then 'sms_disabled' end,
      case when not preference.ai_agent_messages then 'user_paused' end,
      case when preference.phone_number is null then 'verified_phone_missing' end,
      case when preference.preferred_agent_id is null then 'agent_not_selected' end,
      case when coalesce(consent.status, 'unknown') = 'opted_out' then 'consent_opted_out' end
    ]::text[], null)
  from communication.sms_notification_preferences preference
  join communication.sms_phone_numbers destination
    on destination.program_key = 'ai_matrx_owner_beta'
   and destination.deleted_at is null
  left join lateral (
    select c.id, c.chat_conversation_id, c.identity_status
    from communication.sms_conversations c
    where c.user_id = caller
      and c.destination_identity_id = destination.id
      and c.program_key = destination.program_key
      and c.status = 'active'
      and c.deleted_at is null
    order by c.created_at desc
    limit 1
  ) transport on true
  left join lateral (
    select s.status
    from communication.sms_consent s
    where s.user_id = caller
      and s.organization_id = preference.organization_id
      and s.phone_number = preference.phone_number
      and s.consent_type = 'transactional'
      and s.deleted_at is null
    order by s.updated_at desc
    limit 1
  ) consent on true
  where preference.user_id = caller
    and preference.deleted_at is null
  order by destination.created_at
  limit 1;
end;
$$;

drop function if exists communication.configure_my_sms_assistant(boolean, uuid, uuid);
create function communication.configure_my_sms_assistant(
  p_enabled boolean,
  p_agent_id uuid,
  p_agent_version_id uuid
)
returns table (
  destination_id uuid,
  masked_phone text,
  program_key text,
  number_active boolean,
  global_assistant_enabled boolean,
  verified_user_phone text,
  sms_enabled boolean,
  user_assistant_enabled boolean,
  preferred_agent_id uuid,
  preferred_agent_version_id uuid,
  sms_conversation_id uuid,
  chat_conversation_id uuid,
  identity_status text,
  consent_status text,
  ready boolean,
  blocked_reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  preference communication.sms_notification_preferences%rowtype;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_agent_id is null and p_agent_version_id is not null then
    raise exception 'An agent version requires its agent' using errcode = '22023';
  end if;
  if p_agent_id is not null and not iam.has_access_for(caller, 'agent', p_agent_id) then
    raise exception 'Selected agent is not accessible' using errcode = '42501';
  end if;
  if p_agent_version_id is not null and not exists (
    select 1 from agent.definition_version version_row
    where version_row.id = p_agent_version_id
      and version_row.agent_id = p_agent_id
      and version_row.deleted_at is null
  ) then
    raise exception 'Selected agent version does not belong to the agent' using errcode = '22023';
  end if;

  select pref.* into preference
  from communication.sms_notification_preferences pref
  where pref.user_id = caller and pref.deleted_at is null
  for update;
  if not found then
    raise exception 'SMS preferences must be created during account setup' using errcode = 'P0002';
  end if;

  update communication.sms_notification_preferences
  set ai_agent_messages = coalesce(p_enabled, false),
      preferred_agent_id = p_agent_id,
      preferred_agent_version_id = p_agent_version_id,
      updated_by = caller,
      updated_at = now()
  where id = preference.id;

  update communication.sms_conversations c
  set agent_id = p_agent_id,
      canonical_agent_version_id = p_agent_version_id,
      updated_by = caller,
      updated_at = now()
  where c.user_id = caller
    and c.external_phone_number = preference.phone_number
    and c.program_key = 'ai_matrx_owner_beta'
    and c.status = 'active'
    and c.deleted_at is null;

  return query select * from communication.get_my_sms_assistant_program();
end;
$$;

drop function if exists communication.enqueue_my_sms_assistant_test(text, text);
create function communication.enqueue_my_sms_assistant_test(
  p_body text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  destination_id uuid;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select p.id into destination_id
  from communication.sms_phone_numbers p
  where p.program_key = 'ai_matrx_owner_beta'
    and p.is_active
    and p.assistant_enabled
    and p.deleted_at is null
  order by p.created_at
  limit 1;
  if destination_id is null then
    raise exception 'SMS assistant is globally paused' using errcode = '55000';
  end if;
  return communication.enqueue_sms_assistant_test(
    caller,
    destination_id,
    p_body,
    p_idempotency_key
  );
end;
$$;

revoke execute on function communication.get_my_sms_assistant_program()
  from public, anon;
revoke execute on function communication.configure_my_sms_assistant(boolean, uuid, uuid)
  from public, anon;
revoke execute on function communication.enqueue_my_sms_assistant_test(text, text)
  from public, anon;

grant execute on function communication.get_my_sms_assistant_program()
  to authenticated, service_role;
grant execute on function communication.configure_my_sms_assistant(boolean, uuid, uuid)
  to authenticated, service_role;
grant execute on function communication.enqueue_my_sms_assistant_test(text, text)
  to authenticated, service_role;

comment on function communication.configure_my_sms_assistant(boolean, uuid, uuid) is
  'Authenticated single path for a user to pause/resume or select their own SMS assistant. The global destination switch is read-only.';
