-- Transactional contract test for communications_p6_voice_agent_launch_facts.sql.

begin;

do $test$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'communication.consume_voice_agent_session_reference(text,text,text,text,text)'::regprocedure
  ) into v_definition;

  if position('pg_advisory_xact_lock' in v_definition) = 0 then
    raise exception 'Voice launch admission is not serialized';
  end if;
  if position('interaction.status = ''in_progress''' in v_definition) = 0
     or position('voice.agent.session_reference.consumed' in v_definition) = 0 then
    raise exception 'Voice active-session facts are not derived from durable state';
  end if;
  if position('from chat.request request' in lower(v_definition)) = 0
     or position('request.cost is null' in lower(v_definition)) = 0 then
    raise exception 'Voice daily-cost fact is not fail-closed over canonical requests';
  end if;
  if position('''active_global'', 0' in v_definition) > 0
     or position('''active_program'', 0' in v_definition) > 0
     or position('''active_party'', 0' in v_definition) > 0
     or position('''estimated_cost_today_usd'', 0' in v_definition) > 0 then
    raise exception 'Voice launch facts still contain hardcoded zeroes';
  end if;
end;
$test$;

rollback;
