-- LANE DATA-V2-BASICS-2 — AN ARCHIVE UNDER WAY SAYS SO (BREAKER-1 B-F13).
--
-- THE USE CASE: a clinic archives an old stock count (admin@admin.com's Workspace). The page archives in
-- passes; a reload between passes must learn that a run is open, so it offers "Carry on archiving".
--   A. before anything: the look (chunk 0) says in_progress = false;
--   B. after one pass of 1 record out of 3: the look says in_progress = true;
--   C. after the run finishes: in_progress = false (and the table is archived);
--   D. a table whose one record was archived on its own (no table archive): in_progress = false.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics2_an_archive_under_way_says_so.sql
-- ITS RED: before the campaign file it fails at B (the answer has no in_progress at all).

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics2_an_archive_under_way_says_so.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2a1"}', true);

do $t$
declare
  c_ws   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin@admin.com's Workspace
  v_home uuid;
  c_tbl  uuid;
  c_two  uuid;
  v_r    uuid;
  a jsonb; b jsonb; c jsonb; d jsonb;
  mk_spec jsonb;
begin
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Old Stock Counts Home'));
  mk_spec := jsonb_build_object(
    'type', 'entity', 'label_singular', 'Count', 'label_plural', 'Counts', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'item', 'retention_days', 365, 'agent_writable', true,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'item', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'item')), 'parent_id', v_home::text);
  c_tbl := custom.table_declare(c_ws, mk_spec || '{"name":"Stock count, March","slug":"stock_count_march_databasics2"}');
  perform custom.field_declare(c_ws, c_tbl, '{"key":"item","label":"Item","type":"text"}');
  perform custom.record_write(c_ws, c_tbl, '{"item":"Foam rollers"}');
  perform custom.record_write(c_ws, c_tbl, '{"item":"Resistance bands, light"}');
  perform custom.record_write(c_ws, c_tbl, '{"item":"Theraband loops"}');
  a := custom.table_archive(c_ws, c_tbl, 0, true);
  b := custom.table_archive(c_ws, c_tbl, 1, true);
  b := custom.table_archive(c_ws, c_tbl, 0, true);
  c := custom.table_archive(c_ws, c_tbl, 50, true);
  c_two := custom.table_declare(c_ws, mk_spec || '{"name":"Stock count, April","slug":"stock_count_april_databasics2"}');
  perform custom.field_declare(c_ws, c_two, '{"key":"item","label":"Item","type":"text"}');
  v_r := custom.record_write(c_ws, c_two, '{"item":"Pinch gauges"}');
  perform custom.record_write(c_ws, c_two, '{"item":"Hot packs"}');
  perform custom.record_delete(c_ws, v_r);
  d := custom.table_archive(c_ws, c_two, 0, true);
  if a -> 'in_progress' is distinct from 'false'::jsonb then raise exception 'A: before anything, in_progress is % (%)', a -> 'in_progress', a; end if;
  if b -> 'in_progress' is distinct from 'true'::jsonb then raise exception 'B: after one pass, in_progress is % (%)', b -> 'in_progress', b; end if;
  if c -> 'in_progress' is distinct from 'false'::jsonb or c -> 'done' is distinct from 'true'::jsonb then raise exception 'C: after the run, % (%)', c -> 'in_progress', c; end if;
  if d -> 'in_progress' is distinct from 'false'::jsonb then raise exception 'D: a record archived on its own made the table look under way: %', d; end if;
  raise notice 'GREEN: A–D';
end
$t$;

rollback;
