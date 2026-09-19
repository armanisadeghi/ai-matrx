-- chair-step: an UPDATE to platform.client_callable_door (flips signed_in_callers on an existing row) and a GRANT EXECUTE to authenticated — both refused by the additive allow-list by name, exactly as the four record write doors' flip was in w4_door_the_write_client_grants.sql. This opens EXACTLY one function, custom.io_outbox_drain(uuid, text, integer, text), and nothing else in schema custom.
-- based-on: custom.io_outbox_drain(uuid, text, integer, text) 6bafc9328a1c419df349361ff3ae77ace70a0df205e1841b30502e8c5a703632
--
-- W4-DOOR — THE DRAIN DOOR BECOMES CLIENT-CALLABLE, AND IT DECIDES MEMBERSHIP FIRST.
--
-- DOOR-13 · DOOR-N-1 · AGT-N-4.
--
-- THE GAP THIS CLOSES. `custom.io_outbox_drain` is how the `records.changed` workflow
-- trigger node and any automation reads the change feed. It was declared
-- `signed_in_callers = false, non_client_lane = 'server_only'` by
-- w4_io_the_outbox_and_its_consumer.sql on the theory that only a server worker ever
-- drains a queue. That theory does not hold for a workflow that a signed-in person's own
-- organization runs from the browser (matrx-records, @ai-matrx/records-ui) with no service
-- account (AGT-N-4) — exactly the shape the four write doors were opened for in
-- w4_door_the_write_doors_are_client_callable.sql. Today a normal signed-in caller gets
-- 42501 on this function and only the role that owns custom.record can drain at all.
--
-- WHAT THE BODY ALREADY DID, MEASURED, BEFORE THIS FILE. `custom.io_outbox_drain` already
-- scopes every read and claim to `o.organization_id = p_organization_id` — a caller can
-- never see or claim another organization's outbox rows by construction of the WHERE
-- clause. What it did NOT do is decide whether THIS caller may reach p_organization_id at
-- all: `custom.assert_store_door` only asks whether the store is switched on for that
-- organization, never who is asking. A SECURITY DEFINER function applies no row-level
-- security, so — exactly as W4-DOOR's write-door file found for the four record doors —
-- opening EXECUTE without adding that decision would let any signed-in person name any
-- organization id and drain (claim, consume) its events. This file adds the same one
-- decision the write doors added, reusing the same helper rather than inventing a second
-- one: `custom.assert_client_may_reach(p_organization_id, door)`, which lets the role that
-- owns custom.record through (the server lanes) and otherwise requires
-- `iam.has_org_access(p_organization_id)` for auth.uid(), refusing 42501 by name.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE
--   · custom.io_outbox_release stays server-only. Releasing a dead consumer's claims is
--     queue maintenance with no client-facing use (a browser has no consumer name to
--     release and no way to know one died) — it is not part of "draining", and opening it
--     is not this file's job.
--   · The switch. `custom/system_enabled` still resolves false platform-wide, and
--     `custom.assert_store_door` still runs FIRST in this body. With the switch off, the
--     door refuses a signed-in caller by name before membership is even asked.
--   · `anon`, `public`, `service_role`: nothing is granted to any of them here.
--   · Any table privilege: DOOR-N-1 is unchanged, no client role holds a privilege on
--     custom.io_outbox or any other table in the schema.
--
-- THE INVERSE is `migrations/inverse/w4_door_the_drain_door_is_client_callable_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ---------------------------------------------------------------------------------------
-- 1. THE BODY, replaced to add the ONE membership decision every other client-callable
--    door in schema custom already makes. Everything else is byte-identical to the
--    based-on body.
-- ---------------------------------------------------------------------------------------

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
  -- THE MEMBERSHIP DECISION, before anything is claimed. A definer door applies no row-level
  -- security, so this is the only thing standing between a signed-in caller and another
  -- organization's outbox. Same helper the write doors use (w4_door_the_write_doors_are_client_callable.sql).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_outbox_drain');
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'custom.io_outbox_drain: name the consumer. Two consumers draining one organization must be tellable apart, and an unnamed claim is an unrecoverable one.'
      using errcode = '22004';
  end if;

  -- THE CLAIM IS THE READ. One statement, so two consumers running at the same instant split
  -- the queue rather than both taking the same rows: `for update skip locked` inside the
  -- subselect is what makes that true, and `consumed_at is null` is what makes a redelivery
  -- to a crashed consumer impossible without an explicit release.
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
  'CUT-N-2 / W4-DOOR: the idempotent consumer, and a client-callable door. Claims and returns in ONE statement with FOR UPDATE SKIP LOCKED. Switch first (custom.assert_store_door), then membership (custom.assert_client_may_reach for auth.uid()) before any row is claimed, so a signed-in caller can never drain another organization''s events.';

-- ---------------------------------------------------------------------------------------
-- 2. THE REGISTRY ROW, FLIPPED. `platform.enforce_definer_client_grants` reads this row
--    INSIDE the GRANT statement and revokes a client EXECUTE on any function whose row
--    still says no client may open it, so the flip must run BEFORE the grant below.
-- ---------------------------------------------------------------------------------------

update platform.client_callable_door d
   set signed_in_callers = true,
       non_client_lane   = null,
       identity_args     = iam.door_identity_args(p.oid),
       reason            = 'W4-DOOR / DOOR-13: the drain door, and a client-callable one. Switch first (custom.assert_store_door), then membership (custom.assert_client_may_reach for auth.uid()) before any row is claimed — a signed-in caller can read and claim only their own organization''s outbox, by the WHERE clause and by this check. custom.io_outbox_release stays server-only: it is queue maintenance for a dead consumer, not part of draining.',
       declared_by       = 'W4-DOOR-DRAIN'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'custom'
 where d.schema_name = 'custom'
   and d.function_name = 'io_outbox_drain'
   and p.proname = 'io_outbox_drain'
   and d.identity_argtypes = platform.door_argtypes(p.proargtypes);

-- ---------------------------------------------------------------------------------------
-- 3. THE GRANT, and it is exactly one function.
-- ---------------------------------------------------------------------------------------

grant execute on function custom.io_outbox_drain(uuid, text, integer, text) to authenticated;
