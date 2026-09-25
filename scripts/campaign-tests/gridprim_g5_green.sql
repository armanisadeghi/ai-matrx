-- LANE GRID-PRIMITIVES, G5 — THE GREEN SUITE for the store's own numbering of existing records
-- and the placeholder refusals of the example door. The example door building a REAL use case
-- end to end, from the @ai-matrx/records use-case library, is proved by
-- scripts/campaign-tests/gridprim_g5_examples.ts; the column kinds (autonumber on new records,
-- created / modified time, display_format) by gridprim_g3_green.sql parts 5–7.
--
-- THE USE CASE (scripts/campaign-tests/_gridprim_clinic.sql): Dr. Ana Whitfield adds a "Visit
-- number" to Cedar Ridge Veterinary Clinic's Appointments day sheet, which already holds ten
-- visits; they must be numbered 1–10 in the order they were booked, and the next visit gets 11.
--
-- WHAT MAKES IT FAIL:
--   1  existing records left unnumbered, numbered out of booking order, or renumbered on a
--      second backfill; the next new record not continuing the sequence.
--   2  the backfill door numbering a column that is not an autonumber, or a stranger's call.
--   3  an example called "Acme …", or a row holding lorem ipsum, built anyway.

\set ON_ERROR_STOP on
\timing off

\set suite 'gridprim_g5_green.sql'
\set requires 'function:custom.formula_eval|function:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_home uuid; f_num uuid; v_res jsonb; v_nums integer[]; v_want integer[]; v_new uuid; v_caught text;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into v_home from gp where k = 'home';
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  -- ══ PART 1 — TEN VISITS NUMBERED IN BOOKING ORDER; THE NEXT ONE IS 11. ═══════════════════
  f_num := custom.field_declare(v_org, v_appts, jsonb_build_object('key', 'visit_number', 'label', 'Visit number', 'type', 'autonumber', 'sort', 5));
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_res := custom.autonumber_backfill(v_org, f_num);
  -- Booking order is created_at, ties broken by id — the older door's own order. The fixture
  -- books all ten in one transaction, so the tie-break is what decides here.
  perform set_config('role', 'postgres', true);
  select array_agg(n order by o), array_agg(o order by o) into v_nums, v_want
    from (select (custom.read_record(v_org, r.id, false) ->> 'visit_number')::integer as n,
                 row_number() over (order by r.created_at, r.id)::integer as o
            from custom.record r where r.organization_id = v_org and r.table_id = v_appts and r.data_class = 'record') x;
  perform set_config('role', 'authenticated', true);
  if (v_res ->> 'numbered')::integer is distinct from 10 or v_nums is distinct from v_want then
    raise exception '1a: the ten booked visits were not numbered in booking order: % / % vs %', v_res, v_nums, v_want;
  end if;
  v_res := custom.autonumber_backfill(v_org, f_num);
  if (v_res ->> 'numbered')::integer is distinct from 0 then raise exception '1c: a second backfill renumbered % visits', v_res ->> 'numbered'; end if;
  v_new := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Clementine (Osei)', 'species', 'Cat',
             'visit_status', 'Scheduled', 'visit_on', '2026-09-24', 'visit_fee', 142.5, 'owner_phone', '(541) 290-5518'));
  if (custom.read_record(v_org, v_new, false) ->> 'visit_number')::integer is distinct from 11 then
    raise exception '1d: the next booked visit is %, not 11', custom.read_record(v_org, v_new, false) ->> 'visit_number';
  end if;
  raise notice '1 PASS — the ten visits are 1 … 10 in booking order, a second backfill numbers nothing, Clementine is 11.';

  -- ══ PART 2 — ONLY AN AUTONUMBER COLUMN; NOBODY OUTSIDE THE CLINIC. ═══════════════════════
  begin
    perform custom.autonumber_backfill(v_org, (select v from gp where k = 'f_fee'));
    raise exception '2a: the Visit fee column was "numbered"';
  exception when foreign_key_violation then null;
  end;
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.autonumber_backfill(v_org, f_num);
    raise exception '2b: a stranger renumbered the clinic''s visits';
  exception when insufficient_privilege then null;
  end;
  raise notice '2 PASS — the fee column is refused as "not an autonumber column"; a stranger is refused (42501).';

  -- ══ PART 3 — AN EXAMPLE IS A REAL BUSINESS. ══════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.table_from_example(v_org, v_home, jsonb_build_object('business', 'Acme Veterinary',
      'tables', jsonb_build_array(jsonb_build_object('token', 'patient', 'name', 'Patients', 'titleField', 'name',
        'fields', jsonb_build_array(jsonb_build_object('key', 'name', 'label', 'Name', 'parityType', 'text')), 'rows', '[]'::jsonb))));
    raise exception '3a: an example called Acme was built';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  begin
    perform custom.table_from_example(v_org, v_home, jsonb_build_object('business', 'Cascade Mobile Grooming',
      'tables', jsonb_build_array(jsonb_build_object('token', 'booking', 'name', 'Bookings', 'titleField', 'pet',
        'fields', jsonb_build_array(jsonb_build_object('key', 'pet', 'label', 'Pet', 'parityType', 'text')),
        'rows', jsonb_build_array(jsonb_build_object('key', 'b1', 'values', jsonb_build_object('pet', 'Lorem ipsum dolor')))))));
    raise exception '3b: an example row of lorem ipsum was built';
  exception when check_violation then null;
  end;
  raise notice '3 PASS — "Acme Veterinary" and a row of lorem ipsum are refused by name: "%".', v_caught;
  raise notice 'GRIDPRIM G5 GREEN — every part passed.';
end
$t$;

rollback;
