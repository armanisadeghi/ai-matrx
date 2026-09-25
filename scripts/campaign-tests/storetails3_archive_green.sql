-- LANE STORE-TAILS-3 — WHAT ONE ARCHIVE TAKES, ONE RESTORE BRINGS BACK.
--
-- THE USE CASE. The Birchwood owner archives the Rooms table once the renovation is booked
-- ("Archive this table", which a screen drives in chunks until it says done), and a week later
-- the client adds a sunroom and she presses "Bring it back". She expects Rooms exactly as it
-- was: every column, every room that was in it, each room's quotes still linked and still
-- adding up. The Garage had been archived on its own the day before (it was cut from the job):
-- it stays archived, because that was a different decision.
--
-- WHAT MAKES IT FAIL (RED on the bodies before storetails3_what_one_archive_takes_one_restore_brings_back.sql):
-- the archive leaves no event that says what it took; or "Bring it back" returns the table with
-- no columns or no rows; or it brings back the Garage; or Kitchen's quotes are no longer linked
-- (Quoted so far is not 17,350); or a second archive/restore cycle brings back a room archived on
-- its own in between.
--
-- SEAT: every door is called as `authenticated` with admin@admin.com's claims (PART 0).

\set ON_ERROR_STOP on
\timing off
\set suite 'storetails3_archive_green.sql'
\set requires 'function:custom.table_archive|function:custom.record_restore|relation:history.migration_log'
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
  v_org uuid; v_rooms uuid; v_kitchen uuid; v_bath uuid; v_garage uuid;
  v_res jsonb; v_calls int := 0; v_fields_live int; v_fields_all int; v_edges_before int; v_edges int;
  v_ev record; v_doc jsonb; v_n int; v_took text;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select v into v_kitchen from st3 where k = 'Kitchen';
  select v into v_bath from st3 where k = 'Primary bath';
  select v into v_garage from st3 where k = 'Garage';
  perform set_config('request.jwt.claims', c_admin_j, true);

  select count(*) into v_fields_all from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.deleted_at is null;
  select count(*) into v_edges_before from platform.associations a
   where a.organization_id = v_org and a.deleted_at is null
     and (a.source_id = v_kitchen or a.target_id = v_kitchen);

  -- ══ PART 0. the seat ══
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception 'PART 0: the suite is not in the member seat (%)', current_user; end if;
  raise notice 'PART 0 PASS — every door below is called as authenticated (admin@admin.com, owner); Rooms has % columns, Kitchen % live edges',
    v_fields_all, v_edges_before;

  -- ══ A1. the Garage is archived on its own first; then the table, in chunks of one ══
  perform custom.record_delete(v_org, v_garage);
  loop
    v_res := custom.table_archive(v_org, v_rooms, 1, true);
    v_calls := v_calls + 1;
    exit when (v_res ->> 'done')::boolean or v_calls > 10;
  end loop;
  if not (v_res ->> 'done')::boolean or not (v_res ->> 'table_archived')::boolean or v_calls <> 2 then
    raise exception 'A1: the chunked archive did not finish as two calls (Kitchen, then Primary bath and the table) (% calls): %', v_calls, v_res;
  end if;
  raise notice 'A1 PASS — Garage archived on its own; Rooms archived in % calls of one ("%")', v_calls, v_res ->> 'message';

  -- ══ A2. ONE archive event names exactly what it took ══
  perform set_config('role', 'postgres', true);
  select m.* into v_ev from history.migration_log m
   where m.organization_id = v_org and m.verb = 'archive' and m.target_id = v_rooms and m.undone_at is null;
  get diagnostics v_n = row_count;
  perform set_config('role', 'authenticated', true);
  if v_ev.id is null then
    raise exception 'A2: archiving Rooms left no archive event — nothing says what it took, so nothing can bring it back as it was';
  end if;
  v_took := v_ev.inverse -> 'took';
  if coalesce((v_ev.inverse ->> 'open')::boolean, true)
     or v_took not like '%' || v_kitchen || '%' or v_took not like '%' || v_bath || '%'
     or v_took like '%' || v_garage || '%'
     or jsonb_array_length(v_ev.inverse -> 'took') <> 1 + 2 + v_fields_all then
    raise exception 'A2: the event is open, or does not name exactly the table, its % columns, Kitchen and Primary bath (and not the Garage): open=% took=%',
      v_fields_all, v_ev.inverse ->> 'open', v_ev.inverse -> 'took';
  end if;
  raise notice 'A2 PASS — one closed archive event: % rows (the table, % columns, Kitchen, Primary bath), the Garage not among them',
    jsonb_array_length(v_ev.inverse -> 'took'), v_fields_all;
  perform set_config('role', 'postgres', true);
  insert into st3 values ('event', v_ev.id);
  perform set_config('role', 'authenticated', true);
  perform set_config('st3.fields_all', v_fields_all::text, true);
  perform set_config('st3.edges_before', v_edges_before::text, true);
end
$t$;

