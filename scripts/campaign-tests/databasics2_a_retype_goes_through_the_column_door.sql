-- LANE DATA-V2-BASICS-2 — A RETYPE GOES THROUGH THE COLUMN DOOR (BREAKER-2 B2-05).
--
-- THE USE CASE: a clinic's visit tracker (admin@admin.com's Workspace). The Sheet changes "Body Areas"
-- (several choices) and "Visit Status" (one choice) to Text through custom.migrate_retype:
--   A. both changes land; B. Grace's "Neck, Knee" and "Completed" read as words.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics2_a_retype_goes_through_the_column_door.sql
-- ITS RED: before the campaign file it fails at A ("is not a list, so it has no choices to take from a table").

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics2_a_retype_goes_through_the_column_door.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2t1"}', true);

do $t$
declare
  c_ws   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_home uuid; c_tbl uuid; v_b uuid; v_s uuid; v_r uuid;
begin
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Retype Visits Home'));
  c_tbl := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Clinic visits (retype)', 'slug', 'clinic_visits_retype_databasics2', 'type', 'entity',
    'label_singular', 'Visit', 'label_plural', 'Visits', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'patient', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_tbl, '{"key":"patient","label":"Patient","type":"text"}');
  v_b := custom.field_declare(c_ws, c_tbl, '{"key":"body_areas","label":"Body Areas","parity_type":"multi_select","options":["Neck","Knee"]}');
  v_s := custom.field_declare(c_ws, c_tbl, '{"key":"visit_status","label":"Visit Status","parity_type":"select","options":["Scheduled","Completed"]}');
  v_r := custom.record_write(c_ws, c_tbl, '{"patient":"Grace Kim","body_areas":["Neck","Knee"],"visit_status":"Completed"}');
  perform custom.migrate_retype(c_ws, v_b, 'text');
  perform custom.migrate_retype(c_ws, v_s, 'text');
  perform set_config('dv2b2.t', v_r::text, true);
end
$t$;

reset role;

do $a$
declare d jsonb;
begin
  select data into d from custom.record where id = current_setting('dv2b2.t')::uuid;
  if d -> 'body_areas' is distinct from '"Neck, Knee"'::jsonb then raise exception 'B: Body Areas reads %', d -> 'body_areas'; end if;
  if d -> 'visit_status' is distinct from '"Completed"'::jsonb then raise exception 'B: Visit Status reads %', d -> 'visit_status'; end if;
  raise notice 'GREEN: A–B';
end
$a$;

rollback;
