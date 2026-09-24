-- chair-step: this restores the 15 live bodies in schema communication that errorshonest_s4_the_communication_doors_say_not_found.sql replaced, byte-for-byte as read from production on 2026-09-24. Undoing it returns each of their not-found refusals to HTTP 500 through PostgREST; called directly nothing changes either way. The 7 platform.client_callable_door declarations the up wrote are left standing: they state what those functions already were, and provision_shape_guard needs them for these very bodies to be restored.
-- lane: ERRORS-HONEST
-- based-on: communication.claim_voice_call_consent_event(text, text, text, text, text, text, text, timestamp with time zone, text, text, timestamp with time zone, text) 4835bc8f55d5dc5c8aaef27ace66be78b1f85fcd63006d2e3cc7ab46512b588e
-- based-on: communication.claim_voice_call_lifecycle_event(text, text, text, text, integer, text, timestamp with time zone) fdd800da46793082bbbad15372757a75794a4a080253227ce52a9d87ecae9713
-- based-on: communication.claim_voice_playback_activity(uuid, uuid, text, uuid, text, text, boolean, jsonb) 8747dff85a3cdb09a1da75ee8614214eacd553542363483179b48744304e094e
-- based-on: communication.claim_voice_recording_lifecycle_event(text, text, text, text, text, text, timestamp with time zone, integer, smallint, text, text, text) 84232db5a5df0fd8f7dbdb7672aad5313d80abbc67fb9df50ece9328c287c43a
-- based-on: communication.configure_my_sms_task_notifications(boolean, text) 8777ce688634552e57235b12533caaf9c7bff8d15bb54682b6c36c28f77068e3
-- based-on: communication.enqueue_task_sms_reminder_for_user(uuid, uuid, text, text) d571f3bd416efd938961ee302fc6b264a23980a163429736e584a66fe6760724
-- based-on: communication.enroll_verified_phone_for_assistant(uuid, uuid, text, timestamp with time zone, text) ef35ac8978ce66daed9027531b00ddc4b1371ea2d71f76db4419bee67495a708
-- based-on: communication.fail_voice_recording_custody_work(bigint, uuid, text, text, boolean, integer, text, uuid, boolean, integer) 5da0bf1e4dc047637381d36e918ba1977c61b570f44ad78d823ec89d8ee0a6ca
-- based-on: communication.finalize_voice_recording_file(text, text, text, text, text, uuid) 1775fdce57ebdef7a7d8ce11a89ff40024cc9568c94a0183a49c22f29e3ac926
-- based-on: communication.issue_voice_agent_session_reference_unfenced(text, uuid, timestamp with time zone, uuid, uuid, bigint, uuid, text, uuid, uuid, text, jsonb, text) 29edc2277826551b8fbeeda57f1477ab5d5171ce3aeb85eb694f75f66e870761
-- based-on: communication.meet_meeting_by_slug(text) ef0c469daaf225614e36d5aafd8ba3e893482a1677eab3071dc12083c86f1639
-- based-on: communication.meet_record_consent(uuid, text, timestamp with time zone) 360e7d73cc048ce259b2cd3dc4ae8e7b4973988c0f3e93f6dff7b1ce683e00a3
-- based-on: communication.meet_settle_call_invite(uuid, text, text) a0d1596103c90917ddadb64dd62f4f4937ba52c8af01d29204328b6197b26497
-- based-on: communication.resolve_voice_owner_call_context(text, uuid, text, text, text, text) 627a6ad96e79ef1184422375d81d22c80fa3d496642879e5339aa1f760db3ecc
-- based-on: communication.set_my_sms_assistant_enabled(text, boolean) 1ca19fde3a9e1402e981b717fdd4b77106c72b4de2fdb3988efc88cbd9b12390

