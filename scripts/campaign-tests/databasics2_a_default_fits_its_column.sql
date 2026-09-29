-- LANE DATA-V2-BASICS-2 — A COLUMN'S DEFAULT FITS THE COLUMN (BREAKER-2 B2-01 S1, B2-14).
--
-- THE USE CASE: a physical-therapy clinic's visit log (admin@admin.com's Workspace).
--   A. "Sessions Prescribed" (a number) with default "abc": refused, by name;
--   B. with default "12": kept as the number 12, and a new visit starts with 12;
--   C. "Priority" (Routine, Urgent) with default "Rutine": refused; "routine": kept;
--   D. "Needs Interpreter" (a tick box) with default "maybe": refused;
--   E. "Referral Note" (text) with default "Pending", changed to a number: the change lands and the
--      default goes (it cannot hold "Pending"); "Copay Note" with default "30", changed to a number: 30.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics2_a_default_fits_its_column.sql
-- ITS RED: before the campaign file it fails at A (the default "abc" is accepted).

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics2_a_default_fits_its_column.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2d1"}', true);

do $t$
declare
  c_ws   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_home uuid;
  c_tbl  uuid;
  v_f    uuid;
  v_p    uuid;
  v_t    uuid;
  v_c    uuid;
  v_r    uuid;
  refused text;
  s jsonb := '{}';
begin
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Visit Log Home'));
  c_tbl := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Patient visit log', 'slug', 'patient_visit_log_databasics2', 'type', 'entity',
    'label_singular', 'Visit', 'label_plural', 'Visits', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'patient', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_tbl, '{"key":"patient","label":"Patient","type":"text"}');
  -- A
  begin
    perform custom.field_declare(c_ws, c_tbl, '{"key":"sessions_prescribed","label":"Sessions Prescribed","type":"number","default":"abc"}');
    refused := null;
  exception when sqlstate '23514' then refused := sqlerrm;
  end;
  if refused is null then raise exception 'A: the default "abc" was accepted on a number column'; end if;
  s := s || jsonb_build_object('a', refused);
  -- B
  v_f := custom.field_declare(c_ws, c_tbl, '{"key":"sessions_prescribed","label":"Sessions Prescribed","type":"number","default":"12"}');
  v_r := custom.record_write(c_ws, c_tbl, '{"patient":"Grace Kim"}');
  s := s || jsonb_build_object('b_field', v_f, 'b_row', v_r);
  -- C
  v_p := custom.field_declare(c_ws, c_tbl, '{"key":"priority","label":"Priority","parity_type":"select","options":["Routine","Urgent"]}');
  begin
    perform custom.field_update(c_ws, v_p, '{"default":"Rutine"}');
    refused := null;
  exception when sqlstate '23514' then refused := sqlerrm;
  end;
  if refused is null then raise exception 'C: the default "Rutine" was accepted though it is none of the choices'; end if;
  perform custom.field_update(c_ws, v_p, '{"default":"routine"}');
  -- D
  begin
    perform custom.field_declare(c_ws, c_tbl, '{"key":"needs_interpreter","label":"Needs Interpreter","type":"checkbox","default":"maybe"}');
    refused := null;
  exception when sqlstate '23514' then refused := sqlerrm;
  end;
  if refused is null then raise exception 'D: the default "maybe" was accepted on a tick box'; end if;
  -- E
  v_t := custom.field_declare(c_ws, c_tbl, '{"key":"referral_note","label":"Referral Note","type":"text","default":"Pending"}');
  perform custom.field_update(c_ws, v_t, '{"type":"number"}');
  v_c := custom.field_declare(c_ws, c_tbl, '{"key":"copay_note","label":"Copay Note","type":"text","default":"30"}');
  perform custom.field_update(c_ws, v_c, '{"type":"number"}');
  s := s || jsonb_build_object('p', v_p, 't', v_t, 'c', v_c);
  perform set_config('dv2b2.d', s::text, true);
end
$t$;

reset role;

do $a$
declare
  s jsonb := current_setting('dv2b2.d')::jsonb;
  d jsonb;
begin
  raise notice 'A said: %', s ->> 'a';
  select data into d from custom.record where id = (s ->> 'b_field')::uuid;
  if d -> 'default' is distinct from '12'::jsonb then raise exception 'B: the default "12" is stored as %', d -> 'default'; end if;
  select data into d from custom.record where id = (s ->> 'b_row')::uuid;
  if d -> 'sessions_prescribed' is distinct from '12'::jsonb then raise exception 'B: a new visit starts with %', d -> 'sessions_prescribed'; end if;
  select data into d from custom.record where id = (s ->> 'p')::uuid;
  if d ->> 'default' is distinct from 'routine' then raise exception 'C: the default is %', d -> 'default'; end if;
  select data into d from custom.record where id = (s ->> 't')::uuid;
  if d ->> 'type' <> 'range' or d ? 'default' then raise exception 'E: Referral Note is % with default %', d ->> 'type', d -> 'default'; end if;
  select data into d from custom.record where id = (s ->> 'c')::uuid;
  if d -> 'default' is distinct from '30'::jsonb then raise exception 'E: Copay Note default is %', d -> 'default'; end if;
  raise notice 'GREEN: A–E';
end
$a$;

rollback;
