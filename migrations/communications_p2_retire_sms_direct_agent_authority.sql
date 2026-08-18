-- Retire the direct SMS agent-selection path after the Mandate-aware frontend
-- and aidream worker are live. The legacy columns remain only as constrained
-- NULL compatibility fields for older stored function rowtypes; no caller can
-- write or execute through them.

set lock_timeout = '8s';

drop function if exists communication.configure_my_sms_assistant(text, boolean, uuid);
drop function if exists communication.configure_my_sms_assistant_version(text, boolean, uuid, uuid);
drop function if exists communication.disconnect_my_sms_assistant(text);
drop function if exists communication._configure_my_sms_assistant(text, boolean, uuid, uuid);

update communication.sms_notification_preferences
set preferred_agent_id = null,
    preferred_agent_version_id = null,
    updated_at = now()
where preferred_agent_id is not null
   or preferred_agent_version_id is not null;

update communication.sms_conversations
set agent_id = null,
    canonical_agent_version_id = null,
    updated_at = now()
where program_key = 'ai_matrx_owner_beta'
  and (agent_id is not null or canonical_agent_version_id is not null)
  and deleted_at is null;

alter table communication.sms_notification_preferences
  drop constraint if exists sms_notification_preferences_mandate_only_agent_chk;
alter table communication.sms_notification_preferences
  add constraint sms_notification_preferences_mandate_only_agent_chk
  check (preferred_agent_id is null and preferred_agent_version_id is null);

comment on column communication.sms_notification_preferences.preferred_agent_id is
  'Retired compatibility field; constrained NULL. SMS agent identity resolves only through sms.owner_beta Mandate Bindings.';
comment on column communication.sms_notification_preferences.preferred_agent_version_id is
  'Retired compatibility field; constrained NULL. Version policy belongs to sms.owner_beta Mandate Bindings.';

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
    null::uuid,
    null::uuid,
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
      and sms_mandate.is_enabled
      and (sms_mandate.default_agent_id is not null
        or sms_mandate.default_agent_version_id is not null)
      and coalesce(consent.status, 'unknown') <> 'opted_out',
    array_remove(array[
      case when not destination.is_active or destination.provider_account_id is null
        then 'destination_not_ready' end,
      case when not destination.assistant_enabled then 'globally_paused' end,
      case when not preference.sms_enabled then 'sms_disabled' end,
      case when not preference.ai_agent_messages then 'user_paused' end,
      case when preference.phone_number is null then 'verified_phone_missing' end,
      case when not sms_mandate.is_enabled
          or (sms_mandate.default_agent_id is null
            and sms_mandate.default_agent_version_id is null)
        then 'mandate_unavailable' end,
      case when coalesce(consent.status, 'unknown') = 'opted_out'
        then 'consent_opted_out' end
    ]::text[], null)
  from communication.sms_notification_preferences preference
  join communication.sms_phone_numbers destination
    on destination.id = preference.assistant_destination_id
   and destination.program_key = preference.assistant_program_key
   and destination.program_key = p_program_key
   and destination.deleted_at is null
  join agent.mandate sms_mandate
    on sms_mandate.mandate_key = 'sms.owner_beta'
   and sms_mandate.deleted_at is null
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
  if not exists (
    select 1 from agent.mandate mandate
    where mandate.mandate_key = 'sms.owner_beta'
      and mandate.is_enabled
      and mandate.deleted_at is null
      and (mandate.default_agent_id is not null
        or mandate.default_agent_version_id is not null)
  ) then
    raise exception 'SMS assistant Mandate is unavailable' using errcode = '55000';
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
        gen_random_uuid(), null, null, 'resolved'
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

revoke execute on function communication.enqueue_sms_assistant_test(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function communication.enqueue_sms_assistant_test(uuid, uuid, text, text)
  to service_role;

comment on function communication.get_my_sms_assistant_program(text) is
  'Returns transport readiness only. Holder identity is intentionally absent and resolves through sms.owner_beta Mandate Bindings.';
comment on function communication.enqueue_sms_assistant_test(uuid, uuid, text, text) is
  'Queues a safe transport test without reading or snapshotting a direct agent pointer.';
