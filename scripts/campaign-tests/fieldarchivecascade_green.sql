-- LANE FIELD-ARCHIVE-CASCADE — A TABLE'S ARCHIVE TAKES ITS FIELD DEFINITIONS WITH IT, AND ITS RESTORE
-- BRINGS BACK EXACTLY THOSE.
--
-- THE USE CASE. The Birchwood Avenue renovation (the STORE-TAILS-3 fixture): the owner tracks Rooms
-- (room name, status, budget, a contingency formula, the quotes for each room and their rollup).
-- Earlier in the week she retired the Status column on purpose. Then Rooms is archived by a path that
-- is not the Trash door — the way the context follow, custom._ctx_store_type, the mover or a test's
-- clean-up archive a Table: one UPDATE of the Table row's deleted_at at a moment of their own.
-- Later Rooms is brought back from Trash.
--
-- WHAT MAKES IT FAIL (RED on the bodies before fieldarchivecascade_a_tables_fields_go_and_come_back_with_it.sql):
--   B2  the Table is archived and its columns stay live (production 2026-09-30: 42 such columns, in
--       3 organizations), or a column is archived at a moment other than the Table's;
--   B3  a later write to one of those column definitions is refused by FLD-8 ("the field … says it
--       belongs to a table this organization does not have") — what stopped Copy again;
--   B4  "Bring it back" returns Rooms without the columns its archive took, or brings back Status,
--       which she had retired before.
--
-- SEAT: the archive in B2 is the store owner's own statement (those paths run as the owner role);
-- the restore in B4 is called as `authenticated` with admin@admin.com's claims. Everything is rolled
-- back; the fixture organization never exists outside this transaction.

\set ON_ERROR_STOP on
\timing off
\set suite 'fieldarchivecascade_green.sql'
\set requires 'function:custom.record_restore|function:custom._work_approvals_withdraw_on_archive'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '240s';

\i scripts/campaign-tests/_storetails3_fixture.sql

-- B1. Status is retired by a person first, through its own door, at a moment of its own.
do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_status uuid;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select f.id into v_status from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'status';
  insert into st3 values ('status', v_status);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  perform custom.field_retire(v_org, v_status);
  perform set_config('role', 'postgres', true);
  -- The retire door stamps the transaction's now(); a person's retire is an earlier transaction, so
  -- its moment is earlier than the Table's archive below. Said as a moment of its own, the way the
  -- two would be on a real day.
  update custom.record set deleted_at = now() - interval '2 days'
   where organization_id = v_org and id = v_status;
  raise notice 'B1 PASS — Status retired by a person, two days before the table is archived';
end
$t$;

-- B2. Rooms is archived the way the follow, the mover and _ctx_store_type archive a Table.
do $t$
declare
  v_org uuid; v_rooms uuid; v_status uuid; v_at timestamptz; v_live int; v_off int; v_all int; v_status_at timestamptz;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select v into v_status from st3 where k = 'status';
  select count(*) into v_all from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.id <> v_status;
  update custom.record set deleted_at = clock_timestamp()
   where organization_id = v_org and id = v_rooms
  returning deleted_at into v_at;
  select count(*) filter (where f.deleted_at is null),
         count(*) filter (where f.deleted_at is not null and f.deleted_at <> v_at and f.id <> v_status)
    into v_live, v_off
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text;
  select deleted_at into v_status_at from custom.record where organization_id = v_org and id = v_status;
  if v_live > 0 then
    raise exception 'B2 RED: Rooms is archived and % of its % columns are still live', v_live, v_all;
  end if;
  if v_off > 0 then
    raise exception 'B2 RED: % columns were archived at a moment other than the table''s', v_off;
  end if;
  if v_status_at >= v_at then
    raise exception 'B2 RED: the column Status that a person retired earlier was re-stamped to the table''s moment';
  end if;
  raise notice 'B2 PASS — Rooms archived outside the Trash door: its % columns archived at its own moment; Status keeps its earlier one', v_all;
end
$t$;

-- B3. A later write to a column definition of the archived Table is not refused by FLD-8.
do $t$
declare
  v_org uuid; v_rooms uuid; v_budget uuid; v_msg text;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select f.id into v_budget from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'budget';
  begin
    -- The shape of a rerun's restamp of a held column: the copy's own words written again.
    update custom.record set data = data || jsonb_build_object('label', 'Budget')
     where organization_id = v_org and id = v_budget;
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%belongs to a table this organization does not have%' then
      raise exception 'B3 RED: a later write to the column Budget of the archived Rooms is refused by FLD-8: %', v_msg;
    end if;
    raise;
  end;
  raise notice 'B3 PASS — a later write to a column of the archived Rooms is not refused by FLD-8';
end
$t$;

-- B4. "Bring it back" (its own statement, as from a screen) returns exactly the columns the archive took.
do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_status uuid; v_live int; v_all int; v_status_live boolean; v_rows int;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select v into v_status from st3 where k = 'status';
  select count(*) into v_all from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.id <> v_status;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  perform custom.record_restore(v_org, v_rooms);
  select count(*) into v_rows from custom.read_records(v_org, v_rooms, false, 50, 0);
  perform set_config('role', 'postgres', true);
  select count(*) filter (where f.deleted_at is null and f.id <> v_status) into v_live
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text;
  select deleted_at is null into v_status_live from custom.record where organization_id = v_org and id = v_status;
  if v_live <> v_all then
    raise exception 'B4 RED: Rooms came back with % of the % columns its archive took', v_live, v_all;
  end if;
  if v_status_live then
    raise exception 'B4 RED: bringing Rooms back also brought back Status, which a person had retired before';
  end if;
  if v_rows <> 3 then
    raise exception 'B4 RED: Rooms came back reading % rooms (want Kitchen, Primary bath, Garage: 3)', v_rows;
  end if;
  raise notice 'B4 PASS — Rooms brought back with its % columns and its 3 rooms; Status stays retired', v_all;
end
$t$;

rollback;
