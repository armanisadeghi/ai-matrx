-- LANE DATA-V2-BASICS-2 — A VALUE A TYPE CHANGE SET ASIDE COMES BACK WHEN IT FITS AGAIN.
--
-- THE USE CASE: a dental office's operatory supply orders (admin@admin.com's Workspace, made here
-- as New table makes one). "Operatory" holds Op 1 · Op 2 · Op 3 · 4. Somebody changes it to a
-- Number: "4" converts, the three words are set aside in `_retired`. Changing it back to Text:
--   A. every set-aside word is back in its cell, and leaves `_retired`;
--   B. a value converted in place stays what it is;
--   C. the migration's own undo (custom.migrate_undo) brings the words back the same way.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics2_a_value_set_aside_comes_back.sql
-- ITS RED: before the campaign file it fails at A (the words stay in _retired, the cells empty).

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics2_a_value_set_aside_comes_back.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2r1"}', true);

do $t$
declare
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin@admin.com's Workspace
  c_tbl   uuid;
  v_home  uuid;
  v_op    uuid;
  s       jsonb := '{}'::jsonb;
  v_log   uuid;
begin
  if current_user <> 'authenticated' then
    raise exception '0: the suite is not in the signed-in person''s seat (%)', current_user;
  end if;
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Operatory Supply Orders Home'));
  c_tbl := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Operatory supply orders', 'slug', 'operatory_supply_orders_databasics2', 'type', 'entity',
    'label_singular', 'Order', 'label_plural', 'Orders', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'item', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'item', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'item')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_tbl, jsonb_build_object('key', 'item', 'label', 'Item', 'type', 'text'));
  v_op := custom.field_declare(c_ws, c_tbl, '{"key":"operatory","label":"Operatory","type":"text"}');
  s := jsonb_build_object('op', v_op,
    'r1', custom.record_write(c_ws, c_tbl, '{"item":"Saliva ejectors","operatory":"Op 3"}'),
    'r2', custom.record_write(c_ws, c_tbl, '{"item":"Nitrile gloves, medium","operatory":"Op 2"}'),
    'r3', custom.record_write(c_ws, c_tbl, '{"item":"Prophy paste, mint (200 cups)","operatory":"4"}'));
  -- to a Number: two words set aside, "4" converts
  perform custom.field_update(c_ws, v_op, '{"type":"number"}');
  -- and back to Text by hand — A, read through the person's own door
  perform custom.field_update(c_ws, v_op, '{"type":"text"}');
  s := s || jsonb_build_object('a_r1', custom.read_record(c_ws, (s ->> 'r1')::uuid));
  perform set_config('dv2b2.a', s::text, true);
  -- C: to a Number again, then the migration's own undo
  perform custom.field_update(c_ws, v_op, '{"type":"number"}');
  select m.id into v_log from custom.migrations(c_ws, v_op, 5) m where m.verb = 'retype' and m.undone_at is null order by m.applied_at desc limit 1;
  perform set_config('dv2b2.log', coalesce(v_log::text, ''), true);
end
$t$;

reset role;

do $a$
declare
  s jsonb := current_setting('dv2b2.a')::jsonb;
  d jsonb;
begin
  if (s -> 'a_r1')::text not like '%"operatory": "Op 3"%' then
    raise exception 'A: changing it back by hand did not bring "Op 3" back: %', left((s -> 'a_r1')::text, 400);
  end if;
end
$a$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2r2"}', true);
do $u$
declare
  v_log text := current_setting('dv2b2.log');
begin
  if v_log = '' then raise exception 'C: no retype migration is on the record for Operatory'; end if;
  perform custom.migrate_undo('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', v_log::uuid);
end
$u$;
reset role;

do $b$
declare
  s jsonb := current_setting('dv2b2.a')::jsonb;
  d jsonb;
begin
  select data into d from custom.record where id = (s ->> 'r1')::uuid;
  if d ->> 'operatory' is distinct from 'Op 3' then raise exception 'A/C: "Op 3" did not come back (cell %, set aside %)', d -> 'operatory', d -> '_retired'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(d -> '_retired', '[]')) e where e ->> 'key' = 'operatory') then
    raise exception 'A/C: "Op 3" came back but is still in _retired: %', d -> '_retired';
  end if;
  select data into d from custom.record where id = (s ->> 'r2')::uuid;
  if d ->> 'operatory' is distinct from 'Op 2' then raise exception 'A/C: "Op 2" did not come back (%)', d -> 'operatory'; end if;
  select data into d from custom.record where id = (s ->> 'r3')::uuid;
  if d ->> 'operatory' is distinct from '4' then raise exception 'B: the converted "4" is now %', d -> 'operatory'; end if;
  raise notice 'GREEN: A–C';
end
$b$;

rollback;
