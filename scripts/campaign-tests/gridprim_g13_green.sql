-- LANE GRID-PRIMITIVES, G13 — A VIEW KEEPS THE ORDER A PERSON DRAGGED.
--
-- THE USE CASE (_gridprim_clinic.sql): Cedar Ridge Veterinary Clinic's front desk keeps a
-- "Check-in queue" view of the day's appointments and drags patients into the order they will be
-- seen. Marisol Vega (test@test.com, the front desk) drags Tango, Juniper and Maple to the top,
-- then moves Maple above Tango; Juniper's owner cancels (the visit is archived); a walk-in,
-- Bruno, arrives and lands at the bottom. Dr. Ana Whitfield (admin@admin.com) keeps her own
-- "Surgery board" view of the same table in a different order.
--
-- WHAT MAKES IT FAIL: a dragged order that does not come back in that order; a move that
-- loses the rows it did not name; positions that are not re-spaced; an unplaced row that is
-- not last by created time; an archived row still shown; two views sharing one order; a bad
-- id, a repeat or a stranger changing anything.
-- RED before the file (doors absent), GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'gridprim_g13_green.sql'
\set requires 'function:custom.view_declare|function:custom.read_records_by_ids'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
do $g$ begin
  if not has_function_privilege('authenticated', 'custom.view_record_order_set(uuid, uuid, uuid[])', 'execute')
     or not has_function_privilege('authenticated', 'custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer)', 'execute') then
    raise exception 'G13-grant: a signed-in person holds no EXECUTE on the G13 doors';
  end if;
