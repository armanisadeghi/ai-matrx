-- chair-step: this file REVOKES EXECUTE on custom.io_outbox_drain from signed-in callers (the drain
-- becomes server-only; its client_callable_door row says so first, so the closed-schema sweep does
-- not hand the grant back). Everything else is CREATE OR REPLACE of four live bodies, NEW functions
-- (all server-only), one platform.metadata_reserved_keys row and four platform.client_callable_door
-- rows. No table DDL, no index, no trigger DDL: no ACCESS EXCLUSIVE lock on any table.
-- Its inverse puts the four bodies back byte for byte, drops the new functions, deletes the rows
-- and re-grants the drain to authenticated.
-- based-on: custom.io_record_changed_stmt_insert() 0f0134ec1bfef8a7e7108ddc1c75c5557c60af696a9668c9ad8d0d38051d71db
-- based-on: custom.io_record_changed_stmt_update() f5c8f9c51c40d9aa6e6f826cffeb888da41415bee68daaf19e0a0e86246a764e
-- based-on: custom.io_record_changed_stmt_delete() 37c3784b052d2839154f1990737c5ba15e4720ac7b1238e199998f5f12488297
-- based-on: custom.io_outbox_drain(uuid, text, integer, text) f585d860be0ee514e741ba0de9e6c93fd1f04ab4360f0901f6a40308e894a543
-- based-on: custom.io_outbox_release(uuid, text, interval) 6cebc38214228162478b1a294f8546386d8fbfbe50ffa643de30e779907ed984
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
    raise exception 'The consumer "%" is not subscribed to "%" events. Subscribe it once with custom.io_outbox_subscribe(''%'', ''%''); it then sees every event from that moment on.',
      p_consumer, p_event_key, p_consumer, p_event_key
      using errcode = '55000';
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
                     'io_outbox_subscribe', 'record_changes_drain', '_io_outbox_claim')
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
