begin;

do $test$
declare
  v_public text;
  v_internal text;
begin
  select pg_get_functiondef(
    'communication.issue_voice_agent_session_reference(text,uuid,timestamptz,uuid,uuid,bigint,uuid,text,uuid,uuid,text,jsonb,text)'::regprocedure
  ) into v_public;
  select pg_get_functiondef(
    'communication.issue_voice_agent_session_reference_unfenced(text,uuid,timestamptz,uuid,uuid,bigint,uuid,text,uuid,uuid,text,jsonb,text)'::regprocedure
  ) into v_internal;

  if position('pg_advisory_xact_lock' in v_public) = 0
     or position('voice.agent.session_reference.consumed' in v_public) = 0
     or position('is distinct from p_mandate_config_overrides' in lower(v_public)) = 0 then
    raise exception 'Voice reference producer is not idempotent and exact';
  end if;
  if has_function_privilege(
    'authenticated',
    'communication.issue_voice_agent_session_reference_unfenced(text,uuid,timestamptz,uuid,uuid,bigint,uuid,text,uuid,uuid,text,jsonb,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'communication.issue_voice_agent_session_reference_unfenced(text,uuid,timestamptz,uuid,uuid,bigint,uuid,text,uuid,uuid,text,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'Unfenced Voice reference producer remains externally callable';
  end if;
  if position('Complete exact Voice session reference inputs are required' in v_internal) = 0 then
    raise exception 'Idempotent wrapper did not preserve the exact canonical issuer';
  end if;
end;
$test$;

rollback;
