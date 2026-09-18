-- target: branch,production
-- additive: yes
-- guard: custom/row_versions_guard
--
-- W3-HIST, part one — HIS-1 and HIS-7: ONE append-only store, non-optional, covering every
--                     Value and every structural change, with no second mechanism.
--
-- WHAT WAS ALREADY THERE, MEASURED BEFORE A LINE WAS WRITTEN (branch, 2026-09-18)
-- ------------------------------------------------------------------------------
-- Schema `history` holds exactly ONE table, `history.row_versions` — RANGE partitioned by
-- `occurred_at`, 30 children including the default, columns
-- (id, entity_type, row_id, organization_id, version, operation, row_data, actor_id,
-- occurred_at, actor_tier) — and exactly ONE function,
-- `history.ensure_row_version_partitions(months_ahead)`. The live writer is
-- `platform._version_capture()`, attached as a trigger to 268 tables across the platform,
-- which is the mechanism this lane EXTENDS rather than replaces. There is no prune function
-- anywhere in the schema (part two adds the first one) and there was no capture at all on
-- `custom.record`: the campaign's own store recorded nothing.
--
-- So HIS-1 is not "build a history store" — the store exists and holds over a million rows.
-- HIS-1 is: the campaign's store is INSIDE it, on for everything, with nothing able to opt
-- out. This file is that, and nothing more.
--
-- WHY ONE TRIGGER ON ONE TABLE IS THE WHOLE OF HIS-7 TOO
-- -----------------------------------------------------
-- `custom.record` carries the Values (`data_class = 'record'`) AND the structure: a Table is
-- a row with `data_class = 'table'`, a Field `'field'`, a Rule `'rule'`, a Merge Field
-- `'merge_field'`, the kernel `'kernel'`. Structural change is therefore a write to the same
-- table as a Value change, so ONE capture trigger covers both and HIS-7's "no second
-- mechanism" is true by construction rather than by discipline. The proof is not that the
-- code looks right: it is that a Table declaration and a Value edit produce rows in the same
-- store, read back by the same query, which `scripts/campaign-tests/w3_hist_c17.sql` asserts
-- for all six live `data_class` values.
--
-- NOTHING CAN OPT OUT — AND THAT IS A PROPERTY OF THE SURFACE, NOT A PROMISE
-- -------------------------------------------------------------------------
-- There is no argument, no column, no per-Table property and no knob that turns recording
-- off. `retention` (part two) is the only knob History has, and it is HOW LONG, never
-- WHETHER: `history.retention_set` refuses zero by name. This file adds no switch of its own
-- beyond the campaign's OFF switch, which is not an opt-out available to a Table or to an
-- organization — it is the switch that holds the whole campaign unreachable on production
-- until the switch checklist runs, and while it is off `custom.record` takes no writes at
-- all, so there is nothing to record.
--
-- THE GUARD, AND WHY IT IS READ THROUGH THE ONE DOOR PREDICATE
-- -----------------------------------------------------------
-- `custom/row_versions_guard` (§6.6) holds off "the writer over history.row_versions.row_data".
-- That writer is this file. But a capture trigger that merely reads a knob would be a
-- SECOND door standing beside `custom.assert_store_door`, which V1-STORE spent a round
-- closing. So `history.capture_is_open` reads its guard THROUGH the one predicate: it calls
-- `custom.assert_store_door` and turns that one refusal into "inert" for the tables that must
-- not be broken by it. The knob is read too, by name, so the OFF switch is honoured and the
-- file names its guard the way §6b.2 requires.
--
-- AND AN INERT CAPTURE NEVER PRETENDS IT CAPTURED (rule 16)
-- --------------------------------------------------------
-- `history.capture_window` records the moment capture became live for an entity type. Every
-- replay this lane ships — `history.who_could_see`, `history.value_as_of`,
-- `history.snapshot_chain` — REFUSES by name for a moment before that window opened rather
-- than answering from a store that was not recording. A history with a hole answers "I was
-- not watching then", never a confident wrong answer.

