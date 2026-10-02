-- chair-step: this file REVOKES EXECUTE on custom.io_outbox_drain from signed-in callers (the drain
-- becomes server-only; its client_callable_door row says so first, so the closed-schema sweep does
-- not hand the grant back). Everything else is CREATE OR REPLACE of ten live bodies, NEW functions
-- (all server-only), one platform.metadata_reserved_keys row and four platform.client_callable_door
-- rows. No table DDL, no index, no trigger DDL: no ACCESS EXCLUSIVE lock on any table.
-- Its inverse puts the ten bodies back byte for byte, drops the new functions, deletes the rows
-- and re-grants the drain to authenticated.
-- based-on: custom.io_record_changed_stmt_insert() 0f0134ec1bfef8a7e7108ddc1c75c5557c60af696a9668c9ad8d0d38051d71db
-- based-on: custom.io_record_changed_stmt_update() f5c8f9c51c40d9aa6e6f826cffeb888da41415bee68daaf19e0a0e86246a764e
-- based-on: custom.io_record_changed_stmt_delete() 37c3784b052d2839154f1990737c5ba15e4720ac7b1238e199998f5f12488297
-- based-on: custom.io_outbox_drain(uuid, text, integer, text) f585d860be0ee514e741ba0de9e6c93fd1f04ab4360f0901f6a40308e894a543
-- based-on: custom.io_outbox_release(uuid, text, interval) 6cebc38214228162478b1a294f8546386d8fbfbe50ffa643de30e779907ed984
-- based-on: custom.context_compare_facts(uuid, uuid[], uuid[], jsonb) ec16f14edcf7a71ca7d6193a229e67f1d546dc170e1b8e8cd827c9d9690f033a
-- based-on: platform._cutover_seam_readiness(text, uuid) d5ea2861cbaacf68e2d5e6d1446ec7ce3404153308336f26bc65384cf1f4ad8e
-- based-on: platform._final_switch_readiness() c2d74c55edb8d2caaee2f0ce5fb28bdac5274a3069f925246a692d14f783b5da
-- based-on: platform._context_tag_follow_to_the_copy() f67a17fa7f4e8f554da0d26a30d5cf9eed6a2f8aea4b978e22646e4f47dfb841
-- based-on: context._follow_to_the_copy() 49b5e7149482971f47a10cd346c394485cc8e57f35cb8f6a0d43663e9aba08fc
--
-- CHAIR · RECORD-CHANGED (lane CHAIR-RECORD-CHANGED, 2026-10-02) — PART A, THE EVENT.
--
-- THE EVENT ALREADY HAS ONE EMITTER, AND IT IS THE RIGHT ONE. Every write door of the store —
-- custom.record_write, record_write_many, record_update, record_upsert, record_delete (archive),
-- record_restore, record_restore_version, value_restore, io_restore, the bulk import, table_move,
-- record_write_graph, and a server's own direct statement — lands on custom.record, and the three
-- statement triggers io_record_changed_s_{i,u,d} write one custom.io_outbox row per record per
-- statement (event key 'records.changed'). A door cannot forget to emit, because no door emits.
-- What the event did NOT carry is what lanes 5 and 11 asked for. This file adds it, in place:
--
--   io_outbox.metadata.change = {
--     "kind":    "create" | "update" | "archive" | "restore" | "delete",
--     "version": <the record's version after the change; before it on a hard delete>,
--     "fields":  { "<field key>": {"before": <value | null>, "after": <value | null>}, ... }
--   }                         -- the CHANGED keys only (custom.io_changed_keys, the same keys
--                             -- changed_field_ids is resolved from); {} on archive and delete
--   io_outbox.actor gains   "system": app.actor_system, "agent": app.actor_agent (when declared)
--                           "chain":  {"run_id", "root_run", "depth"} from custom.workflow_chain
--                                     (the workflow run whose step made this write), else absent
--
-- `operation` (created | updated | deleted) is unchanged: four consumers read it today
-- (activity spine, realtime notices, digests, the old records.changed node). `kind` tells archive
-- from purge and restore from create, which `operation` cannot.
--
-- The values never leave the server: custom.io_outbox has no grant to anon or authenticated, the
-- realtime notice (io_outbox_broadcast_stmt) and the NOTIFY pointer (io_outbox_announce) carry ids
-- only, and the activity spine copies field ids, never metadata. Read through the masked doors
-- when a value must reach a person.
--
-- PER-CONSUMER CONSUMPTION, WORLD-AGNOSTIC DOORS. Part B (chairrc_b_…, the chair applies it with
-- Arman watching: two new tables and an index) replaces the single `consumed_at` with
-- custom.io_outbox_consumption keyed (event id, consumer). So that no code has to ship in step with
-- a DDL apply, every door here asks custom.io_outbox_per_consumer() — "are Part B's tables there?"
-- — and answers in whichever world it is in. Callers (context-follow, the parity check, the aidream
-- record-change hook) use only these doors, never the column, and are correct before and after.
--
-- THE DRAIN IS A SERVER DOOR. It was client-callable (W4-DOOR-DRAIN): a signed-in member could
-- claim, and so take from every other consumer, their organization's whole change queue.

-- ── 0. THE METADATA KEY IS SYSTEM STATE ──────────────────────────────────────────────────────
insert into platform.metadata_reserved_keys (table_token, key, reason)
select 'io_outbox', 'change',
       'System: the record.changed event''s kind and the changed fields'' before/after values, '
       || 'stamped by the store''s own statement triggers (custom.io_record_changed_stmt_*), never by a client. '
       || 'Lane CHAIR-RECORD-CHANGED, 2026-10-02.'
where not exists (select 1 from platform.metadata_reserved_keys
                   where table_token = 'io_outbox' and key = 'change');

-- ── 1. HELPERS ───────────────────────────────────────────────────────────────────────────────

-- Are Part B's tables there? The one question every world-agnostic door asks.
create or replace function custom.io_outbox_per_consumer()
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select to_regclass('custom.io_outbox_consumption') is not null
     and to_regclass('custom.io_outbox_consumer') is not null;
$function$;

-- The automation-chain stamp: the workflow run whose step is writing. matrx-orm's session context
-- emits it at BEGIN (transaction-local, never a session SET); a run's write therefore carries it
-- and so does every write that write causes in the same transaction. Unreadable is said, not dropped.
create or replace function custom.io_workflow_chain()
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_raw text := nullif(btrim(coalesce(current_setting('custom.workflow_chain', true), '')), '');
  v     jsonb;
begin
  if v_raw is null then
    return null;
  end if;
  begin
    v := v_raw::jsonb;
  exception when others then
    raise warning '[record.changed] custom.workflow_chain is not JSON (%); the event carries it as unreadable. Fix the door that set it.', left(v_raw, 200);
    return jsonb_build_object('unreadable', left(v_raw, 500));
  end;
  if jsonb_typeof(v) <> 'object' or nullif(v ->> 'run_id', '') is null then
    raise warning '[record.changed] custom.workflow_chain names no run_id (%); the event carries it as unreadable.', left(v_raw, 200);
    return jsonb_build_object('unreadable', left(v_raw, 500));
  end if;
  return v;
end;
$function$;

-- WHO IS WRITING — a fact about the connection, asked once per statement. The four keys the event
-- always carried, then what the session declared (system, agent) and the chain, each only when set.
create or replace function custom.io_change_actor()
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select jsonb_build_object(
           'user_id', custom.query_principal(),
           'role',    custom.caller_role()::text,
           'tier',    coalesce(platform.declared_actor_tier(), platform.actor_tier()))
         || jsonb_strip_nulls(jsonb_build_object(
           'system',  nullif(platform.declared_actor_system(), ''),
           'agent',   platform.declared_actor_agent(),
           'chain',   custom.io_workflow_chain()));
$function$;

-- The changed keys' before and after, from the two documents. JSON null for a side that has none.
create or replace function custom.io_change_fields(p_keys text[], p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select coalesce(jsonb_object_agg(k, jsonb_build_object(
           'before', coalesce(p_old -> k, 'null'::jsonb),
           'after',  coalesce(p_new -> k, 'null'::jsonb))), '{}'::jsonb)
    from unnest(coalesce(p_keys, array[]::text[])) k;
$function$;

-- ── 2. THE EMITTERS — one event per record, now carrying the change ─────────────────────────

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid;
  v_actor jsonb;
  v_op    uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  -- WHO IS WRITING. A fact about the connection, not about the row.
  v_actor := custom.io_change_actor();
  v_op := nullif(current_setting('custom.op_id', true), '')::uuid;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id, metadata)
  with changed as (
    select n.organization_id, n.id, n.table_id, n.data, n.version,
           custom.io_changed_keys('{}'::jsonb, n.data) as keys
      from new_rows n
  )
  select c.organization_id, 'records.changed', c.id, c.table_id, 'created',
         case when coalesce(array_length(c.keys, 1), 0) = 0
              then '[]'::jsonb
              else coalesce((select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
                               from unnest(c.keys) k
                               join custom.applicable_fields(c.organization_id, c.table_id, null) f
                                 on (f.data ->> 'key') = k), '[]'::jsonb) end,
         v_actor || jsonb_build_object('declared', coalesce(c.data, '{}'::jsonb) ->> '_actor'),
         c.organization_id::text || ':' || c.id::text || ':' || coalesce(c.version, 0)::text || ':created',
         v_op,
         jsonb_build_object('change', jsonb_build_object(
           'kind',    'create',
           'version', c.version,
           'fields',  custom.io_change_fields(c.keys, '{}'::jsonb, c.data)))
    from changed c
   order by c.id
  on conflict do nothing;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid;
  v_actor jsonb;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  -- WHO IS WRITING, once per statement (it was asked once per row).
  v_actor := custom.io_change_actor();

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id, metadata)
  select n.organization_id, 'records.changed', n.id, n.table_id, k.op,
         -- The row trigger's `v_changed`, character for character: `[]` when no key moved,
         -- otherwise the field ids of (old.data -> new.data) — the old side is `old.data`
         -- whenever tg_op is UPDATE, which is every row here, including the restore arm.
         case when coalesce(array_length(k.keys, 1), 0) = 0
              then '[]'::jsonb
              else custom.io_changed_field_ids(n.organization_id, n.table_id,
                     o.data, coalesce(n.data, '{}'::jsonb)) end,
         v_actor || jsonb_build_object('declared', coalesce(n.data, o.data) ->> '_actor'),
         n.organization_id::text || ':' || n.id::text || ':' ||
           coalesce(n.version, o.version, 0)::text || ':' || k.op,
         nullif(current_setting('custom.op_id', true), '')::uuid,
         jsonb_build_object('change', jsonb_build_object(
           'kind',    k.kind,
           'version', coalesce(n.version, o.version),
           'fields',  custom.io_change_fields(k.keys, o.data, n.data)))
    from new_rows n
    join old_rows o
      on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral (
      select
        -- A soft delete is a DELETE to everyone downstream. An automation that fired "updated"
        -- when a record disappeared would be lying in the one case people notice.
        case when n.deleted_at is not null and o.deleted_at is null then 'deleted'
             when o.deleted_at is not null and n.deleted_at is null then 'created'
             else 'updated' end as op,
        -- THE KIND tells what `op` cannot: an archive from a purge, a restore from a create.
        case when n.deleted_at is not null and o.deleted_at is null then 'archive'
             when o.deleted_at is not null and n.deleted_at is null then 'restore'
             else 'update' end as kind,
        case when n.deleted_at is not null and o.deleted_at is null then array[]::text[]
             when o.deleted_at is not null and n.deleted_at is null
               then custom.io_changed_keys('{}'::jsonb, n.data)
             else custom.io_changed_keys(o.data, n.data) end as keys) k
   -- NO VALUE MOVED, so there is no event. Asked of the KEYS, never of the resolved Field ids.
   where not (k.op = 'updated'
              and coalesce(array_length(k.keys, 1), 0) = 0
              and o.deleted_at is not distinct from n.deleted_at)
   order by n.id
  on conflict do nothing;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid;
  v_actor jsonb;
