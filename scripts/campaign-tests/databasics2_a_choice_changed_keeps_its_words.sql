-- LANE DATA-V2-BASICS-2 — A CHOICE COLUMN CHANGED INTO SOMETHING ELSE (AND BACK) KEEPS ITS WORDS.
--
-- THE USE CASE: a clinic's supply count (admin@admin.com's Workspace, made here as New table makes
-- one). "Stock status" is a choice column: In stock · Backordered · Discontinued. Its cells hold each
-- choice's KEY (in_stock), which a person never sees. MEASURED on the Sheet (Configure Table → Shows
-- as Text): every cell then read "in_stock" — the key, in words nobody wrote.
--   A. changed to Text, every cell reads as the choice's own words ("In stock");
--   B. changed back to a choice column, a word that names a choice becomes that choice again, a key
--      word too; a word that names none is set aside in `_retired` (kept, never deleted);
--   C. one choice → several: the cell holds its one choice as a list of one;
--   D. several → one: a list of one becomes that one choice again.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics2_a_choice_changed_keeps_its_words.sql
-- ITS RED: before the campaign file it fails at A (the cell reads "in_stock").

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics2_a_choice_changed_keeps_its_words.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2c1"}', true);

do $t$
declare
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin@admin.com's Workspace
  c_tbl   uuid;
  v_home  uuid;
  v_st    uuid;
  s       jsonb := '{}'::jsonb;
begin
  if current_user <> 'authenticated' then
    raise exception '0: the suite is not in the signed-in person''s seat (%)', current_user;
  end if;
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Clinic Supply Count Home'));
  c_tbl := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Clinic supply count', 'slug', 'clinic_supply_count_databasics2', 'type', 'entity',
    'label_singular', 'Supply', 'label_plural', 'Supplies', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'item', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'item', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'item')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_tbl, jsonb_build_object('key', 'item', 'label', 'Item', 'type', 'text'));
  v_st := custom.field_declare(c_ws, c_tbl,
    '{"key":"stock_status","label":"Stock status","parity_type":"select","options":["In stock","Backordered","Discontinued"]}');
  s := jsonb_build_object('st', v_st, 'tbl', c_tbl,
    'r1', custom.record_write(c_ws, c_tbl, '{"item":"Nitrile gloves, medium","stock_status":"In stock"}'),
    'r2', custom.record_write(c_ws, c_tbl, '{"item":"Saliva ejectors","stock_status":"Backordered"}'));
  perform set_config('dv2b2.c', s::text, true);
end
$t$;
reset role;
do $o$
declare
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  s := s || jsonb_build_object('held_r1', (select data -> 'stock_status' from custom.record where id = (s ->> 'r1')::uuid));
  perform set_config('dv2b2.c', s::text, true);
end
$o$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2c1"}', true);
do $p$
declare
  c_ws constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  -- A: to Text
  perform custom.field_update(c_ws, (s ->> 'st')::uuid, '{"type":"text"}');
  perform set_config('dv2b2.c', s::text, true);
end
$p$;
reset role;
do $o$
declare
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  s := s || jsonb_build_object('a_r1', (select data -> 'stock_status' from custom.record where id = (s ->> 'r1')::uuid));
  s := s || jsonb_build_object('a_r2', (select data -> 'stock_status' from custom.record where id = (s ->> 'r2')::uuid));
  perform set_config('dv2b2.c', s::text, true);
end
$o$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2c1"}', true);
do $p$
declare
  c_ws constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  -- B: two more rows typed as Text, then back to a choice column
  s := s || jsonb_build_object(
    'r3', custom.record_write(c_ws, (s ->> 'tbl')::uuid, '{"item":"Prophy paste, mint","stock_status":"Special order"}'),
    'r4', custom.record_write(c_ws, (s ->> 'tbl')::uuid, '{"item":"Bite blocks","stock_status":"discontinued"}'));
  perform custom.field_update(c_ws, (s ->> 'st')::uuid, '{"parity_type":"select","options":["In stock","Backordered","Discontinued"]}');
  perform set_config('dv2b2.c', s::text, true);
