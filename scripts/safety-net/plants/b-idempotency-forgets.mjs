// SAFETY-NET-B · A10. The table API's stored first answer for an Idempotency-Key expires the moment it is written (a
// trigger on workflow.idempotency, scoped to the probe's two organizations), so a retried create runs again instead of
// replaying. A10 "*.idempotent_replay" must go RED. Committed on the clone for one probe run; the trigger is dropped
// and read back.
export default {
  id: "b-idempotency-forgets",
  check: "agents.api-mcp",
  items: ["A10"],
  description: "workflow.idempotency rows of Cedar Ridge / admin's Workspace are born expired (clone, one run)",
  mode: "committed",
  apply: `create function public._sn_b_idempotency_born_expired() returns trigger language plpgsql as $$
begin
  if new.organization_id in ('0a54df90-eab8-4d07-ab29-81a45fb41e04', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f') then
    new.expires_at := now() - interval '1 second';
  end if;
  return new;
end $$;
create trigger _sn_b_idempotency_born_expired before insert or update on workflow.idempotency
  for each row execute function public._sn_b_idempotency_born_expired();`,
  restore: `drop trigger if exists _sn_b_idempotency_born_expired on workflow.idempotency;
drop function if exists public._sn_b_idempotency_born_expired();`,
  readback: `select not exists (select 1 from pg_trigger where tgname = '_sn_b_idempotency_born_expired')
     and not exists (select 1 from pg_proc where proname = '_sn_b_idempotency_born_expired');`,
};