CREATE OR REPLACE FUNCTION communication.claim_voice_call_consent_event(p_provider text, p_provider_account_id text, p_provider_call_id text, p_provider_event_key text, p_program_key text, p_disclosure_version text, p_disclosure_text_hash text, p_disclosed_at timestamp with time zone, p_response_kind text, p_response_value text, p_consented_at timestamp with time zone, p_source text)
 RETURNS TABLE(interaction_id uuid, event_id bigint, disposition text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_interaction crm.interaction%rowtype;
  v_existing platform.activity_log%rowtype;
  v_event_id bigint;
  v_evidence jsonb;
begin
  if nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or nullif(btrim(p_provider_call_id), '') is null
     or nullif(btrim(p_provider_event_key), '') is null
     or nullif(btrim(p_program_key), '') is null
     or nullif(btrim(p_disclosure_version), '') is null
     or p_disclosure_text_hash !~ '^sha256:[0-9a-f]{64}$'
     or p_disclosed_at is null
     or p_consented_at is null
     or p_consented_at < p_disclosed_at
     or p_response_kind not in ('dtmf', 'speech', 'continued_after_disclosure')
     or nullif(btrim(p_response_value), '') is null
     or p_source not in ('twiml', 'conversation_relay') then
    raise exception 'Complete affirmative Voice consent evidence is required'
      using errcode = '22023';
  end if;

  select interaction.* into v_interaction
  from crm.interaction interaction
  where interaction.channel_code = 'call'
    and interaction.provider = p_provider
    and interaction.provider_account_id = p_provider_account_id
    and interaction.provider_interaction_id = p_provider_call_id
    and interaction.program_key = p_program_key
    and interaction.deleted_at is null
  for update;
  if not found then
    raise exception 'No canonical Voice interaction matches the exact call and program'
      using errcode = 'P0002';
  end if;

  v_evidence := jsonb_build_object(
    'provider', p_provider,
    'provider_account_id', p_provider_account_id,
    'provider_call_id', p_provider_call_id,
    'provider_event_key', p_provider_event_key,
    'program_key', p_program_key,
    'disclosure_version', p_disclosure_version,
    'disclosure_text_hash', p_disclosure_text_hash,
    'disclosed_at', p_disclosed_at,
    'response_kind', p_response_kind,
    'response_value', p_response_value,
    'consented', true,
    'consented_at', p_consented_at,
    'source', p_source
  );

  select activity.* into v_existing
  from platform.activity_log activity
  where activity.action = 'voice.call.consent'
    and activity.metadata ->> 'provider_event_key' = p_provider_event_key;
  if found then
    if v_existing.entity_id is distinct from v_interaction.id
       or v_existing.organization_id is distinct from v_interaction.organization_id
       or v_existing.metadata is distinct from v_evidence then
      raise exception 'Voice consent event key was replayed with different evidence'
        using errcode = '23505';
    end if;
    return query select v_interaction.id, v_existing.id, 'replay'::text;
    return;
  end if;

  if v_interaction.attributes ? 'voice_consent'
     and v_interaction.attributes -> 'voice_consent' is distinct from v_evidence then
    raise exception 'Voice interaction already carries different consent evidence'
      using errcode = '23505';
  end if;

  update crm.interaction
  set attributes = jsonb_set(
        coalesce(attributes, '{}'::jsonb),
        '{voice_consent}',
        v_evidence,
        true
      )
  where id = v_interaction.id;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_interaction.organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.call.consent',
    v_interaction.recording_owner_id,
    p_consented_at,
    v_evidence
  ) returning id into v_event_id;

  return query select v_interaction.id, v_event_id, 'created'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.claim_voice_call_lifecycle_event(p_provider text, p_provider_account_id text, p_provider_call_id text, p_provider_event_key text, p_sequence integer, p_status text, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(interaction_id uuid, event_id bigint, disposition text, effective_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_interaction crm.interaction%rowtype;
  v_existing platform.activity_log%rowtype;
  v_event_id bigint;
  v_disposition text;
  v_status_rank integer;
  v_current_rank integer;
  v_terminal boolean;
  v_interaction_status text;
begin
  if nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or nullif(btrim(p_provider_call_id), '') is null
     or nullif(btrim(p_provider_event_key), '') is null then
    raise exception 'Voice call event provider identity is required' using errcode = '22023';
  end if;
  if p_sequence is null or p_sequence < 0 then
    raise exception 'Voice call event sequence must be non-negative' using errcode = '22023';
  end if;
  v_status_rank := case p_status
    when 'initiated' then 0
    when 'ringing' then 1
    when 'in_progress' then 2
    when 'completed' then 3
    when 'busy' then 3
    when 'failed' then 3
    when 'no_answer' then 3
    when 'canceled' then 3
    else null
  end;
  if v_status_rank is null then
    raise exception 'Unsupported voice call status: %', p_status using errcode = '22023';
  end if;

  select i.* into v_interaction
  from crm.interaction i
  where i.channel_code = 'call'
    and i.provider = p_provider
    and i.provider_account_id = p_provider_account_id
    and i.provider_interaction_id = p_provider_call_id
    and i.deleted_at is null
  for update;
  if not found then
    raise exception 'No canonical voice interaction matches the exact provider account and call'
      using errcode = 'P0002';
  end if;

  select a.* into v_existing
  from platform.activity_log a
  where a.action = 'voice.call.lifecycle'
    and a.metadata ->> 'provider_event_key' = p_provider_event_key;
  if found then
    if v_existing.entity_id is distinct from v_interaction.id
       or v_existing.metadata ->> 'provider' is distinct from p_provider
       or v_existing.metadata ->> 'provider_account_id' is distinct from p_provider_account_id
       or v_existing.metadata ->> 'provider_call_id' is distinct from p_provider_call_id
       or v_existing.metadata ->> 'status' is distinct from p_status
       or (v_existing.metadata ->> 'sequence')::integer is distinct from p_sequence
       or (v_existing.metadata ->> 'provider_occurred_at')::timestamptz
          is distinct from p_occurred_at then
      raise exception 'Voice call provider event key was replayed with different evidence'
        using errcode = '23505';
    end if;
    return query
      select v_interaction.id, v_existing.id, 'replay'::text, v_interaction.provider_status;
    return;
  end if;

  v_current_rank := case v_interaction.provider_status
    when 'initiated' then 0
    when 'ringing' then 1
    when 'in_progress' then 2
    when 'completed' then 3
    when 'busy' then 3
    when 'failed' then 3
    when 'no_answer' then 3
    when 'canceled' then 3
    else -1
  end;
  v_terminal := v_current_rank = 3;

  if v_terminal then
    v_disposition := 'ignored_terminal';
  elsif p_sequence <= coalesce(v_interaction.provider_status_sequence, -1)
        or v_status_rank < v_current_rank then
    v_disposition := 'ignored_out_of_order';
  elsif p_status = v_interaction.provider_status then
    -- A provider may emit the same state at a later sequence. Advance the
    -- sequence watermark so a different callback cannot reuse that sequence
    -- to move the lifecycle forward.
    v_disposition := 'ignored_duplicate_state';
    update crm.interaction
    set provider_status_sequence = p_sequence,
        provider_status_at = coalesce(p_occurred_at, now())
    where id = v_interaction.id
    returning * into v_interaction;
  else
    v_disposition := 'applied';
    v_interaction_status := case p_status
      when 'completed' then 'completed'
      when 'canceled' then 'cancelled'
      when 'busy' then 'failed'
      when 'failed' then 'failed'
      when 'no_answer' then 'failed'
      else 'in_progress'
    end;
    update crm.interaction
    set provider_status = p_status,
        provider_status_sequence = p_sequence,
        provider_status_at = coalesce(p_occurred_at, now()),
        status = v_interaction_status,
        occurred_at = coalesce(occurred_at, p_occurred_at, now())
    where id = v_interaction.id
    returning * into v_interaction;
  end if;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_interaction.organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.call.lifecycle',
    null,
    coalesce(p_occurred_at, now()),
    jsonb_build_object(
      'provider', p_provider,
      'provider_account_id', p_provider_account_id,
      'provider_call_id', p_provider_call_id,
      'provider_event_key', p_provider_event_key,
      'sequence', p_sequence,
      'status', p_status,
      'provider_occurred_at', p_occurred_at,
      'disposition', v_disposition
    )
  ) returning id into v_event_id;

  return query
    select v_interaction.id, v_event_id, v_disposition, v_interaction.provider_status;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.claim_voice_playback_activity(p_interaction_id uuid, p_organization_id uuid, p_program_key text, p_session_id uuid, p_provider_session_id text, p_source_event_key_sha256 text, p_provider_payload_verified boolean, p_playback jsonb)
 RETURNS TABLE(interaction_id uuid, event_id bigint, source_event_key_sha256 text, disposition text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION communication.claim_voice_recording_lifecycle_event(p_provider text, p_provider_account_id text, p_provider_call_id text, p_provider_recording_id text, p_provider_event_key text, p_status text, p_recording_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_duration_seconds integer DEFAULT NULL::integer, p_channels smallint DEFAULT NULL::smallint, p_source text DEFAULT NULL::text, p_track text DEFAULT NULL::text, p_provider_media_url text DEFAULT NULL::text)
 RETURNS TABLE(interaction_id uuid, event_id bigint, disposition text, effective_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_interaction crm.interaction%rowtype;
  v_existing platform.activity_log%rowtype;
  v_event_id bigint;
  v_disposition text;
begin
  if nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or nullif(btrim(p_provider_call_id), '') is null
     or nullif(btrim(p_provider_recording_id), '') is null
     or nullif(btrim(p_provider_event_key), '') is null then
    raise exception 'Voice recording event provider identity is required'
      using errcode = '22023';
  end if;
  if p_status not in ('in_progress', 'completed', 'absent', 'failed') then
    raise exception 'Unsupported voice recording status: %', p_status using errcode = '22023';
  end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'Voice recording duration must be non-negative' using errcode = '22023';
  end if;
  if p_channels is not null and p_channels not in (1, 2) then
    raise exception 'Voice recording channels must be one or two' using errcode = '22023';
  end if;
  if p_track is not null and p_track not in ('inbound', 'outbound', 'both') then
    raise exception 'Unsupported voice recording track: %', p_track using errcode = '22023';
  end if;
  if p_status = 'completed' and nullif(btrim(p_provider_media_url), '') is null then
    raise exception 'Completed voice recording evidence requires a provider media URL'
      using errcode = '22023';
  end if;

  select i.* into v_interaction
  from crm.interaction i
  where i.channel_code = 'call'
    and i.provider = p_provider
    and i.provider_account_id = p_provider_account_id
    and i.provider_interaction_id = p_provider_call_id
    and i.deleted_at is null
  for update;
  if not found then
    raise exception 'No canonical voice interaction matches the exact provider account and call'
      using errcode = 'P0002';
  end if;

  select a.* into v_existing
  from platform.activity_log a
  where a.action = 'voice.recording.lifecycle'
    and a.metadata ->> 'provider_event_key' = p_provider_event_key;
  if found then
    if v_existing.entity_id is distinct from v_interaction.id
       or v_existing.metadata ->> 'provider' is distinct from p_provider
       or v_existing.metadata ->> 'provider_account_id' is distinct from p_provider_account_id
       or v_existing.metadata ->> 'provider_call_id' is distinct from p_provider_call_id
       or v_existing.metadata ->> 'provider_recording_id' is distinct from p_provider_recording_id
       or v_existing.metadata ->> 'status' is distinct from p_status
       or (v_existing.metadata ->> 'recording_started_at')::timestamptz
          is distinct from p_recording_started_at
       or (v_existing.metadata ->> 'duration_seconds')::integer
          is distinct from p_duration_seconds
       or (v_existing.metadata ->> 'channels')::smallint is distinct from p_channels
       or v_existing.metadata ->> 'source' is distinct from p_source
       or v_existing.metadata ->> 'track' is distinct from p_track
       or v_existing.metadata ->> 'provider_media_url' is distinct from p_provider_media_url then
      raise exception 'Voice recording provider event key was replayed with different evidence'
        using errcode = '23505';
    end if;
    return query select
      v_interaction.id,
      v_existing.id,
      'replay'::text,
      v_interaction.recording_status;
    return;
  end if;

  if v_interaction.provider_recording_id is not null
     and v_interaction.provider_recording_id <> p_provider_recording_id then
    raise exception 'Canonical voice interaction is already bound to a different recording'
      using errcode = '23505';
  end if;

  if v_interaction.recording_status in ('completed', 'absent', 'failed') then
    v_disposition := 'ignored_terminal';
  elsif v_interaction.recording_status = p_status then
    v_disposition := 'ignored_duplicate_state';
  else
    v_disposition := 'applied';
    update crm.interaction
    set provider_recording_id = p_provider_recording_id,
        recording_status = p_status,
        recording_started_at = coalesce(recording_started_at, p_recording_started_at),
        recording_status_at = now(),
        recording_duration_seconds = case
          when p_status = 'completed' then p_duration_seconds
          else recording_duration_seconds
        end,
        recording_channels = coalesce(p_channels, recording_channels),
        recording_source = coalesce(p_source, recording_source),
        recording_track = coalesce(p_track, recording_track)
    where id = v_interaction.id
    returning * into v_interaction;
  end if;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_interaction.organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.recording.lifecycle',
    null,
    now(),
    jsonb_strip_nulls(jsonb_build_object(
      'provider', p_provider,
      'provider_account_id', p_provider_account_id,
      'provider_call_id', p_provider_call_id,
      'provider_recording_id', p_provider_recording_id,
      'provider_event_key', p_provider_event_key,
      'status', p_status,
      'recording_started_at', p_recording_started_at,
      'duration_seconds', p_duration_seconds,
      'channels', p_channels,
      'source', p_source,
      'track', p_track,
      'provider_media_url', p_provider_media_url,
      'disposition', v_disposition
    ))
  ) returning id into v_event_id;

  return query select
    v_interaction.id,
    v_event_id,
    v_disposition,
    v_interaction.recording_status;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.configure_my_sms_task_notifications(p_enabled boolean, p_program_key text DEFAULT 'ai_matrx_owner_beta'::text)
 RETURNS TABLE(masked_phone text, sms_enabled boolean, task_notifications boolean, consent_status text, program_key text, destination_ready boolean, can_enable boolean, blocked_reasons text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := auth.uid();
  preference communication.sms_notification_preferences%rowtype;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Task notification preference is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;

  select preference_row.* into preference
  from communication.sms_notification_preferences preference_row
  where preference_row.user_id = caller
    and preference_row.deleted_at is null
  for update;
  if not found then
    raise exception 'Verify a mobile number before enabling task reminders'
      using errcode = 'P0002';
  end if;

  if p_enabled then
    if not preference.sms_enabled then
      raise exception 'Enable SMS notifications before enabling task reminders'
        using errcode = '22023';
    end if;
    if preference.phone_number is null then
      raise exception 'Verify a mobile number before enabling task reminders'
        using errcode = '22023';
    end if;
    if preference.assistant_program_key is distinct from p_program_key then
      raise exception 'This SMS program is not connected to your account'
        using errcode = '22023';
    end if;
    if not exists (
      select 1
      from communication.sms_consent consent
      where consent.user_id = caller
        and consent.organization_id = preference.organization_id
        and consent.phone_number = preference.phone_number
        and consent.consent_type in ('transactional', 'all')
        and consent.status = 'opted_in'
        and consent.deleted_at is null
    ) then
      raise exception 'SMS consent is not opted in for this mobile number'
        using errcode = '22023';
    end if;
  end if;

  update communication.sms_notification_preferences preference_row
  set task_notifications = p_enabled
  where preference_row.id = preference.id;

  return query
  select *
  from communication.get_my_sms_task_notification_preference(p_program_key);
end;
$function$;

CREATE OR REPLACE FUNCTION communication.enqueue_task_sms_reminder_for_user(p_caller uuid, p_task_id uuid, p_program_key text, p_event_key text DEFAULT NULL::text)
 RETURNS TABLE(outcome text, notification_id uuid, outbound_message_id uuid, assist_id uuid, sms_conversation_id uuid, blocked_reason text, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := p_caller;
  task_row workspace.tasks%rowtype;
  preference communication.sms_notification_preferences%rowtype;
  destination communication.sms_phone_numbers%rowtype;
  conversation communication.sms_conversations%rowtype;
  event_key text;
  block_key text;
  block_code text;
  person_block text;
  person_defer timestamptz;
  clean_title text;
  reminder_body text;
  created_notification_id uuid;
  created_message_id uuid;
  created_assist_id uuid;
  existing_notification communication.sms_notifications%rowtype;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_task_id is null then
    raise exception 'Task is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;

  select t.* into task_row
  from workspace.tasks t
  where t.id = p_task_id
    and t.deleted_at is null
  for share;
  if not found then
    raise exception 'Task was not found' using errcode = 'P0002';
  end if;
  if not iam.has_access_for(caller, 'task', task_row.id, 'editor') then
    raise exception 'Task is not editable by this user' using errcode = '42501';
  end if;

  event_key := coalesce(p_event_key, format(
    'notification:task_sms_reminder:v1:%s:%s:%s',
    caller,
    task_row.id,
    task_row.version
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(event_key, 0)
  );

  select n.* into existing_notification
  from communication.sms_notifications n
  where n.idempotency_key = event_key
    and n.deleted_at is null;
  if found then
    return query select
      'duplicate'::text,
      existing_notification.id,
      existing_notification.message_id,
      case
        when pg_catalog.pg_input_is_valid(
          existing_notification.metadata ->> 'assist_id',
          'uuid'
        ) then (existing_notification.metadata ->> 'assist_id')::uuid
        else null::uuid
      end,
      case
        when pg_catalog.pg_input_is_valid(
          existing_notification.metadata ->> 'sms_conversation_id',
          'uuid'
        ) then (existing_notification.metadata ->> 'sms_conversation_id')::uuid
        else null::uuid
      end,
      existing_notification.failure_reason,
      true;
    return;
  end if;

  begin
    select p.* into strict preference
    from communication.sms_notification_preferences p
    where p.user_id = caller
      and p.assistant_program_key = p_program_key
      and p.deleted_at is null
    for share;
  exception
    when no_data_found then
      return query select
        'blocked'::text,
        null::uuid,
        null::uuid,
        null::uuid,
        null::uuid,
        'sms_program_not_enrolled'::text,
        false;
      return;
    when too_many_rows then
      return query select
        'blocked'::text,
        null::uuid,
        null::uuid,
        null::uuid,
        null::uuid,
        'sms_program_enrollment_ambiguous'::text,
        false;
      return;
  end;

  clean_title := left(
    pg_catalog.regexp_replace(btrim(task_row.title), '[[:space:]]+', ' ', 'g'),
    240
  );

  if task_row.recurrence_rule is not null then
    block_code := 'recurring_task_unsupported';
  elsif task_row.status in ('completed', 'cancelled', 'dismissed') then
    block_code := 'task_not_actionable';
  end if;

  if block_code is null then
    if not preference.sms_enabled then
      block_code := 'sms_disabled';
    elsif not preference.task_notifications then
      block_code := 'task_notifications_disabled';
    elsif preference.phone_number is null then
      block_code := 'verified_phone_missing';
    end if;
  end if;

  if block_code is null then
    select d.* into destination
    from communication.sms_phone_numbers d
    where d.id = preference.assistant_destination_id
      and d.program_key = preference.assistant_program_key
      and d.program_key = p_program_key
      and d.is_active
      and d.provider_account_id is not null
      and d.deleted_at is null
    for share;
    if not found then
      block_code := 'destination_not_ready';
    end if;
  end if;

  if block_code is null then
    perform 1
    from communication.sms_consent consent
    where consent.user_id = caller
      and consent.organization_id = preference.organization_id
      and consent.phone_number = preference.phone_number
      and consent.consent_type in ('transactional', 'all')
      and consent.status = 'opted_in'
      and consent.deleted_at is null
    for share;
    if not found then
      block_code := 'consent_not_opted_in';
    end if;
  end if;

  -- STOP and DNC are keyed to the person/phone, independent of this old P1
  -- enrollment row. A later preference toggle cannot override them.
  if block_code is null and exists (
    select 1 from crm.contact_medium cm
    where cm.organization_id = preference.organization_id
      and cm.channel = 'phone'
      and cm.value_key = preference.phone_number
      and cm.deleted_at is null
      and (cm.suppressed_at is not null or cm.unsubscribed_at is not null
        or cm.dnc_state = 'listed')
  ) then
    block_code := 'phone_suppressed';
  end if;
  if block_code is null and exists (
    select 1 from communication.sms_consent consent
    where consent.phone_number = preference.phone_number
      and consent.consent_type in ('transactional', 'notifications', 'all')
      and consent.status = 'opted_out' and consent.deleted_at is null
  ) then
    block_code := 'consent_not_opted_in';
  end if;

  if block_code is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        format(
          'sms-transport:%s:%s:%s:%s',
          destination.provider_account_id,
          destination.id,
          preference.phone_number,
          destination.program_key
        ),
        0
      )
    );
    -- The cap counts every outbound SMS for this person in this tenant,
    -- including other programs/destinations. Serialize that wider set too.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        format('sms-person-cap:%s:%s', preference.organization_id,
          preference.phone_number),
        0
      )
    );
  end if;

  -- Count under the same per-person transaction lock as the insert;
  -- two programs at the cap cannot both observe one remaining slot.
  if block_code is null then
    select g.reason, g.defer_until into person_block, person_defer
    from communication.task_sms_person_timing_gate(
      caller, preference.organization_id, preference.phone_number, now()
    ) g;
    block_code := person_block;
  end if;

  if block_code is null and exists (
    select 1
    from platform.assists suppressed
    where suppressed.user_id = caller
      and suppressed.source_key = 'notifications.task.sms_reply'
      and suppressed.suppressed_until > now()
      and suppressed.deleted_at is null
  ) then
    block_code := 'notification_source_suppressed';
  end if;

  if block_code is not null then
    block_key := format(
      '%s:blocked:%s:%s',
      event_key,
      block_code,
      pg_catalog.to_char(now() at time zone 'UTC', 'YYYYMMDDHH24')
    );
    insert into communication.sms_notifications (
      organization_id,
      user_id,
      notification_type,
      category,
      reference_type,
      reference_id,
      status,
      failure_reason,
      idempotency_key,
      metadata,
      created_by
    ) values (
      preference.organization_id,
      caller,
      'task_due_date',
      'transactional',
      'task',
      task_row.id::text,
      case
        when block_code = 'quiet_hours' then 'blocked_quiet_hours'
        when block_code = 'consent_not_opted_in' then 'blocked_opt_out'
        when block_code in ('hourly_rate_limit', 'daily_rate_limit') then 'blocked_rate_limit'
        else 'skipped'
      end,
      block_code,
      block_key,
      pg_catalog.jsonb_build_object(
        'producer', 'communication.enqueue_my_task_sms_reminder',
        'event_key', event_key,
        'program_key', p_program_key,
        'task_title', clean_title,
        'defer_until', person_defer
      ),
      caller
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into created_notification_id;

    if created_notification_id is null then
      select n.id into created_notification_id
      from communication.sms_notifications n
      where n.idempotency_key = block_key;
    end if;

    return query select
      'blocked'::text,
      created_notification_id,
      null::uuid,
      null::uuid,
      null::uuid,
      block_code,
      false;
    return;
  end if;

  select c.* into conversation
  from communication.sms_conversations c
  where c.provider_account_id = destination.provider_account_id
    and c.destination_identity_id = destination.id
    and c.external_phone_number = preference.phone_number
    and c.program_key = destination.program_key
    and c.status = 'active'
    and c.deleted_at is null;

  if not found then
    insert into communication.sms_conversations (
      organization_id,
      user_id,
      external_phone_number,
      our_phone_number,
      conversation_type,
      provider,
      provider_account_id,
      destination_identity_id,
      program_key,
      chat_conversation_id,
      agent_id,
      canonical_agent_version_id,
      identity_status
    ) values (
      preference.organization_id,
      caller,
      preference.phone_number,
      destination.phone_number,
      'notification',
      destination.provider,
      destination.provider_account_id,
      destination.id,
      destination.program_key,
      gen_random_uuid(),
      preference.preferred_agent_id,
      preference.preferred_agent_version_id,
      'resolved'
    ) returning * into conversation;
  end if;

  insert into communication.sms_notifications (
    organization_id,
    user_id,
    notification_type,
    category,
    reference_type,
    reference_id,
    status,
    idempotency_key,
    metadata,
    created_by
  ) values (
    preference.organization_id,
    caller,
    'task_due_date',
    'transactional',
    'task',
    task_row.id::text,
    'pending',
    event_key,
    pg_catalog.jsonb_build_object(
      'producer', 'communication.enqueue_my_task_sms_reminder',
      'program_key', destination.program_key,
      'destination_id', destination.id,
      'sms_conversation_id', conversation.id,
      'task_title', clean_title
    ),
    caller
  )
  returning id into created_notification_id;

  reminder_body := format(
    'AI Matrx: Task reminder — “%s”. Reply DONE to complete it or SNOOZE 1H for one later reminder.',
    clean_title
  );

  insert into communication.sms_messages (
    organization_id,
    conversation_id,
    provider,
    provider_account_id,
    direction,
    from_number,
    to_number,
    body,
    status,
    sent_by_user_id,
    sent_by_type,
    ai_processed,
    ai_processing_status,
    idempotency_key,
    attempt_count,
    next_attempt_at,
    metadata,
    created_by
  ) values (
    preference.organization_id,
    conversation.id,
    destination.provider,
    destination.provider_account_id,
    'outbound',
    destination.phone_number,
    preference.phone_number,
    reminder_body,
    'queued',
    caller,
    'notification',
    true,
    'completed',
    'outbound:' || event_key,
    0,
    now(),
    pg_catalog.jsonb_build_object(
      'notification_id', created_notification_id,
      'reference_type', 'task',
      'reference_id', task_row.id,
      'program_key', destination.program_key
    ),
    caller
  ) returning id into created_message_id;

  insert into platform.assists (
    user_id,
    organization_id,
    created_by,
    source_kind,
    source_key,
    title,
    body,
    action,
    surface_name,
    entity_type,
    entity_id,
    dedupe_key,
    expires_at,
    priority,
    evidence,
    metadata,
    visibility
  ) values (
    caller,
    preference.organization_id,
    caller,
    'deterministic',
    'notifications.task.sms_reply',
    'Reply to task reminder by text',
    clean_title,
    pg_catalog.jsonb_build_object(
      'kind', 'navigate',
      'href', '/tasks/' || task_row.id,
      'label', 'Open task'
    ),
    'matrx-user/tasks',
    'task',
    task_row.id,
    'notifications.task.sms_reply:' || event_key,
    now() + interval '7 days',
    10,
    pg_catalog.jsonb_build_object(
      'kind', 'task',
      'label', clean_title,
      'href', '/tasks/' || task_row.id,
      'ref', task_row.id
    ),
    pg_catalog.jsonb_build_object(
      'sms_reply_offer', pg_catalog.jsonb_build_object(
        'version', 2,
        'operations', pg_catalog.jsonb_build_object(
          'DONE', pg_catalog.jsonb_build_object(
            'kind', 'task.complete', 'arguments', '{}'::jsonb
          ),
          'SNOOZE 1H', pg_catalog.jsonb_build_object(
            'kind', 'task.snooze',
            'arguments', pg_catalog.jsonb_build_object('delay_seconds', 3600)
          )
        ),
        'target_entity_type', 'task',
        'target_entity_id', task_row.id,
        'outbound_sms_message_id', created_message_id
      )
    ),
    'personal'
  ) returning id into created_assist_id;

  update communication.sms_notifications n
  set message_id = created_message_id,
      metadata = n.metadata || pg_catalog.jsonb_build_object(
        'assist_id', created_assist_id,
        'outbound_sms_message_id', created_message_id
      ),
      updated_by = caller,
      updated_at = now()
  where n.id = created_notification_id;

  return query select
    'queued'::text,
    created_notification_id,
    created_message_id,
    created_assist_id,
    conversation.id,
    null::text,
    false;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.enroll_verified_phone_for_assistant(p_user_id uuid, p_organization_id uuid, p_phone_number text, p_verified_at timestamp with time zone DEFAULT now(), p_source text DEFAULT 'twilio_verify'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_phone text := crm.normalize_phone_e164(p_phone_number);
  v_party_id uuid;
  v_point record;
  v_destination communication.sms_phone_numbers%rowtype;
  v_destination_count integer;
  v_existing communication.sms_notification_preferences%rowtype;
  v_binding text;
  v_preference_id uuid;
  v_contact_graph jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users u
    where u.id = p_user_id and coalesce(u.is_anonymous, false) = false
  ) then
    raise exception 'enroll_verified_phone_for_assistant: permanent auth user required'
      using errcode = '23503';
  end if;
  if p_organization_id is null then
    raise exception 'enroll_verified_phone_for_assistant: an enrollment names its organization'
      using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'enroll_verified_phone_for_assistant: phone is not canonicalizable to E.164'
      using errcode = '22023';
  end if;
  if p_source <> 'twilio_verify' then
    raise exception 'enroll_verified_phone_for_assistant: unsupported verification source'
      using errcode = '22023';
  end if;
  if not iam.is_org_member(p_user_id, p_organization_id) then
    raise exception 'enroll_verified_phone_for_assistant: user % is not a member of organization %',
      p_user_id, p_organization_id using errcode = '42501';
  end if;

  -- (a) The account + HR contact-graph proof. Unchanged contract; this call is
  --     why the door can replace the old one rather than sit beside it.
  v_contact_graph := communication.record_verified_sms_phone(
    p_user_id, v_phone, coalesce(p_verified_at, now()), 'twilio_verify'
  );

  -- (b) THE VOICE HALF. The caller context
  --     `communication.resolve_voice_owner_call_context` looks for, in the
  --     organization the enrollment names — the thing that did not exist.
  v_party_id := crm.ensure_user_party_in_org(
    p_user_id, p_organization_id, 'reconcile', true
  );
  if v_party_id is null then
    raise exception 'enroll_verified_phone_for_assistant: no CRM party could be established'
      using errcode = 'P0002';
  end if;
  select * into v_point
  from crm.upsert_party_phone_contact(
    v_party_id, p_organization_id, v_phone, 'mobile', 'verified', 'twilio_verify',
    p_user_id, coalesce(p_verified_at, now()),
    jsonb_build_object(
      'provider', 'twilio_verify',
      'verification_channel', 'sms',
      'verified_at', coalesce(p_verified_at, now()),
      'enrollment_organization_id', p_organization_id
    )
  );

  -- (c) THE TEXT HALF. Exactly one destination is a binding; anything else is
  --     an outcome with a name, never a guess.
  select count(*) into v_destination_count
  from communication.sms_phone_numbers d
  where d.is_active
    and d.assistant_enabled
    and d.provider_account_id is not null
    and d.deleted_at is null;

  select * into v_existing
  from communication.sms_notification_preferences pref
  where pref.user_id = p_user_id and pref.deleted_at is null;

  if v_existing.id is not null and v_existing.assistant_destination_id is not null then
    -- A binding somebody already has is never repointed from here. Moving a
    -- person between assistant programs is a deliberate act with its own door.
    v_binding := 'already_bound';
    select * into v_destination
    from communication.sms_phone_numbers d
    where d.id = v_existing.assistant_destination_id
      and d.program_key = v_existing.assistant_program_key;
    update communication.sms_notification_preferences pref
    set organization_id = p_organization_id,
        phone_number = v_phone,
        sms_enabled = true,
        updated_by = p_user_id,
        updated_at = now()
    where pref.id = v_existing.id
    returning pref.id into v_preference_id;
  elsif v_destination_count = 0 then
    v_binding := 'no_active_assistant_destination';
  elsif v_destination_count > 1 then
    v_binding := 'ambiguous_assistant_destination';
  else
    select * into v_destination
    from communication.sms_phone_numbers d
    where d.is_active
      and d.assistant_enabled
      and d.provider_account_id is not null
      and d.deleted_at is null;
    v_binding := 'bound';
  end if;

  if v_preference_id is null then
    insert into communication.sms_notification_preferences (
      user_id, organization_id, phone_number, sms_enabled,
      assistant_destination_id, assistant_program_key, created_by, updated_by
    ) values (
      p_user_id, p_organization_id, v_phone, true,
      v_destination.id, v_destination.program_key, p_user_id, p_user_id
    )
    on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        phone_number = excluded.phone_number,
        sms_enabled = true,
        assistant_destination_id = coalesce(
          sms_notification_preferences.assistant_destination_id,
          excluded.assistant_destination_id
        ),
        assistant_program_key = coalesce(
          sms_notification_preferences.assistant_program_key,
          excluded.assistant_program_key
        ),
        updated_by = excluded.updated_by,
        updated_at = now()
    returning id into v_preference_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'phone_number', v_phone,
    'user_id', p_user_id,
    'organization_id', p_organization_id,
    'preference_id', v_preference_id,
    'assistant_binding', v_binding,
    'assistant_destination_id', v_destination.id,
    'assistant_program_key', v_destination.program_key,
    'party_id', v_party_id,
    'contact_point_id', v_point.contact_point_id,
    'contact_medium_id', v_point.contact_medium_id,
    'text_reachable', v_binding in ('bound', 'already_bound'),
    'voice_reachable', v_point.contact_point_id is not null,
    'contact_graph', v_contact_graph
  );
end;
$function$;

CREATE OR REPLACE FUNCTION communication.fail_voice_recording_custody_work(p_source_event_id bigint, p_claim_token uuid, p_worker_id text, p_error_code text, p_retryable boolean, p_retry_after_seconds integer DEFAULT 30, p_operator_detail text DEFAULT NULL::text, p_canonical_file_id uuid DEFAULT NULL::uuid, p_cleanup_required boolean DEFAULT false, p_max_attempts integer DEFAULT 5)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source platform.activity_log%rowtype;
  v_claim platform.activity_log%rowtype;
  v_attempt_count integer;
  v_effective_retryable boolean;
  v_next_attempt_at timestamptz;
begin
  if p_source_event_id is null or p_claim_token is null then
    raise exception 'Voice recording custody source and claim are required'
      using errcode = '22023';
  end if;
  if nullif(btrim(p_worker_id), '') is null
     or nullif(btrim(p_error_code), '') is null then
    raise exception 'Voice recording custody worker and error code are required'
      using errcode = '22023';
  end if;
  if p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'Voice recording custody error code is invalid' using errcode = '22023';
  end if;
  if p_operator_detail ~* '(https?://|s3://)' then
    raise exception 'Voice recording custody failure detail cannot contain a media location'
      using errcode = '22023';
  end if;

  select source.* into v_source
  from platform.activity_log source
  where source.id = p_source_event_id
    and source.entity_type = 'crm_interaction'
    and source.action = 'voice.recording.lifecycle'
    and source.metadata ->> 'status' = 'completed'
  for update;
  if not found then
    raise exception 'Completed voice recording lifecycle source does not exist'
      using errcode = 'P0002';
  end if;

  select claim.* into v_claim
  from platform.activity_log claim
  where claim.action = 'voice.recording.custody.claimed'
    and claim.metadata ->> 'source_event_id' = p_source_event_id::text
    and claim.metadata ->> 'claim_token' = p_claim_token::text
    and claim.metadata ->> 'worker_id' = p_worker_id
  order by claim.id desc
  limit 1;
  if not found then
    raise exception 'Voice recording custody claim does not match this worker'
      using errcode = '42501';
  end if;
  if v_claim.id is distinct from (
    select latest.id
    from platform.activity_log latest
    where latest.action = 'voice.recording.custody.claimed'
      and latest.metadata ->> 'source_event_id' = p_source_event_id::text
    order by latest.id desc
    limit 1
  ) then
    return false;
  end if;
  if exists (
    select 1
    from platform.activity_log prior
    where prior.action = 'voice.recording.custody.failed'
      and prior.metadata ->> 'claim_token' = p_claim_token::text
  ) then
    return false;
  end if;
  if exists (
    select 1
    from platform.activity_log custody
    where custody.action = 'voice.recording.custody'
      and custody.entity_id = v_source.entity_id
      and custody.metadata ->> 'source_event_key' =
        v_source.metadata ->> 'provider_event_key'
  ) then
    return false;
  end if;

  v_attempt_count := coalesce((v_claim.metadata ->> 'attempt_count')::integer, 1);
  v_effective_retryable := coalesce(p_retryable, false)
    and v_attempt_count < greatest(1, least(coalesce(p_max_attempts, 5), 20));
  v_next_attempt_at := case
    when v_effective_retryable then
      now() + pg_catalog.make_interval(
        secs => greatest(1, least(coalesce(p_retry_after_seconds, 30), 86400))
      )
    else null
  end;

  insert into platform.activity_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    occurred_at,
    metadata
  ) values (
    v_source.organization_id,
    'crm_interaction',
    v_source.entity_id,
    'voice.recording.custody.failed',
    null,
    now(),
    jsonb_strip_nulls(jsonb_build_object(
      'source_event_id', p_source_event_id,
      'source_event_key', v_source.metadata ->> 'provider_event_key',
      'claim_token', p_claim_token,
      'worker_id', p_worker_id,
      'attempt_count', v_attempt_count,
      'error_code', p_error_code,
      'retryable', v_effective_retryable,
      'next_attempt_at', v_next_attempt_at,
      'operator_detail', left(p_operator_detail, 500),
      'canonical_file_id', p_canonical_file_id,
      'cleanup_required', coalesce(p_cleanup_required, false)
    ))
  );
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.finalize_voice_recording_file(p_provider text, p_provider_account_id text, p_provider_call_id text, p_provider_recording_id text, p_source_event_key text, p_file_id uuid)
 RETURNS TABLE(interaction_id uuid, canonical_file_id uuid, disposition text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_interaction crm.interaction%rowtype;
  v_file files.files%rowtype;
  v_source_event platform.activity_log%rowtype;
  v_event_key text;
begin
  select i.* into v_interaction
  from crm.interaction i
  where i.channel_code = 'call'
    and i.provider = p_provider
    and i.provider_account_id = p_provider_account_id
    and i.provider_interaction_id = p_provider_call_id
    and i.provider_recording_id = p_provider_recording_id
    and i.deleted_at is null
  for update;
  if not found then
    raise exception 'No exact completed voice recording interaction is available for file binding'
      using errcode = 'P0002';
  end if;
  if v_interaction.recording_status <> 'completed' then
    raise exception 'Voice recording must be completed before canonical file binding'
      using errcode = '55000';
  end if;

  select a.* into v_source_event
  from platform.activity_log a
  where a.entity_type = 'crm_interaction'
    and a.entity_id = v_interaction.id
    and a.action = 'voice.recording.lifecycle'
    and a.metadata ->> 'provider_event_key' = p_source_event_key
    and a.metadata ->> 'provider' = p_provider
    and a.metadata ->> 'provider_account_id' = p_provider_account_id
    and a.metadata ->> 'provider_call_id' = p_provider_call_id
    and a.metadata ->> 'provider_recording_id' = p_provider_recording_id
    and a.metadata ->> 'status' = 'completed';
  if not found then
    raise exception 'Canonical file binding lacks exact completed provider evidence'
      using errcode = '23503';
  end if;

  select f.* into v_file
  from files.files f
  where f.id = p_file_id and f.deleted_at is null;
  if not found then
    raise exception 'Canonical recording file does not exist' using errcode = '23503';
  end if;
  if v_file.organization_id is distinct from v_interaction.organization_id
     or v_file.created_by is distinct from v_interaction.recording_owner_id then
    raise exception 'Canonical recording file owner or organization does not match the call'
      using errcode = '42501';
  end if;
  if v_interaction.recording_file_id is not null then
    if v_interaction.recording_file_id is distinct from p_file_id then
      raise exception 'Voice recording is already bound to a different canonical file'
        using errcode = '23505';
    end if;
    return query select v_interaction.id, p_file_id, 'replay'::text;
    return;
  end if;

  update crm.interaction
  set recording_file_id = p_file_id,
      recording_custody_at = now()
  where id = v_interaction.id;

  v_event_key := 'custody:' || p_source_event_key;
  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_interaction.organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.recording.custody',
    null,
    now(),
    jsonb_build_object(
      'provider', p_provider,
      'provider_account_id', p_provider_account_id,
      'provider_call_id', p_provider_call_id,
      'provider_recording_id', p_provider_recording_id,
      'provider_event_key', v_event_key,
      'source_event_key', p_source_event_key,
      'canonical_file_id', p_file_id
    )
  );

  return query select v_interaction.id, p_file_id, 'bound'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.issue_voice_agent_session_reference_unfenced(p_reference_sha256 text, p_session_id uuid, p_expires_at timestamp with time zone, p_interaction_id uuid, p_chat_conversation_id uuid, p_consent_event_id bigint, p_mandate_id uuid, p_mandate_key text, p_definition_agent_id uuid, p_agent_version_id uuid, p_mandate_provenance text, p_mandate_config_overrides jsonb DEFAULT NULL::jsonb, p_transport text DEFAULT 'conversation_relay'::text)
 RETURNS TABLE(event_id bigint, session_id uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_interaction crm.interaction%rowtype;
  v_consent platform.activity_log%rowtype;
  v_conversation chat.conversation%rowtype;
  v_event_id bigint;
  v_now timestamptz := clock_timestamp();
  v_metadata jsonb;
begin
  if p_reference_sha256 !~ '^sha256:[0-9a-f]{64}$'
     or p_session_id is null
     or p_expires_at is null
     or p_expires_at <= v_now
     or p_expires_at > v_now + interval '10 minutes'
     or p_interaction_id is null
     or p_chat_conversation_id is null
     or p_consent_event_id is null
     or p_mandate_id is null
     or p_mandate_key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
     or p_definition_agent_id is null
     or p_mandate_provenance not in ('system', 'org', 'user', 'run')
     or p_transport <> 'conversation_relay'
     or (p_mandate_config_overrides is not null and jsonb_typeof(p_mandate_config_overrides) <> 'object') then
    raise exception 'Complete exact Voice session reference inputs are required'
      using errcode = '22023';
  end if;

  select interaction.* into v_interaction
  from crm.interaction interaction
  where interaction.id = p_interaction_id
    and interaction.channel_code = 'call'
    and interaction.deleted_at is null
    and interaction.party_id is not null
    and interaction.contact_point_id is not null
    and interaction.organization_id is not null
    and interaction.recording_owner_id is not null
    and nullif(interaction.provider, '') is not null
    and nullif(interaction.provider_account_id, '') is not null
    and nullif(interaction.provider_interaction_id, '') is not null
    and nullif(interaction.program_key, '') is not null
  for update;
  if not found then
    raise exception 'No exact canonical Voice interaction matched'
      using errcode = 'P0002';
  end if;

  select activity.* into v_consent
  from platform.activity_log activity
  where activity.id = p_consent_event_id
    and activity.action = 'voice.call.consent'
    and activity.entity_type = 'crm_interaction'
    and activity.entity_id = v_interaction.id
    and activity.organization_id = v_interaction.organization_id
    and activity.actor_id = v_interaction.recording_owner_id
    and (activity.metadata ->> 'consented')::boolean is true
    and activity.metadata ->> 'provider' = v_interaction.provider
    and activity.metadata ->> 'provider_account_id' = v_interaction.provider_account_id
    and activity.metadata ->> 'provider_call_id' = v_interaction.provider_interaction_id
    and activity.metadata ->> 'program_key' = v_interaction.program_key
    and activity.metadata is not distinct from v_interaction.attributes -> 'voice_consent';
  if not found then
    raise exception 'No exact durable Voice consent evidence matched'
      using errcode = 'P0002';
  end if;

  select conversation.* into v_conversation
  from chat.conversation conversation
  where conversation.id = p_chat_conversation_id
    and conversation.organization_id = v_interaction.organization_id
    and conversation.created_by = v_interaction.recording_owner_id
    and conversation.initial_agent_id = p_definition_agent_id
    and (p_agent_version_id is null or conversation.initial_agent_version_id = p_agent_version_id)
    and conversation.deleted_at is null
    and conversation.is_ephemeral is false
  for update;
  if not found then
    raise exception 'No exact persisted Voice chat conversation matched'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from mandate.definition mandate
    where mandate.id = p_mandate_id
      and mandate.mandate_key = p_mandate_key
      and mandate.is_enabled is true
      and mandate.deleted_at is null
  ) or not exists (
    select 1
    from agent.definition definition
    where definition.id = p_definition_agent_id
      and definition.is_active is true
      and definition.is_archived is false
      and definition.deleted_at is null
  ) or (
    p_agent_version_id is not null
    and not exists (
      select 1
      from agent.definition_version version
      where version.id = p_agent_version_id
        and version.agent_id = p_definition_agent_id
        and version.deleted_at is null
    )
  ) then
    raise exception 'Voice Mandate snapshot is not exactly runnable'
      using errcode = 'P0002';
  end if;

  v_metadata := jsonb_build_object(
    'reference_sha256', p_reference_sha256,
    'session_id', p_session_id,
    'expires_at', p_expires_at,
    'transport', p_transport,
    'interaction_id', v_interaction.id,
    'chat_conversation_id', v_conversation.id,
    'organization_id', v_interaction.organization_id,
    'party_id', v_interaction.party_id,
    'contact_point_id', v_interaction.contact_point_id,
    'actor_user_id', v_interaction.recording_owner_id,
    'provider', v_interaction.provider,
    'provider_account_id', v_interaction.provider_account_id,
    'provider_call_id', v_interaction.provider_interaction_id,
    'program_key', v_interaction.program_key,
    'consent_event_id', v_consent.id,
    'consent', v_consent.metadata,
    'mandate_id', p_mandate_id,
    'mandate_key', p_mandate_key,
    'definition_agent_id', p_definition_agent_id,
    'agent_version_id', p_agent_version_id,
    'mandate_provenance', p_mandate_provenance,
    'mandate_config_overrides', p_mandate_config_overrides
  );

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_interaction.organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.agent.session_reference.issued',
    v_interaction.recording_owner_id,
    v_now,
    v_metadata
  ) returning id into v_event_id;

  return query select v_event_id, p_session_id, p_expires_at;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.meet_meeting_by_slug(p_slug text)
 RETURNS communication.meet_meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_row communication.meet_meetings;