end $g$;
\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_queue uuid; v_board uuid;
  v_juniper uuid; v_tango uuid; v_maple uuid; v_biscuit uuid; v_bruno uuid;
  v_names text[]; v_pos numeric[]; v_res jsonb; v_n integer; v_tail text[];
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into v_biscuit from gp where k = 'r1'; select v into v_juniper from gp where k = 'r2';
  select v into v_tango from gp where k = 'r5'; select v into v_maple from gp where k = 'r8';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_queue := custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Check-in queue'));

  begin
    perform custom.read_records_in_view_order(v_org, v_queue);
    raise exception 'G13a: a view ordered by its sort was read as hand-ordered';
  exception when invalid_parameter_value then null;
  end;

  -- She drags Tango, Juniper, Maple to the top.
  v_res := custom.view_record_order_set(v_org, v_queue, array[v_tango, v_juniper, v_maple]);
  perform set_config('role', 'postgres', true);
  select array_agg(r.data ->> 'patient' order by r.created_at, r.id) into v_tail from custom.record r
   where r.organization_id = v_org and r.table_id = v_appts and r.deleted_at is null
     and r.id <> all(array[v_tango, v_juniper, v_maple]);
  perform set_config('role', 'authenticated', true);

  select array_agg(d.document ->> 'patient' order by d.position nulls last, d.ord), array_agg(d.position order by d.ord)
    into v_names, v_pos
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_queue) x) d;
  if v_names[1:3] is distinct from array['Tango (Fairweather)', 'Juniper (Okafor)', 'Maple (Ferreira)']
     or v_names[4:] is distinct from v_tail
     or v_pos[1:3] is distinct from array[1024, 2048, 3072]::numeric[] or v_pos[4] is not null
     or cardinality(v_names) <> 10 then
    raise exception 'G13b: the dragged order came back as % / % (unplaced should be %)', v_names, v_pos, v_tail;
  end if;

  -- She moves Maple above Tango: only Maple and Tango named; Juniper keeps her place after them.
  v_res := custom.view_record_order_set(v_org, v_queue, array[v_maple, v_tango]);
  select array_agg(d.document ->> 'patient' order by d.ord), array_agg(d.position order by d.ord) into v_names, v_pos
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_queue) x) d;
  if v_names[1:3] is distinct from array['Maple (Ferreira)', 'Tango (Fairweather)', 'Juniper (Okafor)']
     or v_pos[1:3] is distinct from array[1024, 2048, 3072]::numeric[] then
    raise exception 'G13c: the move lost a row or did not re-space: % / %', v_names, v_pos;
  end if;

  -- Juniper cancels; Bruno walks in.
  perform custom.record_delete(v_org, v_juniper);
  v_bruno := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Bruno (Salazar)', 'species', 'Dog',
               'visit_status', 'Checked in', 'visit_on', '2026-09-22', 'desk_notes', 'Walk-in: limping on the left fore'));
  -- One transaction has one now(); Bruno arrived forty minutes after the day was booked.
  perform set_config('role', 'postgres', true);
  update custom.record set created_at = created_at + interval '40 minutes' where organization_id = v_org and id = v_bruno;
  perform set_config('role', 'authenticated', true);
  select array_agg(d.document ->> 'patient' order by d.ord) into v_names
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_queue) x) d;
  perform set_config('role', 'postgres', true);
  select array_agg(r.data ->> 'patient' order by r.created_at, r.id) into v_tail from custom.record r
   where r.organization_id = v_org and r.table_id = v_appts and r.deleted_at is null
     and r.id <> all(array[v_tango, v_maple]);
  perform set_config('role', 'authenticated', true);
  if v_names[1:2] is distinct from array['Maple (Ferreira)', 'Tango (Fairweather)']
     or v_names[3:] is distinct from v_tail
     or v_names[cardinality(v_names)] is distinct from 'Bruno (Salazar)' or 'Juniper (Okafor)' = any(v_names)
     or cardinality(v_names) <> 10 then
    raise exception 'G13d: after the cancellation and the walk-in the queue reads %', v_names;
  end if;
  -- A page is the same page: rows 2-3.
  select array_agg(d.document ->> 'patient' order by d.ord) into v_names
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_queue, false, 2, 1) x) d;
  if v_names is distinct from array['Tango (Fairweather)', v_tail[1]] then
    raise exception 'G13e: page 2 of 2-row pages read %', v_names;
  end if;
  -- The next set forgets the archived row.
  v_res := custom.view_record_order_set(v_org, v_queue, array[v_bruno]);
  if (v_res ->> 'positioned')::integer <> 3 then
    raise exception 'G13f: Bruno + Maple + Tango should be the three placed rows (Juniper archived): %', v_res;
  end if;
  raise notice 'G13 queue PASS — dragged, moved, re-spaced; a cancelled visit leaves the queue and its place; a walk-in lands last; pages are stable.';

  -- Refusals change nothing.
  begin
    perform custom.view_record_order_set(v_org, v_queue, array[v_maple, 'c0ffee00-1b2c-4d3e-8f00-000000000abc'::uuid]);
    raise exception 'G13g: an invented record was ordered';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform custom.view_record_order_set(v_org, v_queue, array[v_maple, v_maple]);
    raise exception 'G13h: a repeated record was ordered';
  exception when invalid_parameter_value then null;
  end;
  select array_agg(d.document ->> 'patient' order by d.ord) into v_names
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_queue, false, 3, 0) x) d;
  if v_names is distinct from array['Bruno (Salazar)', 'Maple (Ferreira)', 'Tango (Fairweather)'] then
    raise exception 'G13i: a refused call changed the queue: %', v_names;
  end if;

  -- Dr. Whitfield's own view keeps its own order.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_board := custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Surgery board'));
  perform custom.view_record_order_set(v_org, v_board, array[v_biscuit]);
  select array_agg(d.document ->> 'patient' order by d.ord) into v_names
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_board, false, 1, 0) x) d;
  if v_names is distinct from array['Biscuit (Hollis)'] then raise exception 'G13j: the surgery board reads %', v_names; end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  select array_agg(d.document ->> 'patient' order by d.ord) into v_names
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_queue, false, 1, 0) x) d;
  if v_names is distinct from array['Bruno (Salazar)'] then raise exception 'G13k: the queue took the surgery board''s order: %', v_names; end if;

  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.view_record_order_set(v_org, v_queue, array[v_maple]);
    raise exception 'G13l: a stranger reordered the queue';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.read_records_in_view_order(v_org, v_queue);
    raise exception 'G13m: a stranger read the queue';
  exception when insufficient_privilege then null;
  end;
  raise notice 'G13 PASS — refusals change nothing; two views keep two orders; a stranger is refused.';
  raise notice 'GRIDPRIM G13 GREEN — every part passed.';
end $t$;
rollback;