begin
  for v_org in select distinct o.organization_id from old_rows o loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  v_actor := custom.io_change_actor();

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id, metadata)
  select o.organization_id, 'records.changed', o.id, o.table_id, 'deleted',
         -- On a delete `v_keys` is empty by construction, so the answer is `[]` whatever the
         -- join would have done — and asking anyway made a deletion event depend on the caller
         -- still being allowed to READ the Table.
         '[]'::jsonb,
         v_actor || jsonb_build_object('declared', o.data ->> '_actor'),
         o.organization_id::text || ':' || o.id::text || ':' || coalesce(o.version, 0)::text || ':deleted',
         nullif(current_setting('custom.op_id', true), '')::uuid,
         -- A HARD DELETE (the retention purge) is its own kind; no field "changed", the row is gone.
         jsonb_build_object('change', jsonb_build_object(
           'kind', 'delete', 'version', o.version, 'fields', '{}'::jsonb))
    from old_rows o
   order by o.id
  on conflict do nothing;

  return null;
end;
$function$;

-- ── 3. THE CONSUMER DOORS — server-only, correct in both worlds ─────────────────────────────

-- The server-door refusal, one sentence for every door below.
create or replace function custom._io_outbox_server_only(p_door text)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
begin
  if custom.caller_role() in ('anon', 'authenticated') then
    raise exception '% is a server door: the change queue is drained by the server''s consumers, never from a browser.', p_door
      using errcode = '42501';
  end if;
end;
$function$;

-- Has this consumer consumed this event? The one question every backlog reader asks.
create or replace function custom.io_outbox_consumed_by(p_event_id uuid, p_consumer text, p_consumed_at timestamptz)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare v boolean;
begin
  if custom.io_outbox_per_consumer() then
    execute 'select exists (select 1 from custom.io_outbox_consumption c where c.event_id = $1 and c.consumer = $2)'
       into v using p_event_id, p_consumer;
    return v;
  end if;
  return p_consumed_at is not null;
end;
$function$;

-- When this consumer last carried an event of this key (optionally for one organization).
create or replace function custom.io_outbox_last_consumed(p_consumer text, p_event_key text, p_organization_id uuid)
returns timestamptz
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare v timestamptz;
begin
  if custom.io_outbox_per_consumer() then
    execute 'select max(c.consumed_at) from custom.io_outbox_consumption c join custom.io_outbox o on o.id = c.event_id
              where c.consumer = $1 and o.event_key = $2 and ($3::uuid is null or c.organization_id = $3)'
       into v using p_consumer, p_event_key, p_organization_id;
    return v;
  end if;
  select max(o.consumed_at) into v from custom.io_outbox o
   where o.event_key = p_event_key and (p_organization_id is null or o.organization_id = p_organization_id);
  return v;
end;
$function$;

