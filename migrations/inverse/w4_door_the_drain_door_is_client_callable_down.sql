-- chair-step: the DOWN migration for w4_door_the_drain_door_is_client_callable.sql. It takes back the one client EXECUTE grant on custom.io_outbox_drain, puts the registry row back to `signed_in_callers = false` with the lane sentence it carried before, and restores the body to the based-on bytes (no membership check). A REVOKE on a live door, an UPDATE of a registry row, and a CREATE OR REPLACE FUNCTION that removes a check are all outside the additive allow-list, which is exactly why this is a chair step.

set lock_timeout = '5s';
set statement_timeout = '120s';

revoke execute on function custom.io_outbox_drain(uuid, text, integer, text) from authenticated;

update platform.client_callable_door
   set signed_in_callers = false,
       declared_by       = 'w4_io_the_outbox_and_its_consumer.sql',
       non_client_lane   = 'server_only: the outbox consumer is a server worker (aidream, matrx-records) and the workflow trigger node; a browser never drains a queue, because draining CLAIMS rows and a claim a client abandons is an event nobody processes.'
 where schema_name = 'custom'
   and function_name = 'io_outbox_drain';

create or replace function custom.io_outbox_drain(p_organization_id uuid,
                                       p_consumer text,
                                       p_limit integer default 100,
                                       p_event_key text default 'records.changed')
returns table(outbox_id uuid, record_id uuid, table_id uuid, operation text,
              changed_field_ids jsonb, actor jsonb, occurred_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_outbox_drain');
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'custom.io_outbox_drain: name the consumer. Two consumers draining one organization must be tellable apart, and an unnamed claim is an unrecoverable one.'
      using errcode = '22004';
  end if;

  return query
  update custom.io_outbox o
     set consumed_at = now(), consumer = p_consumer
   where o.id in (
           select c.id from custom.io_outbox c
            where c.organization_id = p_organization_id
              and c.consumed_at is null
              and c.deleted_at is null
              and c.event_key = p_event_key
            order by c.created_at, c.id
            limit greatest(1, least(coalesce(p_limit, 100), 1000))
            for update skip locked)
  returning o.id, o.record_id, o.table_id, o.operation, o.changed_field_ids, o.actor, o.created_at;
end;
$fn$;

comment on function custom.io_outbox_drain(uuid, text, integer, text) is
  'CUT-N-2: the idempotent consumer. Claims and returns in ONE statement with FOR UPDATE SKIP LOCKED, so concurrent consumers split the queue and a claimed row is never handed out twice.';
