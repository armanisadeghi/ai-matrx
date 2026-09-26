-- Lane TRASH-TABLES — the proof for migrations/campaign/trashtables_archived_tables_and_records_are_in_trash.sql
--
-- Use case (VERIFIER-25 item 11): admin@admin.com archives one of their own data Tables from its page
-- (custom.table_archive, the door the page calls) and looks for it in Trash. Then a single Record, then a
-- saved view. Everything runs as the person (role authenticated + their JWT claims) inside ONE
-- transaction that is ROLLED BACK — nothing is left changed.
--
--   T1  personal Trash lists the archived Table (kind table, label Table, token record, its name)
--   T2  personal Trash counts carry the table kind
--   T3  test@test.com's personal Trash does NOT list admin's Table (access is personal)
--   T4  Restore (entity_undelete 'record') brings the Table back THROUGH custom.record_restore: the
--       archive event is marked undone and every record the archive took is live again
--   T5  archived again: the organization's Trash lists it; org_trash_restore brings it back
--   T6  a Record archived on its own (custom.record_delete) is in Trash as kind record, "… (in <table>)",
--       and entity_undelete brings it back
--   T7  a Record inside an archived Table is NOT a second Trash row (it comes back with its Table)
--   T8  a saved view removed with saved_view_archive is in Trash (kind saved_view) and comes back
--   T9  the two "Document" kinds carry distinct labels
--
-- Run: psql -v ON_ERROR_STOP=1 -f scripts/campaign-tests/trashtables_green.sql (clone or production).
-- RED under the inverse (T1 fails: no table kind), GREEN after the up.

begin;
set local statement_timeout = '60s';

-- The seats and the subjects, picked as the store owner BEFORE taking the person's seat.
select set_config('tt.uid', (select id::text from auth.users where email = 'admin@admin.com'), true);
select set_config('tt.test', (select id::text from auth.users where email = 'test@test.com'), true);
select set_config('tt.pick', (
  select jsonb_build_object('org', t.organization_id, 'tbl', t.id, 'name', t.data ->> 'name',
                            'rec', (select r.id from custom.record r
                                     where r.organization_id = t.organization_id and r.table_id = t.id
                                       and r.data_class = 'record' and r.deleted_at is null
                                     order by r.created_at limit 1))::text
    from custom.record t
    join iam.organization_member om
      on om.organization_id = t.organization_id and om.user_id = t.created_by and om.role = 'owner'
   where t.created_by = current_setting('tt.uid')::uuid
     and t.data_class = 'table' and t.deleted_at is null
     and (select count(*) from custom.record r
           where r.organization_id = t.organization_id and r.table_id = t.id
             and r.data_class = 'record' and r.deleted_at is null) between 1 and 10
     and not exists (select 1 from custom.record r
                      where r.organization_id = t.organization_id and r.table_id = t.id
                        and r.data_class = 'record' and r.deleted_at is null
                        and r.created_by is distinct from t.created_by)
   order by t.created_at desc
   limit 1), true);
select set_config('tt.view', (
  select jsonb_build_object('id', s.id, 'surface', s.surface_key)::text
    from platform.saved_view s
   where s.created_by = current_setting('tt.uid')::uuid and s.deleted_at is null
   order by s.created_at desc limit 1), true);

set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', current_setting('tt.uid'), 'role', 'authenticated')::text, true);

do $$
declare
  v_pick jsonb := current_setting('tt.pick')::jsonb;
  v_org uuid := (v_pick ->> 'org')::uuid;
  v_tbl uuid := (v_pick ->> 'tbl')::uuid;
  v_name text := v_pick ->> 'name';
  v_rec uuid := (v_pick ->> 'rec')::uuid;
  v_view jsonb := nullif(current_setting('tt.view', true), '')::jsonb;
  v_live_before int;
  v_live_after int;
  v_res jsonb;
  v_n int;
  v_title text;
  v_ok boolean;
  v_fail int := 0;
  v_ids uuid[];
  v_b1 boolean;
  v_b2 boolean;
