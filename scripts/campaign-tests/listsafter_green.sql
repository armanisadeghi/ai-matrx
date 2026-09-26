-- LANE LISTS-AFTER-SWITCH — THE GREEN SUITE. After an owner presses Data tables → new system:
--   · a moved pick list is read FROM ITS COPY in the store: custom.where_lists_live says
--     `record`; get_user_list_with_items, get_structured_list_for_selection and
--     get_user_lists_summary answer the copy's choices (a choice added to the copy after the
--     switch is there; the frozen older rows are not what answers), each marked lives_in;
--   · update_user_list renames the copy (the older list stays archived and untouched);
--   · a NEW list of the switched organization is born in the store (create_user_list), and
--     every other way of making an older list or table there is refused, naming where new ones
--     are made (a direct insert, create_user_table_with_fields);
--   · the server's two views (workbench.pick_list_live / pick_list_item_live, read by the
--     agents' picklist tool, the picklist REST router and the variable resolver) answer the same;
--   · the older table reads that still answered unmarked (get_table_row / _cell / _column,
--     list_table_rows / _columns, udt_table_profile, udt_column_facets, the CSV export) carry
--     moved_to for the moved table;
--   · before the press, the readiness card says when a pick list is not copied (and offers Copy
--     again), because the press refuses the whole switch for it;
--   · Switch back: the list is older again, read from the older rows; a new list is older.
--
-- THE REAL USE CASE: admin@admin.com's Workspace. Its pick list "Countries by Continent" moves
-- with the switch; after the switch Portugal (Europe) is added to its copy. The owner renames it
-- "Countries by Continent (2026)". A new list, "Hygiene Visit Types" (Recall cleaning,
-- Periodontal maintenance, New patient exam, Emergency visit), is made after the switch. The
-- moved older table "Rincon Plumbing — Customers" is read through the older doors. The press and
-- Switch back run inside the transaction; everything is rolled back.
--
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/listsafter_green.sql
-- ITS RED: without the campaign file (and after its inverse) it fails at 0 — no list door, no guard;
-- with the existence check removed it fails at 2a (the list answers `record` from where_tables_live
-- for any list id, and get_user_list_with_items answers the frozen older choices without Portugal).

\set ON_ERROR_STOP on
\timing off

\set suite 'listsafter_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';