begin
  select * into v_row from communication.meet_meetings m
    where m.slug = p_slug and m.deleted_at is null;
  if not found then
    raise exception 'meet_meeting_by_slug: no meeting for that link' using errcode = 'P0002';
  end if;
  -- DD-152 / DD-116 class: declaring this an anonymous door says a caller with no account may
  -- REACH it; it never said every meeting behind it is open to one. A guest resolves a meeting
  -- only when its visibility class says the link is the capability. A signed-in caller is
  -- unchanged — the same page serves members and guests.
  if auth.uid() is null and v_row.visibility < 'link'::platform.visibility then
    raise exception 'meet_meeting_by_slug: this meeting is not open to guests — sign in with an '
                    'account in the meeting''s organization, or ask the host to share it by link'
      using errcode = '42501';
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.meet_record_consent(p_meeting_id uuid, p_identity text, p_acknowledged_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_org uuid; v_vis platform.visibility;
begin
  select organization_id, visibility into v_org, v_vis from communication.meet_meetings
    where id = p_meeting_id and deleted_at is null;
  if v_org is null then
    raise exception 'meet_record_consent: no such meeting' using errcode = 'P0002';
  end if;
  -- DD-152: the same guest bound as meet_meeting_by_slug. Without it an anonymous caller holding
  -- any meeting UUID could mint a participant row on a meeting no guest may join.
  if auth.uid() is null and v_vis < 'link'::platform.visibility then
    raise exception 'meet_record_consent: this meeting is not open to guests' using errcode = '42501';
  end if;
  insert into communication.meet_participants
    (meeting_id, identity, consent_acknowledged_at, organization_id)
  values (p_meeting_id, p_identity, coalesce(p_acknowledged_at, now()), v_org)
  on conflict (meeting_id, identity) do update
    set consent_acknowledged_at = coalesce(
          communication.meet_participants.consent_acknowledged_at,
          excluded.consent_acknowledged_at);
end;
$function$;

CREATE OR REPLACE FUNCTION communication.meet_settle_call_invite(p_invite_id uuid, p_state text, p_decline_message text)
 RETURNS communication.meet_call_invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid; v_row communication.meet_call_invites;
  v_terminal text[] := array['declined','missed','busy','cancelled','ended','failed'];
begin
  select * into v_row from communication.meet_call_invites where id = p_invite_id;
  if not found then
    raise exception 'meet_settle_call_invite: no such invite' using errcode = 'P0002';
  end if;
  v_actor := communication._meet_actor(null);
  if v_actor is not null
     and v_actor <> v_row.caller_user_id
     and not (v_actor = any (v_row.callee_ids)) then
    raise exception 'meet_settle_call_invite: only the caller or a callee may settle this call'
      using errcode = '42501';
  end if;
  update communication.meet_call_invites i
     set state = p_state,
         decline_message = coalesce(p_decline_message, i.decline_message),
         settled_at = case when p_state = any (v_terminal) then now() else i.settled_at end,
         updated_by = coalesce(v_actor, i.updated_by)
   where i.id = p_invite_id
     and not (i.state = any (v_terminal))
  returning * into v_row;
  if not found then
    select * into v_row from communication.meet_call_invites where id = p_invite_id;
    if v_row.state = p_state then
      return v_row;   -- idempotent replay of the same verdict
    end if;
    raise exception 'meet_settle_call_invite: the call is already % and cannot become %',
      v_row.state, p_state using errcode = '42501';
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.resolve_voice_owner_call_context(p_program_key text, p_destination_id uuid, p_provider text, p_provider_account_id text, p_caller_phone text, p_called_phone text)
 RETURNS TABLE(party_id uuid, contact_point_id uuid, organization_id uuid, recording_owner_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_candidate_count bigint;
  v_party_id uuid;
  v_contact_point_id uuid;
  v_organization_id uuid;
  v_owner_id uuid;
begin
  if nullif(btrim(p_program_key), '') is null
     or p_destination_id is null
     or nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or p_caller_phone !~ '^\+[1-9][0-9]{6,14}$'
     or p_called_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'Voice owner call context requires exact canonical identity inputs'
      using errcode = '22023';
  end if;

  select
    count(*),
    (array_agg(candidate.party_id order by candidate.party_id))[1],
    (array_agg(candidate.contact_point_id order by candidate.party_id))[1],
    (array_agg(candidate.organization_id order by candidate.party_id))[1],
    (array_agg(candidate.owner_id order by candidate.party_id))[1]
  into
    v_candidate_count,
    v_party_id,
    v_contact_point_id,
    v_organization_id,
    v_owner_id
  from (
    select distinct
      party.id as party_id,
      point.id as contact_point_id,
      -- 🚨 THE ORGANIZATION IS THE ENROLLMENT'S, NOT A CONSTANT. This is the
      -- one line the SMS ingress and the voice ingress have to agree on, and
      -- it is why a text and a call now open the same conversation.
      preference.organization_id as organization_id,
      party.claimed_by as owner_id
    from communication.sms_phone_numbers destination
    join communication.sms_notification_preferences preference
      on preference.assistant_destination_id = destination.id
     and preference.assistant_program_key = destination.program_key
     and preference.phone_number = p_caller_phone
     and preference.user_id is not null
     and preference.organization_id is not null
     and preference.deleted_at is null
    join auth.users owner_user
      on owner_user.id = preference.user_id
     and owner_user.is_anonymous is false
    join crm.party party
      on party.organization_id = preference.organization_id
     and party.claimed_by = preference.user_id
     and party.party_kind = 'person'
     and party.canonical_id is null
     and party.deleted_at is null
    join crm.contact_medium medium
      on medium.organization_id = party.organization_id
     and medium.channel = 'phone'
     and coalesce(medium.platform_slug, '') = ''
     and medium.value_key = p_caller_phone
     and medium.verification_status = 'verified'
     and medium.deleted_at is null
    join crm.party_contact_point point
      on point.party_id = party.id
     and point.medium_id = medium.id
     and point.organization_id = party.organization_id
     and point.deleted_at is null
    where destination.id = p_destination_id
      and destination.program_key = p_program_key
      and destination.provider = p_provider
      and destination.provider_account_id = p_provider_account_id
      and destination.phone_number = p_called_phone
      and destination.is_active is true
      and destination.deleted_at is null
      and iam.is_org_member(preference.user_id, preference.organization_id)
  ) candidate;

  if v_candidate_count = 0 then
    raise exception 'No exact pre-existing enrolled CRM caller context matched'
      using errcode = 'P0002';
  end if;
  if v_candidate_count <> 1 then
    raise exception 'Enrolled CRM caller context is ambiguous'
      using errcode = '23505';
  end if;

  return query
    select v_party_id, v_contact_point_id, v_organization_id, v_owner_id;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.set_my_sms_assistant_enabled(p_program_key text, p_enabled boolean)
 RETURNS TABLE(destination_id uuid, masked_phone text, program_key text, number_active boolean, global_assistant_enabled boolean, verified_user_phone text, sms_enabled boolean, user_assistant_enabled boolean, preferred_agent_id uuid, preferred_agent_version_id uuid, sms_conversation_id uuid, chat_conversation_id uuid, identity_status text, consent_status text, ready boolean, blocked_reasons text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := auth.uid();
  updated_count integer;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from mandate.definition sms_mandate
    where sms_mandate.mandate_key = 'sms.owner_beta'
      and sms_mandate.is_enabled
      and sms_mandate.deleted_at is null
  ) then
    raise exception 'SMS assistant Mandate is unavailable' using errcode = '55000';
  end if;

  update communication.sms_notification_preferences preference
  set ai_agent_messages = coalesce(p_enabled, false),
      updated_by = caller,
      updated_at = now()
  where preference.user_id = caller
    and preference.assistant_program_key = p_program_key
    and preference.assistant_destination_id is not null
    and preference.deleted_at is null;
  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    raise exception 'SMS preferences and program must already be explicitly bound'
      using errcode = 'P0002';
  elsif updated_count > 1 then
    raise exception 'SMS assistant program binding is ambiguous' using errcode = '21000';
  end if;

  return query
  select * from communication.get_my_sms_assistant_program(p_program_key);
end;
$function$;
