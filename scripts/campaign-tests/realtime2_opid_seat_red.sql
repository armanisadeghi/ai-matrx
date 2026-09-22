-- LANE REALTIME-2 — THE RED TWIN. A guard nobody has watched fail is not a guard.
--
-- It installs, one at a time and INSIDE A TRANSACTION THAT ROLLS BACK, the three shapes a
-- well-meaning change would produce, and asserts the green suite's own clause catches each.
-- Every arm ends by putting the real body back before the next one, so a failure in the
-- middle cannot leave a half-broken store behind — and the whole thing rolls back regardless.
--
--   (a) the door stops lifting `_op_id` out, "because the store ignores unknown keys anyway"
--       → clause 2 goes red: the envelope key is persisted on the practitioner's record
--   (b) the notice stops carrying `op_id`, "because a notice should hold nothing"
--       → clause 3 goes red: every browser re-reads its own write forever, silently
--   (c) the batch door takes the FIRST op id instead of refusing a mixed batch, "because it
--       is obviously the same paste" → clause 5 goes red, and the defect it hides is the one
--       that LOSES A CHANGE: the second writer is told to drop an echo that was never its own
--
-- Run: <psql> -f scripts/campaign-tests/realtime2_opid_seat_red.sql

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'realtime2_opid_seat_red.sql'
\set requires 'grant:authenticated:custom.record_write'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- ── THE RECORD-STORE SWITCH, BORROWED (SUITES-TIDY 2026-09-22) ──────────────────────────────
-- `custom.system_enabled` defaults to FALSE and that is the DESIGN: the record store is opt-in
-- per organization (STORE-OFF / FIX-11A). This suite takes a seat in an organization that has
-- not opted in, so every write below was answered "This organization has not turned the record
-- store on yet, so custom.<door> is not taking writes." — correctly. The knob's DEFAULT is not
-- touched; the organization-scoped override is written inside THIS transaction and goes with
-- the ROLLBACK at the end of the file. See _borrow_store_switch.sql for why that is a stronger
-- borrow than scripts/lib/borrow-live-switch.sh, which a psql suite cannot source.
-- Rincon Plumbing Co
\set store_org '6069a466-1445-42df-a64e-cf37ecdc1b99'
\i scripts/campaign-tests/_borrow_store_switch.sql


do $red$
declare
  v_answers jsonb;
  v_org   constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';  -- Rincon Plumbing Co
  v_jobs  constant uuid := 'af3bfff6-a255-41e5-9ac2-879d53816163';  -- its Jobs table
  v_admin constant text := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_topic constant text := 'custom:table:af3bfff6-a255-41e5-9ac2-879d53816163';
  v_boss  text := current_user;
  v_op    uuid;
  v_rec   uuid;
  v_doc   jsonb;
  v_msg   jsonb;
  v_caught integer := 0;