-- A re-armed event (same dedupe key, written again) is news again for EVERY consumer.
create or replace function custom.io_outbox_rearm(p_organization_id uuid, p_dedupe_key text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  if not custom.io_outbox_per_consumer() then
    return;
  end if;
  execute 'delete from custom.io_outbox_consumption c using custom.io_outbox o
            where o.organization_id = $1 and o.dedupe_key = $2 and o.deleted_at is null and c.event_id = o.id'
    using p_organization_id, p_dedupe_key;
end;
$function$;

-- The claim, Part B's world: one consumption row per (event, consumer). Two drains of the SAME
-- consumer racing pick the same candidates; the primary key lets exactly one insert land per event
-- (the loser waits on the winner's row, then does nothing), so each consumer sees each event once.
-- A DIFFERENT consumer never meets this row at all.
create or replace function custom._io_outbox_claim(p_organization_id uuid, p_consumer text,
                                                   p_event_key text, p_limit integer)
returns setof uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_start timestamptz;
begin
  if not custom.io_outbox_per_consumer() then
    raise exception 'custom._io_outbox_claim: per-consumer consumption is not installed on this database yet (custom.io_outbox_consumption). Until it is, drain with custom.io_outbox_drain.'
      using errcode = '55000';
  end if;
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'name the consumer. Two consumers draining one organization must be tellable apart, and an unnamed claim is an unrecoverable one.'
      using errcode = '22004';
  end if;
  execute 'select s.starts_at from custom.io_outbox_consumer s where s.consumer = $1 and s.event_key = $2'
     into v_start using p_consumer, p_event_key;
  if v_start is null then
    -- A FIRST DRAIN SUBSCRIBES, OUT LOUD. Every caller of the one generic drain keeps working the
    -- moment Part B lands; the consumer sees events from this transaction's start on, never a
    -- backlog it never asked for. custom.io_outbox_subscribe is the deliberate way to say it first.
    execute 'insert into custom.io_outbox_consumer (consumer, event_key) values ($1, $2)
             on conflict (consumer, event_key) do nothing'
      using p_consumer, p_event_key;
    execute 'select s.starts_at from custom.io_outbox_consumer s where s.consumer = $1 and s.event_key = $2'
       into v_start using p_consumer, p_event_key;
    raise warning '[record.changed] "%" was not subscribed to "%" events; it is now, from % on. Subscribe a consumer once with custom.io_outbox_subscribe to say so deliberately.',
      p_consumer, p_event_key, v_start;
  end if;

  return query execute
    'with picked as (
       select o.id
         from custom.io_outbox o
        where o.organization_id = $1
          and o.event_key = $3
          and o.deleted_at is null
          and o.created_at >= $5
          and not exists (select 1 from custom.io_outbox_consumption c
                           where c.event_id = o.id and c.consumer = $2)
        order by o.created_at, o.id
        limit $4)
     insert into custom.io_outbox_consumption (event_id, consumer, organization_id)
     select p.id, $2, $1 from picked p
     on conflict do nothing
     returning event_id'
    using p_organization_id, p_consumer, p_event_key,
          custom.page_size(p_organization_id, 'custom.io_outbox_drain', p_limit, 100, 1000), v_start;
end;
$function$;

-- THE DRAIN — same signature, same rows back. Server-only now; per-consumer once Part B is in.
CREATE OR REPLACE FUNCTION custom.io_outbox_drain(p_organization_id uuid, p_consumer text, p_limit integer DEFAULT 100, p_event_key text DEFAULT 'records.changed'::text)
 RETURNS TABLE(outbox_id uuid, record_id uuid, table_id uuid, operation text, changed_field_ids jsonb, actor jsonb, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom._io_outbox_server_only('custom.io_outbox_drain');
  perform custom.assert_store_door(p_organization_id, 'custom.io_outbox_drain');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_outbox_drain');
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'custom.io_outbox_drain: name the consumer. Two consumers draining one organization must be tellable apart, and an unnamed claim is an unrecoverable one.'
      using errcode = '22004';
  end if;

  -- PART B'S WORLD: each consumer drains on its own; nobody takes an event from anybody else.
  if custom.io_outbox_per_consumer() then
    return query
    select o.id, o.record_id, o.table_id, o.operation, o.changed_field_ids, o.actor, o.created_at
      from custom.io_outbox o
     where o.id in (select c from custom._io_outbox_claim(p_organization_id, p_consumer, p_event_key, p_limit) c)
     order by o.created_at, o.id;
    return;
  end if;

  -- THE ONE-COLUMN WORLD (until Part B): the claim is the read, `for update skip locked`.
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
            limit custom.page_size(p_organization_id, 'custom.io_outbox_drain', p_limit, 100, 1000)
            for update skip locked)
  returning o.id, o.record_id, o.table_id, o.operation, o.changed_field_ids, o.actor, o.created_at;
end;
$function$;

-- THE STALE-CLAIM RELEASE. In the one-column world unchanged. In Part B's world a claim IS the
-- consumption (there is no "claimed but not done" state to time out), so a consumer that failed
-- hands back exactly what it claimed with custom.io_outbox_release_claimed — never "everything
-- older than 15 minutes", which handed back every event ever carried (lane PROOF-DEFECTS D3's class).
CREATE OR REPLACE FUNCTION custom.io_outbox_release(p_organization_id uuid, p_consumer text, p_older_than interval DEFAULT '00:15:00'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_n integer;
begin
  perform custom._io_outbox_server_only('custom.io_outbox_release');
  perform custom.assert_store_door(p_organization_id, 'custom.io_outbox_release');
  if custom.io_outbox_per_consumer() then
    raise exception 'custom.io_outbox_release: each consumer now keeps its own consumption, so there is no stale claim to time out. Hand back what a failed pass claimed with custom.io_outbox_release_claimed(organization, consumer, ids).'
      using errcode = '55000';
  end if;
  -- A consumer that died mid-batch left rows claimed and unprocessed. Without this they are
  -- lost silently, which is the one failure an outbox exists to prevent. Releasing puts them
  -- back at the head of the queue; the dedupe key means a double-processed event still lands
  -- one downstream row wherever the downstream is keyed on it.
  update custom.io_outbox o
     set consumed_at = null, consumer = null
   where o.organization_id = p_organization_id
     and o.consumer = p_consumer
     and o.consumed_at is not null
     and o.consumed_at < now() - coalesce(p_older_than, interval '15 minutes');
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- Hand back exactly the events one failed pass claimed, for that consumer only.
create or replace function custom.io_outbox_release_claimed(p_organization_id uuid, p_consumer text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare v_n integer;
begin
  perform custom._io_outbox_server_only('custom.io_outbox_release_claimed');
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'custom.io_outbox_release_claimed: name the consumer whose claims are handed back.' using errcode = '22004';
  end if;
  if custom.io_outbox_per_consumer() then
    execute 'delete from custom.io_outbox_consumption c
              where c.organization_id = $1 and c.consumer = $2 and c.event_id = any($3)'
      using p_organization_id, p_consumer, coalesce(p_ids, '{}'::uuid[]);
  else
    update custom.io_outbox o
       set consumed_at = null, consumer = null
     where o.organization_id = p_organization_id
       and o.id = any(coalesce(p_ids, '{}'::uuid[]))
       and o.consumer = p_consumer;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- Which organizations hold an event this consumer has not consumed.
create or replace function custom.io_outbox_pending_organizations(p_consumer text, p_event_key text)
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom._io_outbox_server_only('custom.io_outbox_pending_organizations');
  if custom.io_outbox_per_consumer() then
    return query execute
      'select distinct o.organization_id
         from custom.io_outbox o
         join custom.io_outbox_consumer s on s.consumer = $1 and s.event_key = o.event_key
        where o.event_key = $2 and o.deleted_at is null and o.created_at >= s.starts_at
          and not exists (select 1 from custom.io_outbox_consumption c
                           where c.event_id = o.id and c.consumer = $1)'
      using p_consumer, p_event_key;
    return;
  end if;
  return query
  select distinct o.organization_id from custom.io_outbox o
   where o.event_key = p_event_key and o.consumed_at is null and o.deleted_at is null;
end;
$function$;

-- One consumer's backlog per organization: what waits (older than p_older_than), since when, and
-- when this consumer last carried one. The follow-lag check and the compare panel read this.
create or replace function custom.io_outbox_backlog(p_consumer text, p_event_key text,
                                                    p_older_than interval default '0 seconds')
returns table(organization_id uuid, waiting bigint, oldest timestamptz, last_carried timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom._io_outbox_server_only('custom.io_outbox_backlog');
  if custom.io_outbox_per_consumer() then
    return query execute
      'select o.organization_id, count(*)::bigint, min(o.created_at),
              (select max(c.consumed_at) from custom.io_outbox_consumption c
                where c.consumer = $1 and c.organization_id = o.organization_id)
         from custom.io_outbox o
         join custom.io_outbox_consumer s on s.consumer = $1 and s.event_key = o.event_key
        where o.event_key = $2 and o.deleted_at is null and o.created_at >= s.starts_at
          and o.created_at < now() - $3
          and not exists (select 1 from custom.io_outbox_consumption c
                           where c.event_id = o.id and c.consumer = $1)
        group by o.organization_id'
      using p_consumer, p_event_key, coalesce(p_older_than, interval '0 seconds');
    return;
  end if;
  return query
  select o.organization_id, count(*)::bigint, min(o.created_at),
         (select max(x.consumed_at) from custom.io_outbox x
           where x.event_key = p_event_key and x.organization_id = o.organization_id)
    from custom.io_outbox o
   where o.event_key = p_event_key and o.consumed_at is null and o.deleted_at is null
     and o.created_at < now() - coalesce(p_older_than, interval '0 seconds')
   group by o.organization_id;
end;
$function$;

-- Subscribe a consumer to an event key: it sees every event from this moment on (never the
-- backlog before it). Idempotent: a second call keeps the first start. Part B's world only.
create or replace function custom.io_outbox_subscribe(p_consumer text, p_event_key text)
returns timestamptz
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare v_start timestamptz;
begin
  perform custom._io_outbox_server_only('custom.io_outbox_subscribe');
  if coalesce(btrim(p_consumer), '') = '' or coalesce(btrim(p_event_key), '') = '' then
    raise exception 'custom.io_outbox_subscribe: name the consumer and the event key.' using errcode = '22004';
  end if;
  if not custom.io_outbox_per_consumer() then
    raise exception 'custom.io_outbox_subscribe: per-consumer consumption is not installed on this database yet (custom.io_outbox_consumption), so "%" cannot drain on its own. It waits for the chair''s Part B.', p_consumer
      using errcode = '55000';
  end if;
  execute 'insert into custom.io_outbox_consumer (consumer, event_key) values ($1, $2)
           on conflict (consumer, event_key) do nothing'
    using p_consumer, p_event_key;
  execute 'select starts_at from custom.io_outbox_consumer where consumer = $1 and event_key = $2'
     into v_start using p_consumer, p_event_key;
  return v_start;
end;
$function$;

-- THE RECORD-CHANGED DRAIN: the whole event, for one consumer, one organization, in order.
create or replace function custom.record_changes_drain(p_organization_id uuid, p_consumer text,
                                                       p_limit integer default 100)
returns table(event_id uuid, organization_id uuid, table_id uuid, record_id uuid, kind text,
              operation text, version integer, fields jsonb, changed_field_ids jsonb, actor jsonb,
              chain jsonb, op_id uuid, occurred_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom._io_outbox_server_only('custom.record_changes_drain');
  perform custom.assert_store_door(p_organization_id, 'custom.record_changes_drain');
  return query
  select o.id, o.organization_id, o.table_id, o.record_id,
         coalesce(o.metadata #>> '{change,kind}',
                  case o.operation when 'created' then 'create' when 'deleted' then 'archive' else 'update' end),
         o.operation,
         (o.metadata #>> '{change,version}')::integer,
         coalesce(o.metadata #> '{change,fields}', '{}'::jsonb),
         o.changed_field_ids, o.actor, o.actor -> 'chain', o.op_id, o.created_at
    from custom.io_outbox o
   where o.id in (select c from custom._io_outbox_claim(p_organization_id, p_consumer, 'records.changed', p_limit) c)
   order by o.created_at, o.id;
end;
$function$;

-- ── 3b. THE BACKLOG READERS AND THE RE-ARMING WRITERS ASK THE DOORS, NEVER THE COLUMN ───────
-- Character for character the live bodies, except: `consumed_at is null` becomes
-- `not custom.io_outbox_consumed_by(id, 'context-follow', consumed_at)`, `max(consumed_at)` becomes
-- custom.io_outbox_last_consumed(...), and each re-arming upsert also calls custom.io_outbox_rearm.

CREATE OR REPLACE FUNCTION custom.context_compare_facts(p_user_id uuid, p_record_ids uuid[], p_item_ids uuid[] DEFAULT NULL::uuid[], p_cells jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_records jsonb;
  v_items   jsonb;
  v_cells   jsonb;
  v_follow  jsonb;
begin
  select coalesce(jsonb_object_agg(x.id::text, jsonb_build_object(
           'in_store', exists (select 1 from custom.record r where r.id = x.id and r.deleted_at is null),
           'in_store_trash', exists (select 1 from custom.record r where r.id = x.id and r.deleted_at is not null),
           'old_readable', coalesce(context._scope_readable_for(p_user_id, x.id, 'viewer'), false))), '{}'::jsonb)
    into v_records
    from (select distinct unnest(coalesce(p_record_ids, '{}'::uuid[])) as id) x
   where x.id is not null;

  select coalesce(jsonb_object_agg(ci.id::text, jsonb_build_object(
           'old_active', ci.is_active and ci.deleted_at is null,
           'old_fetch_hint', ci.fetch_hint::text)), '{}'::jsonb)
    into v_items
    from context.context_items ci
   where ci.id = any (coalesce(p_item_ids, '{}'::uuid[]));

  -- THE CURRENT SYSTEM'S VERSION OF EACH CELL BOTH SIDES DELIVER, so a changed value can be
  -- classed as the copy catching up (old written later) or not.
  select coalesce(jsonb_object_agg((c ->> 'item_id') || ':' || (c ->> 'scope_id'), jsonb_build_object(
           'old_version', v.version, 'old_written_at', v.created_at)), '{}'::jsonb)
    into v_cells
    from jsonb_array_elements(coalesce(p_cells, '[]'::jsonb)) c
    join context.context_item_values v
      on v.context_item_id = (c ->> 'item_id')::uuid
     and v.scope_id = (c ->> 'scope_id')::uuid
     and v.is_current;

  -- THE FOLLOW'S LAG (P8, lane SC-2'): what the old-wins follow has not applied yet. Until
  -- SC-2' lands the follow there is no `context.follow` row at all, and the page says so.
  select jsonb_build_object(
           'running', exists (select 1 from custom.io_outbox o where o.event_key = 'context.follow'),
           'pending', count(*) filter (where not custom.io_outbox_consumed_by(o.id, 'context-follow', o.consumed_at)),
           'oldest_pending_at', min(o.created_at) filter (where not custom.io_outbox_consumed_by(o.id, 'context-follow', o.consumed_at)),
           'last_applied_at', custom.io_outbox_last_consumed('context-follow', 'context.follow', null))
    into v_follow
    from custom.io_outbox o
   where o.event_key = 'context.follow';

  return jsonb_build_object('records', v_records, 'items', v_items, 'cells', v_cells, 'follow', v_follow);
end;
$function$;

CREATE OR REPLACE FUNCTION platform._cutover_seam_readiness(p_seam text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s platform.cutover_seam;
  v_checks jsonb := '[]'::jsonb;
  v_n bigint; v_c bigint; v_missing bigint; v_stale bigint; v_lag bigint;
  v_tn bigint; v_tc bigint; v_sn bigint; v_sc bigint; v_in bigint; v_ic bigint;
  v_names text;
  v_pre jsonb;
  v_count jsonb;
  v_any bigint; v_hooks bigint;
  v_ev jsonb;
  v_diff jsonb;
  v_part jsonb;
  v_rest text;
  v_ln bigint; v_lc bigint; v_lmiss bigint; v_lnames text;
  v_rm jsonb; v_rmn bigint;
begin
  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'known', 'says', 'This switch exists', 'met', false,
                         'detail', format('There is no switch called %s.', p_seam))));
  end if;

  if s.press_kind = 'platform_switch' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'pressed_here', 'says', 'Switched for one organization', 'met', false,
                         'detail', 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.')));
  elsif s.press_kind = 'already_switched' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'already', 'says', 'Already on the new system', 'met', true,
                         'detail', s.flip_does)));
  end if;

  if p_seam = 'older_tables' then
    -- ONE COUNT, shared with the mover's census (lane CUTOVER-CENSUS): the organization's live
    -- older tables against their live same-id copies; archived older tables and the option lists
    -- the app keeps are never counted on either side.
    v_count := platform.cutover_tables_copied(p_org);
    v_n := (v_count ->> 'older_live')::bigint;
    v_c := (v_count ->> 'copied')::bigint;
    v_missing := (v_count ->> 'rows_missing')::bigint;
    v_stale := (v_count ->> 'rows_stale')::bigint;
    select string_agg(x, ', ' order by x) into v_names
      from jsonb_array_elements_text(v_count -> 'not_yet') x;

    -- MOVER-CARRY-TAILS: every check of this switch says how many of its differences copying again
    -- clears (copy_again_clears) and how many it leaves (copy_again_leaves); the settings card offers
    -- "Copy again" only when one unmet check has something it clears, and each sentence says what to
    -- do about the rest instead.
    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every table is copied into the new system', 'met', v_c = v_n,
      'copy_again_clears', greatest(v_n - v_c, 0), 'copy_again_leaves', 0,
      'detail', case when v_n = 0 then 'This organization has no older tables left.'
                     else format('%s of %s tables copied.', v_c, v_n)
                          || case when v_c < v_n then ' Not yet: ' || v_names || case when v_n - v_c > 5 then format(' and %s more', v_n - v_c - 5) else '' end || '.' else '' end end);

    -- LISTS-AFTER-SWITCH: the press archives the organization's live older pick lists too, and
    -- refuses (rolled back whole) when a list's Table-of-choices copy or any live choice is not in
    -- the store. Said here, before the press, with Copy again offered to bring them.
    select count(*), count(t.id),
           -- CHOICE-COLUMN-EDIT, 2026-09-27: a choice is "not in its copy" when the copy has no
           -- option with its id AT ALL. It used to be a count (older live choices minus the copy's
           -- live ones), so a choice a person RETIRED on the copy counted as not copied forever
           -- (Copy again cannot bring back what a person removed) and one a person ADDED hid a
           -- genuinely missing one. An edit made in the new system is neither.
           coalesce(sum((select count(*) from workbench.udt_structured_list_items i
                          where i.list_id = l.id and i.deleted_at is null
                            and not exists (select 1 from custom.record c
                                             where c.organization_id = l.organization_id and c.table_id = l.id
                                               and c.id = i.id and c.data_class = 'record'))), 0),
           string_agg(case when t.id is null then coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') end, ', '
                      order by l.list_name)
      into v_ln, v_lc, v_lmiss, v_lnames
      from workbench.udt_structured_lists l
      left join custom.record t
        on t.organization_id = l.organization_id and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'lists_copied', 'says', 'Every pick list is copied into the new system',
      'met', v_lc = v_ln and v_lmiss = 0,
      'copy_again_clears', greatest(v_ln - v_lc, 0) + v_lmiss, 'copy_again_leaves', 0,
      'detail', case when v_ln = 0 then 'This organization has no older pick lists left.'
                     when v_lc = v_ln and v_lmiss = 0 then format('%s of %s pick lists copied, every choice in its copy.', v_lc, v_ln)
                     else format('%s of %s pick lists copied.', v_lc, v_ln)
                          || case when v_lnames is not null then ' Not yet: ' || v_lnames || '.' else '' end
                          || case when v_lmiss > 0 then format(' %s choices are not in their copies yet.', v_lmiss) else '' end
                          || ' Copying again brings them.' end);

    -- MOVER-DELETIONS: what the older side REMOVED since the copy — a row, a column, a list's choice,
    -- a whole table or list — that its copy still holds, and what the rerun archived whose older
    -- original is back. The rerun (platform.cutover_carry_removals) archives each on the copy, never a
    -- hard delete; until it runs, the switch would bring each one back to life.
    v_rm := platform.cutover_older_removals(p_org);
    v_rmn := coalesce((v_rm ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'removals_carried', 'says', 'Nothing removed from an older table or list is still on its copy',
      'met', v_rmn = 0, 'counts', v_rm -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     then 'Every row, column, choice, table and list removed on the older side is gone from its copy too, and no copy has a choice its older list never had.'
                     else format('%s %s the older side does not have %s still on the copies: %s. Copying again archives %s on the copies (restorable, never deleted).',
                                 v_rmn, case when v_rmn = 1 then 'thing' else 'things' end,
                                 case when v_rmn = 1 then 'is' else 'are' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_rm -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);

    v_checks := v_checks
      || jsonb_build_object('key', 'rows_present', 'says', 'No row is missing from a copy',
           'met', v_missing = 0, 'copy_again_clears', v_missing, 'copy_again_leaves', 0,
           'detail', case when v_missing = 0 then 'Every row of every copied table is in its copy.'
                          else format('%s rows are not in their copies yet. Copying the table again brings them.', v_missing) end)
      || jsonb_build_object('key', 'rows_current', 'says', 'No row was edited in an older table after it was copied',
           'met', v_stale = 0, 'copy_again_clears', v_stale, 'copy_again_leaves', 0,
           'detail', case when v_stale = 0 then 'Every copy is as current as its older table.'
                          else format('%s rows were edited in the older tables after they were copied. Copying again brings the edits.', v_stale) end);

    -- WHAT THE COPIES WOULD SHOW DIFFERENTLY (CUTOVER-READINESS). The rows checks above never looked
    -- at a table's colours, its columns' checks and formats, or who it is shared with, so the switch
    -- could show a copy that looks, refuses and opens differently from the older table while saying
    -- "ready". Each is compared here as the switch will leave the copy, and each difference is named.
    v_diff := platform.cutover_copy_differences(p_org);
    foreach v_rest in array array['colours', 'checks', 'formats', 'shares'] loop
      v_part := coalesce(v_diff -> v_rest, '{}'::jsonb);
      v_checks := v_checks || jsonb_build_object(
        'key', v_rest || '_match',
        'says', case v_rest when 'colours' then 'Every copy shows the colours its older table shows'
                            when 'checks' then 'No copy refuses a write its older table takes'
                            when 'formats' then 'Every column means on its copy what it means on its older table'
                            else 'Every copy is shared exactly as its older table' end,
        'met', coalesce((v_part ->> 'count')::int, 0) = 0,
        'counts', v_diff -> v_rest,
        'copy_again_clears', coalesce((v_part ->> 'clears')::int, 0),
        'copy_again_leaves', greatest(coalesce((v_part ->> 'count')::int, 0) - coalesce((v_part ->> 'clears')::int, 0), 0),
        'detail', platform.cutover_difference_sentence(v_rest, v_part));
    end loop;

    -- WHAT THE SWITCH REPLACES FIRST (COPY-WRITABLE). People may test the copies while the switch
    -- is off; the switch puts every row they changed back to the older table's version and
    -- archives the rows they added, and logs the counts. Always met: it is what the press does,
    -- said before it is pressed.
    v_ev := v_count -> 'evaluation';
    v_checks := v_checks
      || jsonb_build_object('key', 'test_edits_replaced', 'says', 'Test edits on the copies are replaced by the older tables first',
           'met', true,
           'counts', v_ev,
           'detail', case when coalesce((v_ev ->> 'rows')::bigint, 0) = 0
                          then 'Nobody has changed a copy while testing; nothing is replaced.'
                          else format('%s %s changed while testing, in %s %s: %s edited %s put back to the older table''s version, %s added %s archived (never deleted), %s table or column %s put back. Each table''s counts are kept in a log.',
                                      v_ev ->> 'rows', case when (v_ev ->> 'rows')::bigint = 1 then 'row was' else 'rows were' end,
                                      v_ev ->> 'tables', case when (v_ev ->> 'tables')::bigint = 1 then 'table' else 'tables' end,
                                      v_ev ->> 'edited', case when (v_ev ->> 'edited')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'added', case when (v_ev ->> 'added')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'settings', case when (v_ev ->> 'settings')::bigint = 1 then 'setting is' else 'settings are' end) end);

    -- What the switch cannot carry by itself (CUTOVER-PLAN D8, F19): an automation on "any older
    -- table" names no table to follow, and an outbound webhook subscribed to older row events has
    -- no copy to listen to. Either would go silent at the switch, so each holds it back, named.
    select count(*) into v_any from scheduler.sch_trigger t
     where t.organization_id = p_org and t.deleted_at is null and t.enabled and t.type = 'event'
       and t.config ->> 'entity_type' = 'user_table_row' and coalesce(t.config ->> 'table_id', '') = '';
    select count(*) into v_hooks from files.webhooks w
     where w.organization_id = p_org and w.is_active
       and w.event_types && array['row.created','row.updated','row.deleted','row.archived','row.restored']::text[];
    v_checks := v_checks
      || jsonb_build_object('key', 'automations_follow', 'says', 'Every "when a row changes" automation names its table',
           'met', v_any = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_any,
           'detail', case when v_any = 0 then 'Each one moves to its table''s copy at the switch and back with Switch back.'
                          else format('%s automations run on a change to any older table. Pick the table each one watches first, so it can follow it.', v_any) end)
      || jsonb_build_object('key', 'webhooks_follow', 'says', 'No outbound webhook listens for older-table row changes',
           'met', v_hooks = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_hooks,
           'detail', case when v_hooks = 0 then 'Nothing outside the platform is waiting on older-table changes.'
                          else format('%s outbound webhooks still listen for older-table row changes. Point each at its table''s changes in the new system first.', v_hooks) end);

  elsif p_seam = 'agent_context' then
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_tn, v_tc
      from context.scope_types t
      left join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org and t.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_sn, v_sc
      from context.scopes x
      join context.scope_types t on t.id = x.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = x.id
     where x.organization_id = p_org and x.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_in, v_ic
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = i.id
     where t.organization_id = p_org and i.deleted_at is null and i.is_active;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every scope type, scope and context field is copied',
      'met', v_tc = v_tn and v_sc = v_sn and v_ic = v_in,
      'detail', case when v_tn = 0 then 'This organization has no scopes.'
                     else format('%s of %s scope types, %s of %s scopes, %s of %s context fields copied.',
                                 v_tc, v_tn, v_sc, v_sn, v_ic, v_in) end);

    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and not custom.io_outbox_consumed_by(x.id, 'context-follow', x.consumed_at) and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  if p_seam = 'scopes_screens' then
    -- SCOPES-ROWS-COPIED (2026-09-28). (−1) EVERY ROW IS IN THE STORE, BY ID, COUNTED AS THE OWNER. The
    -- parity check below is a compare through a test seat, and a seat sees only the organizations it
    -- belongs to: Titanium's 843 Tag scopes with no Record read as "0 defects" and ready. This counts
    -- every live older row with no live store twin — scope types, context items, scopes (Tag scopes
    -- named apart), current values and "<kind> -> scope" tags — for this organization, whoever asks.
    v_part := platform.cutover_scope_rows_copied(p_org);
    v_rmn := coalesce((v_part ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'rows_copied', 'says', 'Every scope row is in the new system',
      'met', v_rmn = 0, 'counts', v_part -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'measured_at', v_part -> 'measured_at',
      'detail', case when v_rmn = 0
                     then format('Every scope type, context field, scope, current value and tag is in the new system (%s scopes, %s tags counted by id).',
                                 v_part -> 'live' ->> 'scopes', v_part -> 'live' ->> 'tag_edges')
                     else (select string_agg(x, '; ') from jsonb_array_elements_text(v_part -> 'examples') x)
                          || case when jsonb_array_length(v_part -> 'by_type') > 5
                                  then format(' and %s more scope types', jsonb_array_length(v_part -> 'by_type') - 5) else '' end
                          || '. Copying again brings them.' end);
    -- SCOPES-TAILS. (0) EVERY WORD A SCOPE TYPE OR A CONTEXT FIELD SAYS ABOUT ITSELF IS ON ITS COPY: a
    -- type's description and sort order, a field's category, tags and status note. Copying again
    -- brings each one; Switch back carries the copy's words back to the current screens.
    v_part := platform.cutover_scope_own_words(p_org);
    v_rmn := coalesce((v_part ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'own_words_copied', 'says', 'Every scope type''s, context field''s and scope''s own words are on its copy',
      'met', v_rmn = 0, 'counts', v_part -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     -- SCOPES-STORE-HOMES: every word the old screens read, at its home in the store.
                     then 'Every scope type''s description, order, assignment limit and suggested variables; every context field''s description, status, status note, category, tags, item limit, custom component, dataset source and allowed types; and every scope''s slug and order is on its copy.'
                     else format('%s %s what the current screens show: %s. Copying again brings %s.',
                                 v_rmn, case when v_rmn = 1 then 'copy does not say' else 'copies do not say' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_part -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);
    -- SCOPES-WRITE-THROUGH. (1) THE COPY HAS EVERY EDIT: no follow row waiting for this organization.
    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and not custom.io_outbox_consumed_by(x.id, 'context-follow', x.consumed_at) and x.deleted_at is null;
    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
    -- (2) PARITY: the newest context parity run for this organization found no defect, and nothing
    -- changed in its scopes after that run.
    declare
      m platform.cutover_seam_measure;
      v_changed timestamptz;
    begin
      -- NOTHING TO COMPARE IS MET (found by lane FINAL-SWITCH's rehearsal): an organization with no
      -- live scope type hands every agent nothing on both systems, so there is no parity to measure,
      -- and the switch must never hold it for want of a measurement.
      if not exists (select 1 from context.scope_types t where t.organization_id = p_org and t.deleted_at is null) then
        v_checks := v_checks || jsonb_build_object(
          'key', 'parity', 'says', 'Agents are handed the same context by both systems', 'met', true,
          'detail', 'This organization has no scopes: both systems hand an agent nothing, so there is nothing to compare.');
      else
      select * into m from platform.cutover_seam_measure x
       where x.seam_key = 'scopes_screens' and x.organization_id = p_org and x.key = 'parity'
       order by x.measured_at desc limit 1;
      select greatest(
               (select max(t.updated_at) from context.scope_types t where t.organization_id = p_org),
               (select max(sc.updated_at) from context.scopes sc where sc.organization_id = p_org),
               (select max(i.updated_at) from context.context_items i join context.scope_types t on t.id = i.scope_type_id where t.organization_id = p_org),
               (select max(v.created_at) from context.context_item_values v join context.scopes sc on sc.id = v.scope_id where sc.organization_id = p_org))
        into v_changed;
      v_checks := v_checks || jsonb_build_object(
        'key', 'parity', 'says', 'Agents are handed the same context by both systems',
        'met', m.id is not null and m.met and (v_changed is null or m.measured_at >= v_changed),
        'measured_at', m.measured_at,
        'detail', case when m.id is null
                         then 'Not measured yet for this organization: uv run python scripts/context_parity.py --organization ' || p_org::text || ' --record (aidream).'
                       when not m.met then m.says
                       when v_changed is not null and m.measured_at < v_changed
                         then format('Measured %s, but this organization''s scopes changed after that (%s); measure again.', m.measured_at, v_changed)
                       else m.says end);
      end if;
    end;
  end if;

  for v_pre in select * from jsonb_array_elements(s.prerequisites) loop
    v_checks := v_checks || jsonb_build_object(
      'key', v_pre ->> 'key', 'says', v_pre ->> 'says',
      'met', coalesce((v_pre ->> 'met')::boolean, false),
      'detail', v_pre ->> 'evidence',
      -- When a measured fact was last measured (the census writes it; every release re-runs it).
      'measured_at', v_pre ->> 'measured_at');
  end loop;

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'met')::boolean),
    'checked_at', now(),
    'checks', v_checks);
end;
$function$;

CREATE OR REPLACE FUNCTION platform._final_switch_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_last platform.cutover_seam_press;
  v_state text;
  v_platform jsonb := '[]'::jsonb;
  v_orgs jsonb := '[]'::jsonb;
  v_orgs_a jsonb[] := '{}'::jsonb[];
  v_scopes_landed boolean;
  v_blocking jsonb := '[]'::jsonb;
  v_need jsonb := '[]'::jsonb;
  v_undo jsonb := '[]'::jsonb;
  v_pre_keys text[];
  o record;
  c jsonb;
  r jsonb;
  rc jsonb;
  rs jsonb;
  v_clears jsonb;
  v_cannot jsonb;
  v_ctx jsonb;
  v_ctx_left jsonb;
  v_ctx_at timestamptz;
  v_ctx_need jsonb := '[]'::jsonb;
  v_orgs_ctx int := 0;
  v_t_state text; v_c_state text;
  v_t_at timestamptz; v_c_at timestamptz;
  v_tl bigint; v_ll bigint; v_st bigint; v_lag bigint;
  v_n bigint; v_names text;
  v_scopes jsonb;
  v_scopes_code boolean;
  v_x jsonb;
  v_rr jsonb;
  v_now_press uuid;
  v_platform_ok boolean;
  v_copy_pending boolean := false;
  v_orphans jsonb;
  v_adopt int := 0;
  v_noowner int := 0;
  v_copy jsonb;
  v_orgs_blocked int := 0; v_orgs_need int := 0; v_orgs_ready int := 0; v_orgs_switch int := 0;
  v_sw jsonb;
begin
  v_last := platform._final_switch_last();
  v_state := coalesce(v_last.direction, 'old');

  -- ── the platform's own checks ─────────────────────────────────────────────────────────────────
  -- (a) The Data tables switch's measured facts (the cutover census): the same for every
  -- organization, so said once here and left out of each organization's list.
  select coalesce(array_agg(p ->> 'key'), '{}'::text[]) into v_pre_keys
    from platform.cutover_seam s, jsonb_array_elements(s.prerequisites) p
   where s.seam_key = 'older_tables';
  for c in select p from platform.cutover_seam s, jsonb_array_elements(s.prerequisites) p
            where s.seam_key = 'older_tables' loop
    v_platform := v_platform || jsonb_build_object(
      'key', c ->> 'key', 'says', c ->> 'says', 'met', coalesce((c ->> 'met')::boolean, false),
      'detail', c ->> 'evidence', 'measured_at', c ->> 'measured_at',
      'fix', 'The cutover census re-measures with every release (census.ts --record); it turns green when every place it names reads the switch.');
  end loop;

  -- (b) Older tables and pick lists that belong to no organization: no organization's switch
  -- reaches them, so they would stay live in the older store.
  -- FINAL-SWITCH (b): the press resolves them itself (coordinator ruling 2026-09-27). A list whose maker
  -- belongs to exactly one organization goes to that organization at Copy again (then it is copied and
  -- archived like the rest); every other one is archived by the press with no owner organization,
  -- named in its record and restorable by the Undo.
  v_orphans := platform._final_switch_orphan_lists();
  select count(*) filter (where x ->> 'resolution' = 'organization'), count(*) filter (where x ->> 'resolution' = 'no_owner')
    into v_adopt, v_noowner from jsonb_array_elements(v_orphans) x;
  v_platform := v_platform || jsonb_build_object(
    'key', 'orphan_lists', 'says', 'Every older pick list with no organization has somewhere to go',
    'met', v_adopt = 0, 'copy_again_clears', true,
    'detail', case when jsonb_array_length(v_orphans) = 0 then 'No older pick list is outside an organization.'
                   else concat_ws(' ',
                     case when v_adopt > 0 then format('%s %s to %s maker''s one organization at Copy again: %s.',
                       v_adopt, case when v_adopt = 1 then 'goes' else 'go' end, case when v_adopt = 1 then 'its' else 'their' end,
                       (select string_agg(format('%s → %s', x ->> 'name', x ->> 'organization_name'), '; ' order by x ->> 'name')
                          from jsonb_array_elements(v_orphans) x where x ->> 'resolution' = 'organization')) end,
                     case when v_noowner > 0 then format('%s %s archived by the press with no owner organization, restorable by Undo: %s.',
                       v_noowner, case when v_noowner = 1 then 'is' else 'are' end,
                       (select string_agg(format('%s (%s)', x ->> 'name', x ->> 'why'), '; ' order by x ->> 'name')
                          from jsonb_array_elements(v_orphans) x where x ->> 'resolution' = 'no_owner')) end) end,
    'fix', 'Copy again on this page gives each its maker''s organization; the press archives the rest.');
  select count(*), string_agg(coalesce(nullif(btrim(d.table_name), ''), 'Untitled table'), '; ' order by d.table_name)
    into v_n, v_names
    from workbench.udt_datasets d
   where d.organization_id is null and d.deleted_at is null;
  v_platform := v_platform || jsonb_build_object(
    'key', 'orphan_tables', 'says', 'Every older table belongs to an organization',
    'met', v_n = 0,
    'detail', case when v_n = 0 then 'No older table is outside an organization.'
                   else format('%s older %s no organization: %s.', v_n,
                               case when v_n = 1 then 'table belongs to' else 'tables belong to' end, v_names) end,
    'fix', 'Give each an organization or archive it.');

  -- (c) The scope and context screens switch (lane SCOPES-WRITE-THROUGH) has its code.
  v_scopes_code := platform._final_switch_scopes_code() <> 'none';
  v_platform := v_platform || jsonb_build_object(
    'key', 'scopes_seam_has_code', 'says', 'The scope and context screens switch has its code',
    'met', v_scopes_code,
    'detail', case platform._final_switch_scopes_code()
                   when 'landed' then 'The scope and context screens switch is pressed for every organization, through its own door; each organization''s scopes readiness is below.'
                   when 'rehearsal_stand_in' then 'Rehearsal on the dev clone: the scope and context screens switch is stood in for.'
                   else 'The scope and context screens switch has no code yet: every scope screen, picker, tag and template still writes the current tables, and the agents'' write-back still goes to them. Lane SCOPES-WRITE-THROUGH is building it; the final switch waits for it.' end,
    'fix', 'Lane SCOPES-WRITE-THROUGH lands its switch (the seam per organization, platform.cutover_seam_press_everyone).');

  -- (d) The last Copy again (its own step on the page, never inside the press) finished green.
  v_copy := platform._final_switch_copy_again_state();
  v_platform := v_platform || jsonb_build_object(
    'key', 'copy_again_finished', 'says', 'The last Step 1 (Copy again and the context copy) finished green',
    'met', v_copy is null or ((v_copy ->> 'finished')::boolean and (v_copy ->> 'ok')::boolean),
    'copy_again_clears', true,
    'detail', case when v_copy is null then 'Step 1 has not run from this page yet; it runs when something below needs it.'
                   when not (v_copy ->> 'finished')::boolean then
                     format('Step 1, started %s by %s, has not finished (%s of its organizations done). Resume it.',
                            to_char((v_copy ->> 'started_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'),
                            coalesce(v_copy ->> 'by', 'someone'), v_copy ->> 'organizations_done')
                   when not (v_copy ->> 'ok')::boolean then
                     format('The last Step 1 finished with refusals: %s. Run Step 1 again.',
                            coalesce((select string_agg(x ->> 'name' || ' — ' || coalesce(x ->> 'says', ''), '; ')
                                        from jsonb_array_elements(v_copy -> 'organizations') x where not (x ->> 'ok')::boolean), 'see its record'))
                   else format('The last Step 1 finished green at %s.',
                               to_char((v_copy ->> 'finished_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')) end,
    'fix', 'Step 1 on this page (it resumes where it stopped).');

  -- A platform check Copy again clears holds the press but is not a blocker a person must fix.
  v_platform_ok := not exists (select 1 from jsonb_array_elements(v_platform) p
                                where not (p ->> 'met')::boolean and not coalesce((p ->> 'copy_again_clears')::boolean, false));
  v_copy_pending := exists (select 1 from jsonb_array_elements(v_platform) p
                             where not (p ->> 'met')::boolean and coalesce((p ->> 'copy_again_clears')::boolean, false));
  for c in select p from jsonb_array_elements(v_platform) p
            where not (p ->> 'met')::boolean and not coalesce((p ->> 'copy_again_clears')::boolean, false) loop
    -- FINAL-SWITCH-2: a check's `says` is its met-form name; an unmet one is said as not true yet.
    v_blocking := v_blocking || to_jsonb(format('The platform — not yet: %s: %s',
      case when c ->> 'says' ~ '^[A-Z][a-z]' then lower(left(c ->> 'says', 1)) || substr(c ->> 'says', 2) else c ->> 'says' end,
      rtrim(coalesce(c ->> 'detail', ''), '.')));
  end loop;

  -- ── every organization with anything old, or a switch pressed ─────────────────────────────────
  -- FINAL-SWITCH-2: read in time. Once the scopes press listed every organization (1,635 on
  -- 2026-09-29) this function took 8.2–8.5 s on production, over the 8 s a signed-in page's statement
  -- may run, so the Final switch page failed to load one time in two. Every organization's own facts
  -- (both switches' last press, live counts, waiting edits) are read in this one statement instead of
  -- seven per organization, the scopes switch's code is asked once, and the list is built as an array
  -- (appending to a jsonb array copies it every time: 0.8 s for 1,635 rows).
  v_scopes_landed := platform._final_switch_scopes_code() = 'landed';
  -- READINESS-PARITY (2026-10-01, SAFETY-NET W1): an organization whose scopes are written in the store
  -- first has no scopes_screens readiness below (its writer is the store), so a write to context.*
  -- outside the doors left the two sides different while this read Ready (Alex Hart's Workspace →
  -- Classes, "Biology 101 — Live Test", 2026-10-01 05:03Z). Every store-writer organization's live
  -- scopes are compared with its live Records by id, both directions, per scope type, in ONE set-based
  -- read (platform.cutover_store_writer_scope_parity, ~0.2 s for every organization), keyed by organization.
  select coalesce(jsonb_object_agg(z.k, z.v), '{}'::jsonb) into v_sw
    from (select x ->> 'organization_id' as k, jsonb_agg(x order by x ->> 'scope_type', x ->> 'scope_type_id') as v
            from jsonb_array_elements(platform.cutover_store_writer_scope_parity()) x
           group by 1) z;
  for o in
    select x.id, x.name::text as name, x.created_at, x.archived_at,
           coalesce(lt.direction, 'old') as t_state, lt.pressed_at as t_at,
           coalesce(lc.direction, 'old') as c_state, lc.pressed_at as c_at,
           (select count(*) from workbench.udt_datasets d where d.organization_id = x.id and d.deleted_at is null) as tl,
           (select count(*) from workbench.udt_structured_lists l where l.organization_id = x.id and l.deleted_at is null) as ll,
           (select count(*) from context.scope_types t where t.organization_id = x.id and t.deleted_at is null) as st,
           (select count(*) from custom.io_outbox q
             where q.organization_id = x.id and q.event_key = 'context.follow'
               and not custom.io_outbox_consumed_by(q.id, 'context-follow', q.consumed_at) and q.deleted_at is null) as lag
      from iam.organizations x
      left join lateral platform._cutover_seam_last_done('older_tables', x.id) lt on true
      left join lateral platform._cutover_seam_last_done('agent_context', x.id) lc on true
     where exists (select 1 from workbench.udt_datasets d where d.organization_id = x.id and d.deleted_at is null)
        or exists (select 1 from workbench.udt_structured_lists l where l.organization_id = x.id and l.deleted_at is null)
        or exists (select 1 from context.scope_types t where t.organization_id = x.id and t.deleted_at is null)
        or exists (select 1 from platform.cutover_seam_press p
                    where p.organization_id = x.id and p.outcome = 'done'
                      and p.seam_key in ('older_tables', 'agent_context'))
     order by x.created_at, x.id
  loop
    v_t_state := o.t_state; v_t_at := o.t_at; v_c_state := o.c_state; v_c_at := o.c_at;
    v_tl := o.tl; v_ll := o.ll; v_st := o.st; v_lag := o.lag;
    v_clears := '[]'::jsonb; v_cannot := '[]'::jsonb; v_ctx := '[]'::jsonb; r := null; rc := null;
    -- FINAL-SWITCH (d): what Step 1's context copy for this organization LEFT the last time it ran
    -- (the checks still unmet when it read readiness back after copying), in the latest FINISHED run.
    -- A check the copy already ran and could not clear is not the copy's to clear again: it blocks.
    v_ctx_left := null; v_ctx_at := null;
    if v_copy is not null and (v_copy ->> 'finished')::boolean then
      select z.did -> 'report' -> 'context' -> 'left', (z.did -> 'report' -> 'context' ->> 'finished_at')::timestamptz
        into v_ctx_left, v_ctx_at
        from platform.cutover_seam_press z
       where z.seam_key = 'final_switch_copy_again' and (z.did ->> 'run')::uuid = (v_copy ->> 'run_id')::uuid
         and z.did ->> 'event' = 'organization' and z.organization_id = o.id
         and coalesce((z.did -> 'report' -> 'context' ->> 'ran')::boolean, false)
       order by z.pressed_at desc limit 1;
    end if;

    if v_tl + v_ll > 0 then
      r := platform._cutover_seam_readiness('older_tables', o.id);
      for c in select x from jsonb_array_elements(r -> 'checks') x
                where not (x ->> 'met')::boolean and not ((x ->> 'key') = any (v_pre_keys)) loop
        if coalesce((c ->> 'copy_again_clears')::bigint, 0) > 0 and coalesce((c ->> 'copy_again_leaves')::bigint, 0) = 0 then
          v_clears := v_clears || jsonb_build_object('switch', 'Data tables', 'key', c ->> 'key', 'says', c ->> 'says',
                                                     'detail', c ->> 'detail', 'clears', (c ->> 'copy_again_clears')::bigint);
        else
          v_cannot := v_cannot || jsonb_build_object('switch', 'Data tables', 'key', c ->> 'key', 'says', c ->> 'says',
                                                     'detail', c ->> 'detail',
                                                     'clears', coalesce((c ->> 'copy_again_clears')::bigint, 0),
                                                     'leaves', coalesce((c ->> 'copy_again_leaves')::bigint, 1));
        end if;
      end loop;
    end if;

    if v_c_state = 'old' and v_st > 0 then
      rc := platform._cutover_seam_readiness('agent_context', o.id);
      for c in select x from jsonb_array_elements(rc -> 'checks') x
                where not (x ->> 'met')::boolean and x ->> 'key' <> 'follow_current' loop
        -- FINAL-SWITCH (d): the context copy lands every scope type, scope and context field it is
        -- missing (the runner's --copy-context), so "not everything is copied" is Step 1's to clear.
        if c ->> 'key' = 'copied' and not coalesce(v_ctx_left ? 'agent_context.copied', false) then
          v_ctx := v_ctx || jsonb_build_object('switch', 'Where agents get their context', 'key', 'agent_context.copied',
                                               'says', c ->> 'says', 'detail', c ->> 'detail');
        else
          v_cannot := v_cannot || jsonb_build_object('switch', 'Where agents get their context', 'key', c ->> 'key',
                                                     'says', c ->> 'says',
                                                     'detail', rtrim(coalesce(c ->> 'detail', ''), '.')
                                                               || case when v_ctx_left ? 'agent_context.copied' and c ->> 'key' = 'copied'
                                                                       then format('. The context copy ran at %s and left it.', to_char(v_ctx_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')) else '' end,
                                                     'clears', 0, 'leaves', 1);
        end if;
      end loop;
    end if;
    -- The scope screens, once their switch has landed: each organization's own readiness.
    if v_scopes_landed and v_st > 0 then
      execute 'select case custom.context_writer($1) when ''store'' then null else platform._cutover_seam_readiness(''scopes_screens'', $1) end'
         into rs using o.id;
      for c in select x from jsonb_array_elements(coalesce(rs -> 'checks', '[]'::jsonb)) x
                where not (x ->> 'met')::boolean and x ->> 'key' <> 'follow_current' loop
        -- FINAL-SWITCH (d), from SCOPES-TAILS' own_words_copied (coordinator 2026-09-27): a scope
        -- type's or context field's own words not on its copy are brought by the context copy; the
        -- parity measurement is taken again by Step 1 right after that copy. Both are Step 1's to
        -- clear — unless Step 1 already copied this organization and the check was still unmet after.
        -- SCOPES-ROWS-COPIED (2026-09-28): a row with no store twin (rows_copied) is the context copy's
        -- to land, so it is Step 1's too, under the same rule.
        if ((c ->> 'key' in ('own_words_copied', 'rows_copied') and coalesce((c ->> 'copy_again_clears')::bigint, 0) > 0
                                               and coalesce((c ->> 'copy_again_leaves')::bigint, 0) = 0)
            or c ->> 'key' = 'parity')
           and not coalesce(v_ctx_left ? ('scopes_screens.' || (c ->> 'key')), false) then
          v_ctx := v_ctx || jsonb_build_object('switch', 'Scope and context screens', 'key', 'scopes_screens.' || (c ->> 'key'),
                                               'says', c ->> 'says', 'detail', c ->> 'detail');
        else
          v_cannot := v_cannot || jsonb_build_object('switch', 'Scope and context screens', 'key', c ->> 'key',
                                                     'says', c ->> 'says',
                                                     'detail', rtrim(coalesce(c ->> 'detail', ''), '.')
                                                               || case when v_ctx_left ? ('scopes_screens.' || (c ->> 'key'))
                                                                       then format('. The context copy ran at %s and left it.', to_char(v_ctx_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')) else '' end,
                                                     'clears', 0, 'leaves', 1);
        end if;
      end loop;
    end if;
    -- READINESS-PARITY: a store-writer organization whose two sides differ is blocked by name. It is not
    -- Step 1's to clear: the context copy takes the old side's word, and here the store is the writer, so
    -- which side is right is a person's call. The repair is the write-through door for each named scope
    -- (custom._ctx_bridge, the one the context.* trigger calls), run by the chair.
    if v_sw ? (o.id::text) then
      for c in select x from jsonb_array_elements(v_sw -> (o.id::text)) x loop
        v_cannot := v_cannot || jsonb_build_object('switch', 'Scope and context screens', 'key', 'store_image_parity',
          'says', 'Every live scope is live in both the store and the current scope tables',
          'detail', concat_ws('; ',
            case when (c ->> 'image_only')::bigint > 0 then format('%s: %s %s live in the current scope tables with no live record in the store (%s)',
              c ->> 'scope_type', c ->> 'image_only', case when (c ->> 'image_only')::bigint = 1 then 'scope is' else 'scopes are' end,
              (select string_agg(e, ', ') from jsonb_array_elements_text(c -> 'image_only_examples') e)) end,
            case when (c ->> 'store_only')::bigint > 0 then format('%s: %s %s live in the store with no live scope in the current scope tables (%s)',
              c ->> 'scope_type', c ->> 'store_only', case when (c ->> 'store_only')::bigint = 1 then 'record is' else 'records are' end,
              (select string_agg(e, ', ') from jsonb_array_elements_text(c -> 'store_only_examples') e)) end),
          'scope_type_id', c ->> 'scope_type_id',
          'clears', 0, 'leaves', (c ->> 'image_only')::bigint + (c ->> 'store_only')::bigint);
      end loop;
    end if;
    -- Edits waiting for the context copy hold everything: after the final switch every agent reads
    -- the copy, so a waiting edit is a wrong answer. Whichever side the organization is on.
    -- FINAL-SWITCH (d): Step 1's context copy claims them and carries them (the follow's own drain,
    -- for this one organization), so they are Step 1's to clear — unless it already ran and left them.
    if v_lag > 0 then
      v_x := jsonb_build_object('switch', 'Where agents get their context', 'key', 'follow_current',
        'says', 'No scope edit is waiting to be copied',
        'detail', format('%s %s made in the current scope screens %s waiting for the copy (the oldest since %s).',
                         v_lag, case when v_lag = 1 then 'edit' else 'edits' end, case when v_lag = 1 then 'is' else 'are' end,
                         (select to_char(min(x.created_at) at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') from custom.io_outbox x
                           where x.organization_id = o.id and x.event_key = 'context.follow'
                             and not custom.io_outbox_consumed_by(x.id, 'context-follow', x.consumed_at) and x.deleted_at is null)));
      if coalesce(v_ctx_left ? 'follow_current', false) then
        v_cannot := v_cannot || (v_x || jsonb_build_object(
          'detail', rtrim(v_x ->> 'detail', '.') || format('. The context copy ran at %s and left them waiting.', to_char(v_ctx_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')),
          'clears', 0, 'leaves', v_lag));
      else
        v_ctx := v_ctx || v_x;
      end if;
    end if;

    for c in select x from jsonb_array_elements(v_cannot) x loop
      v_blocking := v_blocking || to_jsonb(format('%s — %s: not yet: %s: %s', o.name, c ->> 'switch',
        case when c ->> 'says' ~ '^[A-Z][a-z]' then lower(left(c ->> 'says', 1)) || substr(c ->> 'says', 2) else c ->> 'says' end,
        rtrim(coalesce(c ->> 'detail', ''), '.')));
    end loop;
    if jsonb_array_length(v_cannot) > 0 then v_orgs_blocked := v_orgs_blocked + 1; end if;
    if jsonb_array_length(v_clears) > 0 then
      v_need := v_need || to_jsonb(o.id);
      v_orgs_need := v_orgs_need + 1;
    end if;
    if jsonb_array_length(v_ctx) > 0 then
      v_ctx_need := v_ctx_need || to_jsonb(o.id);
      v_orgs_ctx := v_orgs_ctx + 1;
    end if;
    if jsonb_array_length(v_cannot) = 0 and jsonb_array_length(v_clears) = 0 and jsonb_array_length(v_ctx) = 0 then v_orgs_ready := v_orgs_ready + 1; end if;
    -- FINAL-SWITCH (c): the organizations the press itself switches (its plan names a step for them).
    if (v_t_state = 'old' and v_tl + v_ll > 0) or (v_t_state = 'new' and v_tl + v_ll > 0) or (v_c_state = 'old' and v_st > 0) then
      v_orgs_switch := v_orgs_switch + 1;
    end if;

    v_orgs_a := array_append(v_orgs_a, jsonb_build_object(
      'id', o.id, 'name', o.name, 'created_at', o.created_at, 'archived', o.archived_at is not null,
      'tables', jsonb_build_object(
          'live', v_tl,
          'copied', case when r is null then null else ((select x from jsonb_array_elements(r -> 'checks') x where x ->> 'key' = 'copied' limit 1) ->> 'detail') end,
          'state', v_t_state, 'switched_at', case when v_t_state = 'new' then v_t_at end),
      'lists', jsonb_build_object(
          'live', v_ll,
          'copied', case when r is null then null else ((select x from jsonb_array_elements(r -> 'checks') x where x ->> 'key' = 'lists_copied' limit 1) ->> 'detail') end),
      'scopes', jsonb_build_object(
          'types', v_st, 'state', v_c_state, 'switched_at', case when v_c_state = 'new' then v_c_at end,
          'parity', case when rc is not null then ((select x from jsonb_array_elements(rc -> 'checks') x where x ->> 'key' = 'copied' limit 1) ->> 'detail')
                         when v_c_state = 'new' then 'Agents read the copy.'
                         when v_st = 0 then 'No scopes.' end),
      'follow_lag', v_lag,
      'rerun_clears', v_clears,
      'cannot_clear', v_cannot,
      'needs_copy_again', jsonb_array_length(v_clears) > 0,
      'context_clears', v_ctx,
      'needs_context_copy', jsonb_array_length(v_ctx) > 0,
      'ready', jsonb_array_length(v_cannot) = 0 and jsonb_array_length(v_clears) = 0 and jsonb_array_length(v_ctx) = 0,
      'plan', jsonb_build_object(
          'press_tables', v_t_state = 'old' and v_tl + v_ll > 0,
          'sweep_tables', case when v_t_state = 'new' then v_tl else 0 end,
          'sweep_lists', case when v_t_state = 'new' then v_ll else 0 end,
          'press_context', v_c_state = 'old' and v_st > 0)));
  end loop;
  v_orgs := coalesce(to_jsonb(v_orgs_a), '[]'::jsonb);

  -- ── after a run: the undo's plan ──────────────────────────────────────────────────────────────
  if v_state = 'new' then
    for v_x in select x from jsonb_array_elements(coalesce(v_last.did -> 'organizations', '[]'::jsonb)) x
                where x ->> 'tables_press' is not null loop
      v_now_press := (platform._cutover_seam_last_done('older_tables', (v_x ->> 'id')::uuid)).id;
      if v_now_press is distinct from (v_x ->> 'tables_press')::uuid then
        v_undo := v_undo || jsonb_build_object('id', v_x ->> 'id', 'name', v_x ->> 'name',
          'skipped', 'Its Data tables were pressed again after the final switch, so the undo leaves them as they are.');
      else
        v_rr := platform._cutover_seam_reverse_readiness('older_tables', (v_x ->> 'id')::uuid);
        v_undo := v_undo || jsonb_build_object('id', v_x ->> 'id', 'name', v_x ->> 'name',
          'carries', coalesce(v_rr -> 'carries', '[]'::jsonb),
          'not_carried', coalesce(v_rr -> 'not_carried', '[]'::jsonb),
          'needs_confirm', coalesce((v_rr ->> 'needs_confirm')::boolean, false));
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'checked_at', clock_timestamp(),
    'state', v_state,
    'last_run', case when v_last.id is null then null else jsonb_build_object(
        'id', v_last.id, 'direction', v_last.direction, 'at', v_last.pressed_at, 'says', v_last.says,
        'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text) from auth.users u where u.id = v_last.pressed_by),
        'counts', v_last.did -> 'counts') end,
    'platform', v_platform,
    'organizations', v_orgs,
    -- ONE SET OF COUNTS, EACH NAMED (VERIFIER-27): 'organizations' is every organization listed (it has
    -- anything old, or a switch pressed); 'to_switch' is the ones the press itself switches;
    -- 'nothing_to_switch' the rest (already on the new system, or nothing old left); 'need_copy_again'
    -- and 'blocked' are subsets of the listed ones. 'ready' is kept for older readers: listed
    -- organizations with no difference at all.
    'totals', jsonb_build_object('organizations', jsonb_array_length(v_orgs), 'ready', v_orgs_ready,
                                 'to_switch', v_orgs_switch, 'nothing_to_switch', jsonb_array_length(v_orgs) - v_orgs_switch,
                                 'need_copy_again', v_orgs_need, 'need_context_copy', v_orgs_ctx, 'blocked', v_orgs_blocked),
    'needs_copy_again', v_need,
    'needs_context_copy', v_ctx_need,
    'blocking', v_blocking,
    'orphans', v_orphans,
    'adopt_orphans', v_adopt,
    'copy_again', v_copy,
    'copy_again_needed', v_orgs_need > 0 or v_orgs_ctx > 0 or v_adopt > 0 or (v_copy is not null and not ((v_copy ->> 'finished')::boolean and (v_copy ->> 'ok')::boolean)),
    'no_owner_archived', case when v_state = 'new' then coalesce(v_last.did -> 'orphans' -> 'no_owner', '[]'::jsonb) end,
    'ready', v_state = 'old' and v_platform_ok and v_orgs_blocked = 0 and v_orgs_need = 0 and v_orgs_ctx = 0 and not v_copy_pending,
    'ready_after_copy_again', v_state = 'old' and v_platform_ok and v_orgs_blocked = 0,
    'says', case when v_state = 'new' then 'Everything is on the new system (the final switch).'
                 when v_platform_ok and v_orgs_blocked = 0 and v_orgs_need = 0 and v_orgs_ctx = 0 and not v_copy_pending then
                   format('Ready: pressing switches %s %s at once.', v_orgs_switch,
                          case when v_orgs_switch = 1 then 'organization' else 'organizations' end)
                 when v_platform_ok and v_orgs_blocked = 0 then
                   case when v_orgs_need > 0 or v_orgs_ctx > 0 or v_adopt > 0
                        then format('Ready once Step 1 has run: %s. Run it first; the press stays off until it finishes green.',
                               concat_ws(', ',
                                 case when v_orgs_need > 0 then format('Copy again for %s %s', v_orgs_need, case when v_orgs_need = 1 then 'organization' else 'organizations' end) end,
                                 case when v_orgs_ctx > 0 then format('the context copy for %s %s', v_orgs_ctx, case when v_orgs_ctx = 1 then 'organization' else 'organizations' end) end,
                                 case when v_adopt > 0 then format('%s older pick %s given %s maker''s organization', v_adopt,
                                                                    case when v_adopt = 1 then 'list' else 'lists' end, case when v_adopt = 1 then 'its' else 'their' end) end))
                        else 'Ready once Step 1 finishes green: ' || coalesce((select p ->> 'detail' from jsonb_array_elements(v_platform) p
                                                                                 where p ->> 'key' = 'copy_again_finished'), 'run it first.') end
                 else format('Not ready: %s %s must be fixed first. Step 1 cannot fix %s.',
                             jsonb_array_length(v_blocking), case when jsonb_array_length(v_blocking) = 1 then 'thing' else 'things' end,
                             case when jsonb_array_length(v_blocking) = 1 then 'it' else 'them' end) end,
    'undo', case when v_state = 'new' then jsonb_build_object(
        'plan', v_undo,
        'needs_confirm', exists (select 1 from jsonb_array_elements(v_undo) u where coalesce((u ->> 'needs_confirm')::boolean, false))) end);
end;
$function$;

CREATE OR REPLACE FUNCTION platform._context_tag_follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  platform.associations%rowtype := case when tg_op = 'DELETE' then old else new end;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- The follow's own write to a copy is not news (it would wake the follow to re-copy itself), and
  -- neither is the write-through's (SCOPES-WRITE-THROUGH, marked for its transaction).
  if v_row.target_type = 'record' and custom._ctx_marked() then
    return null;
  end if;
  if v_row.target_type = 'record'
     and pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return null;
  end if;

  select s.organization_id, s.scope_type_id into v_org, v_type
    from context.scopes s where s.id = v_row.target_id;
  if v_org is null and tg_op = 'UPDATE' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = old.target_id;
  end if;
  if v_org is null then
    return null;
  end if;
  -- SCOPES-WRITE-THROUGH: in an organization whose store is the writer, this tag's copy is brought
  -- current in the same statement (outside the handler below, so a store refusal refuses the tag).
  if custom.context_writer(v_org) = 'store' then
    declare
      v_was text := custom._ctx_mark('bridge');
    begin
      if coalesce(current_setting('app.actor_system', true), '') = '' then
        perform set_config('app.actor_system', 'custom.context_write_through', true);
      end if;
      perform custom._ctx_store_tag(v_org, v_row.source_type, v_row.source_id, v_row.target_id);
      if tg_op = 'UPDATE' and old.target_id is distinct from new.target_id and old.target_type = 'scope' then
        perform custom._ctx_store_tag(v_org, old.source_type, old.source_id, old.target_id);
      end if;
      perform custom._ctx_mark(v_was);
    end;
    return null;
  end if;
  begin
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return null;
  end if;

  insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
  values ('context.follow', v_row.id, v_type,
          case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
          'context.follow:associations:' || v_row.id::text,
          v_org,
          jsonb_build_object('declared', 'platform.associations', 'user_id', auth.uid(),
                             'source_type', v_row.source_type, 'target_type', v_row.target_type))
  on conflict (organization_id, dedupe_key) where deleted_at is null
  do update set consumed_at = null,
                consumer    = null,
                operation   = excluded.operation,
                actor       = excluded.actor;
  -- RE-ARMED FOR EVERY CONSUMER (CHAIR-RECORD-CHANGED): once each consumer keeps its own
  -- consumption, a re-armed row is news again only when those rows go too.
  if custom.io_outbox_per_consumer() then
    perform custom.io_outbox_rearm(v_org, 'context.follow:associations:' || v_row.id::text);
  end if;
  perform pg_notify('records_changed',
                    jsonb_build_object('organization_id', v_org, 'record_id', v_row.id, 'table_id', v_type,
                                       'operation', 'updated', 'event_key', 'context.follow')::text);
  return null;
  exception when others then
  -- NEVER FAIL THE OLD SIDE'S TAG, NEVER FAIL IN SILENCE (same rule as context._follow_to_the_copy).
  begin
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'context_follow_enqueue_failure',
      'organization_id', v_org,
      'source_app', 'database',
      'source_feature', 'context-follow',
      'route', 'platform._context_tag_follow_to_the_copy',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'context', jsonb_build_object('table', 'platform.associations', 'row_id', v_row.id, 'operation', tg_op,
                               'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes')));
  exception when others then
    raise warning 'platform._context_tag_follow_to_the_copy: could not tell the copy about tag % (%), and could not record it: %',
      v_row.id, tg_op, sqlerrm;
  end;
  return null;
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION context._follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id   uuid  := (v_row ->> 'id')::uuid;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- WHICH ORGANIZATION AND WHICH SCOPE TYPE (the copy's Table) this row belongs to.
  if tg_table_name = 'scope_types' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := v_id;
  elsif tg_table_name = 'scopes' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := (v_row ->> 'scope_type_id')::uuid;
  elsif tg_table_name = 'context_items' then
    v_type := (v_row ->> 'scope_type_id')::uuid;
    select t.organization_id into v_org from context.scope_types t where t.id = v_type;
  elsif tg_table_name = 'context_item_values' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = (v_row ->> 'scope_id')::uuid;
  end if;
  if v_org is null then
    return null;
  end if;

  -- SCOPES-WRITE-THROUGH: IN AN ORGANIZATION WHOSE STORE IS THE WRITER, the record store is written
  -- in this same statement and its rules govern — a store refusal refuses the write. OUTSIDE the
  -- exception handler below on purpose: swallowing a refusal here would commit the old row and leave
  -- the store behind, silently. A scope door has already written the store for its own rows (marked).
  if custom.context_writer(v_org) = 'store' then
    if not custom._ctx_marked() then
      perform custom._ctx_bridge(tg_table_name, tg_op, v_row, v_org, v_type);
    end if;
    return null;
  end if;

  begin
    v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
    if not v_on then
      return null;
    end if;

    insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
    values ('context.follow', v_id, v_type,
            case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
            'context.follow:' || tg_table_name || ':' || v_id::text,
            v_org,
            jsonb_build_object('declared', 'context.' || tg_table_name, 'user_id', auth.uid()))
    on conflict (organization_id, dedupe_key) where deleted_at is null
    do update set consumed_at = null,
                  consumer    = null,
                  operation   = excluded.operation,
                  actor       = excluded.actor;
    -- RE-ARMED FOR EVERY CONSUMER (CHAIR-RECORD-CHANGED): once each consumer keeps its own
    -- consumption, a re-armed row is news again only when those rows go too.
    if custom.io_outbox_per_consumer() then
      perform custom.io_outbox_rearm(v_org, 'context.follow:' || tg_table_name || ':' || v_id::text);
    end if;
    -- A RE-ARMED ROW IS NEWS TOO. custom.io_outbox_announce fires on INSERT only, so the second
    -- edit of the same old row (an update of the outbox row) would wake nobody; say it here, in the
    -- announce's own shape (a pointer, never the row). The follow debounces, so a duplicate on the
    -- first insert costs nothing.
    perform pg_notify('records_changed',
                      jsonb_build_object('organization_id', v_org, 'record_id', v_id, 'table_id', v_type,
                                         'operation', 'updated', 'event_key', 'context.follow')::text);
  exception when others then
    -- NEVER FAIL THE OLD SIDE'S EDIT, NEVER FAIL IN SILENCE. The current screens are the writer;
    -- an edit there must land whether or not the copy could be told. The miss is recorded with its
    -- remedy, and the next change to the same organization (or any follow drain run for it)
    -- re-plans the whole organization, so nothing is lost for good.
    begin
      perform ops.record_system_error(jsonb_build_object(
      'kind', 'context_follow_enqueue_failure',
      'organization_id', v_org,
      'source_app', 'database',
      'source_feature', 'context-follow',
      'route', 'context._follow_to_the_copy',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'context', jsonb_build_object('table', 'context.' || tg_table_name, 'row_id', v_id, 'operation', tg_op,
                                 'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes')));
    exception when others then
      raise warning 'context._follow_to_the_copy: could not tell the copy about %.% (%), and could not record it: %',
        'context', tg_table_name, v_id, sqlerrm;
    end;
  end;
  return null;
end;
$function$;

-- ── 4. EVERY NEW DOOR IS SERVER-ONLY, AND THE DRAIN JOINS THEM ──────────────────────────────
-- Declare first: the closed-schema sweep (platform.reopen_declared_doors) hands a declared
-- signed-in door its grant back after any REVOKE, so the registry must say "server only" before
-- the revoke runs, or the revoke is undone by the next DDL statement.
update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'server_only: the change queue is drained by the server''s named consumers (context-follow, the workflow trigger source). A signed-in member draining it took events from every other consumer of their organization (lane CHAIR-RECORD-CHANGED, 2026-10-02).',
       reason = reason || ' — 2026-10-02 CHAIR-RECORD-CHANGED: server-only, per-consumer.'
 where schema_name = 'custom' and function_name = 'io_outbox_drain' and signed_in_callers;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, non_client_lane)
select 'custom', p.proname, pg_get_function_identity_arguments(p.oid),
       string_to_array(p.proargtypes::text, ' ')::oid[],  -- oidvector is 0-based; the registry is not
       'CHAIR-RECORD-CHANGED',
       'The record-changed event''s consumer doors: each named server consumer subscribes, drains, hands back and counts its own backlog.',
       false,
       'server_only: queue plumbing for the server''s consumers; a browser has no consumer name and must never take events from one.'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'custom'
   and p.proname in ('io_outbox_release_claimed', 'io_outbox_pending_organizations', 'io_outbox_backlog',
                     'io_outbox_subscribe', 'record_changes_drain', '_io_outbox_claim', 'io_outbox_rearm')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

revoke all on function custom.io_outbox_drain(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function custom.io_outbox_release_claimed(uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function custom.io_outbox_pending_organizations(text, text) from public, anon, authenticated;
revoke all on function custom.io_outbox_backlog(text, text, interval) from public, anon, authenticated;
revoke all on function custom.io_outbox_subscribe(text, text) from public, anon, authenticated;
revoke all on function custom.record_changes_drain(uuid, text, integer) from public, anon, authenticated;
revoke all on function custom._io_outbox_claim(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function custom._io_outbox_server_only(text) from public, anon, authenticated;
revoke all on function custom.io_outbox_per_consumer() from public, anon, authenticated;
revoke all on function custom.io_workflow_chain() from public, anon, authenticated;
revoke all on function custom.io_change_actor() from public, anon, authenticated;
revoke all on function custom.io_change_fields(text[], jsonb, jsonb) from public, anon, authenticated;
revoke all on function custom.io_outbox_consumed_by(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function custom.io_outbox_last_consumed(text, text, uuid) from public, anon, authenticated;
revoke all on function custom.io_outbox_rearm(uuid, text) from public, anon, authenticated;
