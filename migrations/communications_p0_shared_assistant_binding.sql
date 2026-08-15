-- A platform-owned SMS destination is shared across tenant users. Tenant identity therefore
-- binds explicitly from the user's preference to the destination + program; destination
-- organization ownership is not user identity and must never be inferred as such.

alter table communication.sms_notification_preferences
  add column if not exists assistant_destination_id uuid,
  add column if not exists assistant_program_key text;

create unique index if not exists sms_phone_numbers_id_program_uidx
  on communication.sms_phone_numbers(id, program_key);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_notification_preferences_assistant_binding_pair_check'
      and conrelid = 'communication.sms_notification_preferences'::regclass
  ) then
    alter table communication.sms_notification_preferences
      add constraint sms_notification_preferences_assistant_binding_pair_check
      check (
        (assistant_destination_id is null) = (assistant_program_key is null)
        and (
          assistant_program_key is null
          or assistant_program_key ~ '^[a-z0-9][a-z0-9_]*$'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_notification_preferences_assistant_binding_fkey'
      and conrelid = 'communication.sms_notification_preferences'::regclass
  ) then
    alter table communication.sms_notification_preferences
      add constraint sms_notification_preferences_assistant_binding_fkey
      foreign key (assistant_destination_id, assistant_program_key)
      references communication.sms_phone_numbers(id, program_key)
      on update restrict on delete restrict;
  end if;
end;
$$;

create index if not exists sms_notification_preferences_assistant_binding_idx
  on communication.sms_notification_preferences(
    assistant_destination_id, assistant_program_key, phone_number
  )
  where deleted_at is null;

do $$
declare
  destination_count integer;
begin
  select count(*) into destination_count
  from communication.sms_phone_numbers destination
  where destination.phone_number = '+14158059951'
    and destination.program_key = 'ai_matrx_owner_beta'
    and destination.deleted_at is null;
  if destination_count <> 1 then
    raise exception 'Owner beta SMS destination must resolve exactly once, found %', destination_count;
  end if;
end;
$$;

with owner_binding as (
  select distinct preference.id as preference_id,
         destination.id as destination_id,
         destination.program_key
  from communication.sms_notification_preferences preference
  join communication.sms_conversations transport
    on transport.user_id = preference.user_id
   and transport.organization_id = preference.organization_id
   and transport.external_phone_number = preference.phone_number
   and transport.status = 'active'
   and transport.deleted_at is null
  join communication.sms_phone_numbers destination
    on destination.id = transport.destination_identity_id
   and destination.phone_number = '+14158059951'
   and destination.program_key = 'ai_matrx_owner_beta'
   and destination.deleted_at is null
  where preference.deleted_at is null
)
update communication.sms_notification_preferences preference
set assistant_destination_id = owner_binding.destination_id,
    assistant_program_key = owner_binding.program_key,
    metadata = jsonb_set(
      coalesce(preference.metadata, '{}'::jsonb),
      '{assistant_binding_evidence}',
      jsonb_build_object(
        'source', 'communications_p0_shared_assistant_binding',
        'destination_id', owner_binding.destination_id,
        'program_key', owner_binding.program_key,
        'bound_at', now()
      ),
      true
    ),
    updated_at = now()
from owner_binding
where preference.id = owner_binding.preference_id
  and (
    preference.assistant_destination_id is distinct from owner_binding.destination_id
    or preference.assistant_program_key is distinct from owner_binding.program_key
  );

do $$
declare
  binding_count integer;
begin
  select count(*) into binding_count
  from communication.sms_notification_preferences preference
  join communication.sms_phone_numbers destination
    on destination.id = preference.assistant_destination_id
   and destination.program_key = preference.assistant_program_key
  where destination.phone_number = '+14158059951'
    and destination.program_key = 'ai_matrx_owner_beta'
    and preference.deleted_at is null;
  if binding_count <> 1 then
    raise exception 'Owner beta SMS preference backfill must resolve exactly once, found %', binding_count;
  end if;
end;
$$;

create or replace function communication.get_my_sms_assistant_program(p_program_key text)
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
    on destination.id = preference.assistant_destination_id
   and destination.program_key = preference.assistant_program_key
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
    on destination.id = preference.assistant_destination_id
   and destination.program_key = preference.assistant_program_key
   and destination.program_key = p_program_key
   and destination.deleted_at is null
  left join lateral (
    select c.id, c.chat_conversation_id, c.identity_status
    from communication.sms_conversations c
    where c.user_id = caller
      and c.organization_id = preference.organization_id
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

create or replace function communication._configure_my_sms_assistant(
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
    on destination.id = pref.assistant_destination_id
   and destination.program_key = pref.assistant_program_key
   and destination.program_key = p_program_key
   and destination.deleted_at is null
  where pref.user_id = caller and pref.deleted_at is null;
  if match_count = 0 then
    raise exception 'SMS preferences and program must already be explicitly bound'
      using errcode = 'P0002';
  elsif match_count > 1 then
    raise exception 'SMS assistant program binding is ambiguous' using errcode = '21000';
  end if;

  select pref.* into preference
  from communication.sms_notification_preferences pref
  join communication.sms_phone_numbers destination
    on destination.id = pref.assistant_destination_id
   and destination.program_key = pref.assistant_program_key
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
  where pref.id = preference.id;

  update communication.sms_conversations c
  set agent_id = p_agent_id,
      canonical_agent_version_id = p_agent_version_id,
      updated_by = caller,
      updated_at = now()
  where c.user_id = caller
    and c.organization_id = preference.organization_id
    and c.external_phone_number = preference.phone_number
    and c.destination_identity_id = preference.assistant_destination_id
    and c.program_key = p_program_key
    and c.status = 'active'
    and c.deleted_at is null;
end;
$$;

create or replace function communication.enqueue_my_sms_assistant_test(
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
  from communication.sms_notification_preferences preference
  join communication.sms_phone_numbers destination
    on destination.id = preference.assistant_destination_id
   and destination.program_key = preference.assistant_program_key
   and destination.program_key = p_program_key
   and destination.deleted_at is null
  where preference.user_id = caller
    and preference.deleted_at is null
    and destination.is_active
    and destination.assistant_enabled;

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

create or replace function communication.enqueue_sms_assistant_test(
  p_user_id uuid,
  p_destination_identity_id uuid,
  p_body text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  destination communication.sms_phone_numbers%rowtype;
  preference communication.sms_notification_preferences%rowtype;
  conversation communication.sms_conversations%rowtype;
  outbound_id uuid;
begin
  if length(btrim(coalesce(p_body, ''))) not between 1 and 1200 then
    raise exception 'Test body must contain 1 to 1200 characters' using errcode = '22023';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;

  select destination_row.* into strict destination
  from communication.sms_phone_numbers destination_row
  where destination_row.id = p_destination_identity_id
    and destination_row.is_active
    and destination_row.assistant_enabled
    and destination_row.provider_account_id is not null
    and destination_row.deleted_at is null;

  select pref.* into strict preference
  from communication.sms_notification_preferences pref
  where pref.user_id = p_user_id
    and pref.assistant_destination_id = destination.id
    and pref.assistant_program_key = destination.program_key
    and pref.sms_enabled
    and pref.ai_agent_messages
    and pref.phone_number is not null
    and pref.preferred_agent_id is not null
    and pref.deleted_at is null
    and not exists (
      select 1
      from communication.sms_consent consent
      where consent.user_id = pref.user_id
        and consent.organization_id = pref.organization_id
        and consent.phone_number = pref.phone_number
        and consent.consent_type = 'transactional'
        and consent.status = 'opted_out'
        and consent.deleted_at is null
    );

  begin
    select c.* into strict conversation
    from communication.sms_conversations c
    where c.destination_identity_id = destination.id
      and c.user_id = preference.user_id
      and c.organization_id = preference.organization_id
      and c.external_phone_number = preference.phone_number
      and c.program_key = destination.program_key
      and c.status = 'active'
      and c.deleted_at is null;
  exception
    when no_data_found then
      insert into communication.sms_conversations (
        organization_id, user_id, external_phone_number, our_phone_number,
        conversation_type, provider, provider_account_id, destination_identity_id,
        program_key, chat_conversation_id, agent_id, canonical_agent_version_id,
        identity_status
      ) values (
        preference.organization_id, preference.user_id, preference.phone_number,
        destination.phone_number, 'system_initiated', destination.provider,
        destination.provider_account_id, destination.id, destination.program_key,
        gen_random_uuid(), preference.preferred_agent_id,
        preference.preferred_agent_version_id, 'resolved'
      ) returning * into conversation;
  end;

  insert into communication.sms_messages (
    organization_id, conversation_id, provider, provider_account_id,
    direction, from_number, to_number, body, status, sent_by_type,
    ai_processed, ai_processing_status, idempotency_key, attempt_count, next_attempt_at
  ) values (
    conversation.organization_id, conversation.id, destination.provider,
    destination.provider_account_id, 'outbound', destination.phone_number,
    preference.phone_number, p_body, 'queued', 'system', true, 'completed',
    p_idempotency_key, 0, now()
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into outbound_id;

  if outbound_id is null then
    select message.id into outbound_id
    from communication.sms_messages message
    where message.idempotency_key = p_idempotency_key;
  end if;
  return outbound_id;
exception
  when no_data_found then
    raise exception 'SMS assistant destination or verified user binding is not ready'
      using errcode = '55000';
  when too_many_rows then
    raise exception 'SMS assistant user binding is ambiguous' using errcode = '21000';
end;
$$;

comment on column communication.sms_notification_preferences.assistant_destination_id is
  'Explicit shared assistant destination binding. Destination ownership organization is not tenant identity.';
comment on column communication.sms_notification_preferences.assistant_program_key is
  'Program half of the explicit assistant destination binding; composite FK prevents drift.';
comment on function communication.get_my_sms_assistant_program(text) is
  'Returns the caller SMS assistant state only through an explicit preference-to-destination/program binding.';