end
$p$;
reset role;
do $o$
declare
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  s := s || jsonb_build_object('b_r1', (select data -> 'stock_status' from custom.record where id = (s ->> 'r1')::uuid));
  s := s || jsonb_build_object('b_r2', (select data -> 'stock_status' from custom.record where id = (s ->> 'r2')::uuid));
  s := s || jsonb_build_object('b_r3', (select data from custom.record where id = (s ->> 'r3')::uuid));
  s := s || jsonb_build_object('b_r4', (select data -> 'stock_status' from custom.record where id = (s ->> 'r4')::uuid));
  s := s || jsonb_build_object('b_words', (select custom.choice_render_value(jsonb_build_object('options', custom.choice_options(organization_id, (select (f.data -> 'config' ->> 'options_table_id')::uuid from custom.record f where f.id = (s ->> 'st')::uuid))), data -> 'stock_status') from custom.record where id = (s ->> 'r1')::uuid));
  perform set_config('dv2b2.c', s::text, true);
end
$o$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2c1"}', true);
do $p$
declare
  c_ws constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  -- C: one choice -> several
  perform custom.field_update(c_ws, (s ->> 'st')::uuid, '{"parity_type":"multi_select"}');
  perform set_config('dv2b2.c', s::text, true);
end
$p$;
reset role;
do $o$
declare
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  s := s || jsonb_build_object('c_r1', (select data -> 'stock_status' from custom.record where id = (s ->> 'r1')::uuid));
  perform set_config('dv2b2.c', s::text, true);
end
$o$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2c1"}', true);
do $p$
declare
  c_ws constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  -- D: several -> one
  perform custom.field_update(c_ws, (s ->> 'st')::uuid, '{"parity_type":"select"}');
  perform set_config('dv2b2.c', s::text, true);
end
$p$;
reset role;
do $o$
declare
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  s := s || jsonb_build_object('d_r1', (select data -> 'stock_status' from custom.record where id = (s ->> 'r1')::uuid));
  perform set_config('dv2b2.c', s::text, true);
end
$o$;

do $a$
declare
  s jsonb := current_setting('dv2b2.c')::jsonb;
begin
  raise notice 'held before: %', s -> 'held_r1';
  if s -> 'a_r1' is distinct from '"In stock"'::jsonb then
    raise exception 'A: changed to Text, the cell reads % instead of "In stock"', s -> 'a_r1';
  end if;
  if s -> 'a_r2' is distinct from '"Backordered"'::jsonb then
    raise exception 'A: changed to Text, the cell reads % instead of "Backordered"', s -> 'a_r2';
  end if;
  if s -> 'b_words' is distinct from '"In stock"'::jsonb then
    raise exception 'B: back to a choice column, "In stock" is now % (held %)', s -> 'b_words', s -> 'b_r1';
  end if;
  if s -> 'b_r4' is distinct from '"discontinued"'::jsonb then
    raise exception 'B: the key word "discontinued" did not become the choice Discontinued: %', s -> 'b_r4';
  end if;
  if (s -> 'b_r3') ? 'stock_status' then
    raise exception 'B: "Special order" names no choice and was not set aside: %', s -> 'b_r3' -> 'stock_status';
  end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(s -> 'b_r3' -> '_retired', '[]')) e
                  where e ->> 'key' = 'stock_status' and e -> 'value' = '"Special order"'::jsonb) then
    raise exception 'B: "Special order" was not kept in _retired: %', s -> 'b_r3' -> '_retired';
  end if;
  if s -> 'c_r1' is distinct from jsonb_build_array(s -> 'b_r1') then
    raise exception 'C: one → several, the cell holds % instead of [%]', s -> 'c_r1', s -> 'b_r1';
  end if;
  if s -> 'd_r1' is distinct from s -> 'b_r1' then
    raise exception 'D: several → one, the cell holds % instead of %', s -> 'd_r1', s -> 'b_r1';
  end if;
  raise notice 'GREEN: A–D';
end
$a$;

rollback;
