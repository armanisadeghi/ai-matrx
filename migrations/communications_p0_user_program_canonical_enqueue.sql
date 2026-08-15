-- Remove the superseded unscoped disconnect overload and make safe-test transport
-- snapshots use only the canonical typed agent binding.

drop function if exists communication.disconnect_my_sms_assistant();

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
    and pref.organization_id = destination.organization_id
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

revoke execute on function communication.enqueue_sms_assistant_test(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function communication.enqueue_sms_assistant_test(uuid, uuid, text, text)
  to service_role;