begin
  if v_tbl is null then raise exception 'SETUP: admin@admin.com owns no small live Table to archive'; end if;
  -- Direct reads of the store are the verifier's, taken as the store owner (`reset role`); every
  -- call to a door is the person's (`set local role authenticated`).
  reset role;
  select count(*) into v_live_before from custom.record r
   where r.organization_id = v_org and r.table_id = v_tbl and r.data_class = 'record' and r.deleted_at is null;
  set local role authenticated;

  -- archive the Table exactly as its page does
  v_res := custom.table_archive(v_org, v_tbl, 1000, true);
  if not coalesce((v_res ->> 'done')::boolean, false) then raise exception 'SETUP: table_archive not done: %', v_res; end if;

  -- T1
  select count(*) into v_n from public.trash_list(array['table'], 200, 0) x
   where x.id = v_tbl and x.artifact_kind = 'table' and x.label = 'Table' and x.entity_token = 'record'
     and x.title = coalesce(nullif(btrim(v_name), ''), 'Untitled table') and x.is_mine;
  if v_n = 1 then raise notice 'PASS T1 personal Trash lists the archived Table "%"', v_name;
  else raise notice 'FAIL T1 personal Trash does not list the archived Table "%" (% rows)', v_name, v_n; v_fail := v_fail + 1; end if;

  -- T2
  select count(*) into v_n from public.trash_counts() c where c.artifact_kind = 'table' and c.n >= 1 and c.label = 'Table';
  if v_n = 1 then raise notice 'PASS T2 personal counts carry the Table kind';
  else raise notice 'FAIL T2 personal counts have no Table kind'; v_fail := v_fail + 1; end if;

  -- T7 (while the Table is archived, its records are not separate rows)
  reset role;
  select coalesce(array_agg(r.id), '{}') into v_ids from custom.record r where r.organization_id = v_org and r.table_id = v_tbl;
  set local role authenticated;
  select count(*) into v_n from public.trash_list(array['record'], 1000, 0) x where x.id = any (v_ids);
  if v_n = 0 then raise notice 'PASS T7 records inside the archived Table are not separate Trash rows';
  else raise notice 'FAIL T7 % record(s) of the archived Table are listed on their own', v_n; v_fail := v_fail + 1; end if;

  -- T3
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', current_setting('tt.test'), 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.trash_list(array['table'], 1000, 0) x where x.id = v_tbl;
  if v_n = 0 then raise notice 'PASS T3 test@test.com does not see admin''s archived Table';
  else raise notice 'FAIL T3 test@test.com sees admin''s archived Table'; v_fail := v_fail + 1; end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', current_setting('tt.uid'), 'role', 'authenticated')::text, true);

  -- T4
  v_ok := public.entity_undelete('record', v_tbl);
  reset role;
  select count(*) into v_live_after from custom.record r
   where r.organization_id = v_org and r.table_id = v_tbl and r.data_class = 'record' and r.deleted_at is null;
  v_b1 := exists (select 1 from custom.record t where t.organization_id = v_org and t.id = v_tbl and t.deleted_at is null);
  v_b2 := exists (select 1 from history.migration_log m
                  where m.organization_id = v_org and m.verb = 'archive' and m.target_id = v_tbl and m.undone_at is not null
                    and m.applied_at > now() - interval '1 minute');
  set local role authenticated;
  if v_ok and v_b1 and v_live_after = v_live_before and v_b2
  then raise notice 'PASS T4 Restore brought the Table and its % record(s) back through the store''s restore door', v_live_after;
  else raise notice 'FAIL T4 restore: ok=% live records before=% after=%', v_ok, v_live_before, v_live_after; v_fail := v_fail + 1; end if;
  select count(*) into v_n from public.trash_list(array['table'], 1000, 0) x where x.id = v_tbl;
  if v_n <> 0 then raise notice 'FAIL T4 the restored Table is still in Trash'; v_fail := v_fail + 1; end if;

  -- T5
  v_res := custom.table_archive(v_org, v_tbl, 1000, true);
  select count(*) into v_n from public.org_trash_list(v_org, array['table'], null, 200, 0) x
   where x.id = v_tbl and x.owner_id = current_setting('tt.uid')::uuid;
  begin
    v_res := public.org_trash_restore(v_org, 'record', v_tbl);
  exception when others then v_res := jsonb_build_object('error', sqlerrm);
  end;
  reset role;
  v_b1 := exists (select 1 from custom.record t where t.organization_id = v_org and t.id = v_tbl and t.deleted_at is null);
  set local role authenticated;
  if v_n = 1 and coalesce((v_res ->> 'restored')::boolean, false) and v_b1
  then raise notice 'PASS T5 Organization Trash lists the Table and restores it (%)', v_res ->> 'message';
  else raise notice 'FAIL T5 org Trash: listed=% restore=%', v_n, v_res; v_fail := v_fail + 1; end if;

  -- T6
  perform custom.record_delete(v_org, v_rec);
  select x.title into v_title from public.trash_list(array['record'], 200, 0) x
   where x.id = v_rec and x.artifact_kind = 'record' and x.label = 'Record' and x.entity_token = 'record';
  v_ok := public.entity_undelete('record', v_rec);
  reset role;
  v_b1 := exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_rec and r.deleted_at is null);
  set local role authenticated;
  if v_title like '%(in %)' and v_ok and v_b1
  then raise notice 'PASS T6 an archived Record is in Trash as "%" and comes back', v_title;
  else raise notice 'FAIL T6 record: title=% restored=%', v_title, v_ok; v_fail := v_fail + 1; end if;

  -- T8
  if v_view is null then
    raise notice 'SKIP T8 admin@admin.com has no live saved view';
  else
    perform public.saved_view_archive(v_view ->> 'surface', (v_view ->> 'id')::uuid, null);
    select count(*) into v_n from public.trash_list(array['saved_view'], 200, 0) x
     where x.id = (v_view ->> 'id')::uuid and x.label = 'Saved view';
    v_ok := public.entity_undelete('platform_saved_view', (v_view ->> 'id')::uuid);
    if v_n = 1 and v_ok then raise notice 'PASS T8 a removed saved view is in Trash and comes back';
    else raise notice 'FAIL T8 saved view: listed=% restored=%', v_n, v_ok; v_fail := v_fail + 1; end if;
  end if;

  -- T9
  reset role;
  select count(distinct label) into v_n from platform.entity_types where token in ('udt_document', 'document');
  if v_n = 2 then raise notice 'PASS T9 the two document kinds have distinct labels';
  else raise notice 'FAIL T9 udt_document and document share one label'; v_fail := v_fail + 1; end if;

  if v_fail > 0 then raise exception 'TRASH-TABLES: % check(s) failed', v_fail; end if;
  raise notice 'TRASH-TABLES GREEN';
end $$;

rollback;
