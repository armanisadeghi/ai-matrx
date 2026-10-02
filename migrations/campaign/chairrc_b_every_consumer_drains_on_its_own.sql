-- chair-step: NEW TABLES. This file creates custom.io_outbox_consumer and custom.io_outbox_consumption
-- (server-only: every client grant revoked; `custom` is a closed schema), a foreign key from the second to
-- custom.io_outbox (SHARE ROW EXCLUSIVE on custom.io_outbox for the instant the empty table is checked),
-- and back-fills them from io_outbox.consumed_at/consumer. The chair applies it with Arman watching.
-- No function body changes: Part A's doors already answer in both worlds and switch the moment
-- these two tables exist, in this file's own transaction. Its index sibling (custom.io_outbox's
-- (event_key, organization_id, created_at, id) index) is chairrc_c_…, CREATE INDEX CONCURRENTLY.
--
-- CHAIR · RECORD-CHANGED — PART B, PER-CONSUMER CONSUMPTION.
--
-- custom.io_outbox had ONE `consumed_at`: whichever consumer drained first took the event from every
-- other one (lane 11's D1 was the live instance — a workflow step ate context-follow's events). Each
-- consumer now keeps its own row per event it has carried, keyed (event id, consumer):
--
--   custom.io_outbox_consumer     (consumer, event_key) -> starts_at   a consumer sees events from
--                                                                     its subscription on, never a
--                                                                     backlog it never asked for
--   custom.io_outbox_consumption  (event_id, consumer)  -> consumed_at one row per event carried
--
-- THE BACKLOG IS NOT LOST. context-follow is registered from '-infinity' (its events are re-armed in
-- place, so an old created_at can be news) and every event it has consumed is copied into its own
-- consumption rows, so its backlog is what it was the instant before: proven 0 before and 0 after on
-- the clone. The `workflow:*` claims the old records.changed node made are copied too (history only;
-- no consumer of those names is registered, so nothing drains under them again).
-- `consumed_at` / `consumer` on custom.io_outbox are no longer written by any door; dropping them is a
-- later chair step once a release has run on this world.

create table custom.io_outbox_consumer (
  consumer   text        not null check (btrim(consumer) <> ''),
  event_key  text        not null check (btrim(event_key) <> ''),
  starts_at  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (consumer, event_key)
);
comment on table custom.io_outbox_consumer is
  'Server-only. One row per named consumer of a custom.io_outbox event key (custom.io_outbox_subscribe); it sees events created from starts_at on. Lane CHAIR-RECORD-CHANGED, 2026-10-02.';

create table custom.io_outbox_consumption (
  event_id        uuid        not null references custom.io_outbox (id) on delete cascade,
  consumer        text        not null,
  organization_id uuid        not null,
  consumed_at     timestamptz not null default now(),
  primary key (event_id, consumer)
);
create index io_outbox_consumption_organization_consumer_idx
  on custom.io_outbox_consumption (organization_id, consumer, consumed_at);
comment on table custom.io_outbox_consumption is
  'Server-only. One row per (custom.io_outbox event, consumer) that consumer has carried; written only by custom._io_outbox_claim, handed back by custom.io_outbox_release_claimed, cleared on re-arm by custom.io_outbox_rearm. Lane CHAIR-RECORD-CHANGED, 2026-10-02.';

-- SERVER-ONLY BY GRANT, NOT BY ROW SECURITY. `custom` is a closed schema (no PostgREST exposure) and
-- these tables hold no client grant, so no client can reach a row. Turning RLS on would add
-- platform_admin_read, whose policy statement freezes sign-in (ACCESS EXCLUSIVE on auth.users and 20+
-- relations, measured on the clone) for a table no client can see anyway.
revoke all on table custom.io_outbox_consumer from public, anon, authenticated;
revoke all on table custom.io_outbox_consumption from public, anon, authenticated;

-- context-follow: from the beginning of time, with everything it has carried.
insert into custom.io_outbox_consumer (consumer, event_key, starts_at)
values ('context-follow', 'context.follow', '-infinity');

insert into custom.io_outbox_consumption (event_id, consumer, organization_id, consumed_at)
select o.id, o.consumer, o.organization_id, o.consumed_at
  from custom.io_outbox o
 where o.consumed_at is not null
   and coalesce(btrim(o.consumer), '') <> ''
on conflict do nothing;