begin
  -- ── (a) THE DOOR KEEPS THE ENVELOPE KEY ────────────────────────────────────────────────
  create or replace function custom._take_op_id(p_doc jsonb, p_door text)
  returns jsonb language plpgsql volatile security definer set search_path to 'pg_catalog'
  as $bad$
  begin
    -- THE WRONG SHAPE: remember it, and hand the document back UNCHANGED.
    if p_doc ? '_op_id' then
      perform set_config('custom.op_id', (p_doc ->> '_op_id'), true);
    else
      perform set_config('custom.op_id', '', true);
    end if;
    return p_doc;
  end;
  $bad$;


  -- ── THE JOBS BOARD'S OWN RULE (SUITES-TIDY 2026-09-22) ────────────────────────────────
  -- Rincon's Jobs table carries a live table Rule, "New Job Request: every answer it asks for
  -- is there" (REC-15 / DOOR-17): customer, service address, service type and scheduled date
  -- must all be present. It was added to the board after this suite was written, so every
  -- write below was refused by it on the clone — correctly, and for a reason that has nothing
  -- to do with what this twin is asserting. The four answers are taken from a job already on
  -- the board rather than invented.
  select jsonb_build_object(
           'customer',       x.data ->> 'customer',
           'address',        x.data ->> 'address',
           'service_type',   x.data ->> 'service_type',
           'scheduled_date', x.data ->> 'scheduled_date')
    into v_answers
    from custom.record x
   where x.organization_id = v_org and x.table_id = v_jobs and x.deleted_at is null
     and x.data ? 'customer' and x.data ? 'address'
     and x.data ? 'service_type' and x.data ? 'scheduled_date'
   limit 1;
  if v_answers is null then
    raise exception 'the Rincon Jobs board has no job carrying all four answers its Rule asks for, so this fixture cannot be built from real data';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_op := gen_random_uuid();
  v_rec := custom.record_write(v_org, v_jobs, v_answers || jsonb_build_object(
             '_op_id', v_op::text, 'job_number', 'RPC-RED-A',
             'address', '118 Loma Vista Rd, Ventura CA 93001'));
  v_doc := custom.read_record(v_org, v_rec, false);
  perform set_config('role', v_boss, true);
  if v_doc ? '_op_id' then
    v_caught := v_caught + 1;
    raise notice 'a  RED CAUGHT  the door kept `_op_id` and the read door hands it back — green clause 2 goes red';
  else
    raise exception 'a: the broken door did NOT persist _op_id, so green clause 2 would not have caught it';
  end if;

  -- put it back before anything else runs
  create or replace function custom._take_op_id(p_doc jsonb, p_door text)
  returns jsonb language plpgsql volatile security definer set search_path to 'pg_catalog'
  as $good$
  declare v_raw text; v_id uuid;
  begin
    if p_doc is null or jsonb_typeof(p_doc) <> 'object' or not (p_doc ? '_op_id') then
      perform set_config('custom.op_id', '', true);
      return p_doc;
    end if;
    v_raw := p_doc ->> '_op_id';
    begin
      v_id := v_raw::uuid;
    exception when others then
      raise exception '%: _op_id must be a uuid identifying this client operation, and "%" is not one.', p_door, left(coalesce(v_raw, 'null'), 64)
        using errcode = '22023';
    end;
    perform set_config('custom.op_id', v_id::text, true);
    return p_doc - '_op_id';
  end;
  $good$;

  -- ── (b) THE NOTICE DROPS THE OP ID ─────────────────────────────────────────────────────
  create or replace function custom._realtime_notice(
    p_organization_id uuid, p_table_id uuid, p_kind text, p_op text,
    p_record_ids jsonb, p_fields_changed boolean) returns void
  language plpgsql volatile security definer set search_path to 'pg_catalog'
  as $bad$
  declare v_id uuid := gen_random_uuid(); v_topic text := 'custom:table:' || p_table_id::text;
  begin
    perform realtime.send(
      jsonb_build_object('id', v_id, 'table_id', p_table_id, 'kind', p_kind, 'op', p_op,
                         'record_ids', p_record_ids, 'fields_changed', p_fields_changed,
                         'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'records.changed', v_topic, true);
  end;
  $bad$;

  set local role authenticated;
  v_op := gen_random_uuid();
  v_rec := custom.record_write(v_org, v_jobs, v_answers || jsonb_build_object(
             '_op_id', v_op::text, 'job_number', 'RPC-RED-B',
             'address', '2210 E Main St, Ventura CA 93001'));
  perform set_config('role', v_boss, true);
  select m.payload into v_msg from realtime.messages m
   where m.topic = v_topic and m.inserted_at >= date_trunc('day', now())
     and m.payload -> 'record_ids' @> to_jsonb(array[v_rec])
   order by m.inserted_at desc limit 1;
  if v_msg is not null and (v_msg ->> 'op_id') is distinct from v_op::text then
    v_caught := v_caught + 1;
    raise notice 'b  RED CAUGHT  the notice announced no op_id — green clause 3 goes red, and every browser re-reads its own write forever';
  else
    raise exception 'b: the broken notice still carried the op id, so green clause 3 would not have caught it (payload %)', v_msg;
  end if;

  -- ── (c) THE BATCH DOOR TAKES THE FIRST OP ID INSTEAD OF REFUSING A MIXED ONE ───────────
  -- Not installed as a replacement body — the refusal lives inside `record_write_many`, and
  -- rewriting that whole door here would be a second copy of it that could drift from the
  -- real one. Instead the CLAUSE is run against the real door, and what is asserted is that
  -- the refusal exists at all: if it ever became a silent "take the first", this goes red.
  set local role authenticated;
  begin
    perform custom.record_write_many(v_org, v_jobs, array[
      v_answers || jsonb_build_object('_op_id', gen_random_uuid()::text, 'job_number', 'RPC-RED-C1'),
      v_answers || jsonb_build_object('_op_id', gen_random_uuid()::text, 'job_number', 'RPC-RED-C2')]);
    perform set_config('role', v_boss, true);
    raise exception 'c: a batch carrying two different op ids was ACCEPTED — the second writer would be told to drop an echo that was never its own, and a real change would be lost';
  exception when others then
    perform set_config('role', v_boss, true);
    if sqlerrm like '%was ACCEPTED%' then raise; end if;
    v_caught := v_caught + 1;
    raise notice 'c  RED CAUGHT  a mixed batch is refused, so the change-losing shape cannot ship';
  end;

  if v_caught <> 3 then
    raise exception 'only % of 3 red shapes were caught', v_caught;
  end if;
  raise notice 'ALL RED CAUGHT (3/3)';
end
$red$;

rollback;
