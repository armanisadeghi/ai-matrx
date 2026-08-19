-- Additive adapter for matrx-orm's canonical JSON encoding of Python lists.
-- Keep the established text[] finalizer unchanged; the worker calls this
-- unambiguous name so NULL and JSON-array replies cannot hit overload ambiguity.

create or replace function communication.finalize_sms_agent_turn_jsonb(
  p_inbound_message_id uuid,
  p_worker_id text,
  p_status text,
  p_request_id uuid default null,
  p_reply text default null,
  p_error_code text default null,
  p_operator_detail text default null,
  p_execution_known_not_started boolean default false,
  p_retry_after_seconds integer default 5,
  p_replies jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_replies text[];
begin
  if p_replies is not null then
    if jsonb_typeof(p_replies) <> 'array' then
      raise exception 'SMS replies must be a JSON array';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_replies) as item(value)
      where jsonb_typeof(item.value) <> 'string'
    ) then
      raise exception 'every SMS reply must be a string';
    end if;
    select coalesce(array_agg(item.value order by item.ordinality), array[]::text[])
      into v_replies
      from jsonb_array_elements_text(p_replies) with ordinality as item(value, ordinality);
  end if;

  return communication.finalize_sms_agent_turn(
    p_inbound_message_id,
    p_worker_id,
    p_status,
    p_request_id,
    p_reply,
    p_error_code,
    p_operator_detail,
    p_execution_known_not_started,
    p_retry_after_seconds,
    v_replies
  );
end;
$function$;

revoke all on function communication.finalize_sms_agent_turn_jsonb(
  uuid, text, text, uuid, text, text, text, boolean, integer, jsonb
) from public, anon, authenticated;
grant execute on function communication.finalize_sms_agent_turn_jsonb(
  uuid, text, text, uuid, text, text, text, boolean, integer, jsonb
) to service_role;

comment on function communication.finalize_sms_agent_turn_jsonb(
  uuid, text, text, uuid, text, text, text, boolean, integer, jsonb
) is 'Service-only JSON adapter for the canonical text-array SMS turn finalizer.';
