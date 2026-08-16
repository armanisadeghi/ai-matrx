begin;

do $$
declare
  v_program constant text := 'ai_matrx_owner_beta';
  v_destination communication.sms_phone_numbers%rowtype;
  v_preference communication.sms_notification_preferences%rowtype;
  v_context record;
  v_registration record;
  v_consent record;
  v_slot agent.slot_definition%rowtype;
  v_conversation_id uuid := gen_random_uuid();
  v_call_id text := 'CA_SESSION_REFERENCE_ROLLBACK_PROBE';
  v_event_key text := 'twilio:voice-consent:rollback:CA_SESSION_REFERENCE_ROLLBACK_PROBE:v1';
  v_raw_reference text := 'raw-reference-must-never-be-persisted-rollback-probe';
  v_hash text := 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
  v_mismatch_hash text := 'sha256:2222222222222222222222222222222222222222222222222222222222222222';
  v_expiry_hash text := 'sha256:3333333333333333333333333333333333333333333333333333333333333333';
  v_issued record;
  v_consumed record;
  v_count bigint;
begin
  select destination.* into strict v_destination
  from communication.sms_phone_numbers destination
  where destination.program_key = v_program
    and destination.provider = 'twilio'
    and destination.is_active is true
    and destination.deleted_at is null;

  select preference.* into strict v_preference
  from communication.sms_notification_preferences preference
  where preference.assistant_program_key = v_program
    and preference.assistant_destination_id = v_destination.id
    and preference.phone_number is not null
    and preference.deleted_at is null;

  select * into strict v_context
  from communication.resolve_voice_owner_call_context(
    v_program,
    v_destination.id,
    'twilio',
    v_destination.provider_account_id,
    v_preference.phone_number,
    v_destination.phone_number
  );

  select * into strict v_registration
  from communication.register_voice_call_interaction(
    v_context.party_id,
    v_context.contact_point_id,
    v_context.organization_id,
    v_context.recording_owner_id,
    'inbound',
    'twilio',
    v_destination.provider_account_id,
    v_call_id,
    v_program,
    v_preference.phone_number,
    v_destination.phone_number,
    clock_timestamp()
  );

  select * into strict v_consent
  from communication.claim_voice_call_consent_event(
    'twilio',
    v_destination.provider_account_id,
    v_call_id,
    v_event_key,
    v_program,
    'owner-beta-session-reference-v1',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    clock_timestamp(),
    'dtmf',
    '1',
    clock_timestamp(),
    'conversation_relay'
  );

  select slot.* into strict v_slot
  from agent.slot_definition slot
  where slot.slot_key = 'voice.intro'
    and slot.is_enabled is true
    and slot.deleted_at is null;

  insert into chat.conversation (
    id,
    organization_id,
    created_by,
    initial_agent_id,
    initial_agent_version_id,
    source_app,
    source_feature,
    origin_class
  ) values (
    v_conversation_id,
    v_context.organization_id,
    v_context.recording_owner_id,
    v_slot.default_agent_id,
    v_slot.default_agent_version_id,
    'aidream',
    'voice-owner-beta',
    'system'
  );
  select * into strict v_issued
  from communication.issue_voice_agent_session_reference(
    v_hash,
    '11111111-1111-4111-8111-111111111111'::uuid,
    clock_timestamp() + interval '5 minutes',
    v_registration.interaction_id,
    v_conversation_id,
    v_consent.event_id,
    v_slot.id,
    v_slot.slot_key,
    v_slot.default_agent_id,
    v_slot.default_agent_version_id,
    'system',
    null,
    'conversation_relay'
  );
  if v_issued.session_id <> '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'Issued Voice session reference returned the wrong session';
  end if;
  if exists (
    select 1
    from platform.activity_log activity
    where activity.id = v_issued.event_id
      and activity.metadata::text like '%' || v_raw_reference || '%'
  ) then
    raise exception 'Raw opaque Voice session reference was persisted';
  end if;

  select * into strict v_consumed
  from communication.consume_voice_agent_session_reference(
    v_hash,
    'twilio',
    v_destination.provider_account_id,
    v_call_id,
    'VX11111111111111111111111111111111'
  );
  if v_consumed.binding #>> '{session_id}' <> '11111111-1111-4111-8111-111111111111'
     or v_consumed.binding #>> '{call,provider_call_id}' <> v_call_id
     or v_consumed.binding #>> '{agent,slot_id}' <> v_slot.id::text
     or (v_consumed.launch_facts ->> 'session_binding_match_count')::integer <> 1 then
    raise exception 'Consumed Voice session binding was not exact';
  end if;

  select count(*) into v_count
  from communication.consume_voice_agent_session_reference(
    v_hash,
    'twilio',
    v_destination.provider_account_id,
    v_call_id,
    'VX11111111111111111111111111111111'
  );
  if v_count <> 0 then
    raise exception 'Consumed Voice session reference replay did not fail closed';
  end if;

  perform * from communication.issue_voice_agent_session_reference(
    v_mismatch_hash,
    '22222222-2222-4222-8222-222222222222'::uuid,
    clock_timestamp() + interval '5 minutes',
    v_registration.interaction_id,
    v_conversation_id,
    v_consent.event_id,
    v_slot.id,
    v_slot.slot_key,
    v_slot.default_agent_id,
    v_slot.default_agent_version_id,
    'system',
    null,
    'conversation_relay'
  );
  select count(*) into v_count
  from communication.consume_voice_agent_session_reference(
    v_mismatch_hash,
    'twilio',
    v_destination.provider_account_id,
    'CA_WRONG_CALL',
    'VX22222222222222222222222222222222'
  );
  if v_count <> 0 then
    raise exception 'Mismatched Voice session identity did not fail closed';
  end if;
  select count(*) into v_count
  from communication.consume_voice_agent_session_reference(
    v_mismatch_hash,
    'twilio',
    v_destination.provider_account_id,
    v_call_id,
    'VX22222222222222222222222222222222'
  );
  if v_count <> 1 then
    raise exception 'Identity mismatch incorrectly burned the one-time reference';
  end if;

  perform * from communication.issue_voice_agent_session_reference(
    v_expiry_hash,
    '33333333-3333-4333-8333-333333333333'::uuid,
    clock_timestamp() + interval '100 milliseconds',
    v_registration.interaction_id,
    v_conversation_id,
    v_consent.event_id,
    v_slot.id,
    v_slot.slot_key,
    v_slot.default_agent_id,
    v_slot.default_agent_version_id,
    'system',
    null,
    'conversation_relay'
  );
  perform pg_sleep(0.15);
  select count(*) into v_count
  from communication.consume_voice_agent_session_reference(
    v_expiry_hash,
    'twilio',
    v_destination.provider_account_id,
    v_call_id,
    'VX33333333333333333333333333333333'
  );
  if v_count <> 0 then
    raise exception 'Expired Voice session reference did not fail closed';
  end if;

  if (select count(*) from platform.activity_log activity
      where activity.action = 'voice.agent.session_reference.consumed'
        and activity.metadata ->> 'reference_sha256' in (v_hash, v_mismatch_hash)) <> 2 then
    raise exception 'One-time Voice session consumption evidence is not exact';
  end if;
end;
$$;

rollback;
