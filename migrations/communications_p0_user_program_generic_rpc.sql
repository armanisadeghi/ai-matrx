-- Correct the first authenticated SMS-assistant RPCs without changing their applied bytes.
-- The public contract is program-scoped and splits nullable agent-version operations into
-- distinct typed functions so generated clients never need boundary casts.

drop function if exists communication.get_my_sms_assistant_program();
drop function if exists communication.configure_my_sms_assistant(boolean, uuid, uuid);
drop function if exists communication.enqueue_my_sms_assistant_test(text, text);

drop function if exists communication.get_my_sms_assistant_program(text);
create function communication.get_my_sms_assistant_program(p_program_key text)
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
  match_count integer;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;

  select count(*) into match_count
  from communication.sms_notification_preferences preference
  join communication.sms_phone_numbers destination
    on destination.organization_id = preference.organization_id
   and destination.program_key = p_program_key
   and destination.deleted_at is null
  where preference.user_id = caller
    and preference.deleted_at is null;
  if match_count > 1 then
    raise exception 'SMS assistant program binding is ambiguous' using errcode = '21000';
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
    on destination.organization_id = preference.organization_id
   and destination.program_key = p_program_key
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
    and preference.deleted_at is null;
end;
$$;

drop function if exists communication._configure_my_sms_assistant(text, boolean, uuid, uuid);
create function communication._configure_my_sms_assistant(
  p_program_key text,
  p_enabled boolean,
  p_agent_id uuid,
  p_agent_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  preference communication.sms_notification_preferences%rowtype;
  match_count integer;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;
  if p_agent_id is null and p_agent_version_id is not null then
    raise exception 'An agent version requires its agent' using errcode = '22023';
  end if;
  if p_agent_id is not null
    and not iam.has_access_for(caller, 'agent', p_agent_id, 'viewer') then
    raise exception 'Selected agent is not accessible' using errcode = '42501';
  end if;
  if p_agent_version_id is not null and not exists (
    select 1
    from agent.definition_version version_row
    where version_row.id = p_agent_version_id
      and version_row.agent_id = p_agent_id
      and version_row.deleted_at is null
  ) then
    raise exception 'Selected agent version does not belong to the agent' using errcode = '22023';
  end if;

  select count(*) into match_count
  from communication.sms_notification_preferences pref
  join communication.sms_phone_numbers destination
    on destination.organization_id = pref.organization_id
   and destination.program_key = p_program_key
   and destination.deleted_at is null
  where pref.user_id = caller and pref.deleted_at is null;
  if match_count = 0 then
    raise exception 'SMS preferences and program must already exist' using errcode = 'P0002';
  elsif match_count > 1 then
    raise exception 'SMS assistant program binding is ambiguous' using errcode = '21000';
  end if;

  select pref.* into preference
  from communication.sms_notification_preferences pref
  join communication.sms_phone_numbers destination
    on destination.organization_id = pref.organization_id
   and destination.program_key = p_program_key
   and destination.deleted_at is null
  where pref.user_id = caller and pref.deleted_at is null
  for update of pref;

  update communication.sms_notification_preferences pref
  set ai_agent_messages = coalesce(p_enabled, false),
      preferred_agent_id = p_agent_id,
      preferred_agent_version_id = p_agent_version_id,
      updated_by = caller,
      updated_at = now()
  where pref.id = preference.id
  returning pref.* into preference;

  update communication.sms_conversations c
  set agent_id = p_agent_id,
      canonical_agent_version_id = p_agent_version_id,
      updated_by = caller,
      updated_at = now()
  where c.user_id = caller
    and c.external_phone_number = preference.phone_number
    and c.program_key = p_program_key
    and c.status = 'active'
    and c.deleted_at is null;

  return;
end;
$$;

drop function if exists communication.configure_my_sms_assistant(text, boolean, uuid);
create function communication.configure_my_sms_assistant(
  p_program_key text,
  p_enabled boolean,
  p_agent_id uuid
)
returns table (
  destination_id uuid, masked_phone text, program_key text, number_active boolean,
  global_assistant_enabled boolean, verified_user_phone text, sms_enabled boolean,
  user_assistant_enabled boolean, preferred_agent_id uuid,
  preferred_agent_version_id uuid, sms_conversation_id uuid,
  chat_conversation_id uuid, identity_status text, consent_status text,
  ready boolean, blocked_reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform communication._configure_my_sms_assistant(
    p_program_key, p_enabled, p_agent_id, null
  );
  return query select * from communication.get_my_sms_assistant_program(p_program_key);
end;
$$;

drop function if exists communication.configure_my_sms_assistant_version(text, boolean, uuid, uuid);
create function communication.configure_my_sms_assistant_version(
  p_program_key text,
  p_enabled boolean,
  p_agent_id uuid,
  p_agent_version_id uuid
)
returns table (
  destination_id uuid, masked_phone text, program_key text, number_active boolean,
  global_assistant_enabled boolean, verified_user_phone text, sms_enabled boolean,
  user_assistant_enabled boolean, preferred_agent_id uuid,
  preferred_agent_version_id uuid, sms_conversation_id uuid,
  chat_conversation_id uuid, identity_status text, consent_status text,
  ready boolean, blocked_reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform communication._configure_my_sms_assistant(
    p_program_key, p_enabled, p_agent_id, p_agent_version_id
  );
  return query select * from communication.get_my_sms_assistant_program(p_program_key);
end;
$$;

drop function if exists communication.disconnect_my_sms_assistant(text);
create function communication.disconnect_my_sms_assistant(p_program_key text)
returns table (
  destination_id uuid, masked_phone text, program_key text, number_active boolean,
  global_assistant_enabled boolean, verified_user_phone text, sms_enabled boolean,
  user_assistant_enabled boolean, preferred_agent_id uuid,
  preferred_agent_version_id uuid, sms_conversation_id uuid,
  chat_conversation_id uuid, identity_status text, consent_status text,
  ready boolean, blocked_reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform communication._configure_my_sms_assistant(
    p_program_key, false, null, null
  );
  return query select * from communication.get_my_sms_assistant_program(p_program_key);
end;
$$;

drop function if exists communication.enqueue_my_sms_assistant_test(text, text, text);
create function communication.enqueue_my_sms_assistant_test(
  p_program_key text,
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
  select destination.id into strict destination_id
  from communication.sms_phone_numbers destination
  join communication.sms_notification_preferences preference
    on preference.organization_id = destination.organization_id
   and preference.user_id = caller
   and preference.deleted_at is null
  where destination.program_key = p_program_key
    and destination.is_active
    and destination.assistant_enabled
    and destination.deleted_at is null;

  return communication.enqueue_sms_assistant_test(
    caller, destination_id, p_body, p_idempotency_key
  );
exception
  when no_data_found then
    raise exception 'SMS assistant program is not ready' using errcode = '55000';
  when too_many_rows then
    raise exception 'SMS assistant program binding is ambiguous' using errcode = '21000';
end;
$$;

revoke execute on function communication._configure_my_sms_assistant(text, boolean, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function communication.get_my_sms_assistant_program(text)
  from public, anon;
revoke execute on function communication.configure_my_sms_assistant(text, boolean, uuid)
  from public, anon;
revoke execute on function communication.configure_my_sms_assistant_version(text, boolean, uuid, uuid)
  from public, anon;
revoke execute on function communication.disconnect_my_sms_assistant(text)
  from public, anon;
revoke execute on function communication.enqueue_my_sms_assistant_test(text, text, text)
  from public, anon;

grant execute on function communication.get_my_sms_assistant_program(text)
  to authenticated, service_role;
grant execute on function communication.configure_my_sms_assistant(text, boolean, uuid)
  to authenticated, service_role;
grant execute on function communication.configure_my_sms_assistant_version(text, boolean, uuid, uuid)
  to authenticated, service_role;
grant execute on function communication.disconnect_my_sms_assistant(text)
  to authenticated, service_role;
grant execute on function communication.enqueue_my_sms_assistant_test(text, text, text)
  to authenticated, service_role;

comment on function communication.get_my_sms_assistant_program(text) is
  'Returns the caller SMS assistant state for one explicit program; ambiguous bindings fail closed.';
comment on function communication.configure_my_sms_assistant(text, boolean, uuid) is
  'Selects an accessible agent at its latest version and pauses or resumes the caller SMS assistant for a program.';
comment on function communication.configure_my_sms_assistant_version(text, boolean, uuid, uuid) is
  'Selects an accessible agent at one exact version and pauses or resumes the caller SMS assistant for a program.';
comment on function communication.disconnect_my_sms_assistant(text) is
  'Disables the caller SMS assistant and clears its agent binding for one program.';