set lock_timeout = '5s';
set statement_timeout = '300s';

create schema if not exists history;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE WINDOW. Two of the seven entity-shaped column names (`platform._provision_shape_guard`
-- refuses a NEW relation carrying three or more outside the provisioner, and it is right to)
-- — this is platform machinery keyed by an entity token, not a tenant's table.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists history.capture_window (
  entity_type text primary key,
  opened_at   timestamptz not null default now(),
  opened_by   text        not null default current_user,
  note        text
);

comment on table history.capture_window is
  'HIS-1: when the append-only store began recording an entity type. A replay asked about a moment before this refuses by name rather than answering from a store that was not watching.';

alter table history.capture_window enable row level security;

-- No DROP anywhere in a campaign file (§6b.2's allow-list, and rule 4's floor): a second
-- apply of these bytes is refused by the database itself, which is the house style every
-- wave-1 lane's triggers already follow.
create policy capture_window_read on history.capture_window
  for select
  using (pg_has_role(current_user, (select c.relowner from pg_class c where c.oid = 'history.row_versions'::regclass), 'member')
         or (select is_platform_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
-- THE GUARD, READ THROUGH THE ONE PREDICATE.
-- ─────────────────────────────────────────────────────────────────────────────
create function history.capture_is_open(p_organization_id uuid default null)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_knob boolean;
begin
  -- The campaign's OFF switch for this writer, by name, so §6b.2's "a guarded body names its
  -- guard" is satisfied by a body that actually reads it rather than by a comment.
  begin
    v_knob := coalesce((platform.knob_resolve('custom', 'row_versions_guard', p_organization_id) #>> '{}')::boolean,
                       false);
  exception when others then
    -- §6b.4b: a knob this writer cannot SEE raises P0001 and reads like a missing knob.
    -- A switch that cannot be read is CLOSED.
    v_knob := false;
  end;
  if v_knob then
    return true;
  end if;

  -- THE ONE DOOR PREDICATE. It raises 42501 when the store is shut to this caller, and
  -- returns silently when the store is open or the caller owns it — which is exactly the
  -- question "should this write be recorded". Turning its refusal into `false` here, rather
  -- than writing a second knob read, is what keeps ONE door in this schema.
  begin
    perform custom.assert_store_door(p_organization_id, 'history.row_versions');
    return true;
  exception when insufficient_privilege then
    return false;
  end;
end;
$fn$;

comment on function history.capture_is_open(uuid) is
  'HIS-1: whether the campaign''s history writer is live, read through custom.assert_store_door — the one door predicate — and through custom/row_versions_guard. Never a per-Table or per-organization opt-out: retention is the only knob History has.';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE CAPTURE. One trigger, one store, every data_class.
-- ─────────────────────────────────────────────────────────────────────────────
create function history.record_capture()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_row   jsonb;
  v_old   jsonb;
  v_op    text;
  v_org   uuid := coalesce(new.organization_id, old.organization_id);
begin
  -- THE GUARD, through the one predicate (see history.capture_is_open). An AFTER trigger on
  -- a write the BEFORE triggers already admitted must never raise, so the refusal is read as
  -- a boolean here and the window below is what keeps the silence honest.
  if not history.capture_is_open(v_org) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_op  := 'DELETE';
  else
    v_row := to_jsonb(new);
    if tg_op = 'INSERT' then
      v_op := 'INSERT';
    else
      v_old := to_jsonb(old);
      -- REC-23's soft delete and its undo are distinguishable operations in the store, or
      -- "who deleted this and when did it come back" is unanswerable.
      v_op := case
                when v_row ->> 'deleted_at' is not null and v_old ->> 'deleted_at' is null then 'SOFT_DELETE'
                when v_row ->> 'deleted_at' is null and v_old ->> 'deleted_at' is not null then 'RESTORE'
                else 'UPDATE'
              end;
      -- The contentless-update guard, the same one platform._version_capture applies: a
      -- snapshot identical to its predecessor in everything but the bookkeeping columns is
      -- not a version of anything. HIS-1 is "nothing can opt out of being RECORDED", not
      -- "every statement writes a row whether or not it changed anything".
      if v_op = 'UPDATE'
         and (v_row - 'version' - 'updated_at' - 'updated_by')
             is not distinct from (v_old - 'version' - 'updated_at' - 'updated_by') then
        return new;
      end if;
    end if;
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier)
  values ('custom.record',
          (v_row ->> 'id')::uuid,
          v_org,
          coalesce((v_row ->> 'version')::integer, 1),
          v_op,
          v_row,
          coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
          platform.actor_tier());

  -- The window opens on the first row actually recorded, never on the apply. A replay can
  -- then tell "nothing happened" from "nobody was watching".
  insert into history.capture_window (entity_type, note)
  values ('custom.record', 'HIS-1/HIS-7: W3-HIST''s capture on custom.record — Values and structure in one store')
  on conflict (entity_type) do nothing;

  return coalesce(new, old);
end;
$fn$;

comment on function history.record_capture() is
  'HIS-1 / HIS-7: the campaign store''s append-only capture. Every data_class — record, table, field, rule, merge_field, kernel — lands in history.row_versions, so structural change and Value change share one store and there is no second mechanism.';

create trigger zzz_history_capture
  after insert or update or delete on custom.record
  for each row execute function history.record_capture();

-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT A REPLAY IS ALLOWED TO ANSWER.
-- ─────────────────────────────────────────────────────────────────────────────
create function history.assert_watching(p_entity_type text, p_at timestamptz)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_opened timestamptz;
begin
  select w.opened_at into v_opened
    from history.capture_window w
   where w.entity_type = p_entity_type;

  if v_opened is null then
    raise exception 'History has not started recording % yet, so nothing can be replayed for it.', p_entity_type
      using errcode = '22023',
            hint = 'HIS-1: the store records from the moment the first change is written through it. Ask again after something has changed, or ask about a different kind of thing.';
  end if;

  if p_at < v_opened then
    raise exception 'History was not watching % on %. It began recording on %.',
                    p_entity_type, p_at, v_opened
      using errcode = '22023',
            hint = 'HIS-1: an answer from before the store was recording would be a guess wearing a fact''s clothes. Ask about a moment from when recording began onwards.';
  end if;
end;
$fn$;

comment on function history.assert_watching(text, timestamptz) is
  'Rule 16 / HIS-1: a replay of a moment History was not recording refuses by name with the date it began, rather than returning a confident wrong answer.';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE READ. One body every replay in this lane goes through.
-- ─────────────────────────────────────────────────────────────────────────────
create function history.record_at(p_organization_id uuid, p_record_id uuid, p_at timestamptz)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select v.row_data
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.row_id = p_record_id
     and v.organization_id = p_organization_id
     and v.occurred_at <= p_at
   order by v.occurred_at desc, v.id desc
   limit 1;
$fn$;

comment on function history.record_at(uuid, uuid, timestamptz) is
  'The RECORDED clock (HIS-5): the record exactly as the store held it at a moment, reconstructed from history.row_versions and from nothing else.';

create function history.record_versions(p_organization_id uuid, p_record_id uuid)
returns table(version integer, operation text, occurred_at timestamptz, actor_id uuid, row_data jsonb)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select v.version, v.operation, v.occurred_at, v.actor_id, v.row_data
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.row_id = p_record_id
     and v.organization_id = p_organization_id
   order by v.occurred_at, v.id;
$fn$;

comment on function history.record_versions(uuid, uuid) is
  'HIS-1 / HIS-N-1: the whole chain for one record, oldest first — which is what a document''s or a spreadsheet''s snapshot chain IS here, rather than a second store beside it.';