-- ── 0. the file is there ──
do $t$
begin
  if to_regprocedure('custom.where_lists_live(uuid[])') is null
     or to_regprocedure('platform._store_pick_list_document(uuid,uuid,text)') is null
     or not exists (select 1 from pg_trigger where tgname = '_0_switched_org_makes_nothing_older'
                      and tgrelid = 'workbench.udt_structured_lists'::regclass)
     or not exists (select 1 from pg_trigger where tgname = '_0_switched_org_makes_nothing_older'
                      and tgrelid = 'workbench.udt_datasets'::regclass) then
    raise exception '0: no list door and no birth guard — a switched organization''s lists are read from the frozen older rows and new older lists and tables are still made there';
  end if;
  if not has_function_privilege('authenticated', 'custom.where_lists_live(uuid[])', 'execute')
     or has_function_privilege('authenticated', 'platform._pick_list_born_in_store(uuid,text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'platform._store_pick_list_document(uuid,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'platform.list_lives_in(uuid)', 'execute')
     or has_function_privilege('anon', 'custom.where_lists_live(uuid[])', 'execute') then
    raise exception '0b: a door is reachable by a role it must not be';
  end if;
end
$t$;

-- ── 1. the press (as the database owner, exactly what platform.cutover_seam_press does after readiness) ──
create temp table _la on commit drop as
  select '87a6e699-3622-4869-8843-d0867456c0dd'::uuid as admin,
         '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid as ws,
         (select d.id from workbench.udt_datasets d
           where d.organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
             and d.table_name = 'Rincon Plumbing — Customers' and d.deleted_at is null limit 1) as tbl,
         (select l.id from workbench.udt_structured_lists l
           where l.organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
             and l.list_name = 'Countries by Continent' and l.deleted_at is null limit 1) as lst,
         -- the COPY's live choices before the switch (the copy is what answers after it)
         (select count(*) from custom.record c
           join workbench.udt_structured_lists l on l.id = c.table_id and l.organization_id = c.organization_id
          where l.organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
            and l.list_name = 'Countries by Continent' and l.deleted_at is null
            and c.data_class = 'record' and c.deleted_at is null) as copy_items,
         gen_random_uuid() as press_new,
         gen_random_uuid() as press_old,
         null::uuid as born;
grant select, update on _la to authenticated;

do $t$
declare
  f _la;
  v_did jsonb;
begin
  select * into f from _la;
  if f.tbl is null or f.lst is null then
    raise exception 'fixture: admin''s Workspace needs its live older table "Rincon Plumbing — Customers" and its live pick list "Countries by Continent"';
  end if;
  if (platform._cutover_seam_last_done('older_tables', f.ws)).direction = 'new' then
    raise exception 'fixture: admin''s Workspace is already switched on this database';
  end if;
  -- before the press the live older list is older, and read from its older rows
  if platform.list_lives_in(f.lst) is distinct from 'older' then
    raise exception '1pre: a live older list does not live in the older store (%)', platform.list_lives_in(f.lst);
  end if;

  -- 1r. the readiness card says when a pick list is not copied (the press would refuse), and
  -- offers Copy again for it; a list made after the copy is named
  insert into workbench.udt_structured_lists (id, list_name, user_id, organization_id, created_by, visibility)
  values ('7c1e5a2b-4d6f-4a8b-9c0d-1e2f3a4b5c6d', 'Operatory Rooms', f.admin, f.ws, f.admin, 'personal');
  v_did := (select c from jsonb_array_elements(platform._cutover_seam_readiness('older_tables', f.ws) -> 'checks') c
             where c ->> 'key' = 'lists_copied');
  if v_did is null or (v_did ->> 'met')::boolean or (v_did ->> 'copy_again_clears')::int < 1
     or v_did ->> 'detail' not like '%Operatory Rooms%' then
    raise exception '1r: the readiness card does not say an uncopied pick list stops the switch: %', v_did;
  end if;
  update workbench.udt_structured_lists set deleted_at = now() where id = '7c1e5a2b-4d6f-4a8b-9c0d-1e2f3a4b5c6d';
  if not (select (c ->> 'met')::boolean from jsonb_array_elements(platform._cutover_seam_readiness('older_tables', f.ws) -> 'checks') c
           where c ->> 'key' = 'lists_copied') then
    raise exception '1r2: with every live pick list copied the readiness card still says one is not';
  end if;

  v_did := platform._cutover_seam_apply('older_tables', f.ws, 'new', f.admin, f.press_new);
  insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
  values (f.press_new, 'older_tables', f.ws, 'new', 'done', 'Switched to the new system.', f.admin, v_did, 'listsafter_green');
  if not coalesce(v_did -> 'archived_lists', '[]'::jsonb) @> to_jsonb(array[f.lst::text]) then
    raise exception '1: the press did not archive the older pick list (archived_lists = %)', v_did -> 'archived_lists';
  end if;
end
$t$;

-- ── 2. the member's seat ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-listsafter001"}', true);

do $t$
declare
  f _la;
  v jsonb;
  v_err text;
  v_new uuid;
  v_cnt int;
  v_csv text;
