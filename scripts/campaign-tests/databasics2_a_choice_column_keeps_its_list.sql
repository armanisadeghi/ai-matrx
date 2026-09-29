-- LANE DATA-V2-BASICS-2 — A CHOICE COLUMN KEEPS ITS LIST (BREAKER-2 B2-05, B2-15, B2-24).
--
-- THE USE CASE: a physical-therapy clinic's visit tracker (admin@admin.com's Workspace).
--   A. "Body Areas" (several choices: Neck, Knee, Hip) changed to Text: the change lands and Grace's
--      "Neck, Knee" stays as words;
--   B. "Visit Status" (Scheduled, Completed, No-show) changed to Text and back to a choice column with
--      only "Completed" sent: the SAME list comes back, all three options, and the cell is Completed;
--   C. the table archived: both its pick lists are archived with it; brought back: both are back.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics2_a_choice_column_keeps_its_list.sql
-- ITS RED: before the campaign file it fails at A (the change is refused: "holds many values").

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics2_a_choice_column_keeps_its_list.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2l1"}', true);

do $t$
declare
  c_ws   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_home uuid; c_tbl uuid; v_b uuid; v_s uuid; v_r uuid;
  s jsonb := '{}';
begin
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Visit Tracker Home'));
  c_tbl := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Patient visit tracker', 'slug', 'patient_visit_tracker_databasics2', 'type', 'entity',
    'label_singular', 'Visit', 'label_plural', 'Visits', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'patient', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_tbl, '{"key":"patient","label":"Patient","type":"text"}');
  v_b := custom.field_declare(c_ws, c_tbl, '{"key":"body_areas","label":"Body Areas","parity_type":"multi_select","options":["Neck","Knee","Hip"]}');
  v_s := custom.field_declare(c_ws, c_tbl, '{"key":"visit_status","label":"Visit Status","parity_type":"select","options":["Scheduled","Completed","No-show"]}');
  v_r := custom.record_write(c_ws, c_tbl, '{"patient":"Grace Kim","body_areas":["Neck","Knee"],"visit_status":"Completed"}');
  s := jsonb_build_object('tbl', c_tbl, 'b', v_b, 's', v_s, 'r', v_r);
  perform set_config('dv2b2.l', s::text, true);
  -- A
  perform custom.field_update(c_ws, v_b, '{"type":"text"}');
  -- B
  perform custom.field_update(c_ws, v_s, '{"type":"text"}');
  perform custom.field_update(c_ws, v_s, '{"parity_type":"select","options":["Completed"]}');
end
$t$;

reset role;

do $a$
declare
  s jsonb := current_setting('dv2b2.l')::jsonb;
  d jsonb; f jsonb; v_opts uuid; n integer; v_first uuid;
begin
  select data into d from custom.record where id = (s ->> 'r')::uuid;
  if d -> 'body_areas' is distinct from '"Neck, Knee"'::jsonb then raise exception 'A: Grace''s Body Areas reads %', d -> 'body_areas'; end if;
  -- the list Visit Status was born with is the one it has now
  select data into f from custom.record where id = (s ->> 's')::uuid;
  v_opts := (f -> 'config' ->> 'options_table_id')::uuid;
  select count(*) into n from custom.record o where o.table_id = v_opts and o.deleted_at is null;
  if n <> 3 then raise exception 'B: Visit Status has % live choices after coming back (wanted 3, No-show included)', n; end if;
  if d -> 'visit_status' is distinct from '"completed"'::jsonb then raise exception 'B: the cell holds %', d -> 'visit_status'; end if;
  perform set_config('dv2b2.l2', (s || jsonb_build_object('status_list', v_opts, 'body_list', (select data -> 'config' ->> 'list_kept' from custom.record where id = (s ->> 'b')::uuid)))::text, true);
end
$a$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2l2"}', true);
do $c$
declare s jsonb := current_setting('dv2b2.l2')::jsonb;
begin
  perform custom.table_archive('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', (s ->> 'tbl')::uuid, 50, true);
end
$c$;
reset role;

do $d$
declare s jsonb := current_setting('dv2b2.l2')::jsonb; n integer;
begin
  select count(*) into n from custom.record where id in ((s ->> 'status_list')::uuid, (s ->> 'body_list')::uuid) and deleted_at is not null;
  if n <> 2 then raise exception 'C: % of the table''s 2 pick lists were archived with it (status %, body %)', n, s ->> 'status_list', s ->> 'body_list'; end if;
end
$d$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2l3"}', true);
do $e$
declare s jsonb := current_setting('dv2b2.l2')::jsonb;
begin
  perform custom.record_restore('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', (s ->> 'tbl')::uuid);
end
$e$;
reset role;

do $f$
declare s jsonb := current_setting('dv2b2.l2')::jsonb; n integer;
begin
  select count(*) into n from custom.record where id in ((s ->> 'status_list')::uuid, (s ->> 'body_list')::uuid) and deleted_at is null;
  if n <> 2 then raise exception 'C: bringing the table back brought % of its 2 pick lists back', n; end if;
  raise notice 'GREEN: A–C';
end
$f$;

rollback;
