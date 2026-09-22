-- chair-step: this REPLACES three live client write doors (custom.record_write, record_write_many, record_update), the three statement triggers that write custom.io_outbox, and the realtime notice — so a person reads every body before it runs. It comes through this route rather than the additive one because the additive route demands that a replaced body NAME the file's guard knob, and these bodies must not: they are the store's write path, gated by custom/system_enabled through custom.assert_store_door exactly as they already were, and wiring the realtime switch into a write door would make a person's write depend on whether this database authorizes sockets. NOTHING IS DROPPED AND NO SIGNATURE MOVES — every one of the eight `create or replace` statements keeps its exact argument list, so every existing call site resolves to the same function it resolves to today, and each carries a `-- based-on:` line the runner re-hashes against the live body immediately before executing. The only schema change is one NULLABLE column added to custom.io_outbox with no default and no backfill. What actually changes behaviour: a document handed to a write door may now carry the platform envelope key `_op_id`, which the door lifts out BEFORE the undeclared-key guard and before storage (it is never persisted on a record), records for the length of the transaction, and which then travels on the outbox row and in the realtime notice so a browser can drop the echo of its own write. Absent means exactly today's behaviour and every existing caller — every agent tool included — sends none.
-- lane: REALTIME-2 (chair ruling 2026-09-21: never overload a live door; the op id rides the record envelope)
-- based-on: custom.record_write(uuid, uuid, jsonb) 0cffc281104e61a352ce041192361e7fd5c7d4e85bb3f8d9ec28e72cb61f53fc
-- based-on: custom.record_write_many(uuid, uuid, jsonb[], uuid[]) b610444cecf05eb513771073b3802e021d022044daa18f0f1d757ca20c0a0bf8
-- based-on: custom.record_update(uuid, uuid, jsonb, integer) 8e83dbe17d6beebe39c46ea5a334ea7bad48fb525222292cfe0d6b406caa913a
-- based-on: custom.io_record_changed_stmt_insert() 4cfbe961368994b02ed30561c66cc9d2d7bf5f28fde59f477952da4d85ff15a2
-- based-on: custom.io_record_changed_stmt_update() 932d68d64f70887182b1d13f7e7c0a644717498ea0831637500c4cacec97d3b3
-- based-on: custom.io_record_changed_stmt_delete() e77a79a0334640997c62f62f4ca0dc086f7414da964db908b1a5420b4fe7ac51
-- based-on: custom._realtime_notice(uuid, uuid, text, text, jsonb, boolean) ee4d26ca3d1a014bd2aa4b6e4619fc538409d6cc6102052de03a0a10b24cf52e
--
-- REALTIME-2, file 3 — THE CLIENT OP ID, END TO END, WITH NOT ONE SIGNATURE CHANGED.
--
-- THE PROBLEM. `features/unified-data/realtime/recordsRealtimePort.ts` carries
-- `acceptEchoFromSelf: true` and a paragraph saying so honestly: the notice the database
-- broadcasts has no way of saying WHICH browser's write caused it, so the writer hears its own
-- write back and re-reads a page it had already updated. Lane REALTIME named it and did not
-- fake it.
--
-- WHY THE OBVIOUS FIX IS REFUSED. "Add an optional `p_client_op_id uuid DEFAULT NULL` to the
-- write doors" is not additive on PostgreSQL, and this was proven rather than assumed:
--
--     create function f(a uuid, b uuid, c jsonb) …
--     create function f(a uuid, b uuid, c jsonb, d uuid default null) …
--     select f(…, …, '{}'::jsonb);
--     ERROR:  function f(uuid, uuid, jsonb) is not unique
--
-- Every existing three-argument call site becomes ambiguous, so the only way to add the
-- argument is to DROP a live door eighteen callers use and re-create it. The chair's ruling,
-- 2026-09-21: never overload a live door, and never drop-and-recreate one for an optional
-- nicety.
--
-- THE SHAPE THE CHAIR RULED, AND IT WAS ALREADY IN THE BUILDING. `_`-prefixed keys are
-- PLATFORM ENVELOPE keys belonging to no Table — FIELD-TRUTH established that, and this very
-- outbox trigger already reads one: `coalesce(n.data,'{}') ->> '_actor'`. So the op id rides
-- the envelope the write doors already accept. `_op_id` is lifted out of the jsonb by the door
-- BEFORE the undeclared-key guard and BEFORE storage, handed to the transaction, recorded on
-- the `custom.io_outbox` row, and carried in the notice as `op_id`. Absent means exactly
-- today's behaviour; agent tools send none and nothing about them changes.
--
-- 🚨 IT IS NEVER PERSISTED ON THE RECORD, and that is the difference from `_actor`. `_actor`
-- is a claim about WHO, which belongs in the record's history. An op id is a property of one
-- browser's one click — meaningless a second later, meaningless to anybody else, and pure
-- litter in a practitioner's own document. The door strips it; `custom.record.data` never
-- holds it; `custom.read_record` can never hand it back.
--
-- HOW IT REACHES THE TRIGGER WITHOUT AN ARGUMENT. `set_config('custom.op_id', …, true)` —
-- transaction-local. Through PostgREST one RPC is one transaction, so one door call is one op
-- id, and the statement trigger that writes the outbox row reads the value the door that
-- caused it set. There is ONE source (that `set_config`) and two readers (the outbox row, and
-- the notice). They cannot disagree because there is nothing for them to disagree about.
-- The doors CLEAR it when no `_op_id` was sent, so a second write in one transaction can never
-- inherit the first one's id.
--
-- A MALFORMED `_op_id` IS REFUSED BY NAME. It is a client bug and a silent drop would mean the
-- writer quietly goes back to hearing its own echo with nothing anywhere saying why.
--
-- THE EMITTER IS NOT TOUCHED. `custom.io_outbox_broadcast_stmt` already makes one notice per
-- statement per (table, kind, operation), and one statement is one transaction is one op id —
-- so there is nothing to add to its GROUP BY and the notice reads the value itself.
--
-- AND THE ONE WAY A STALE ID COULD TRAVEL, CLOSED BY THE TRANSPORT. A GUC set with `true` is
-- transaction-local, and through PostgREST one RPC is one transaction, so no second door call
-- can ever see the first one's value. Server-side code that runs several doors in ONE
-- transaction never sends `_op_id` at all (agent tools send none), so the setting is empty
-- there — and the three doors that DO read it clear it when the key is absent, so even that
-- case cannot inherit.

