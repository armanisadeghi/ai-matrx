-- LANE GRID-PRIMITIVES, G12 — EVERY TABLE COUNTS ITS ROWS, EVERY ROW SHOWS ITS HEADER
-- (INTEG-SERVER's two shapes; the `record_read` empty-header defect).
--
-- THE USE CASE (_gridprim_clinic.sql): Cedar Ridge Veterinary Clinic's front desk lists its
-- tables for the `dataset` tool and opens the day's appointments. The clinic owner, Dr. Ana
-- Whitfield (admin@admin.com), also runs her own Workspace — a different organization whose
-- rows the clinic's desk must never be answered about. Marisol Vega (test@test.com, the front
-- desk) adds a walk-in.
--
-- WHAT MAKES IT FAIL: a count that includes a row the reader may not see, or answers a Table
-- she may not know / an invented id; a header with no created time or version; a header that
-- names somebody else as its creator; a stranger answered at all.
-- RED before the file (doors absent), GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'gridprim_g12_green.sql'
\set requires 'function:custom.query_visible_ids'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
-- The grant is judged BEFORE the fixture, because the fixture re-opens declared doors inside
-- this transaction and would hide a door a real signed-in connection is refused.
do $g$ begin
  if not has_function_privilege('authenticated', 'custom.table_row_counts(uuid, uuid[])', 'execute')
     or not has_function_privilege('authenticated', 'custom.record_headers(uuid, uuid[])', 'execute') then
    raise exception 'G12-grant: a signed-in person holds no EXECUTE on custom.table_row_counts / custom.record_headers — apply gridprim_a_signed_in_person_may_count_rows_and_read_headers.sql';
  end if;
end $g$;
\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  c_invented constant uuid := 'c0ffee00-1b2c-4d3e-8f00-000000000abc';
  v_org uuid; v_appts uuid; v_private uuid; v_walkin uuid; v_other uuid; v_n bigint; v_agg bigint; v_h record; v_cnt integer; v_foreign_tbl uuid;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';

  -- A live row of ANOTHER organization (any other organization's record; the wall must hide it).
  select r.id, r.table_id into v_private, v_foreign_tbl from custom.record r
   where r.organization_id <> v_org and r.data_class = 'record' and r.deleted_at is null
     and r.table_id not in (custom.table_kernel_id(), custom.field_kernel_id()) limit 1;
  select r.id into v_other from custom.record r where r.organization_id = v_org and r.table_id = v_appts
   and r.deleted_at is null order by r.created_at limit 1;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_walkin := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Bruno (Salazar)', 'species', 'Dog', 'visit_status', 'Checked in', 'visit_on', '2026-09-22', 'desk_notes', 'Walk-in: limping on the left fore'));

  -- ══ counts ══
  select count(*)::integer into v_cnt from custom.table_row_counts(v_org, array[v_appts, c_invented, v_appts, v_foreign_tbl]);
  select c.visible_rows into v_n from custom.table_row_counts(v_org, array[v_appts, c_invented]) c where c.table_id = v_appts;
  select a.row_count into v_agg from custom.record_aggregate(v_org, v_appts) a;
  if v_cnt <> 1 or v_n is distinct from 11::bigint or v_n is distinct from v_agg then
    raise exception 'G12a: Marisol''s counts were % rows / % appointments / aggregate % (want 1 row, 11, equal)', v_cnt, v_n, v_agg;
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  select c.visible_rows into v_n from custom.table_row_counts(v_org, array[v_appts]) c;
  if v_n is distinct from 11::bigint then raise exception 'G12b: the owner counts % appointments, not 11', v_n; end if;
  raise notice 'G12 counts PASS — 11 appointments for Marisol and the owner, equal to record_aggregate''s count; a repeat answered once; an invented id and another organization''s Table not at all.';

  -- ══ headers ══
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*)::integer into v_cnt from custom.record_headers(v_org, array[v_walkin, v_other, v_private, c_invented]);
  if v_cnt <> 2 then raise exception 'G12c: Marisol got % headers for her walk-in, a shared row, another organization''s row and an invented id (want 2)', v_cnt; end if;
  select * into v_h from custom.record_headers(v_org, array[v_walkin]);
  if v_h.table_id is distinct from v_appts or v_h.created_at is null or v_h.updated_at is null
     or coalesce(v_h.version, 0) < 1 or not v_h.mine or v_h.created_by is distinct from c_dana then
    raise exception 'G12d: the walk-in''s header is wrong: %', row_to_json(v_h);
  end if;
  select * into v_h from custom.record_headers(v_org, array[v_other]);
  if v_h.mine or v_h.created_by is not null or v_h.created_at is null then
    raise exception 'G12e: a row Marisol did not make names a creator or lacks its time: %', row_to_json(v_h);
  end if;
  raise notice 'G12 headers PASS — the walk-in: created %, version %, hers; a shared row names no creator; another organization''s row and an invented id get nothing.', v_h.created_at, v_h.version;

  -- ══ the defect: the history door the client read is not a client door ══
  begin
    perform 1 from history.record_versions(v_org, v_walkin);
    raise notice 'NOTE — history.record_versions answered this seat (the clone grants it here).';
  exception when insufficient_privilege then
    raise notice 'G12 defect PASS — history.record_versions refuses the member seat (what emptied record_read''s header); record_headers answers it.';
  end;

  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.table_row_counts(v_org, array[v_appts]);
    raise exception 'G12f: a stranger counted the clinic''s appointments';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.record_headers(v_org, array[v_walkin]);
    raise exception 'G12g: a stranger read a header';
  exception when insufficient_privilege then null;
  end;
  raise notice 'GRIDPRIM G12 GREEN — every part passed.';
end $t$;
rollback;
