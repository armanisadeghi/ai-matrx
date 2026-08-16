-- Rollback-safe live-schema proof for the P6 recording custody frontier.
begin;

do $$
declare
  owner_id uuid := '4cf62e4e-2679-484f-b652-034e697418df';
  org_id uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  party_id uuid;
  canonical_file_id uuid;
  account_id text := 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  first_call text := 'CAbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  first_recording text := 'REcccccccccccccccccccccccccccccccc';
  second_call text := 'CAdddddddddddddddddddddddddddddddd';
  second_recording text := 'REeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  third_call text := 'CAffffffffffffffffffffffffffffffff';
  third_recording text := 'RE11111111111111111111111111111111';
  lifecycle record;
  work record;
  replay_work record;
  finalized record;
  failure_recorded boolean;
  stale_failure_recorded boolean;
  interaction crm.interaction%rowtype;
begin
  select p.id into strict party_id
  from crm.party p
  where p.organization_id = org_id and p.deleted_at is null
  order by p.created_at
  limit 1;

  select f.id into strict canonical_file_id
  from files.files f
  where f.created_by = owner_id
    and f.organization_id = org_id
    and f.deleted_at is null
  order by f.created_at
  limit 1;

  perform * from communication.register_voice_call_interaction(
    party_id, null, org_id, owner_id, 'inbound', 'twilio', account_id,
    first_call, 'ai_matrx_owner_beta', '+14155553627', '+14158059951', now()
  );
  select * into strict lifecycle
  from communication.claim_voice_recording_lifecycle_event(
    'twilio', account_id, first_call, first_recording,
    'twilio:voice-recording:' || account_id || ':' || first_recording || ':completed',
    'completed', now(), 42, 2::smallint, 'StartCallRecordingAPI', 'both',
    'https://matrx-voice-recordings-prod-872515272894.s3.us-east-1.amazonaws.com/' ||
      'twilio/us1/owner-beta/' || first_recording || '.wav'
  );

  select * into strict work
  from communication.claim_voice_recording_custody_work(
    'rollback-worker-a', 1, 300, 1
  );
  if work.source_event_id <> lifecycle.event_id
     or work.interaction_id <> lifecycle.interaction_id
     or work.attempt_count <> 1
     or work.recording_owner_id <> owner_id
     or work.organization_id <> org_id
     or work.source_event_key <>
       'twilio:voice-recording:' || account_id || ':' || first_recording || ':completed' then
    raise exception 'Custody claim did not return the exact completed lifecycle identity';
  end if;

  perform * from communication.claim_voice_recording_custody_work(
    'rollback-worker-b', 1, 300, 1
  );
  if found then
    raise exception 'An active custody lease was double-claimed';
  end if;

  select communication.fail_voice_recording_custody_work(
    work.source_event_id,
    work.claim_token,
    'rollback-worker-a',
    'external_object_hash_drift',
    true,
    1,
    'ExternalObjectDriftError',
    null,
    false,
    1
  ) into strict failure_recorded;
  if not failure_recorded then
    raise exception 'Custody failure receipt was not appended';
  end if;
  if not exists (
    select 1 from platform.activity_log failure
    where failure.action = 'voice.recording.custody.failed'
      and failure.metadata ->> 'source_event_id' = work.source_event_id::text
      and failure.metadata ->> 'retryable' = 'false'
      and failure.metadata ->> 'error_code' = 'external_object_hash_drift'
      and not (failure.metadata ? 'provider_media_url')
  ) then
    raise exception 'Exhausted retry did not dead-letter without a provider URL';
  end if;
  perform * from communication.claim_voice_recording_custody_work(
    'rollback-worker-b', 1, 300, 1
  );
  if found then
    raise exception 'Dead-lettered recording custody work was reclaimed';
  end if;

  -- A separate exact completed callback proves successful finalization closes
  -- the frontier and remains replay-safe through the existing finalizer.
  perform * from communication.register_voice_call_interaction(
    party_id, null, org_id, owner_id, 'inbound', 'twilio', account_id,
    second_call, 'ai_matrx_owner_beta', '+14155553627', '+14158059951', now()
  );
  select * into strict lifecycle
  from communication.claim_voice_recording_lifecycle_event(
    'twilio', account_id, second_call, second_recording,
    'twilio:voice-recording:' || account_id || ':' || second_recording || ':completed',
    'completed', now(), 21, 1::smallint, 'StartCallRecordingAPI', 'both',
    'https://matrx-voice-recordings-prod-872515272894.s3.us-east-1.amazonaws.com/' ||
      'twilio/us1/owner-beta/' || second_recording || '.wav'
  );
  select * into strict work
  from communication.claim_voice_recording_custody_work(
    'rollback-worker-success', 1, 300, 5
  );
  if work.source_event_id <> lifecycle.event_id then
    raise exception 'Successful scenario claimed another lifecycle event';
  end if;

  select * into strict finalized
  from communication.finalize_voice_recording_file(
    work.provider,
    work.provider_account_id,
    work.provider_call_id,
    work.provider_recording_id,
    work.source_event_key,
    canonical_file_id
  );
  if finalized.disposition <> 'bound'
     or finalized.canonical_file_id <> canonical_file_id then
    raise exception 'Claimed custody work did not bind the canonical file';
  end if;
  select * into strict finalized
  from communication.finalize_voice_recording_file(
    work.provider,
    work.provider_account_id,
    work.provider_call_id,
    work.provider_recording_id,
    work.source_event_key,
    canonical_file_id
  );
  if finalized.disposition <> 'replay' then
    raise exception 'Canonical custody finalization was not idempotent';
  end if;
  perform * from communication.claim_voice_recording_custody_work(
    'rollback-worker-success-replay', 1, 300, 5
  );
  if found then
    raise exception 'Finalized recording custody work remained claimable';
  end if;
  select i.* into strict interaction
  from crm.interaction i where i.id = lifecycle.interaction_id;
  if interaction.recording_file_id <> canonical_file_id
     or interaction.recording_url is not null then
    raise exception 'Finalized interaction did not use only canonical file identity';
  end if;

  -- Lease expiry is the crash-recovery seam. The rollback test backdates only
  -- its own claim receipt to avoid waiting thirty seconds.
  perform * from communication.register_voice_call_interaction(
    party_id, null, org_id, owner_id, 'inbound', 'twilio', account_id,
    third_call, 'ai_matrx_owner_beta', '+14155553627', '+14158059951', now()
  );
  select * into strict lifecycle
  from communication.claim_voice_recording_lifecycle_event(
    'twilio', account_id, third_call, third_recording,
    'twilio:voice-recording:' || account_id || ':' || third_recording || ':completed',
    'completed', now(), 7, 1::smallint, 'StartCallRecordingAPI', 'both',
    'https://matrx-voice-recordings-prod-872515272894.s3.us-east-1.amazonaws.com/' ||
      'twilio/us1/owner-beta/' || third_recording || '.mp3'
  );
  select * into strict work
  from communication.claim_voice_recording_custody_work(
    'rollback-crashed-worker', 1, 30, 5
  );
  update platform.activity_log claim
  set metadata = jsonb_set(
    claim.metadata,
    '{lease_expires_at}',
    to_jsonb((now() - interval '1 second')::text)
  )
  where claim.id = work.claim_event_id;

  select * into strict replay_work
  from communication.claim_voice_recording_custody_work(
    'rollback-recovery-worker', 1, 30, 5
  );
  if replay_work.source_event_id <> lifecycle.event_id
     or replay_work.attempt_count <> 2
     or replay_work.claim_token = work.claim_token then
    raise exception 'Expired custody lease was not reclaimed with a new attempt fence';
  end if;

  select communication.fail_voice_recording_custody_work(
    work.source_event_id,
    work.claim_token,
    'rollback-crashed-worker',
    'recording_custody_processing_failed',
    true,
    30,
    'RuntimeError',
    null,
    false,
    5
  ) into strict stale_failure_recorded;
  if stale_failure_recorded then
    raise exception 'A stale worker was allowed to settle a newer custody claim';
  end if;

  if pg_catalog.has_function_privilege(
      'anon',
      'communication.claim_voice_recording_custody_work(text,integer,integer,integer)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'communication.fail_voice_recording_custody_work(bigint,uuid,text,text,boolean,integer,text,uuid,boolean,integer)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',
      'communication.claim_voice_recording_custody_work(text,integer,integer,integer)',
      'EXECUTE'
    ) then
    raise exception 'Voice recording custody RPC privileges are not service-only';
  end if;
end;
$$;

rollback;
