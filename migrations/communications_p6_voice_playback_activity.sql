-- P6 Voice: idempotent provider-neutral playback activity persistence.
--
-- crm.interaction remains the canonical call and platform.activity_log remains
-- the only evidence ledger. The raw provider/session payload is validated
-- against the already-consumed one-time reference but is never persisted here.

create unique index if not exists activity_log_voice_playback_source_uidx
  on platform.activity_log ((metadata ->> 'source_event_key_sha256'))
  where action = 'voice.agent.playback_activity';

-- The existing consumed-reference binding already validates program_key but
-- did not return it to the provider-neutral runtime. Add that exact canonical
-- fact without changing the function signature or the issued/consumed ledger.
do $$
declare
  v_definition text;
  v_old constant text := $old$    'interaction_id', v_issued.metadata ->> 'interaction_id',
    'chat_conversation_id', v_issued.metadata ->> 'chat_conversation_id',$old$;
  v_new constant text := $new$    'interaction_id', v_issued.metadata ->> 'interaction_id',
    'program_key', v_issued.metadata ->> 'program_key',
    'chat_conversation_id', v_issued.metadata ->> 'chat_conversation_id',$new$;
begin
  select pg_get_functiondef(
    'communication.consume_voice_agent_session_reference(text,text,text,text,text)'::regprocedure
  ) into strict v_definition;
  if strpos(v_definition, v_new) > 0 then
    return;
  end if;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'Expected Voice session binding projection was not found';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;

drop function if exists communication.claim_voice_playback_activity(
  uuid, uuid, text, uuid, text, text, boolean, jsonb
);