-- ── THE DURABLE RECORD ──────────────────────────────────────────────────────────────────
-- `custom.io_outbox` is the store's own change feed; the op id belongs on the row that says
-- what changed, not only on the message that announces it. Nullable, no default, no backfill:
-- every row written before this file has no op id because no client had sent one.
alter table custom.io_outbox add column if not exists op_id uuid;

comment on column custom.io_outbox.op_id is
  'The client operation that caused this change, when the caller sent one as `_op_id` in the write door''s envelope. Never stored on the record itself. Carried into the realtime notice so a browser can drop the echo of its own write instead of re-reading a page it has already updated. NULL for every server-side write and every caller that sends none.';


-- ── THE ONE PLACE THE ENVELOPE KEY IS READ ──────────────────────────────────────────────
-- Three doors need exactly the same four lines, so they are one function rather than three
-- copies: lift, validate, remember, hand back the document without it.
create or replace function custom._take_op_id(p_doc jsonb, p_door text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_raw text;
  v_id  uuid;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or not (p_doc ? '_op_id') then
    -- NO OP ID IS THE ORDINARY CASE. Clear the transaction's value so a second write in the
    -- same transaction can never inherit the first one's id and tell a browser to drop an
    -- echo that is not its own.
    perform set_config('custom.op_id', '', true);
    return p_doc;
  end if;

  v_raw := p_doc ->> '_op_id';
  begin
    v_id := v_raw::uuid;
  exception when others then
    raise exception '%: _op_id must be a uuid identifying this client operation, and "%" is not one.', p_door, left(coalesce(v_raw, 'null'), 64)
      using errcode = '22023',
            hint = 'Nothing was written. _op_id is optional — send a uuid your client minted for this one action, or leave the key out entirely. It is never stored on the record; it travels only so the browser that made the change can recognise the notice announcing it and skip re-reading a page it has already updated.';
  end;

  perform set_config('custom.op_id', v_id::text, true);
  return p_doc - '_op_id';
end;
$$;

comment on function custom._take_op_id(jsonb, text) is
  'Lifts the platform envelope key `_op_id` out of a write door''s document BEFORE the undeclared-key guard and before storage, refuses a malformed one by name, and records it for the length of the transaction so the outbox trigger and the realtime notice can carry it. The document comes back without the key: an op id is never persisted on a record.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', '_take_op_id', 'p_doc jsonb, p_door text',
   'Decides nothing and reaches nothing: it reads one key out of a jsonb the caller already owns, validates it is a uuid, and sets a transaction-local GUC. It touches no table, asks no ladder and returns the caller''s own document minus one key.',
   'realtime2_the_write_doors_take_an_op_id.sql',
   'server_only: called on the first line of custom.record_write, record_write_many and record_update, before anything is written. A client reaches it through those doors and has no reason to call it directly.',
   false, false)
