-- LANE CHAIR-DOORS-2 j (window half) — PUBLISHED TO THE WEB AND INDEXED ON STORE ROWS, FROM THE MEMBER'S SEAT.
-- Guard for migrations/campaign/chairdoors2_j_store_rows_carry_published_to_the_web_and_indexed.sql (on top of
-- chairdoors2_j_a_table_gives_its_new_rows_their_row_controls.sql). RED until the window file lands.
--
-- As `authenticated` with test@test.com's claims; one transaction, rolled back.
--   1. Both switches are available on the Table state.
--   2. A Table she made defaults to Published to the web + Indexed + Shown to Everyone on AI Matrx: a row written
--      through custom.record_write gets all three, and the retiring row column agrees (public).
--   3. Every insert path: a row inserted below the doors (the store owner's own insert) gets them too.
--   4. Per row: she takes one row off the web and narrows Shown to in one call — it sticks, Indexed goes back to
--      the default, the row column agrees (internal); she turns Indexed off on another published row — it sticks,
--      and platform.search_engine_indexed_state agrees.
--   5. A Table that names no default: a new row is off the web, Indexed null, Shown to null.
--   6. The rung: in Cedar Ridge Physical Therapy she is a viewer on Visits (admin@admin.com's table) — publishing
--      admin's row there is refused 42501 and the state says can_change = false.
-- RUN IT (dev clone only; rolled back):
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairdoors2_j_web_row_controls_from_the_member_seat.sql
\set ON_ERROR_STOP on
\set suite 'chairdoors2_j_web_row_controls_from_the_member_seat.sql'
\set expect 'clone'
\set requires 'exec:custom.record_row_controls'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table res (check_name text, ok boolean, detail text) on commit drop;
grant all on res to authenticated, service_role;

select set_config('t.' || k, v, true) from (values
  ('me',       '4060701e-706a-4c76-b3ca-0bbc69fa5a14'),   -- test@test.com
  ('dry_run',  '9b8278c0-82b9-4034-9deb-1fc215522002'),   -- an organization she owns
  ('visits',   'e1eb83b8-4f47-4961-b523-c2ab0fe6da0f'),   -- its Visits table
  ('cedar',    '0a54df90-eab8-4d07-ab29-81a45fb41e04'),   -- Cedar Ridge Physical Therapy (member)
  ('cvisits',  'b79ba573-fb65-46f9-be54-e37d11ee4206')    -- its Visits (viewer; admin@admin.com made it)
) x(k, v) \g /dev/null
select set_config('t.admin_row', (select r.id::text from custom.record r
   where r.organization_id = current_setting('t.cedar')::uuid and r.table_id = current_setting('t.cvisits')::uuid
     and r.deleted_at is null and r.created_by = '87a6e699-3622-4869-8843-d0867456c0dd' order by r.created_at limit 1), true) \g /dev/null
select set_config('t.plain', (select t.id::text from custom.record t
   where t.organization_id = current_setting('t.dry_run')::uuid and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null and t.id <> current_setting('t.visits')::uuid
     and not (t.data ? 'row_defaults') order by t.id limit 1), true) \g /dev/null

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.me'), 'role', 'authenticated')::text, true) \g /dev/null

do $$
declare
  v jsonb; v_id uuid; m text; c text;
  v_org uuid := current_setting('t.dry_run')::uuid;
  v_tab uuid := current_setting('t.visits')::uuid;
begin
  begin
    v := custom.table_row_defaults(v_org, v_tab);
    insert into res values ('1 both switches available', (v #>> '{available,published_to_web}')::boolean and (v #>> '{available,indexed}')::boolean, v ->> 'available');
  exception when others then insert into res values ('1 both switches available', false, sqlerrm);
  end;
  begin
    v := custom.table_row_defaults_set(v_org, v_tab, '{"published_to_web": true, "indexed": true, "shown_to": "everyone_on_ai_matrx"}'::jsonb);
    insert into res values ('2 table defaults set', (v ->> 'published_to_web')::boolean and (v ->> 'indexed')::boolean, v::text);
    v_id := custom.record_write(v_org, v_tab, '{}'::jsonb);
    perform set_config('t.row_a', v_id::text, true);
    v := custom.record_row_controls(v_org, v_id);
    insert into res values ('2 new row takes all three',
      (v #>> '{published_to_web,value}')::boolean and (v #>> '{indexed,value}')::boolean and v #>> '{shown_to,value}' = 'everyone_on_ai_matrx', v::text);
    v_id := custom.record_write(v_org, v_tab, '{}'::jsonb);
    perform set_config('t.row_b', v_id::text, true);
  exception when others then insert into res values ('2 new row takes all three', false, sqlerrm);
  end;
end $$;

-- 3: below the doors, as the store owner; and the row column agrees with the switch.
reset role;
do $$
declare v_id uuid; v_ok boolean; v_d text;
begin
  insert into custom.record (organization_id, table_id, data)
  values (current_setting('t.dry_run')::uuid, current_setting('t.visits')::uuid, '{}'::jsonb) returning id into v_id;
  select r.published_to_web and r.search_engine_indexed and r.shown_to = 'everyone_on_ai_matrx' and r.visibility = 'public',
         format('%s/%s/%s/%s', r.published_to_web, r.search_engine_indexed, r.shown_to, r.visibility)
    into v_ok, v_d from custom.record r where r.id = v_id;
  insert into res values ('3 any insert path takes the defaults', coalesce(v_ok, false), v_d);
  select r.visibility = 'public', r.visibility::text into v_ok, v_d from custom.record r where r.id = current_setting('t.row_a', true)::uuid;
  insert into res values ('2 row column agrees (public)', coalesce(v_ok, false), v_d);
exception when others then insert into res values ('3 any insert path takes the defaults', false, sqlerrm);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.me'), 'role', 'authenticated')::text, true) \g /dev/null

do $$
declare v jsonb; v_id uuid; m text; c text; v_org uuid := current_setting('t.dry_run')::uuid;
begin
  -- 4
  begin
    v_id := current_setting('t.row_a')::uuid;
    v := custom.record_row_controls_set(v_org, v_id, '{"published_to_web": false, "shown_to": "everyone"}'::jsonb);
    v := custom.record_row_controls(v_org, v_id);
    insert into res values ('4 off the web + narrower Shown to sticks',
      (v #>> '{published_to_web,value}')::boolean is false and v #>> '{shown_to,value}' = 'everyone'
      and v #> '{indexed,value}' = 'null'::jsonb and (v #>> '{indexed,effective}')::boolean is false, v::text);
  exception when others then insert into res values ('4 off the web + narrower Shown to sticks', false, sqlerrm);
  end;
  begin
    v_id := current_setting('t.row_b')::uuid;
    v := custom.record_row_controls_set(v_org, v_id, '{"indexed": false}'::jsonb);
    insert into res values ('4 Indexed off sticks on a published row',
      (v #>> '{indexed,value}')::boolean is false and (v #>> '{published_to_web,value}')::boolean
      and (platform.search_engine_indexed_state('record', v_id) ->> 'effective')::boolean is false, v ->> 'indexed');
  exception when others then insert into res values ('4 Indexed off sticks on a published row', false, sqlerrm);
  end;
  begin
    v := custom.record_row_controls_set(v_org, current_setting('t.row_a')::uuid, '{"shown_to": "everyone_on_ai_matrx"}'::jsonb);
    insert into res values ('4 everyone_on_ai_matrx refused off the web', false, 'written');
  exception when others then
    get stacked diagnostics c = returned_sqlstate;
    insert into res values ('4 everyone_on_ai_matrx refused off the web', c = '22023', c);
  end;
  -- 5
  begin
    v_id := custom.record_write(v_org, current_setting('t.plain')::uuid, '{}'::jsonb);
    v := custom.record_row_controls(v_org, v_id);
    insert into res values ('5 no table default: off, follows, follows',
      (v #>> '{published_to_web,value}')::boolean is false and v #> '{indexed,value}' = 'null'::jsonb and v #> '{shown_to,value}' = 'null'::jsonb, v::text);
  exception when others then insert into res values ('5 no table default: off, follows, follows', false, sqlerrm);
  end;
  -- 6
  begin
    perform custom.record_row_controls_set(current_setting('t.cedar')::uuid, current_setting('t.admin_row')::uuid, '{"published_to_web": true}'::jsonb);
    insert into res values ('6 viewer cannot publish a row', false, 'written');
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('6 viewer cannot publish a row', c = '42501', c || ' ' || m);
  end;
  begin
    v := custom.record_row_controls(current_setting('t.cedar')::uuid, current_setting('t.admin_row')::uuid);
    insert into res values ('6 row state says can_change false',
      (v #>> '{published_to_web,can_change}')::boolean is false and (v #>> '{indexed,can_change}')::boolean is false, v::text);
  exception when others then insert into res values ('6 row state says can_change false', false, sqlerrm);
  end;
end $$;

reset role;
\set QUIET off
select check_name, ok, left(detail, 140) as detail from res order by check_name;
do $$
declare v_bad text;
begin
  select string_agg(check_name, '; ') into v_bad from res where not ok;
  if v_bad is not null or (select count(*) from res) < 11 then
    raise exception 'RED chairdoors2_j web row controls: % (checks run: %)', coalesce(v_bad, 'too few checks'), (select count(*) from res);
  end if;
  raise notice 'GREEN chairdoors2_j web row controls: % checks', (select count(*) from res);
end $$;
rollback;
