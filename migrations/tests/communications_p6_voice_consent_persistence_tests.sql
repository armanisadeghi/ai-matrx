begin;

do $$
declare
  v_program constant text := 'ai_matrx_owner_beta';
  v_destination communication.sms_phone_numbers%rowtype;
  v_preference communication.sms_notification_preferences%rowtype;
  v_context record;
  v_registration record;
  v_claim record;
  v_replay record;
  v_readiness record;
  v_call_id text := 'CA_CONSENT_PERSISTENCE_ROLLBACK_PROBE';
  v_event_key text := 'twilio:voice-consent:rollback:CA_CONSENT_PERSISTENCE_ROLLBACK_PROBE:v1';
  v_disclosed_at timestamptz := '2026-08-15T18:00:00Z';
  v_consented_at timestamptz := '2026-08-15T18:00:05Z';
  v_rejected boolean := false;
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
  if v_context.organization_id <> '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid
     or v_context.recording_owner_id <> v_preference.user_id then
    raise exception 'Exact owner context resolved the wrong canonical identity';
  end if;

  begin
    perform * from communication.resolve_voice_owner_call_context(
      v_program,
      v_destination.id,
      'twilio',
      v_destination.provider_account_id,
      '+14155559999',
      v_destination.phone_number
    );
  exception when no_data_found then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'Unknown owner caller did not fail closed';
  end if;

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
    v_disclosed_at
  );
  if v_registration.disposition <> 'created' then
    raise exception 'Rollback probe call was not created';
  end if;

  select * into strict v_claim
  from communication.claim_voice_call_consent_event(
    'twilio',
    v_destination.provider_account_id,
    v_call_id,
    v_event_key,
    v_program,
    'owner-beta-test-v1',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    v_disclosed_at,
    'dtmf',
    '1',
    v_consented_at,
    'twiml'
  );
  if v_claim.disposition <> 'created' then
    raise exception 'Affirmative consent was not durably created';
  end if;

  select * into strict v_replay
  from communication.claim_voice_call_consent_event(
    'twilio',
    v_destination.provider_account_id,
    v_call_id,
    v_event_key,
    v_program,
    'owner-beta-test-v1',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    v_disclosed_at,
    'dtmf',
    '1',
    v_consented_at,
    'twiml'
  );
  if v_replay.disposition <> 'replay'
     or v_replay.event_id <> v_claim.event_id then
    raise exception 'Exact consent replay was not idempotent';
  end if;

  v_rejected := false;
  begin
    perform * from communication.claim_voice_call_consent_event(
      'twilio',
      v_destination.provider_account_id,
      v_call_id,
      v_event_key,
      v_program,
      'owner-beta-test-v1',
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      v_disclosed_at,
      'speech',
      'i agree',
      v_consented_at,
      'twiml'
    );
  exception when unique_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'Mutated consent replay did not fail closed';
  end if;

  if not exists (
    select 1
    from crm.interaction interaction
    where interaction.id = v_registration.interaction_id
      and interaction.attributes -> 'voice_consent' ->> 'provider_event_key' = v_event_key
  ) then
    raise exception 'Canonical interaction does not carry consent evidence';
  end if;
  if not exists (
    select 1
    from platform.activity_log activity
    where activity.id = v_claim.event_id
      and activity.action = 'voice.call.consent'
      and activity.entity_id = v_registration.interaction_id
  ) then
    raise exception 'Consent activity evidence was not correlated to the call';
  end if;

  select * into strict v_readiness
  from communication.voice_call_consent_persistence_readiness(v_program);
  if not v_readiness.ready
     or v_readiness.canonical_identity_binding_count <> 1 then
    raise exception 'Voice consent persistence readiness did not pass';
  end if;
end;
$$;

rollback;
