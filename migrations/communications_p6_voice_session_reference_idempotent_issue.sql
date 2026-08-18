-- Idempotent producer fence for the deterministic post-consent owner Voice reference.

begin;

alter function communication.issue_voice_agent_session_reference(
  text, uuid, timestamptz, uuid, uuid, bigint, uuid, text, uuid, uuid, text, jsonb, text
) rename to issue_voice_agent_session_reference_unfenced;

revoke all on function communication.issue_voice_agent_session_reference_unfenced(
  text, uuid, timestamptz, uuid, uuid, bigint, uuid, text, uuid, uuid, text, jsonb, text
) from public, anon, authenticated, service_role;

create function communication.issue_voice_agent_session_reference(
  p_reference_sha256 text,
  p_session_id uuid,
  p_expires_at timestamptz,
  p_interaction_id uuid,
  p_chat_conversation_id uuid,
  p_consent_event_id bigint,
  p_mandate_id uuid,
  p_mandate_key text,
  p_definition_agent_id uuid,
  p_agent_version_id uuid,
  p_mandate_provenance text,
  p_mandate_config_overrides jsonb default null,
  p_transport text default 'conversation_relay'
)
returns table(event_id bigint, session_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing platform.activity_log%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_reference_sha256 !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'A valid Voice reference digest is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_reference_sha256, 0)
  );

  select issued.* into v_existing
  from platform.activity_log issued
  where issued.action = 'voice.agent.session_reference.issued'
    and issued.metadata ->> 'reference_sha256' = p_reference_sha256
  order by issued.id desc
  limit 1;

  if found then
    if (v_existing.metadata ->> 'expires_at')::timestamptz <= v_now
       or v_existing.metadata ->> 'session_id' <> p_session_id::text
       or v_existing.metadata ->> 'interaction_id' <> p_interaction_id::text
       or v_existing.metadata ->> 'chat_conversation_id' <> p_chat_conversation_id::text
       or v_existing.metadata ->> 'consent_event_id' <> p_consent_event_id::text
       or v_existing.metadata ->> 'mandate_id' <> p_mandate_id::text
       or v_existing.metadata ->> 'mandate_key' <> p_mandate_key
       or v_existing.metadata ->> 'definition_agent_id' <> p_definition_agent_id::text
       or v_existing.metadata ->> 'agent_version_id' is distinct from p_agent_version_id::text
       or v_existing.metadata ->> 'mandate_provenance' <> p_mandate_provenance
       or v_existing.metadata -> 'mandate_config_overrides'
          is distinct from p_mandate_config_overrides
       or v_existing.metadata ->> 'transport' <> p_transport
       or exists (
         select 1
         from platform.activity_log consumed
         where consumed.action = 'voice.agent.session_reference.consumed'
           and consumed.metadata ->> 'reference_sha256' = p_reference_sha256
       ) then
      raise exception 'Voice session reference replay did not match or is no longer usable'
        using errcode = '55000';
    end if;
    return query select
      v_existing.id,
      (v_existing.metadata ->> 'session_id')::uuid,
      (v_existing.metadata ->> 'expires_at')::timestamptz;
    return;
  end if;

  return query
  select issued.event_id, issued.session_id, issued.expires_at
  from communication.issue_voice_agent_session_reference_unfenced(
    p_reference_sha256,
    p_session_id,
    p_expires_at,
    p_interaction_id,
    p_chat_conversation_id,
    p_consent_event_id,
    p_mandate_id,
    p_mandate_key,
    p_definition_agent_id,
    p_agent_version_id,
    p_mandate_provenance,
    p_mandate_config_overrides,
    p_transport
  ) issued;
end;
$function$;

revoke all on function communication.issue_voice_agent_session_reference(
  text, uuid, timestamptz, uuid, uuid, bigint, uuid, text, uuid, uuid, text, jsonb, text
) from public, anon, authenticated;
grant execute on function communication.issue_voice_agent_session_reference(
  text, uuid, timestamptz, uuid, uuid, bigint, uuid, text, uuid, uuid, text, jsonb, text
) to service_role;

comment on function communication.issue_voice_agent_session_reference(
  text, uuid, timestamptz, uuid, uuid, bigint, uuid, text, uuid, uuid, text, jsonb, text
) is
  'Issues or exactly replays one deterministic, unexpired, unconsumed Voice session reference; service role only.';

commit;