begin
  select * into f from _la;

  -- 2a. where the moved list lives: the store
  if (select w.lives_in from custom.where_lists_live(array[f.lst]) w) is distinct from 'record' then
    raise exception '2a: where_lists_live does not send the moved list to the store: %', (select w.lives_in from custom.where_lists_live(array[f.lst]) w);
  end if;

  -- 2b. a choice added to the COPY after the switch is what the list reads answer
  if custom.record_write(f.ws, f.lst, '{"name": "Portugal", "group_name": "Europe"}'::jsonb) is null then
    raise exception '2b: the copy refused a new choice';
  end if;
  v := public.get_user_list_with_items(f.lst);
  if v ->> 'lives_in' is distinct from 'record' then
    raise exception '2b2: get_user_list_with_items does not answer the moved list from its copy (lives_in %)', v ->> 'lives_in';
  end if;
  if not (v -> 'items_grouped' -> 'Europe') @> '[{"label": "Portugal"}]'::jsonb then
    raise exception '2b3: get_user_list_with_items answered without the choice added to the copy: %', v -> 'items_grouped' -> 'Europe';
  end if;
  select count(*) into v_cnt from jsonb_each(v -> 'items_grouped') g, jsonb_array_elements(g.value);
  if v_cnt <> f.copy_items + 1 then
    raise exception '2b4: the list answered % choices, its copy held % (+1 added)', v_cnt, f.copy_items;
  end if;
  v := public.get_structured_list_for_selection(f.lst);
  if v ->> 'lives_in' is distinct from 'record' or not (v -> 'items_grouped' -> 'Europe') @> '[{"label": "Portugal", "group_name": "Europe"}]'::jsonb then
    raise exception '2c: get_structured_list_for_selection does not answer the copy: %', v;
  end if;

  -- 2d. the Lists page's list: the moved list is there, from the store, with its choices counted
  v := (select e from jsonb_array_elements(public.get_user_lists_summary(f.admin)) e where e ->> 'list_id' = f.lst::text);
  if v is null then
    raise exception '2d: get_user_lists_summary no longer lists the moved list (the Lists page is empty after the switch)';
  end if;
  if v ->> 'lives_in' is distinct from 'record' or (v ->> 'item_count')::int <> f.copy_items + 1 then
    raise exception '2d2: the moved list is listed as %', v;
  end if;

  -- 2e. the owner renames it: the copy is renamed, the older list is not touched
  perform public.update_user_list(f.lst, 'Countries by Continent (2026)');
  if (select e ->> 'list_name' from jsonb_array_elements(public.get_user_lists_summary(f.admin)) e where e ->> 'list_id' = f.lst::text)
     is distinct from 'Countries by Continent (2026)' then
    raise exception '2e: update_user_list did not rename the list where it lives';
  end if;

  -- 2f. a NEW list of the switched organization is born in the store
  v := public.create_user_list('Hygiene Visit Types', 'The kinds of hygiene visit the front desk books.', f.admin, false, false, false,
         '[{"Label": "Recall cleaning", "Group": "Routine"}, {"Label": "Periodontal maintenance", "Group": "Routine"},
           {"Label": "New patient exam", "Group": "First visit", "Description": "Full-mouth X-rays and charting"},
           {"Label": "Emergency visit", "Group": "Same day"}]'::jsonb, f.ws);
  v_new := (v ->> 'list_id')::uuid;
  update _la set born = v_new;
  if v ->> 'lives_in' is distinct from 'record' or jsonb_array_length(v -> 'items') <> 4 then
    raise exception '2f: create_user_list in a switched organization answered %', v;
  end if;
  if (select w.lives_in from custom.where_lists_live(array[v_new]) w) is distinct from 'record'
     or (public.get_user_list_with_items(v_new) -> 'items_grouped' -> 'First visit' -> 0 ->> 'description') is distinct from 'Full-mouth X-rays and charting' then
    raise exception '2f4: the new list does not read back from the store: %', public.get_user_list_with_items(v_new);
  end if;
  if not exists (select 1 from jsonb_array_elements(public.get_user_lists_summary(f.admin)) e where e ->> 'list_id' = v_new::text) then
    raise exception '2f5: the new list is not on the Lists page';
  end if;

  -- 2g. nothing new is made in the older store of a switched organization, by any door
  begin
    insert into workbench.udt_structured_lists (list_name, user_id, organization_id, created_by, visibility)
    values ('Operatory Rooms', f.admin, f.ws, f.admin, 'personal');
    raise exception '2g: a direct insert made a new older list in the switched organization';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%switched its Data tables to the new system%' then raise exception '2g2: the refusal says %', v_err; end if;
  end;
  begin
    perform public.create_user_table_with_fields('Sterilization Log', 'Autoclave cycles per operatory', false, f.ws, null, null,
              '[{"field_name": "cycle_date", "display_name": "Cycle date", "data_type": "date"}]'::jsonb);
    raise exception '2h: create_user_table_with_fields made a new older table in the switched organization';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%a new table is made there%' then raise exception '2h2: the refusal says %', v_err; end if;
  end;

  -- 2i. the older reads that answered unmarked now carry moved_to for the moved table
  if public.get_table_row(jsonb_build_object('table_id', f.tbl, 'row_id',
       (select r.id from workbench.udt_dataset_rows r where r.table_id = f.tbl order by r.created_at limit 1))) #>> '{moved_to,address}'
     is distinct from '/data/' || f.tbl then
    raise exception '2i: get_table_row is not marked';
  end if;
  if public.get_table_cell(jsonb_build_object('table_id', f.tbl, 'column_name', 'household', 'row_id',
       (select r.id from workbench.udt_dataset_rows r where r.table_id = f.tbl order by r.created_at limit 1))) #>> '{moved_to,address}'
     is distinct from '/data/' || f.tbl then
    raise exception '2i2: get_table_cell is not marked';
  end if;
  if public.get_table_column(jsonb_build_object('table_id', f.tbl, 'column_name', 'household')) #>> '{moved_to,address}' is distinct from '/data/' || f.tbl then
    raise exception '2i3: get_table_column is not marked';
  end if;
  if public.list_table_rows(jsonb_build_object('table_id', f.tbl)) #>> '{moved_to,address}' is distinct from '/data/' || f.tbl then
    raise exception '2i4: list_table_rows is not marked';
  end if;
  if public.list_table_columns(jsonb_build_object('table_id', f.tbl)) -> 0 #>> '{moved_to,address}' is distinct from '/data/' || f.tbl then
    raise exception '2i5: list_table_columns is not marked';
  end if;
  if public.udt_table_profile(f.tbl) #>> '{moved_to,address}' is distinct from '/data/' || f.tbl then
    raise exception '2i6: udt_table_profile is not marked';
  end if;
  if public.udt_column_facets(f.tbl, 'household') #>> '{moved_to,address}' is distinct from '/data/' || f.tbl then
    raise exception '2i7: udt_column_facets is not marked';
  end if;
  v_csv := public.export_user_table_as_csv(f.tbl, null::text, 'asc'::text);
  if split_part(v_csv, E'\n', 1) not like '%moved to the new system%' then
    raise exception '2i8: the CSV export of the moved table does not say it moved: %', left(v_csv, 120);
  end if;
