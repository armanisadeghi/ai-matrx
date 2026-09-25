-- LANE UI-FIX-19 — A REFUSED "BRING IT BACK" NAMES ITS FIX (VERIFIER-19 #4).
--
-- THE USE CASE. The Birchwood owner (admin@admin.com) cleans up after the renovation is booked:
-- she archives the Status choices list on its own, then the whole Rooms table. A week later the
-- client adds a sunroom and she presses "Bring it back" on Rooms. Rooms' Status column takes its
-- choices from the archived list, so the store cannot bring Rooms back as it was yet. She must be
-- told exactly that, and what to do: bring "Status choices" back first. Then Rooms comes back.
--
-- WHAT MAKES IT FAIL (RED on the body before
-- uifix19_an_archived_choices_table_is_named_with_its_way_back.sql): the refusal says the Status
-- column "points at something that is not a table of this organization" — false (it is this
-- organization's table, only archived) and it names no way back.
--
-- SEAT: every door is called as `authenticated` with admin@admin.com's claims (PART 0).

\set ON_ERROR_STOP on
\timing off
\set suite 'uifix19_a_refused_restore_names_its_fix.sql'
\set requires 'function:custom.table_archive|function:custom.record_restore'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '240s';

\i scripts/campaign-tests/_storetails3_fixture.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_choices uuid; v_choices_name text; v_res jsonb; v_calls int := 0;
  v_msg text; v_n int;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  perform set_config('request.jwt.claims', c_admin_j, true);
  select nullif(f.data #>> '{config,options_table_id}', '')::uuid into v_choices
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'status'
     and f.deleted_at is null;
  select t.data ->> 'name' into v_choices_name from custom.record t where t.id = v_choices;
  if v_choices is null then
    raise exception 'FIXTURE: Rooms'' Status column names no choices table, so this suite proves nothing';
  end if;

  -- ══ PART 0. the seat ══
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception 'PART 0: not in the member seat (%)', current_user; end if;
  raise notice 'PART 0 PASS — authenticated as admin@admin.com (owner); Status takes its choices from "%"', v_choices_name;

  -- ══ R1. the choices list is archived on its own, then Rooms ══
  loop
    v_res := custom.table_archive(v_org, v_choices, 500, true);
    v_calls := v_calls + 1;
    exit when (v_res ->> 'done')::boolean or v_calls > 10;
  end loop;
  v_calls := 0;
  loop
    v_res := custom.table_archive(v_org, v_rooms, 500, true);
    v_calls := v_calls + 1;
    exit when (v_res ->> 'done')::boolean or v_calls > 10;
  end loop;
  raise notice 'R1 PASS — "%" archived on its own, then Rooms', v_choices_name;

  -- ══ R2. "Bring it back" on Rooms is refused, and the refusal names the archived list and the fix ══
  begin
    perform custom.record_restore(v_org, v_rooms);
    raise exception 'R2: Rooms came back although its Status choices are still archived';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg ilike '%not a table of this organization%' then
    raise exception 'R2 RED: the refusal says the choices table is not this organization''s, which is false, and names no fix: %', v_msg;
  end if;
  if v_msg not ilike '%' || v_choices_name || '%archived%' or v_msg not ilike '%bring "' || v_choices_name || '" back first%' then
    raise exception 'R2: the refusal does not name "%" as archived with the way back: %', v_choices_name, v_msg;
  end if;
  raise notice 'R2 PASS — refused in the store''s words: %', v_msg;
end
$t$;

-- R3 runs as its own statements, as two presses of "Bring it back" do from a screen.
do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_choices uuid; v_n int;
begin
  perform set_config('role', 'postgres', true);
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  perform set_config('request.jwt.claims', c_admin_j, true);
  select nullif(f.data #>> '{config,options_table_id}', '')::uuid into v_choices
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'status';
  perform set_config('role', 'authenticated', true);
  -- ══ R3. doing what the refusal said brings Rooms back ══
  perform custom.record_restore(v_org, v_choices);
  perform custom.record_restore(v_org, v_rooms);
  select count(*) into v_n from custom.read_records(v_org, v_rooms, false, 50, 0);
  if v_n <> 3 then
    raise exception 'R3: after bringing the choices back first, Rooms came back with % rooms (want 3)', v_n;
  end if;
  raise notice 'R3 PASS — the choices first, then Rooms: all 3 rooms are back';
end
$t$;

rollback;
