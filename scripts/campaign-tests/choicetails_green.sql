-- LANE CHOICE-TAILS — THE GREEN SUITE. Removing a choice that cells still use says how many records
-- hold it and moves, keeps or clears them in ONE save; the save answers its undo, and the undo puts
-- the list and every cell back in one save.
--
-- THE REAL USE CASE: admin@admin.com's Workspace on the clone, "Table 1 · 2nd", run as a dental
-- front desk's visit log. Its "Visit Type" column offers Cleaning · Exam · X-ray · Whitening and
-- takes other values; "Services" is a multi-choice column. The office stops booking X-rays as a
-- visit type (they are part of the Exam now) and stops offering Whitening (the few records keep
-- the word). Then it drops Cleaning altogether and clears it. Everything is rolled back.
--
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/choicetails_green.sql
-- ITS RED: before choicetails_a, step 1 fails with "function custom.field_choice_usage(uuid, uuid)
-- does not exist" (and the removal door with the same for custom.field_update_rehoming_choices).

\set ON_ERROR_STOP on
\timing off

\set suite 'choicetails_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '120s';

-- The suite's state rides a session setting, never a temp table: a temp table is DDL, and the
-- provisioner's DDL guard can wait on another lane's long transaction on the clone.
select set_config('ct.s', jsonb_build_object(
         'ws', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', 'tbl', 'dd073d8c-f6cd-419e-8a81-7ce17cf50b81',
         'rows', (select jsonb_agg(r.id order by r.created_at, r.id) from custom.record r
                   where r.table_id = 'dd073d8c-f6cd-419e-8a81-7ce17cf50b81' and r.data_class = 'record'
                     and r.deleted_at is null))::text, true);

-- Every block reads the state as `s` and writes what the next block needs back into it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-choicetail001"}', true);

do $t$
declare s jsonb := current_setting('ct.s')::jsonb; ws uuid; tbl uuid; r uuid[];
        visit uuid; services uuid; o_clean uuid; o_exam uuid; o_xray uuid; o_white uuid; s_clean uuid; s_xray uuid;
        v_u jsonb; v_undo jsonb;
begin
  ws := (s ->> 'ws')::uuid; tbl := (s ->> 'tbl')::uuid;
  select array_agg(x::uuid order by n) into r from jsonb_array_elements_text(s -> 'rows') with ordinality t(x, n);
  visit := custom.field_declare(ws, tbl,
    '{"label":"Visit Type","type":"select","options":["Cleaning","Exam","X-ray","Whitening"]}'::jsonb);
  perform custom.field_update(ws, visit, '{"allow_other":true}'::jsonb);
  services := custom.field_declare(ws, tbl,
    '{"label":"Services","type":"multi_select","options":["Cleaning","X-ray"]}'::jsonb);
  select o.id into o_clean from custom.field_options(ws, visit) o where o.data ->> 'title' = 'Cleaning';
  select o.id into o_exam  from custom.field_options(ws, visit) o where o.data ->> 'title' = 'Exam';
  select o.id into o_xray  from custom.field_options(ws, visit) o where o.data ->> 'title' = 'X-ray';
  select o.id into o_white from custom.field_options(ws, visit) o where o.data ->> 'title' = 'Whitening';
  select o.id into s_clean from custom.field_options(ws, services) o where o.data ->> 'title' = 'Cleaning';
  select o.id into s_xray  from custom.field_options(ws, services) o where o.data ->> 'title' = 'X-ray';

  perform custom.record_update(ws, r[1], '{"visit_type":"X-ray","services":["Cleaning","X-ray"]}'::jsonb);
  perform custom.record_update(ws, r[2], '{"visit_type":"Whitening"}'::jsonb);
  perform custom.record_update(ws, r[3], '{"visit_type":"Cleaning"}'::jsonb);
  perform custom.record_update(ws, r[4], '{"visit_type":"X-ray"}'::jsonb);

  -- 1. the count the column editor says: "2 records use "X-ray"."
  v_u := custom.field_choice_usage(ws, visit);
  if (v_u -> o_xray::text ->> 'records')::int <> 2 or (v_u -> o_white::text ->> 'records')::int <> 1
     or (v_u -> o_exam::text ->> 'records')::int <> 0 then
    raise exception '1: the usage count is wrong: %', v_u;
  end if;

  -- 2. X-ray → move to Exam, Whitening → keep the words as another value; ONE save
  v_undo := custom.field_update_rehoming_choices(ws, visit,
    jsonb_build_object('options', jsonb_build_array(
      jsonb_build_object('id', o_clean, 'words', 'Cleaning'), jsonb_build_object('id', o_exam, 'words', 'Exam'))),
    jsonb_build_object(o_xray::text, jsonb_build_object('then', 'move', 'to', o_exam),
                       o_white::text, jsonb_build_object('then', 'keep'))) -> 'undo';

  perform set_config('ct.s', (s || jsonb_build_object('visit', visit, 'services', services,
    'o_clean', o_clean, 'o_exam', o_exam, 'o_xray', o_xray, 'o_white', o_white,
    's_clean', s_clean, 's_xray', s_xray, 'undo', v_undo))::text, true);
end
$t$;