create function communication.claim_voice_playback_activity(
  p_interaction_id uuid,
  p_organization_id uuid,
  p_program_key text,
  p_session_id uuid,
  p_provider_session_id text,
  p_source_event_key_sha256 text,
  p_provider_payload_verified boolean,
  p_playback jsonb
)
returns table (
  interaction_id uuid,
  event_id bigint,
  source_event_key_sha256 text,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interaction crm.interaction%rowtype;
  v_consumed platform.activity_log%rowtype;
  v_existing platform.activity_log%rowtype;
  v_event_id bigint;
  v_consumed_count integer;
  v_key text;
  v_expected_keys constant text[] := array[
    'agent_speaker_open_at_close',
    'agent_speaker_starts',
    'agent_speaker_stops',
    'agent_speaking_ms',
    'cancelled_turns',
    'client_speaker_open_at_close',
    'client_speaker_starts',
    'client_speaker_stops',
    'client_speaking_ms',
    'completed_turns',
    'final_played_turns',
    'final_sent_turns',
    'first_generated_at_ms',
    'first_played_at_ms',
    'first_sent_at_ms',
    'generated_bytes',
    'generated_chain_sha256',
    'generated_chunks',
    'interrupt_boundaries',
    'interrupt_chain_sha256',
    'max_interrupt_duration_ms',
    'partial_turns',
    'played_bytes',
    'played_chain_sha256',
    'played_chunks',
    'provider_evidence_events',
    'provider_evidence_rejections',
    'provider_observed_at_ms_highwater',
    'provider_sequence_highwater',
    'sent_bytes',
    'sent_chain_sha256',
    'sent_chunks',
    'unheard_sent_chunks',
    'unsent_cancelled_chunks'
  ];
  v_count_keys constant text[] := array[
    'generated_chunks', 'sent_chunks', 'played_chunks',
    'unheard_sent_chunks', 'unsent_cancelled_chunks',
    'final_sent_turns', 'final_played_turns',
    'completed_turns', 'partial_turns', 'cancelled_turns',
    'provider_evidence_events', 'provider_evidence_rejections',
    'provider_sequence_highwater',
    'agent_speaker_starts', 'agent_speaker_stops',
    'client_speaker_starts', 'client_speaker_stops',
    'interrupt_boundaries'
  ];
  v_byte_keys constant text[] := array[
    'generated_bytes', 'sent_bytes', 'played_bytes'
  ];
  v_timing_keys constant text[] := array[
    'provider_observed_at_ms_highwater',
    'agent_speaking_ms', 'client_speaking_ms',
    'max_interrupt_duration_ms'
  ];
  v_nullable_timing_keys constant text[] := array[
    'first_generated_at_ms', 'first_sent_at_ms', 'first_played_at_ms'
  ];
  v_boolean_keys constant text[] := array[
    'agent_speaker_open_at_close', 'client_speaker_open_at_close'
  ];
  v_hash_keys constant text[] := array[
    'generated_chain_sha256', 'sent_chain_sha256',
    'played_chain_sha256', 'interrupt_chain_sha256'
  ];
  v_empty_chain constant text :=
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  v_expected_source_hash text;
  v_metadata jsonb;
begin
  if p_interaction_id is null
     or p_organization_id is null
     or p_session_id is null
     or nullif(btrim(p_program_key), '') is null
     or length(p_program_key) > 100
     or nullif(btrim(p_provider_session_id), '') is null
     or length(p_provider_session_id) > 128
     or p_provider_session_id ~ '[[:cntrl:]]'
     or p_source_event_key_sha256 !~ '^sha256:[0-9a-f]{64}$'
     or p_provider_payload_verified is distinct from true then
    raise exception 'Exact verified Voice playback claim identity is required'
      using errcode = '22023';
  end if;

  v_expected_source_hash := 'sha256:' || encode(
    extensions.digest(
      concat_ws(
        chr(31),
        'voice-playback-activity:v1',
        p_interaction_id::text,
        p_session_id::text,
        p_provider_session_id
      ),
      'sha256'
    ),
    'hex'
  );
  if p_source_event_key_sha256 <> v_expected_source_hash then
    raise exception 'Voice playback source event hash is not server-derived'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_playback) <> 'object'
     or (select count(*) from jsonb_object_keys(p_playback)) <> cardinality(v_expected_keys) then
    raise exception 'Voice playback evidence must use the exact bounded object contract'
      using errcode = '22023';
  end if;
  foreach v_key in array v_expected_keys loop
    if not p_playback ? v_key then
      raise exception 'Voice playback evidence is missing required field'
        using errcode = '22023';
    end if;
  end loop;
  if exists (
    select 1
    from jsonb_object_keys(p_playback) supplied(key)
    where not (supplied.key = any(v_expected_keys))
  ) then
    raise exception 'Voice playback evidence contains an unknown field'
      using errcode = '22023';
  end if;

  foreach v_key in array v_count_keys loop
    if jsonb_typeof(p_playback -> v_key) <> 'number'
       or p_playback ->> v_key !~ '^[0-9]+$'
       or (p_playback ->> v_key)::bigint > 100000 then
      raise exception 'Voice playback count/sequence evidence is invalid'
        using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array v_byte_keys loop
    if jsonb_typeof(p_playback -> v_key) <> 'number'
       or p_playback ->> v_key !~ '^[0-9]+$'
       or (p_playback ->> v_key)::bigint > 100000000 then
      raise exception 'Voice playback byte evidence is invalid'
        using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array v_timing_keys loop
    if jsonb_typeof(p_playback -> v_key) <> 'number'
       or p_playback ->> v_key !~ '^[0-9]+$'
       or (p_playback ->> v_key)::bigint > 14400000 then
      raise exception 'Voice playback timing evidence is invalid'
        using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array v_nullable_timing_keys loop
    if p_playback -> v_key <> 'null'::jsonb
       and (
         jsonb_typeof(p_playback -> v_key) <> 'number'
         or p_playback ->> v_key !~ '^[0-9]+$'
         or (p_playback ->> v_key)::bigint > 14400000
       ) then
      raise exception 'Voice playback first-position timing evidence is invalid'
        using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array v_boolean_keys loop
    if jsonb_typeof(p_playback -> v_key) <> 'boolean' then
      raise exception 'Voice playback speaker close evidence is invalid'
        using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array v_hash_keys loop
    if jsonb_typeof(p_playback -> v_key) <> 'string'
       or p_playback ->> v_key !~ '^sha256:[0-9a-f]{64}$' then
      raise exception 'Voice playback chain evidence is invalid'
        using errcode = '22023';
    end if;
  end loop;

  if (p_playback ->> 'sent_chunks')::bigint > (p_playback ->> 'generated_chunks')::bigint
     or (p_playback ->> 'played_chunks')::bigint > (p_playback ->> 'sent_chunks')::bigint
     or (p_playback ->> 'sent_bytes')::bigint > (p_playback ->> 'generated_bytes')::bigint
     or (p_playback ->> 'played_bytes')::bigint > (p_playback ->> 'sent_bytes')::bigint
     or (p_playback ->> 'unheard_sent_chunks')::bigint <>
        (p_playback ->> 'sent_chunks')::bigint - (p_playback ->> 'played_chunks')::bigint
     or (p_playback ->> 'unsent_cancelled_chunks')::bigint >
        (p_playback ->> 'generated_chunks')::bigint - (p_playback ->> 'sent_chunks')::bigint
     or (p_playback ->> 'final_played_turns')::bigint >
        (p_playback ->> 'final_sent_turns')::bigint
     or (p_playback ->> 'final_sent_turns')::bigint >
        (p_playback ->> 'sent_chunks')::bigint
     or (p_playback ->> 'final_played_turns')::bigint >
        (p_playback ->> 'played_chunks')::bigint
     or (p_playback ->> 'completed_turns')::bigint >
        (p_playback ->> 'final_played_turns')::bigint
     or (p_playback ->> 'final_sent_turns')::bigint >
        (p_playback ->> 'completed_turns')::bigint
        + (p_playback ->> 'partial_turns')::bigint
        + (p_playback ->> 'cancelled_turns')::bigint then
    raise exception 'Voice playback generated/sent/played/outcome evidence is inconsistent'
      using errcode = '22023';
  end if;

  if (p_playback ->> 'provider_evidence_events')::bigint <>
       (p_playback ->> 'played_chunks')::bigint
       + (p_playback ->> 'agent_speaker_starts')::bigint
       + (p_playback ->> 'agent_speaker_stops')::bigint
       + (p_playback ->> 'client_speaker_starts')::bigint
       + (p_playback ->> 'client_speaker_stops')::bigint
       + (p_playback ->> 'interrupt_boundaries')::bigint
     or (
       (p_playback ->> 'provider_evidence_events')::bigint = 0
       and (p_playback ->> 'provider_sequence_highwater')::bigint <> 0
     )
     or (
       (p_playback ->> 'provider_evidence_events')::bigint > 0
       and (p_playback ->> 'provider_sequence_highwater')::bigint <
           (p_playback ->> 'provider_evidence_events')::bigint
     )
     or (
       p_playback -> 'first_played_at_ms' <> 'null'::jsonb
       and (p_playback ->> 'first_played_at_ms')::bigint >
           (p_playback ->> 'provider_observed_at_ms_highwater')::bigint
     ) then
    raise exception 'Voice playback provider ordering evidence is inconsistent'
      using errcode = '22023';
  end if;

  if (p_playback ->> 'agent_speaker_starts')::bigint <>
       (p_playback ->> 'agent_speaker_stops')::bigint
       + (case
            when (p_playback ->> 'agent_speaker_open_at_close')::boolean then 1
            else 0
          end)
     or (p_playback ->> 'client_speaker_starts')::bigint <>
       (p_playback ->> 'client_speaker_stops')::bigint
       + (case
            when (p_playback ->> 'client_speaker_open_at_close')::boolean then 1
            else 0
          end) then
    raise exception 'Voice playback speaker transition evidence is inconsistent'
      using errcode = '22023';
  end if;

  if ((p_playback ->> 'generated_chunks')::bigint = 0) <>
       (p_playback -> 'first_generated_at_ms' = 'null'::jsonb)
     or ((p_playback ->> 'sent_chunks')::bigint = 0) <>
       (p_playback -> 'first_sent_at_ms' = 'null'::jsonb)
     or ((p_playback ->> 'played_chunks')::bigint = 0) <>
       (p_playback -> 'first_played_at_ms' = 'null'::jsonb)
     or (
       p_playback -> 'first_generated_at_ms' <> 'null'::jsonb
       and p_playback -> 'first_sent_at_ms' <> 'null'::jsonb
       and (p_playback ->> 'first_sent_at_ms')::bigint <
           (p_playback ->> 'first_generated_at_ms')::bigint
     )
     or (
       p_playback -> 'first_sent_at_ms' <> 'null'::jsonb
       and p_playback -> 'first_played_at_ms' <> 'null'::jsonb
       and (p_playback ->> 'first_played_at_ms')::bigint <
           (p_playback ->> 'first_sent_at_ms')::bigint
     ) then
    raise exception 'Voice playback first-position evidence is inconsistent'
      using errcode = '22023';
  end if;

  if (((p_playback ->> 'generated_chunks')::bigint = 0)
        and p_playback ->> 'generated_chain_sha256' <> v_empty_chain)
     or (((p_playback ->> 'generated_chunks')::bigint > 0)
        and p_playback ->> 'generated_chain_sha256' = v_empty_chain)
     or (((p_playback ->> 'sent_chunks')::bigint = 0)
        and p_playback ->> 'sent_chain_sha256' <> v_empty_chain)
     or (((p_playback ->> 'sent_chunks')::bigint > 0)
        and p_playback ->> 'sent_chain_sha256' = v_empty_chain)
     or (((p_playback ->> 'played_chunks')::bigint = 0)
        and p_playback ->> 'played_chain_sha256' <> v_empty_chain)
     or (((p_playback ->> 'played_chunks')::bigint > 0)
        and p_playback ->> 'played_chain_sha256' = v_empty_chain)
     or (((p_playback ->> 'interrupt_boundaries')::bigint = 0)
        and p_playback ->> 'interrupt_chain_sha256' <> v_empty_chain)
     or (((p_playback ->> 'interrupt_boundaries')::bigint > 0)
        and p_playback ->> 'interrupt_chain_sha256' = v_empty_chain) then
    raise exception 'Voice playback chain/count evidence is inconsistent'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_source_event_key_sha256, 0)
  );

  select interaction.* into v_interaction
  from crm.interaction interaction
  where interaction.id = p_interaction_id
    and interaction.organization_id = p_organization_id
    and interaction.program_key = p_program_key
    and interaction.channel_code = 'call'
    and interaction.deleted_at is null
    and interaction.recording_owner_id is not null
    and nullif(interaction.provider, '') is not null
    and nullif(interaction.provider_account_id, '') is not null
    and nullif(interaction.provider_interaction_id, '') is not null
  for update;
  if not found then
    raise exception 'No exact canonical Voice interaction matched playback evidence'
      using errcode = 'P0002';
  end if;

  select count(*)::integer, max(consumed.id)
    into v_consumed_count, v_event_id
  from platform.activity_log consumed
  where consumed.action = 'voice.agent.session_reference.consumed'
    and consumed.entity_type = 'crm_interaction'
    and consumed.entity_id = p_interaction_id
    and consumed.organization_id = p_organization_id
    and consumed.metadata ->> 'session_id' = p_session_id::text;
  if v_consumed_count <> 1 then
    raise exception 'Voice playback session consumption is missing or ambiguous'
      using errcode = 'P0002';
  end if;

  select consumed.* into strict v_consumed
  from platform.activity_log consumed
  where consumed.id = v_event_id;
  if v_consumed.metadata ->> 'provider_session_id' is distinct from p_provider_session_id
     or v_consumed.metadata ->> 'program_key' is distinct from p_program_key
     or v_consumed.metadata ->> 'interaction_id' is distinct from p_interaction_id::text
     or v_consumed.metadata ->> 'organization_id' is distinct from p_organization_id::text
     or v_consumed.metadata ->> 'transport' is distinct from 'conversation_relay'
     or not exists (
       select 1
       from platform.activity_log issued
       where issued.id = (v_consumed.metadata ->> 'issued_event_id')::bigint
         and issued.action = 'voice.agent.session_reference.issued'
         and issued.entity_type = 'crm_interaction'
         and issued.entity_id = p_interaction_id
         and issued.organization_id = p_organization_id
         and issued.metadata ->> 'session_id' = p_session_id::text
         and issued.metadata ->> 'program_key' = p_program_key
         and issued.metadata ->> 'interaction_id' = p_interaction_id::text
         and issued.metadata ->> 'organization_id' = p_organization_id::text
         and issued.metadata ->> 'transport' = 'conversation_relay'
     ) then
    raise exception 'Voice playback session identity is not exact'
      using errcode = 'P0002';
  end if;

  v_metadata := jsonb_build_object(
    'schema_version', 1,
    'source_event_key_sha256', p_source_event_key_sha256,
    'playback', p_playback
  );

  select activity.* into v_existing
  from platform.activity_log activity
  where activity.action = 'voice.agent.playback_activity'
    and activity.metadata ->> 'source_event_key_sha256' = p_source_event_key_sha256;
  if found then
    if v_existing.organization_id is distinct from p_organization_id
       or v_existing.entity_type is distinct from 'crm_interaction'
       or v_existing.entity_id is distinct from p_interaction_id
       or v_existing.actor_id is distinct from v_interaction.recording_owner_id
       or v_existing.metadata is distinct from v_metadata then
      raise exception 'Voice playback event hash was replayed with different evidence'
        using errcode = '23505';
    end if;
    return query select
      p_interaction_id,
      v_existing.id,
      p_source_event_key_sha256,
      'replay'::text;
    return;
  end if;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    p_organization_id,
    'crm_interaction',
    p_interaction_id,
    'voice.agent.playback_activity',
    v_interaction.recording_owner_id,
    clock_timestamp(),
    v_metadata
  ) returning id into v_event_id;

  return query select
    p_interaction_id,
    v_event_id,
    p_source_event_key_sha256,
    'created'::text;
end;
$$;

comment on function communication.claim_voice_playback_activity(
  uuid, uuid, text, uuid, text, text, boolean, jsonb
) is 'Service-only idempotent claim of bounded provider-neutral Voice playback aggregate evidence.';

revoke all on function communication.claim_voice_playback_activity(
  uuid, uuid, text, uuid, text, text, boolean, jsonb
) from public, anon, authenticated;

grant execute on function communication.claim_voice_playback_activity(
  uuid, uuid, text, uuid, text, text, boolean, jsonb
) to service_role;
