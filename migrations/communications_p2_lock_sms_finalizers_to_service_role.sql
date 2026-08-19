-- Both SMS turn finalizers are worker infrastructure. They must never be
-- callable from PostgREST by anonymous or signed-in clients.

revoke all on function communication.finalize_sms_agent_turn(
  uuid, text, text, uuid, text, text, text, boolean, integer, text[]
) from public, anon, authenticated;
grant execute on function communication.finalize_sms_agent_turn(
  uuid, text, text, uuid, text, text, text, boolean, integer, text[]
) to service_role;

revoke all on function communication.finalize_sms_agent_turn_jsonb(
  uuid, text, text, uuid, text, text, text, boolean, integer, jsonb
) from public, anon, authenticated;
grant execute on function communication.finalize_sms_agent_turn_jsonb(
  uuid, text, text, uuid, text, text, text, boolean, integer, jsonb
) to service_role;
