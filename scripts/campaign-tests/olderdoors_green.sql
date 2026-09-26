-- LANE OLDER-DOORS-AFTER-SWITCH — THE GREEN SUITE. After an owner presses Data tables → new system:
--   · every older table AND every older pick list of the organization is archived with a pointer
--     to its same-id copy (the press archives the lists too; `did.archived_lists` names them);
--   · the older reads (get_full_table, get_user_table_data_paginated_v2, the list reads) answer
--     with the same rows, marked `moved_to` {moved, address '/data/<id>', says};
--   · every older write door refuses — a direct table write (what PostgREST and the server's ORM
--     do), udt_upsert_cell, append_rows_to_user_table, add_column_to_user_table, a list item
--     insert, update_user_list, one Trash restore of a list, update_data_row_in_user_table (which
--     used to answer success) — with a sentence naming the copy's address;
--   · on a live older table a one-cell patch MERGES (update_data_row_in_user_table and
--     udt_upsert_row used to replace the whole row — VERIFIER-26);
--   · the copy in the new system still writes (custom.record_write);
--   · Switch back brings the tables AND the lists back live and writable, unmarked.
--
-- THE REAL USE CASE: admin@admin.com's Workspace. Its older table "Rincon Plumbing — Customers"
-- (the plumbing company's customer list: household + service address) and its pick list
-- "Countries by Continent". A new customer, Tomás Reyes at 88 Avenida Cabrillo, is added after
-- the switch: refused in the older table, accepted in its copy. The press and Switch back run
-- inside the transaction; everything is rolled back.
--
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/olderdoors_green.sql
-- ITS RED: without the campaign file (and after its inverse) it fails at 0 — no mark, no guard.

\set ON_ERROR_STOP on
\timing off

\set suite 'olderdoors_green.sql'
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
  if to_regprocedure('workbench.older_table_moved_to(uuid)') is null
     or to_regprocedure('workbench.udt_structured_list_archive(uuid,uuid,text)') is null
     or not exists (select 1 from pg_trigger where tgname = '_0_moved_older_table_takes_no_writes'
                      and tgrelid = 'workbench.udt_dataset_rows'::regclass) then
    raise exception '0: no moved mark and no write guard — a switched organization''s older tables still take writes from any door';
  end if;
  if has_function_privilege('authenticated', 'workbench.udt_structured_list_archive(uuid,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'platform._older_list_moved_by_switch(uuid)', 'execute')
     or has_function_privilege('anon', 'workbench.older_table_moved_to(uuid)', 'execute') then
    raise exception '0b: a door is reachable by a role it must not be';
  end if;
end
$t$;

-- ── 1. the press (as the database owner, exactly what platform.cutover_seam_press does after readiness) ──
create temp table _od on commit drop as
  select '87a6e699-3622-4869-8843-d0867456c0dd'::uuid as admin,
         '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid as ws,
         (select d.id from workbench.udt_datasets d
           where d.organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
             and d.table_name = 'Rincon Plumbing — Customers' and d.deleted_at is null limit 1) as tbl,
         (select l.id from workbench.udt_structured_lists l
           where l.organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
             and l.list_name = 'Countries by Continent' and l.deleted_at is null limit 1) as lst,
         gen_random_uuid() as press_new,
         gen_random_uuid() as press_old;
grant select on _od to authenticated;

do $t$
declare
  f _od;
  v_did jsonb;
  v_rows int;
begin
  select * into f from _od;
  if f.tbl is null or f.lst is null then
    raise exception 'fixture: admin''s Workspace needs its live older table "Rincon Plumbing — Customers" and its live pick list "Countries by Continent"';
  end if;
  if (platform._cutover_seam_last_done('older_tables', f.ws)).direction = 'new' then
    raise exception 'fixture: admin''s Workspace is already switched on this database';
  end if;

  v_did := platform._cutover_seam_apply('older_tables', f.ws, 'new', f.admin, f.press_new);
  insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
  values (f.press_new, 'older_tables', f.ws, 'new', 'done', 'Switched to the new system.', f.admin, v_did, 'olderdoors_green');

  if not (v_did -> 'archived') @> to_jsonb(array[f.tbl::text]) then
    raise exception '1: the press did not archive the older table: %', v_did -> 'archived';
  end if;
  if not coalesce(v_did -> 'archived_lists', '[]'::jsonb) @> to_jsonb(array[f.lst::text]) then
    raise exception '1b: the press did not archive the older pick list (archived_lists = %)', v_did -> 'archived_lists';
  end if;
  if exists (select 1 from workbench.udt_structured_lists l where l.organization_id = f.ws and l.deleted_at is null) then
    raise exception '1c: the organization still has a live older pick list beside its copy';
  end if;
  if (select l.metadata #>> '{moved_to,table_id}' from workbench.udt_structured_lists l where l.id = f.lst) is distinct from f.lst::text then
    raise exception '1d: the archived list does not point at its copy';
  end if;
end
$t$;

-- ── 2. the member's seat: reads marked, writes refused ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-olderdoors001"}', true);

do $t$
declare
  f _od;
  v jsonb;
  v_err text;
  v_row uuid;
  v_n int;
begin
  select * into f from _od;
  select w.id into v_row from workbench.udt_dataset_rows w where w.table_id = f.tbl and w.deleted_at is null order by w.created_at limit 1;
  if v_row is null then raise exception '2: the member cannot see the moved table''s rows (reads must still answer)'; end if;

  -- 2a. the older grid's reads: same rows, marked moved
  v := public.get_full_table(jsonb_build_object('table_id', f.tbl));
  if coalesce((v #>> '{moved_to,moved}')::boolean, false) is not true
     or v #>> '{moved_to,address}' is distinct from '/data/' || f.tbl then
    raise exception '2a: get_full_table does not mark the moved table: %', v -> 'moved_to';
  end if;
  if (v ->> 'row_count')::int < 3 then raise exception '2a2: get_full_table lost rows (%)', v ->> 'row_count'; end if;
  v := public.get_user_table_data_paginated_v2(f.tbl, 50, 0, null, 'asc', null);
  if jsonb_array_length(v -> 'data') < 3 or v #>> '{moved_to,address}' is distinct from '/data/' || f.tbl then
    raise exception '2b: get_user_table_data_paginated_v2 answers % rows, moved_to %', jsonb_array_length(v -> 'data'), v -> 'moved_to';
  end if;
  if (v #>> '{moved_to,says}') not like '%moved to the new system%' then
    raise exception '2b2: the mark says %', v #>> '{moved_to,says}';
  end if;

  -- 2c. every write door refuses, naming the copy's address
  begin
    insert into workbench.udt_dataset_rows (table_id, data, user_id, created_by)
    values (f.tbl, '{"household": "Tomás Reyes", "service_address": "88 Avenida Cabrillo, San Clemente"}', f.admin, f.admin);
    raise exception '2c: a direct row insert (PostgREST / the server''s ORM) landed in the moved older table';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%moved to the new system%' or v_err not like '%/data/' || f.tbl || '%' then raise exception '2c2: the refusal says %', v_err; end if;
  end;
  begin
    perform public.udt_upsert_cell(f.tbl, v_row, 'service_address', to_jsonb('1412 Calle Puente, Unit B, San Clemente'::text));
    raise exception '2d: udt_upsert_cell changed a cell of the moved older table';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%/data/' || f.tbl || '%' then raise exception '2d2: the refusal says %', v_err; end if;
  end;
  begin
    perform public.append_rows_to_user_table(f.tbl, '[{"household": "Tomás Reyes", "service_address": "88 Avenida Cabrillo, San Clemente"}]'::jsonb);
    raise exception '2e: append_rows_to_user_table (the browser extension''s door) appended to the moved older table';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%moved to the new system%' then raise exception '2e2: the refusal says %', v_err; end if;
  end;
  begin
    perform public.add_column_to_user_table(f.tbl, 'gate_code', 'Gate code', 'string', 3, false, null, null);
    raise exception '2f: add_column_to_user_table added a column to the moved older table';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%moved to the new system%' then raise exception '2f2: the refusal says %', v_err; end if;
  end;
  begin
    perform public.update_data_row_in_user_table(v_row, '{"service_address": "1412 Calle Puente, Unit B, San Clemente"}'::jsonb);
    raise exception '2f3: update_data_row_in_user_table reported success on the moved older table (VERIFIER-26)';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%/data/' || f.tbl || '%' then raise exception '2f4: the refusal says %', v_err; end if;
  end;
  begin
    update workbench.udt_dataset_rows set data = data || '{"service_address": "1412 Calle Puente, Unit B, San Clemente"}' where id = v_row;
    get diagnostics v_n = row_count;
    raise exception '2g: a direct row update changed % rows of the moved older table', v_n;
  exception when check_violation then null;
  end;

  -- 2h. the older pick list: reads marked, writes refused, one restore refused
  v := public.get_structured_list_for_selection(f.lst);
  if v is null or v #>> '{moved_to,address}' is distinct from '/data/' || f.lst then
    raise exception '2h: get_structured_list_for_selection does not answer the moved list, marked: %', v;
  end if;
  v := public.get_user_list_with_items(f.lst);
  if v is null or coalesce((v #>> '{moved_to,moved}')::boolean, false) is not true then
    raise exception '2h2: get_user_list_with_items does not answer the moved list, marked: %', v;
  end if;
  begin
    insert into workbench.udt_structured_list_items (list_id, label, group_name, organization_id, user_id, created_by)
    values (f.lst, 'Portugal', 'Europe', f.ws, f.admin, f.admin);
    raise exception '2i: a choice was added to the moved older list';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%This list moved to the new system%' or v_err not like '%/data/' || f.lst || '%' then raise exception '2i2: the refusal says %', v_err; end if;
  end;
  -- 2j. update_user_list on a moved list writes its COPY (lane LISTS-AFTER-SWITCH, 2026-09-26: a
  -- moved list lives in the store, so the older door writes there); the archived older list is
  -- not touched — the older rows take no writes, from any door.
  perform public.update_user_list(f.lst, 'Countries by Continent (2026)');
  if (public.get_user_list_with_items(f.lst) ->> 'list_name') is distinct from 'Countries by Continent (2026)' then
    raise exception '2j: update_user_list did not rename the moved list where it now lives (its copy)';
  end if;
  begin
    update workbench.udt_structured_lists set list_name = 'Countries by Continent (2026)' where id = f.lst;
    raise exception '2j2: a direct update renamed the moved older list';
  exception when check_violation then null;
  end;
  begin
    update workbench.udt_structured_lists set deleted_at = null where id = f.lst;
    get diagnostics v_n = row_count;
    if v_n > 0 then raise exception '2k: one restore brought back one moved older list'; end if;
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%Switch back restores all of them together%' then raise exception '2k2: the refusal says %', v_err; end if;
  end;

  -- 2l. the copy in the new system still writes
  if custom.record_write(f.ws, f.tbl, '{"household": "Tomás Reyes", "service_address": "88 Avenida Cabrillo, San Clemente"}'::jsonb) is null then
    raise exception '2l: the copy refused a new customer';
  end if;
end
$t$;

reset role;

-- ── 3. Switch back: tables and lists come back live, writable and unmarked ──
do $t$
declare
  f _od;
  v_did jsonb;
begin
  select * into f from _od;
  v_did := platform._cutover_seam_apply('older_tables', f.ws, 'old', f.admin, f.press_old);
  insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
  values (f.press_old, 'older_tables', f.ws, 'old', 'done', 'Switched back to the old system.', f.admin, v_did, 'olderdoors_green');
  if not coalesce(v_did -> 'unarchived_lists', '[]'::jsonb) @> to_jsonb(array[f.lst::text]) then
    raise exception '3: Switch back did not restore the older pick list (unarchived_lists = %)', v_did -> 'unarchived_lists';
  end if;
  if exists (select 1 from workbench.udt_datasets where id = f.tbl and deleted_at is not null)
     or exists (select 1 from workbench.udt_structured_lists where id = f.lst and deleted_at is not null) then
    raise exception '3b: after Switch back the older table or list is still archived';
  end if;
end
$t$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-olderdoors002"}', true);

do $t$
declare
  f _od;
  v jsonb;
  v_row uuid;
begin
  select * into f from _od;
  select w.id into v_row from workbench.udt_dataset_rows w where w.table_id = f.tbl and w.deleted_at is null order by w.created_at limit 1;
  v := public.get_full_table(jsonb_build_object('table_id', f.tbl));
  if v -> 'moved_to' is distinct from 'null'::jsonb then raise exception '4: a live older table is still marked moved: %', v -> 'moved_to'; end if;
  perform public.udt_upsert_cell(f.tbl, v_row, 'service_address', to_jsonb('1412 Calle Puente, Unit B, San Clemente'::text));

  -- 4a. A ONE-CELL PATCH MERGES, NEVER REPLACES (VERIFIER-26): the household stays.
  select w.data into v from workbench.udt_dataset_rows w where w.id = v_row;
  if (public.update_data_row_in_user_table(v_row, '{"service_address": "1412 Calle Puente, Unit C, San Clemente"}'::jsonb) ->> 'success')::boolean is not true then
    raise exception '4a: update_data_row_in_user_table refused a live older table';
  end if;
  if (select w.data ->> 'household' from workbench.udt_dataset_rows w where w.id = v_row) is distinct from v ->> 'household'
     or (select w.data ->> 'service_address' from workbench.udt_dataset_rows w where w.id = v_row) is distinct from '1412 Calle Puente, Unit C, San Clemente' then
    raise exception '4a2: a one-cell patch through update_data_row_in_user_table replaced the row: %', (select w.data from workbench.udt_dataset_rows w where w.id = v_row);
  end if;
  perform public.udt_upsert_row(f.tbl, v_row, '{"service_address": "1412 Calle Puente, San Clemente"}'::jsonb);
  if (select w.data ->> 'household' from workbench.udt_dataset_rows w where w.id = v_row) is distinct from v ->> 'household' then
    raise exception '4b: a one-cell patch through udt_upsert_row replaced the row: %', (select w.data from workbench.udt_dataset_rows w where w.id = v_row);
  end if;

  insert into workbench.udt_structured_list_items (list_id, label, group_name, organization_id, user_id, created_by)
  values (f.lst, 'Portugal', 'Europe', f.ws, f.admin, f.admin);
  v := public.get_structured_list_for_selection(f.lst);
  if v -> 'moved_to' is distinct from 'null'::jsonb then raise exception '4c: a live older list is still marked moved'; end if;
  raise notice 'olderdoors_green: GREEN';
end
$t$;

rollback;
