begin;

do $$
declare
  owner_id uuid := '4cf62e4e-2679-484f-b652-034e697418df';
  org_id uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  party_id uuid;
  first_file_id uuid;
  second_file_id uuid;
  call_id text := 'CArollbackvoicecall000000000000000001';
  recording_id text := 'RErollbackrecording0000000000000001';
  completed_at timestamptz := now();
  recording_started_at timestamptz := now();
  registered record;
  claimed record;
  replayed record;
  finalized record;
  readiness record;
  interaction crm.interaction%rowtype;
  rejected boolean;
begin
  select p.id into strict party_id
  from crm.party p
  where p.organization_id = org_id and p.deleted_at is null
  order by p.created_at
  limit 1;

  select f.id into strict first_file_id
  from files.files f
  where f.created_by = owner_id
    and f.organization_id = org_id
    and f.deleted_at is null
  order by f.created_at
  limit 1;

  select f.id into strict second_file_id
  from files.files f
  where f.created_by = owner_id
    and f.organization_id = org_id
    and f.deleted_at is null
    and f.id <> first_file_id
  order by f.created_at
  limit 1;

  select * into strict registered
  from communication.register_voice_call_interaction(
    party_id,
    null,
    org_id,
    owner_id,
    'inbound',
    'twilio',
    'ACrollbackvoiceaccount00000000000001',
    call_id,
    'ai_matrx_owner_beta',
    '+14155553627',
    '+14158059951',
    now()
  );
  if registered.disposition <> 'created' or registered.interaction_id is null then
    raise exception 'Voice call registration did not create one canonical interaction';
  end if;

  select * into strict replayed
  from communication.register_voice_call_interaction(
    party_id,
    null,
    org_id,
    owner_id,
    'inbound',
    'twilio',
    'ACrollbackvoiceaccount00000000000001',
    call_id,
    'ai_matrx_owner_beta',
    '+14155553627',
    '+14158059951',
    now()
  );
  if replayed.disposition <> 'replay'
     or replayed.interaction_id <> registered.interaction_id then
    raise exception 'Voice call registration replay did not resolve the canonical interaction';
  end if;

  rejected := false;
  begin
    insert into crm.interaction (
      party_id, direction, channel_code, status, occurred_at, organization_id,
      provider, provider_account_id, provider_interaction_id, program_key,
      recording_owner_id
    ) values (
      party_id, 'inbound', 'call', 'in_progress', now(), org_id,
      'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
      'ai_matrx_owner_beta', owner_id
    );
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'Duplicate provider call identity was not rejected';
  end if;

  select * into strict claimed
  from communication.claim_voice_call_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
    'twilio:voice:ACrollbackvoiceaccount00000000000001:' || call_id || ':0:initiated',
    0, 'initiated', now()
  );
  if claimed.disposition <> 'ignored_duplicate_state'
     or claimed.effective_status <> 'initiated' then
    raise exception 'Initial provider callback was not retained as duplicate-state evidence';
  end if;

  select i.* into strict interaction
  from crm.interaction i where i.id = registered.interaction_id;
  if interaction.provider_status_sequence <> 0 then
    raise exception 'Duplicate-state callback did not advance the sequence watermark';
  end if;

  select * into strict claimed
  from communication.claim_voice_call_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
    'twilio:voice:ACrollbackvoiceaccount00000000000001:' || call_id || ':1:ringing',
    1, 'ringing', now()
  );
  if claimed.disposition <> 'applied' or claimed.effective_status <> 'ringing' then
    raise exception 'Ringing provider state was not applied';
  end if;

  select * into strict claimed
  from communication.claim_voice_call_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
    'twilio:voice:ACrollbackvoiceaccount00000000000001:' || call_id || ':2:initiated',
    2, 'initiated', now()
  );
  if claimed.disposition <> 'ignored_out_of_order' or claimed.effective_status <> 'ringing' then
    raise exception 'Regressive call state was not rejected';
  end if;

  select * into strict claimed
  from communication.claim_voice_call_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
    'twilio:voice:ACrollbackvoiceaccount00000000000001:' || call_id || ':3:completed',
    3, 'completed', completed_at
  );
  if claimed.disposition <> 'applied' or claimed.effective_status <> 'completed' then
    raise exception 'Terminal call state was not applied';
  end if;

  select * into strict claimed
  from communication.claim_voice_call_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
    'twilio:voice:ACrollbackvoiceaccount00000000000001:' || call_id || ':4:ringing',
    4, 'ringing', now()
  );
  if claimed.disposition <> 'ignored_terminal' or claimed.effective_status <> 'completed' then
    raise exception 'Post-terminal call callback regressed the lifecycle';
  end if;

  select * into strict replayed
  from communication.claim_voice_call_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
    'twilio:voice:ACrollbackvoiceaccount00000000000001:' || call_id || ':3:completed',
    3, 'completed', completed_at
  );
  if replayed.disposition <> 'replay' or replayed.event_id <> claimed.event_id then
    -- claimed now references the late-ringing event, so compare to the exact stored evidence.
    if replayed.disposition <> 'replay' or not exists (
      select 1 from platform.activity_log a
      where a.id = replayed.event_id
        and a.metadata ->> 'provider_event_key' =
          'twilio:voice:ACrollbackvoiceaccount00000000000001:' || call_id || ':3:completed'
    ) then
      raise exception 'Exact call callback replay was not idempotent';
    end if;
  end if;

  rejected := false;
  begin
    perform * from communication.claim_voice_call_lifecycle_event(
      'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
      'twilio:voice:ACrollbackvoiceaccount00000000000001:' || call_id || ':3:completed',
      3, 'completed', completed_at + interval '1 second'
    );
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'Call callback replay with mutated time evidence was not rejected';
  end if;

  rejected := false;
  begin
    perform * from communication.claim_voice_call_lifecycle_event(
      'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
      'twilio:voice:ACrollbackvoiceaccount00000000000001:' || call_id || ':3:completed',
      3, 'failed', now()
    );
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'Mutated call callback replay was not rejected';
  end if;

  select * into strict claimed
  from communication.claim_voice_recording_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id, recording_id,
    'twilio:voice-recording:ACrollbackvoiceaccount00000000000001:' || recording_id || ':in_progress',
    'in_progress', recording_started_at, null, 2::smallint,
    'StartCallRecordingAPI', 'both', null
  );
  if claimed.disposition <> 'applied' or claimed.effective_status <> 'in_progress' then
    raise exception 'Recording start evidence was not applied';
  end if;

  select * into strict claimed
  from communication.claim_voice_recording_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id, recording_id,
    'twilio:voice-recording:ACrollbackvoiceaccount00000000000001:' || recording_id || ':completed',
    'completed', recording_started_at, 42, 2::smallint, 'StartCallRecordingAPI', 'both',
    'https://api.twilio.com/recordings/' || recording_id
  );
  if claimed.disposition <> 'applied'
     or claimed.effective_status <> 'completed' then
    raise exception 'Completed recording evidence was not claimed before file custody';
  end if;

  select * into strict replayed
  from communication.claim_voice_recording_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id, recording_id,
    'twilio:voice-recording:ACrollbackvoiceaccount00000000000001:' || recording_id || ':completed',
    'completed', recording_started_at, 42, 2::smallint, 'StartCallRecordingAPI', 'both',
    'https://api.twilio.com/recordings/' || recording_id
  );
  if replayed.disposition <> 'replay' or replayed.event_id <> claimed.event_id then
    raise exception 'Exact recording callback replay was not idempotent';
  end if;

  rejected := false;
  begin
    perform * from communication.claim_voice_recording_lifecycle_event(
      'twilio', 'ACrollbackvoiceaccount00000000000001', call_id, recording_id,
      'twilio:voice-recording:ACrollbackvoiceaccount00000000000001:' || recording_id || ':completed',
      'completed', recording_started_at, 42, 2::smallint,
      'StartCallRecordingAPI', 'both',
      'https://api.twilio.com/recordings/MUTATED'
    );
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'Recording callback replay with mutated media evidence was not rejected';
  end if;

  select * into strict claimed
  from communication.claim_voice_recording_lifecycle_event(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id, recording_id,
    'twilio:voice-recording:ACrollbackvoiceaccount00000000000001:' || recording_id || ':failed',
    'failed', now(), null, 2::smallint, 'StartCallRecordingAPI', 'both', null
  );
  if claimed.disposition <> 'ignored_terminal' or claimed.effective_status <> 'completed' then
    raise exception 'Post-terminal recording callback regressed the lifecycle';
  end if;

  rejected := false;
  begin
    perform * from communication.claim_voice_recording_lifecycle_event(
      'twilio', 'ACrollbackvoiceaccount00000000000001', call_id,
      'RErollbackdifferent0000000000000001',
      'twilio:voice-recording:ACrollbackvoiceaccount00000000000001:RErollbackdifferent0000000000000001:failed',
      'failed', now(), null, 2::smallint, 'StartCallRecordingAPI', 'both', null
    );
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'A second recording identity was not rejected for the singular call recording';
  end if;

  select * into strict finalized
  from communication.finalize_voice_recording_file(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id, recording_id,
    'twilio:voice-recording:ACrollbackvoiceaccount00000000000001:' || recording_id || ':completed',
    first_file_id
  );
  if finalized.disposition <> 'bound' or finalized.canonical_file_id <> first_file_id then
    raise exception 'Canonical recording file was not bound';
  end if;

  select * into strict replayed
  from communication.finalize_voice_recording_file(
    'twilio', 'ACrollbackvoiceaccount00000000000001', call_id, recording_id,
    'twilio:voice-recording:ACrollbackvoiceaccount00000000000001:' || recording_id || ':completed',
    first_file_id
  );
  if replayed.disposition <> 'replay' or replayed.canonical_file_id <> first_file_id then
    raise exception 'Canonical file binding replay was not idempotent';
  end if;

  rejected := false;
  begin
    perform * from communication.finalize_voice_recording_file(
      'twilio', 'ACrollbackvoiceaccount00000000000001', call_id, recording_id,
      'twilio:voice-recording:ACrollbackvoiceaccount00000000000001:' || recording_id || ':completed',
      second_file_id
    );
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'Canonical recording file binding was replaceable';
  end if;

  select i.* into strict interaction
  from crm.interaction i where i.id = registered.interaction_id;
  if interaction.recording_file_id <> first_file_id
     or interaction.recording_url is not null
     or interaction.recording_status <> 'completed'
     or interaction.provider_status <> 'completed' then
    raise exception 'Canonical interaction did not retain the final monotonic call/recording state';
  end if;

  select * into strict readiness
  from communication.voice_recording_persistence_readiness();
  if not readiness.ready
     or readiness.ambiguous_call_count <> 0
     or readiness.provider_url_violation_count <> 0 then
    raise exception 'Voice recording persistence readiness did not derive the live ready state';
  end if;
end;
$$;

rollback;