on conflict do nothing;


-- ── THE THREE WRITE DOORS ───────────────────────────────────────────────────────────────
-- Each gains ONE line, in the same place: before the guards, before the insert.

create or replace function custom.record_write(p_organization_id uuid, p_table_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_id uuid;
begin
  -- THE ENVELOPE KEY COMES OFF FIRST. Before the door predicates, before the undeclared-key
  -- guard, before storage — `custom.record.data` must never hold it.
  p_data := custom._take_op_id(p_data, 'custom.record_write');

  -- The switch, then the organization, then the Table this record is being added to.
  -- `current_user` in here is already the definer; both predicates read the caller.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end
$function$;


create or replace function custom.record_write_many(p_organization_id uuid, p_table_id uuid, p_rows jsonb[], p_ids uuid[] DEFAULT NULL::uuid[])
returns uuid[]
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_ids   uuid[];
  v_n     integer := coalesce(cardinality(p_rows), 0);
  v_clean jsonb[];
  v_seen  text := null;
  v_this  text;
  ord     integer;
begin
  -- The switch, then the organization, then the Table these records are being added to — the
  -- same two predicates `custom.record_write` asks, in the same order, ONCE for the batch.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write_many');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write_many',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write_many: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if v_n = 0 then
    perform set_config('custom.op_id', '', true);
    return '{}'::uuid[];
  end if;
  if p_ids is not null and coalesce(cardinality(p_ids), 0) <> v_n then
    raise exception 'custom.record_write_many: % ids were handed in for % records, so no row could be told from another', coalesce(cardinality(p_ids), 0), v_n
      using errcode = '22023',
            hint = 'Hand in one id per record, in the same order, or hand in none and let the door mint them. Nothing was written.';
  end if;

  -- ONE STATEMENT IS ONE OPERATION. Every row's `_op_id` comes off, and they must AGREE: a
  -- batch is one paste, one import, one click. Two different ids in one statement would make
  -- one notice that could only name one of them, so the other writer would be told to drop an
  -- echo that was never its own — which is the one way an echo filter loses a real change.
  v_clean := array[]::jsonb[];
  for ord in 1..v_n loop
    v_this := case when p_rows[ord] is not null and jsonb_typeof(p_rows[ord]) = 'object'
                   then p_rows[ord] ->> '_op_id' else null end;
    if v_this is not null then
      if v_seen is not null and v_seen <> v_this then
        raise exception 'custom.record_write_many: this batch carries two different _op_id values (% and %), and one statement announces itself once.', left(v_seen, 64), left(v_this, 64)
          using errcode = '22023',
                hint = 'Nothing was written. A batch is ONE client operation — one paste, one import, one click — so every row either carries the same _op_id or carries none. Split the rows into one call per operation, or leave the key out.';
      end if;
      v_seen := v_this;
    end if;
    v_clean := v_clean || case
                 when p_rows[ord] is null or jsonb_typeof(p_rows[ord]) <> 'object' then p_rows[ord]
                 else p_rows[ord] - '_op_id' end;
  end loop;

  -- Validated and remembered ONCE for the batch, through the same one place the single-row
  -- door uses, so a malformed id is refused with the same sentence.
  perform custom._take_op_id(
    case when v_seen is null then '{}'::jsonb else jsonb_build_object('_op_id', v_seen) end,
    'custom.record_write_many');

  if p_ids is null then
    select array_agg(gen_random_uuid() order by s) into v_ids
      from generate_subscripts(v_clean, 1) s;
  else
    v_ids := p_ids;
  end if;

  insert into custom.record (organization_id, table_id, id, data)
  select p_organization_id, p_table_id, v_ids[s], coalesce(v_clean[s], '{}'::jsonb)
    from generate_subscripts(v_clean, 1) s
   order by s;

  return v_ids;
end
$function$;


create or replace function custom.record_update(p_organization_id uuid, p_record_id uuid, p_patch jsonb, p_expected_version integer DEFAULT NULL::integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_new       integer;
  v_current   integer;
  v_contested jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_update');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_update');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_update: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'custom.record_update: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(p_patch), 'nothing')
      using errcode = '22023';
  end if;

  -- THE ENVELOPE KEY COMES OFF BEFORE THE MERGE. `data || p_patch` would otherwise write it
  -- straight into the record, where it would then be a column nobody declared, forever.
  p_patch := custom._take_op_id(p_patch, 'custom.record_update');
  if p_patch = '{}'::jsonb then
    raise exception 'custom.record_update: the patch is empty once the platform envelope keys are taken off it, so there is nothing to write.'
      using errcode = '22023',
            hint = 'Nothing was written. Send at least one field key -> value beside _op_id.';
  end if;

  -- THE OPT-IN POSTURE, KEPT. A write that declares no base revision behaves exactly as a
  -- direct UPDATE always has: last-write-wins.
  if p_expected_version is null then
    update custom.record
       set data = data || p_patch
     where organization_id = p_organization_id and id = p_record_id and deleted_at is null
    returning version into v_new;
    if v_new is null then
      raise exception 'There is no record % in this organization any more.', p_record_id
        using errcode = '02000',
              hint = 'It was deleted, or it never existed here. The store is keyed (organization_id, id), so a record from another organization is not found by this one.';
    end if;
    perform custom.assert_columns_are_defined(p_organization_id, p_record_id, p_patch);
    return v_new;
  end if;

  -- THE COMPARE-AND-SWAP.
  update custom.record
     set data = data || p_patch
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
     and version = p_expected_version
  returning version into v_new;
  if v_new is not null then
    perform custom.assert_columns_are_defined(p_organization_id, p_record_id, p_patch);
    return v_new;
  end if;

  select r.version into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_current is null then
    raise exception 'There is no record % in this organization any more - somebody deleted it while you were working on it.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was written. The record is gone, so there is nothing to merge into: keep your work somewhere else, or write it as a new record.';
  end if;

  select jsonb_object_agg(k.key, r.data -> k.key) into v_contested
    from custom.record r, lateral jsonb_object_keys(p_patch) k(key)
   where r.organization_id = p_organization_id and r.id = p_record_id;

  raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                  p_expected_version, v_current
    using errcode = 'PT409',
          detail = jsonb_build_object('expected_version', p_expected_version,
                                      'current_version',  v_current,
                                      'contested_fields', coalesce(v_contested, '{}'::jsonb))::text,
          hint = format('Nothing was overwritten and nothing was lost - their work is still there and yours is still in your hands. Look at what changed (it is in this error, field by field), decide keep-mine, keep-theirs or merged, and write it again against version %s. Resolution is just another write.', v_current);
end
$function$;


-- ── THE OUTBOX ROWS CARRY IT ────────────────────────────────────────────────────────────
-- One extra column in each of the three statement triggers, read from the transaction the
-- door set. Every other line is unchanged.

create or replace function custom.io_record_changed_stmt_insert()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  select n.organization_id, 'records.changed', n.id, n.table_id, 'created',
         case when coalesce(array_length(custom.io_changed_keys('{}'::jsonb, n.data), 1), 0) = 0
              then '[]'::jsonb
              else custom.io_changed_field_ids(n.organization_id, n.table_id,
                     '{}'::jsonb, coalesce(n.data, '{}'::jsonb)) end,
         jsonb_build_object(
           'user_id',   custom.query_principal(),
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  coalesce(n.data, '{}'::jsonb) ->> '_actor'),
         n.organization_id::text || ':' || n.id::text || ':' || coalesce(n.version, 0)::text || ':created',
         nullif(current_setting('custom.op_id', true), '')::uuid
    from new_rows n
   order by n.id
  on conflict do nothing;

  return null;
end;
$function$;


create or replace function custom.io_record_changed_stmt_update()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  select n.organization_id, 'records.changed', n.id, n.table_id, k.op,
         -- The row trigger's `v_changed`, character for character: `[]` when no key moved,
         -- otherwise the field ids of (old.data -> new.data) — the old side is `old.data`
         -- whenever tg_op is UPDATE, which is every row here, including the restore arm.
         case when coalesce(array_length(k.keys, 1), 0) = 0
              then '[]'::jsonb
              else custom.io_changed_field_ids(n.organization_id, n.table_id,
                     o.data, coalesce(n.data, '{}'::jsonb)) end,
         jsonb_build_object(
           'user_id',   custom.query_principal(),
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  coalesce(n.data, o.data) ->> '_actor'),
         n.organization_id::text || ':' || n.id::text || ':' ||
           coalesce(n.version, o.version, 0)::text || ':' || k.op,
         nullif(current_setting('custom.op_id', true), '')::uuid
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


create or replace function custom.io_record_changed_stmt_delete()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid;
begin
  for v_org in select distinct o.organization_id from old_rows o loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  select o.organization_id, 'records.changed', o.id, o.table_id, 'deleted',
         -- On a delete `v_keys` is empty by construction, so the answer is `[]` whatever the
         -- join would have done — and asking anyway made a deletion event depend on the caller
         -- still being allowed to READ the Table.
         '[]'::jsonb,
         jsonb_build_object(
           'user_id',   custom.query_principal(),
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  o.data ->> '_actor'),
         o.organization_id::text || ':' || o.id::text || ':' || coalesce(o.version, 0)::text || ':deleted',
         nullif(current_setting('custom.op_id', true), '')::uuid
    from old_rows o
   order by o.id
  on conflict do nothing;

  return null;
end;
$function$;


-- ── THE NOTICE CARRIES IT ───────────────────────────────────────────────────────────────
-- SEVEN KEYS NOW, AND THE SEVENTH IS STILL NOT A VALUE. `op_id` says WHICH CLICK, not what
-- changed: a uuid the writer's own browser minted seconds ago and nobody else has ever seen.
-- A subscriber who did not mint it learns nothing from it; the one who did learns that this
-- notice is the echo of its own write and skips a re-read it has already done.
--
-- IT IS READ FROM THE TRANSACTION RATHER THAN TAKEN AS AN ARGUMENT, deliberately. Adding a
-- seventh parameter would mean dropping a live function to avoid `is not unique`, for a
-- function whose ONE caller is the trigger fifty lines below. The source is the same
-- `set_config` the outbox row was written from, in the same transaction, so the row and the
-- message cannot disagree.
create or replace function custom._realtime_notice(
  p_organization_id uuid,
  p_table_id        uuid,
  p_kind            text,
  p_op              text,
  p_record_ids      jsonb,
  p_fields_changed  boolean
) returns void
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_topic text := 'custom:table:' || p_table_id::text;
  v_op    uuid := nullif(current_setting('custom.op_id', true), '')::uuid;
  v_land  boolean;
begin
  perform realtime.send(
    jsonb_build_object(
      'id',             v_id,
      'table_id',       p_table_id,
      'kind',           p_kind,
      'op',             p_op,
      'op_id',          v_op,              -- null unless the writer sent `_op_id`
      'record_ids',     p_record_ids,      -- null MEANS "re-read the page"
      'fields_changed', p_fields_changed,
      'at',             to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'records.changed',
    v_topic,
    true);

  -- THE READ-BACK. `realtime.send` returns void whether it worked or not, and it swallows
  -- every failure into a `raise warning` — so a store could go quietly un-live for a day and
  -- every screen would look healthy. `realtime.messages` is RANGE-partitioned on inserted_at
  -- and `realtime.send` mints its OWN row id, so the notice is found by topic, today's
  -- partition and the payload's own id.
  select exists (
    select 1 from realtime.messages m
     where m.topic = v_topic
       and m.inserted_at >= date_trunc('day', now())
       and m.payload ->> 'id' = v_id::text
  ) into v_land;
  if not v_land then
    insert into ops.system_error (kind, error_type, error_text, source_feature, route,
                                  organization_id, payload)
    values ('realtime_notice_not_delivered', 'realtime.send',
            'The record store announced a change and the message did not land in realtime.messages, so screens watching this table will not update until they are reloaded.',
            'custom.realtime', v_topic, p_organization_id,
            jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op,
                               'message_id', v_id));
  end if;
exception when others then
  -- A person's write must never fail because the announcement of it did.
  begin
    insert into ops.system_error (kind, error_type, error_text, source_feature, route,
                                  organization_id, payload)
    values ('realtime_notice_failed', sqlstate, sqlerrm, 'custom.realtime', v_topic,
            p_organization_id, jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op));
  exception when others then
    raise warning 'custom._realtime_notice could not record its own failure on %: %', v_topic, sqlerrm;
  end;
end;
$$;

comment on function custom._realtime_notice(uuid, uuid, text, text, jsonb, boolean) is
  'Sends ONE notice on custom:table:<table_id> and then looks for the row, because realtime.send swallows its own failures. The payload is seven keys and not one value: the seventh, op_id, is the client operation the writer declared as `_op_id`, read from the transaction the write door set it in, so a browser can drop the echo of its own write. Records a miss in ops.system_error against the real organization; never raises.';