-- A3 runs as its own statement, as "Bring it back" does from a screen: History marks one
-- statement with one verb.
do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_kitchen uuid; v_bath uuid; v_garage uuid;
  v_res jsonb; v_calls int := 0; v_fields_live int; v_fields_all int; v_edges_before int; v_edges int;
  v_ev record; v_doc jsonb; v_n int; v_took text;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select v into v_kitchen from st3 where k = 'Kitchen';
  select v into v_bath from st3 where k = 'Primary bath';
  select v into v_garage from st3 where k = 'Garage';
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_fields_all := current_setting('st3.fields_all')::int;
  v_edges_before := current_setting('st3.edges_before')::int;
  perform set_config('role', 'postgres', true);
  select m.* into v_ev from history.migration_log m where m.id = (select v from st3 where k = 'event');
  perform set_config('role', 'authenticated', true);

  -- ══ A3. "Bring it back" brings back the unit ══
  perform custom.record_restore(v_org, v_rooms);
  perform set_config('role', 'postgres', true);
  select count(*) into v_fields_live from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.deleted_at is null;
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from custom.read_records(v_org, v_rooms, false, 50, 0);
  if v_fields_live <> v_fields_all then
    raise exception 'A3: Rooms came back with % of its % columns', v_fields_live, v_fields_all;
  end if;
  if v_n <> 2 then
    raise exception 'A3: Rooms came back with % rooms (want Kitchen and Primary bath, 2)', v_n;
  end if;
  select d.document into v_doc from custom.read_records(v_org, v_rooms, false, 50, 0) d where d.document ->> 'room_name' = 'Kitchen';
  if (v_doc ->> 'quoted_total')::numeric is distinct from 17350 or (v_doc ->> 'budget_with_contingency')::numeric is distinct from 19800 then
    raise exception 'A3: Kitchen came back but reads quoted % / contingency % (want 17,350 / 19,800): %',
      v_doc ->> 'quoted_total', v_doc ->> 'budget_with_contingency', v_doc;
  end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_edges from platform.associations a
   where a.organization_id = v_org and a.deleted_at is null
     and (a.source_id = v_kitchen or a.target_id = v_kitchen);
  if (select deleted_at from custom.record where organization_id = v_org and id = v_garage) is null then
    perform set_config('role', 'authenticated', true);
    raise exception 'A3: the Garage, archived on its own before the table, came back with it';
  end if;
  if (select undone_at from history.migration_log where id = v_ev.id) is null then
    perform set_config('role', 'authenticated', true);
    raise exception 'A3: the archive event was not stamped undone';
  end if;
  perform set_config('role', 'authenticated', true);
  if v_edges <> v_edges_before then
    raise exception 'A3: Kitchen has % live edges after the restore (had %)', v_edges, v_edges_before;
  end if;
  raise notice 'A3 PASS — Rooms is back with all % columns, Kitchen and Primary bath (Kitchen: 19,800, quoted 17,350, % of % edges); the Garage stays archived; the event is undone',
    v_fields_live, v_edges, v_edges_before;

end
$t$;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_kitchen uuid; v_bath uuid; v_garage uuid;
  v_res jsonb; v_calls int := 0; v_fields_live int; v_fields_all int; v_edges_before int; v_edges int;
  v_ev record; v_doc jsonb; v_n int; v_took text;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select v into v_kitchen from st3 where k = 'Kitchen';
  select v into v_bath from st3 where k = 'Primary bath';
  select v into v_garage from st3 where k = 'Garage';
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_fields_all := current_setting('st3.fields_all')::int;
  perform set_config('role', 'postgres', true);
  select m.* into v_ev from history.migration_log m where m.id = (select v from st3 where k = 'event');
  perform set_config('role', 'authenticated', true);

  -- ══ A4. the restore is on the record as the undo of that archive ══
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from history.row_versions h
   where h.entity_type = 'custom.record' and h.organization_id = v_org and h.operation = 'RESTORE'
     and h.migration_id = v_ev.id and h.operation_name = 'undo of archive';
  perform set_config('role', 'authenticated', true);
  if v_n < 1 + 2 + v_fields_all then
    raise exception 'A4: only % RESTORE versions carry the archive event (want %)', v_n, 1 + 2 + v_fields_all;
  end if;
  raise notice 'A4 PASS — % History versions read "undo of archive" and carry the event''s id', v_n;

  -- ══ A5. a second cycle: Kitchen archived on its own in between stays archived ══
  perform custom.record_delete(v_org, v_kitchen);
  loop
    v_res := custom.table_archive(v_org, v_rooms, 50, true);
    exit when (v_res ->> 'done')::boolean;
  end loop;
  perform custom.record_restore(v_org, v_rooms);
  select count(*) into v_n from custom.read_records(v_org, v_rooms, false, 50, 0);
  perform set_config('role', 'postgres', true);
  select count(*) into v_fields_live from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.deleted_at is null;
  perform set_config('role', 'authenticated', true);
  if v_n <> 1 or v_fields_live <> v_fields_all
     or (select count(*) from custom.read_records(v_org, v_rooms, false, 50, 0) d where d.document ->> 'room_name' = 'Primary bath') <> 1 then
    raise exception 'A5: the second restore brought back % rooms and % columns (want Primary bath only, and all % columns)', v_n, v_fields_live, v_fields_all;
  end if;
  raise notice 'A5 PASS — second cycle: Primary bath and all % columns back; Kitchen, archived on its own in between, stays archived', v_fields_live;
  raise notice 'storetails3_archive_green.sql: ALL PASS (A1-A5)';
end
$t$;

-- The relation halves are checked at commit (a deferred constraint trigger); ask it now, so a
-- restore that left a room pointing at quotes that no longer point back fails HERE.
set constraints all immediate;
\echo 'storetails3_archive_green.sql: deferred relation checks passed'

rollback;