end
$t$;

reset role;

-- ── 3. Switch back: the list is older again; a new list is older ──
do $t$
declare
  f _la;
  v_did jsonb;
begin
  select * into f from _la;
  -- (as the owner, who sees both stores whole) the list born while switched is a Table of choices
  -- in the store, and nothing of it is in the older lists
  if exists (select 1 from workbench.udt_structured_lists l where l.id = f.born) then
    raise exception '2f2: the new list was made in the older lists';
  end if;
  if not exists (select 1 from custom.record t where t.organization_id = f.ws and t.id = f.born and t.data_class = 'table' and t.metadata ? 'pick_list')
     or (select count(*) from custom.record c where c.organization_id = f.ws and c.table_id = f.born and c.data_class = 'record' and c.deleted_at is null) <> 4 then
    raise exception '2f3: the new list is not a Table of choices with its four choices in the store';
  end if;
  -- the server's views (the picklist tool, the picklist REST router, the variable resolver read
  -- these): the moved list and the new list, from the store, with the choice added to the copy
  if (select pl.lives_in from workbench.pick_list_live pl where pl.id = f.lst) is distinct from 'record'
     or not exists (select 1 from workbench.pick_list_item_live pi where pi.list_id = f.lst and pi.label = 'Portugal' and pi.lives_in = 'record')
     or (select count(*) from workbench.pick_list_item_live pi where pi.list_id = f.born) <> 4
     or (select count(*) from workbench.pick_list_live pl where pl.id = f.lst) <> 1 then
    raise exception '2v: the server views do not answer the moved and the new list from the store';
  end if;
  v_did := platform._cutover_seam_apply('older_tables', f.ws, 'old', f.admin, f.press_old);
  insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
  values (f.press_old, 'older_tables', f.ws, 'old', 'done', 'Switched back to the old system.', f.admin, v_did, 'listsafter_green');
  if (select count(*) from workbench.pick_list_live pl where pl.id = f.lst and pl.lives_in = 'older') <> 1 then
    raise exception '3v: after Switch back the server view does not answer the list from the older rows (once)';
  end if;
end
$t$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-listsafter002"}', true);

do $t$
declare
  f _la;
  v jsonb;
begin
  select * into f from _la;
  if (select w.lives_in from custom.where_lists_live(array[f.lst]) w) is distinct from 'older' then
    raise exception '4: after Switch back the list does not live in the older store';
  end if;
  v := public.get_user_list_with_items(f.lst);
  if v ->> 'lives_in' is distinct from 'older' or v -> 'moved_to' is distinct from 'null'::jsonb then
    raise exception '4b: after Switch back the list reads %', v;
  end if;
  -- the list born in the store while switched stays in the store (it has no older twin)
  if (select w.lives_in from custom.where_lists_live(array[f.born]) w) is distinct from 'record' then
    raise exception '4c: the list born in the store lost its home at Switch back';
  end if;
  v := public.create_user_list('Insurance Carriers', null, f.admin, false, false, false, '[{"Label": "Delta Dental"}]'::jsonb, f.ws);
  if v ->> 'lives_in' is distinct from 'older'
     or not exists (select 1 from workbench.udt_structured_lists l where l.id = (v ->> 'list_id')::uuid) then
    raise exception '4d: after Switch back a new list was not made in the older lists: %', v;
  end if;
  if public.list_table_rows(jsonb_build_object('table_id', f.tbl)) -> 'moved_to' is distinct from 'null'::jsonb then
    raise exception '4e: a live older table is still marked moved';
  end if;
  raise notice 'listsafter_green: GREEN';
end
$t$;

rollback;