reset role;
do $t$
declare s jsonb := current_setting('ct.s')::jsonb; r uuid[];
begin
  select array_agg(x::uuid order by n) into r from jsonb_array_elements_text(s -> 'rows') with ordinality t(x, n);
  if (select data ->> 'visit_type' from custom.record where id = r[1]) is distinct from 'exam'
     or (select data ->> 'visit_type' from custom.record where id = r[4]) is distinct from 'exam' then
    raise exception '2a: the records that held X-ray did not move to Exam: %, %',
      (select data -> 'visit_type' from custom.record where id = r[1]),
      (select data -> 'visit_type' from custom.record where id = r[4]);
  end if;
  if (select data ->> 'visit_type' from custom.record where id = r[2]) is distinct from 'Whitening' then
    raise exception '2b: the record that held Whitening does not keep the words as another value: %',
      (select data -> 'visit_type' from custom.record where id = r[2]);
  end if;
  if (select deleted_at from custom.record where id = (s ->> 'o_xray')::uuid) is null
     or (select deleted_at from custom.record where id = (s ->> 'o_white')::uuid) is null then
    raise exception '2c: X-ray and Whitening are still offered';
  end if;
  if jsonb_array_length(s -> 'undo' -> 'cells_back') <> 3 or jsonb_array_length(s -> 'undo' -> 'options') <> 4 then
    raise exception '2d: the undo does not carry the list and the three cells as they were: %', s -> 'undo';
  end if;
end
$t$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-choicetail002"}', true);
do $t$
declare s jsonb := current_setting('ct.s')::jsonb;
begin
  -- 3. UNDO, through the same door: the list and every cell back in one save
  perform custom.field_update_rehoming_choices((s ->> 'ws')::uuid, (s ->> 'visit')::uuid,
    jsonb_build_object('options', s -> 'undo' -> 'options'), null, s -> 'undo' -> 'cells_back');
end
$t$;

reset role;
do $t$
declare s jsonb := current_setting('ct.s')::jsonb; r uuid[];
begin
  select array_agg(x::uuid order by n) into r from jsonb_array_elements_text(s -> 'rows') with ordinality t(x, n);
  if (select data ->> 'visit_type' from custom.record where id = r[1]) is distinct from 'x_ray'
     or (select data ->> 'visit_type' from custom.record where id = r[2]) is distinct from 'whitening'
     or (select data ->> 'visit_type' from custom.record where id = r[4]) is distinct from 'x_ray'
     or (select deleted_at from custom.record where id = (s ->> 'o_xray')::uuid) is not null
     or (select deleted_at from custom.record where id = (s ->> 'o_white')::uuid) is not null then
    raise exception '3: undo did not put X-ray, Whitening and their cells back: % % %',
      (select data -> 'visit_type' from custom.record where id = r[1]),
      (select data -> 'visit_type' from custom.record where id = r[2]),
      (select deleted_at from custom.record where id = (s ->> 'o_xray')::uuid);
  end if;
end
$t$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-choicetail003"}', true);
do $t$
declare s jsonb := current_setting('ct.s')::jsonb; ws uuid := (s ->> 'ws')::uuid; v_msg text; v_ok boolean;
begin
  -- 4. clear: Cleaning removed and its records emptied
  perform custom.field_update_rehoming_choices(ws, (s ->> 'visit')::uuid,
    jsonb_build_object('options', jsonb_build_array(
      jsonb_build_object('id', s ->> 'o_exam', 'words', 'Exam'), jsonb_build_object('id', s ->> 'o_xray', 'words', 'X-ray'),
      jsonb_build_object('id', s ->> 'o_white', 'words', 'Whitening'))),
    jsonb_build_object(s ->> 'o_clean', jsonb_build_object('then', 'clear')));

  -- 5. a multi-choice cell: X-ray moves to Cleaning, and the cell holds Cleaning once
  perform custom.field_update_rehoming_choices(ws, (s ->> 'services')::uuid,
    jsonb_build_object('options', jsonb_build_array(jsonb_build_object('id', s ->> 's_clean', 'words', 'Cleaning'))),
    jsonb_build_object(s ->> 's_xray', jsonb_build_object('then', 'move', 'to', s ->> 's_clean')));

  -- 6. refusals, each naming why and changing nothing
  v_ok := false;
  begin
    perform custom.field_update_rehoming_choices(ws, (s ->> 'services')::uuid, jsonb_build_object('options', '[]'::jsonb),
      jsonb_build_object(s ->> 's_clean', jsonb_build_object('then', 'keep')));
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg like '%takes only its own choices%';
  end;
  if not v_ok then raise exception '6a: keep-as-other on a column that takes only its choices was not refused by name (%)', v_msg; end if;
  v_ok := false;
  begin
    perform custom.field_update_rehoming_choices(ws, (s ->> 'visit')::uuid, '{}'::jsonb,
      jsonb_build_object(s ->> 'o_exam', jsonb_build_object('then', 'clear')));
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg like '%is still one of the choices%';
  end;
  if not v_ok then raise exception '6b: clearing the records of a choice still in the list was not refused (%)', v_msg; end if;
end
$t$;

reset role;
do $t$
declare s jsonb := current_setting('ct.s')::jsonb; r uuid[];
begin
  select array_agg(x::uuid order by n) into r from jsonb_array_elements_text(s -> 'rows') with ordinality t(x, n);
  if coalesce(jsonb_typeof((select data -> 'visit_type' from custom.record where id = r[3])), 'null') <> 'null' then
    raise exception '4: the record that held Cleaning was not cleared: %',
      (select data -> 'visit_type' from custom.record where id = r[3]);
  end if;
  if (select data -> 'services' from custom.record where id = r[1]) is distinct from '["cleaning"]'::jsonb then
    raise exception '5: the multi-choice cell is not ["cleaning"]: %',
      (select data -> 'services' from custom.record where id = r[1]);
  end if;
  raise notice 'choicetails_green.sql: GREEN — a removed choice''s records are counted, moved, kept as other values or cleared in one save, and the save''s undo puts the list and the cells back.';
end
$t$;

rollback;
