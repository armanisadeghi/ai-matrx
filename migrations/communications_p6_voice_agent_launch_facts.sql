-- communications_p6_voice_agent_launch_facts.sql
--
-- Make the owner-beta concurrency and daily-cost launch facts real. The
-- consumer already returns these facts to aidream's fail-closed policy, but
-- the prior implementation returned zeroes for every valid reference.
--
-- The stable signature and return shape are unchanged. An advisory transaction
-- lock serializes admission decisions; consumed references on in-progress call
-- interactions are the durable active-session inventory.

begin;

create or replace function communication.consume_voice_agent_session_reference(
  p_reference_sha256 text,
  p_provider text,
  p_provider_account_id text,
  p_provider_call_id text,
  p_provider_session_id text
)
returns table(binding jsonb, launch_facts jsonb)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_issued platform.activity_log%rowtype;
  v_consumed_id bigint;
  v_metadata jsonb;
  v_now timestamptz := clock_timestamp();
  v_binding jsonb;
  v_active_global bigint := 0;
  v_active_program bigint := 0;
  v_active_party bigint := 0;
  v_estimated_cost_today_usd numeric(10,4) := 0;
begin
  if p_reference_sha256 !~ '^sha256:[0-9a-f]{64}$'
     or nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or nullif(btrim(p_provider_call_id), '') is null
     or nullif(btrim(p_provider_session_id), '') is null then
    return;
  end if;

  select issued.* into v_issued
  from platform.activity_log issued
  where issued.action = 'voice.agent.session_reference.issued'
    and issued.metadata ->> 'reference_sha256' = p_reference_sha256
  for update;
  if not found
     or (v_issued.metadata ->> 'expires_at')::timestamptz <= v_now
     or v_issued.metadata ->> 'transport' <> 'conversation_relay'
     or v_issued.metadata ->> 'provider' <> p_provider
     or v_issued.metadata ->> 'provider_account_id' <> p_provider_account_id
     or v_issued.metadata ->> 'provider_call_id' <> p_provider_call_id
     or exists (
       select 1
       from platform.activity_log consumed
       where consumed.action = 'voice.agent.session_reference.consumed'
         and consumed.metadata ->> 'reference_sha256' = p_reference_sha256
     ) then
    return;
  end if;

  if not exists (
    select 1
    from crm.interaction interaction
    where interaction.id = (v_issued.metadata ->> 'interaction_id')::uuid
      and interaction.channel_code = 'call'
      and interaction.organization_id = (v_issued.metadata ->> 'organization_id')::uuid
      and interaction.party_id = (v_issued.metadata ->> 'party_id')::uuid
      and interaction.contact_point_id = (v_issued.metadata ->> 'contact_point_id')::uuid
      and interaction.recording_owner_id = (v_issued.metadata ->> 'actor_user_id')::uuid
      and interaction.provider = p_provider
      and interaction.provider_account_id = p_provider_account_id
      and interaction.provider_interaction_id = p_provider_call_id
      and interaction.program_key = v_issued.metadata ->> 'program_key'
      and interaction.attributes -> 'voice_consent' = v_issued.metadata -> 'consent'
      and interaction.deleted_at is null
  ) or not exists (
    select 1
    from platform.activity_log consent
    where consent.id = (v_issued.metadata ->> 'consent_event_id')::bigint
      and consent.action = 'voice.call.consent'
      and consent.entity_id = (v_issued.metadata ->> 'interaction_id')::uuid
      and consent.organization_id = (v_issued.metadata ->> 'organization_id')::uuid
      and consent.actor_id = (v_issued.metadata ->> 'actor_user_id')::uuid
      and consent.metadata = v_issued.metadata -> 'consent'
  ) or not exists (
    select 1
    from chat.conversation conversation
    where conversation.id = (v_issued.metadata ->> 'chat_conversation_id')::uuid
      and conversation.organization_id = (v_issued.metadata ->> 'organization_id')::uuid
      and conversation.created_by = (v_issued.metadata ->> 'actor_user_id')::uuid
      and conversation.initial_agent_id = (v_issued.metadata ->> 'definition_agent_id')::uuid
      and (
        v_issued.metadata ->> 'agent_version_id' is null
        or conversation.initial_agent_version_id =
          (v_issued.metadata ->> 'agent_version_id')::uuid
      )
      and conversation.deleted_at is null
      and conversation.is_ephemeral is false
  ) or not exists (
    select 1
    from agent.mandate mandate
    where mandate.id = (v_issued.metadata ->> 'mandate_id')::uuid
      and mandate.mandate_key = v_issued.metadata ->> 'mandate_key'
      and mandate.is_enabled is true
      and mandate.deleted_at is null
  ) or not exists (
    select 1
    from agent.definition definition
    where definition.id = (v_issued.metadata ->> 'definition_agent_id')::uuid
      and definition.is_active is true
      and definition.is_archived is false
      and definition.deleted_at is null
  ) or (
    v_issued.metadata ->> 'agent_version_id' is not null
    and not exists (
      select 1
      from agent.definition_version version
      where version.id = (v_issued.metadata ->> 'agent_version_id')::uuid
        and version.agent_id = (v_issued.metadata ->> 'definition_agent_id')::uuid
        and version.deleted_at is null
    )
  ) then
    return;
  end if;

  -- One admission at a time across every aidream instance. The lock lasts
  -- through the consumed-event insert, so the next admission sees this call.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('communication.voice-agent-launch', 0)
  );

  select
    count(*)::bigint,
    count(*) filter (
      where interaction.program_key = v_issued.metadata ->> 'program_key'
    )::bigint,
    count(*) filter (
      where interaction.party_id = (v_issued.metadata ->> 'party_id')::uuid
    )::bigint
  into v_active_global, v_active_program, v_active_party
  from crm.interaction interaction
  where interaction.id <> (v_issued.metadata ->> 'interaction_id')::uuid
    and interaction.channel_code = 'call'
    and interaction.status = 'in_progress'
    and interaction.deleted_at is null
    and exists (
      select 1
      from platform.activity_log consumed
      where consumed.action = 'voice.agent.session_reference.consumed'
        and consumed.entity_type = 'crm_interaction'
        and consumed.entity_id = interaction.id
    );

  select
    case
      -- Unknown request cost is never treated as free. The maximum numeric
      -- value accepted by the runtime fact contract forces a budget refusal.
      when count(*) filter (where request.cost is null) > 0 then 999999.9999
      else coalesce(sum(request.cost), 0)::numeric(10,4)
    end
  into v_estimated_cost_today_usd
  from chat.request request
  where request.deleted_at is null
    and request.created_at >= date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC'
    and exists (
      select 1
      from platform.activity_log consumed
      where consumed.action = 'voice.agent.session_reference.consumed'
        and consumed.metadata ->> 'program_key' = v_issued.metadata ->> 'program_key'
        and consumed.metadata ->> 'chat_conversation_id' = request.conversation_id::text
    );

  v_metadata := v_issued.metadata || jsonb_build_object(
    'issued_event_id', v_issued.id,
    'provider_session_id', p_provider_session_id,
    'consumed_at', v_now
  );
  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_issued.organization_id,
    v_issued.entity_type,
    v_issued.entity_id,
    'voice.agent.session_reference.consumed',
    v_issued.actor_id,
    v_now,
    v_metadata
  ) returning id into v_consumed_id;

  v_binding := jsonb_build_object(
    'session_id', v_issued.metadata ->> 'session_id',
    'transport', v_issued.metadata ->> 'transport',
    'call', jsonb_build_object(
      'provider', v_issued.metadata ->> 'provider',
      'provider_account_id', v_issued.metadata ->> 'provider_account_id',
      'provider_call_id', v_issued.metadata ->> 'provider_call_id'
    ),
    'interaction_id', v_issued.metadata ->> 'interaction_id',
    'program_key', v_issued.metadata ->> 'program_key',
    'chat_conversation_id', v_issued.metadata ->> 'chat_conversation_id',
    'organization_id', v_issued.metadata ->> 'organization_id',
    'party_id', v_issued.metadata ->> 'party_id',
    'contact_point_id', v_issued.metadata ->> 'contact_point_id',
    'actor_user_id', v_issued.metadata ->> 'actor_user_id',
    'agent', jsonb_build_object(
      'mandate_key', v_issued.metadata ->> 'mandate_key',
      'mandate_id', v_issued.metadata ->> 'mandate_id',
      'definition_agent_id', v_issued.metadata ->> 'definition_agent_id',
      'agent_version_id', v_issued.metadata -> 'agent_version_id',
      'provenance', v_issued.metadata ->> 'mandate_provenance',
      'config_overrides', v_issued.metadata -> 'mandate_config_overrides'
    ),
    'consent', jsonb_build_object(
      'provider', v_issued.metadata #>> '{consent,provider}',
      'provider_account_id', v_issued.metadata #>> '{consent,provider_account_id}',
      'provider_call_id', v_issued.metadata #>> '{consent,provider_call_id}',
      'provider_event_key', v_issued.metadata #>> '{consent,provider_event_key}',
      'disclosure_version', v_issued.metadata #>> '{consent,disclosure_version}',
      'disclosure_text_sha256', replace(
        v_issued.metadata #>> '{consent,disclosure_text_hash}', 'sha256:', ''
      ),
      'disclosed_at', v_issued.metadata #> '{consent,disclosed_at}',
      'response_kind', v_issued.metadata #>> '{consent,response_kind}',
      'response_value', v_issued.metadata #>> '{consent,response_value}',
      'consented_at', v_issued.metadata #> '{consent,consented_at}',
      'source', v_issued.metadata #>> '{consent,source}'
    )
  );

  return query select
    v_binding,
    jsonb_build_object(
      'session_binding_match_count', 1,
      'consent_event_match_count', 1,
      'mandate_resolution_match_count', 1,
      'active_global', v_active_global,
      'active_program', v_active_program,
      'active_party', v_active_party,
      'estimated_cost_today_usd', v_estimated_cost_today_usd
    );
end;
$function$;

comment on function communication.consume_voice_agent_session_reference(
  text, text, text, text, text
) is
  'Atomically consumes one exact Voice session reference and returns its durable binding plus serialized concurrency and fail-closed daily-cost launch facts.';

commit;
