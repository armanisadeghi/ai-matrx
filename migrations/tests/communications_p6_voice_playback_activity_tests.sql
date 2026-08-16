-- Rollback-safe live-schema proof for the P6 playback activity claim.
begin;

do $$
declare
  owner_id uuid := '4cf62e4e-2679-484f-b652-034e697418df';
  org_id uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  party_id uuid;
  interaction_id uuid;
  session_id uuid := gen_random_uuid();
  wrong_session_id uuid := gen_random_uuid();
  provider_session_id text := 'VXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  second_provider_session_id text := 'VXbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  account_id text := 'AC12121212121212121212121212121212';
  call_id text := 'CA34343434343434343434343434343434';
  source_hash text;
  wrong_source_hash text;
  reference_hash text := 'sha256:' || repeat('1', 64);
  issued_event_id bigint;
  playback_event_id bigint;
  playback jsonb;
  claimed record;
  replayed record;
  definition_text text;
begin
  select p.id into strict party_id
  from crm.party p
  where p.organization_id = org_id and p.deleted_at is null
  order by p.created_at
  limit 1;

  select registration.interaction_id into strict interaction_id
  from communication.register_voice_call_interaction(
    party_id,
    null,
    org_id,
    owner_id,
    'inbound',
    'twilio',
    account_id,
    call_id,
    'ai_matrx_owner_beta',
    '+14155553627',
    '+14158059951',
    now()
  ) registration;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    org_id,
    'crm_interaction',
    interaction_id,
    'voice.agent.session_reference.issued',
    owner_id,
    now(),
    jsonb_build_object(
      'reference_sha256', reference_hash,
      'session_id', session_id,
      'interaction_id', interaction_id,
      'organization_id', org_id,
      'program_key', 'ai_matrx_owner_beta',
      'transport', 'conversation_relay'
    )
  ) returning id into issued_event_id;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    org_id,
    'crm_interaction',
    interaction_id,
    'voice.agent.session_reference.consumed',
    owner_id,
    now(),
    jsonb_build_object(
      'reference_sha256', reference_hash,
      'session_id', session_id,
      'interaction_id', interaction_id,
      'organization_id', org_id,
      'program_key', 'ai_matrx_owner_beta',
      'transport', 'conversation_relay',
      'issued_event_id', issued_event_id,
      'provider_session_id', provider_session_id
    )
  );

  source_hash := 'sha256:' || encode(
    extensions.digest(
      concat_ws(
        chr(31),
        'voice-playback-activity:v1',
        interaction_id::text,
        session_id::text,
        provider_session_id
      ),
      'sha256'
    ),
    'hex'
  );

  playback := jsonb_build_object(
    'generated_chunks', 2,
    'generated_bytes', 10,
    'sent_chunks', 2,
    'sent_bytes', 10,
    'played_chunks', 2,
    'played_bytes', 10,
    'unheard_sent_chunks', 0,
    'unsent_cancelled_chunks', 0,
    'final_sent_turns', 1,
    'final_played_turns', 1,
    'completed_turns', 1,
    'partial_turns', 0,
    'cancelled_turns', 0,
    'provider_evidence_events', 4,
    'provider_evidence_rejections', 0,
    'provider_sequence_highwater', 4,
    'provider_observed_at_ms_highwater', 50,
    'agent_speaker_starts', 1,
    'agent_speaker_stops', 1,
    'client_speaker_starts', 0,
    'client_speaker_stops', 0,
    'agent_speaking_ms', 20,
    'client_speaking_ms', 0,
    'agent_speaker_open_at_close', false,
    'client_speaker_open_at_close', false,
    'interrupt_boundaries', 0,
    'max_interrupt_duration_ms', 0,
    'first_generated_at_ms', 10,
    'first_sent_at_ms', 20,
    'first_played_at_ms', 30,
    'generated_chain_sha256', 'sha256:' || repeat('a', 64),
    'sent_chain_sha256', 'sha256:' || repeat('b', 64),
    'played_chain_sha256', 'sha256:' || repeat('c', 64),
    'interrupt_chain_sha256',
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );

  select * into strict claimed
  from communication.claim_voice_playback_activity(
    interaction_id,
    org_id,
    'ai_matrx_owner_beta',
    session_id,
    provider_session_id,
    source_hash,
    true,
    playback
  );
  if claimed.disposition <> 'created'
     or claimed.interaction_id <> interaction_id
     or claimed.source_event_key_sha256 <> source_hash then
    raise exception 'Exact playback evidence was not created';
  end if;
  playback_event_id := claimed.event_id;

  select * into strict replayed
  from communication.claim_voice_playback_activity(
    interaction_id,
    org_id,
    'ai_matrx_owner_beta',
    session_id,
    provider_session_id,
    source_hash,
    true,
    playback
  );
  if replayed.disposition <> 'replay' or replayed.event_id <> playback_event_id then
    raise exception 'Exact playback replay did not return the original event';
  end if;

  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
      provider_session_id, source_hash, true,
      jsonb_set(playback, '{played_bytes}', '9'::jsonb)
    );
    raise exception 'mutated playback replay unexpectedly succeeded';
  exception when unique_violation then
    null;
  end;

  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, gen_random_uuid(), 'ai_matrx_owner_beta', session_id,
      provider_session_id, source_hash, true, playback
    );
    raise exception 'wrong organization unexpectedly succeeded';
  exception when sqlstate 'P0002' then
    null;
  end;

  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'different_program', session_id,
      provider_session_id, source_hash, true, playback
    );
    raise exception 'wrong program unexpectedly succeeded';
  exception when sqlstate 'P0002' then
    null;
  end;

  wrong_source_hash := 'sha256:' || encode(
    extensions.digest(
      concat_ws(
        chr(31), 'voice-playback-activity:v1', interaction_id::text,
        wrong_session_id::text, provider_session_id
      ),
      'sha256'
    ),
    'hex'
  );
  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', wrong_session_id,
      provider_session_id, wrong_source_hash, true, playback
    );
    raise exception 'wrong session unexpectedly succeeded';
  exception when sqlstate 'P0002' then
    null;
  end;

  wrong_source_hash := 'sha256:' || encode(
    extensions.digest(
      concat_ws(
        chr(31), 'voice-playback-activity:v1', interaction_id::text,
        session_id::text, second_provider_session_id
      ),
      'sha256'
    ),
    'hex'
  );
  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
      second_provider_session_id, wrong_source_hash, true, playback
    );
    raise exception 'wrong provider session unexpectedly succeeded';
  exception when sqlstate 'P0002' then
    null;
  end;

  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
      provider_session_id, source_hash, false, playback
    );
    raise exception 'unverified provider payload unexpectedly succeeded';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
      provider_session_id, source_hash, true,
      playback || jsonb_build_object('raw_provider_payload', 'forbidden')
    );
    raise exception 'unknown provider payload field unexpectedly succeeded';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
      provider_session_id, source_hash, true,
      jsonb_set(playback, '{provider_sequence_highwater}', '3'::jsonb)
    );
    raise exception 'out-of-order provider evidence unexpectedly succeeded';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
      provider_session_id, source_hash, true,
      jsonb_set(playback, '{sent_chunks}', '3'::jsonb)
    );
    raise exception 'sent-without-generated evidence unexpectedly succeeded';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
      provider_session_id, source_hash, true,
      jsonb_set(playback, '{played_chunks}', '3'::jsonb)
    );
    raise exception 'played-beyond-sent evidence unexpectedly succeeded';
  exception when invalid_parameter_value then
    null;
  end;

  if exists (
    select 1
    from platform.activity_log activity
    where activity.id = playback_event_id
      and (
        activity.metadata ?| array[
          'session_id', 'provider_session_id', 'program_key', 'interaction_id',
          'provider', 'provider_payload', 'reference', 'signature', 'phone',
          'provider_url', 'credentials', 'transcript', 'audio', 'token_text'
        ]
        or activity.metadata::text like '%' || provider_session_id || '%'
        or activity.metadata::text like '%' || session_id::text || '%'
        or activity.metadata::text ~* '(https?://|s3://|\+1415)'
      )
  ) then
    raise exception 'Playback activity leaked provider/session/content evidence';
  end if;

  delete from platform.activity_log
  where id = playback_event_id;
  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
      provider_session_id, source_hash, true, playback
    );
    raise exception 'synthetic playback claim crash';
  exception when raise_exception then
    if sqlerrm <> 'synthetic playback claim crash' then
      raise;
    end if;
  end;
  if exists (
    select 1 from platform.activity_log activity
    where activity.action = 'voice.agent.playback_activity'
      and activity.metadata ->> 'source_event_key_sha256' = source_hash
  ) then
    raise exception 'A crashed playback claim left partial evidence';
  end if;

  select * into strict claimed
  from communication.claim_voice_playback_activity(
    interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
    provider_session_id, source_hash, true, playback
  );
  if claimed.disposition <> 'created' then
    raise exception 'Playback claim did not recover after a rolled-back crash';
  end if;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    org_id,
    'crm_interaction',
    interaction_id,
    'voice.agent.session_reference.consumed',
    owner_id,
    now(),
    jsonb_build_object(
      'reference_sha256', 'sha256:' || repeat('2', 64),
      'session_id', session_id,
      'interaction_id', interaction_id,
      'organization_id', org_id,
      'program_key', 'ai_matrx_owner_beta',
      'transport', 'conversation_relay',
      'issued_event_id', issued_event_id,
      'provider_session_id', second_provider_session_id
    )
  );
  begin
    perform * from communication.claim_voice_playback_activity(
      interaction_id, org_id, 'ai_matrx_owner_beta', session_id,
      provider_session_id, source_hash, true, playback
    );
    raise exception 'ambiguous consumed session unexpectedly succeeded';
  exception when sqlstate 'P0002' then
    null;
  end;

  select pg_get_functiondef(
    'communication.claim_voice_playback_activity(uuid,uuid,text,uuid,text,text,boolean,jsonb)'::regprocedure
  ) into strict definition_text;
  if definition_text not like '%pg_advisory_xact_lock%'
     or definition_text not like '%for update%'
     or not exists (
       select 1
       from pg_indexes
       where schemaname = 'platform'
         and tablename = 'activity_log'
         and indexname = 'activity_log_voice_playback_source_uidx'
         and indexdef like 'CREATE UNIQUE INDEX%'
     ) then
    raise exception 'Playback concurrency fences are incomplete';
  end if;

  select pg_get_functiondef(
    'communication.consume_voice_agent_session_reference(text,text,text,text,text)'::regprocedure
  ) into strict definition_text;
  if definition_text not like
       '%' || quote_literal('program_key') ||
       ', v_issued.metadata ->> ' || quote_literal('program_key') || '%' then
    raise exception 'Consumed Voice binding does not project canonical program_key';
  end if;

  if has_function_privilege(
       'anon',
       'communication.claim_voice_playback_activity(uuid,uuid,text,uuid,text,text,boolean,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'communication.claim_voice_playback_activity(uuid,uuid,text,uuid,text,text,boolean,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'communication.claim_voice_playback_activity(uuid,uuid,text,uuid,text,text,boolean,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Playback claim function privileges are not service-only';
  end if;

  raise notice 'voice playback activity rollback proof passed';
end;
$$;

rollback;
