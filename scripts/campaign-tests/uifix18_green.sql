-- LANE UI-FIX-18 — ADDING A RECORD NUMBER COLUMN DOES NOT MARK EVERY RECORD CHANGED. GREEN.
--
-- THE USE CASE. Birchwood Avenue Renovation keeps its rooms in a table (Kitchen, Primary bath,
-- Garage). The owner — admin — adds a *Job number* column (Record number) so the crew can read
-- "Job 2" over the phone. Nobody touches a room. Then she really changes the Kitchen's budget.
--
-- WHAT WAS WRONG (VERIFIER-18 M1, production 2026-09-24). `custom.autonumber_backfill` numbers
-- the records already there by saving each once; that save moved every record's version, set
-- its updated_at (what *Last touched* reads) to now, and wrote a history version on every row.
--
-- WHAT IT PROVES, from admin's `authenticated` seat through the doors (reads of the stored
-- version and history step out to the connected role and say so):
--   1  after the backfill every room carries its number (1, 2, 3 in creation order)
--   2  …and every room kept its version, its updated_at and its history row count
--   3  a REAL change afterwards still moves the version and writes a history row
--
-- Twin: RED on the bodies before uifix18_a_write_that_only_works_something_out_is_not_a_change.sql
-- (clause 2 fails: version 2, updated_at moved, one extra history row per room).
-- RUN IT:  psql "$DSN" -f <this file>  (ends in ROLLBACK)

\set ON_ERROR_STOP on
\set suite 'uifix18_green.sql'
\set requires 'grant:authenticated:custom.record_write|grant:authenticated:custom.record_update|grant:authenticated:custom.field_declare|grant:authenticated:custom.autonumber_backfill'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temporary table _vn (k text primary key, v uuid) on commit drop;
grant select, insert on _vn to authenticated;

do $fx$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_tbl uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/uifix18_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Birchwood Avenue Renovation', 'birchwood-avenue-renovation-'||substr(v_org::text,1,8), 'BAR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/uifix18_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Birchwood Avenue Renovation')) returning id into v_home;
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','rooms','type','entity','slug','rooms',
    'label_singular','Room','label_plural','Rooms',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,'title_field','room_name','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','room_name','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','room_name','type','text'))));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Budget','key','budget','type','number'));
  insert into _vn values ('org',v_org),('tbl',v_tbl);
end $fx$;

do $seat$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss text := current_user;
  v_org  uuid := (select v from _vn where k='org');
  v_tbl  uuid := (select v from _vn where k='tbl');
  v_rooms uuid[] := '{}';
  v_id uuid; v_field uuid; v_ans jsonb; v_n int; v_ver int;
  v_before jsonb; v_after jsonb;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;

  v_rooms := v_rooms || custom.record_write(v_org, v_tbl, jsonb_build_object('room_name','Kitchen','budget',18000));
  v_rooms := v_rooms || custom.record_write(v_org, v_tbl, jsonb_build_object('room_name','Primary bath','budget',61000));
  v_rooms := v_rooms || custom.record_write(v_org, v_tbl, jsonb_build_object('room_name','Garage','budget',9500));

  perform set_config('role', v_boss, true);   -- stepping out: version, updated_at, history are not client reads
  select jsonb_object_agg(r.id, jsonb_build_object('version', r.version, 'updated_at', r.updated_at,
           'history', (select count(*) from history.row_versions h
                        where h.entity_type = 'custom.record' and h.row_id = r.id)))
    into v_before from custom.record r where r.organization_id = v_org and r.id = any(v_rooms);
  perform set_config('role', 'authenticated', true);

  v_field := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Job number','key','job_number','type','autonumber'));
  v_ans := custom.autonumber_backfill(v_org, v_field);

  -- 1 ── every room carries its number, in creation order
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.id = any(v_rooms)
     and (r.data -> '_derived' -> 'job_number' ->> 'value') ~ '^[0-9]+$';
  if v_n <> 3 then
    raise exception '1: % of 3 rooms carry a Job number after the backfill (%)', v_n, v_ans;
  end if;
  raise notice '1 PASSED — the backfill numbered all three rooms (%)', v_ans ->> 'says';

  -- 2 ── and nothing about any room moved
  select jsonb_object_agg(r.id, jsonb_build_object('version', r.version, 'updated_at', r.updated_at,
           'history', (select count(*) from history.row_versions h
                        where h.entity_type = 'custom.record' and h.row_id = r.id)))
    into v_after from custom.record r where r.organization_id = v_org and r.id = any(v_rooms);
  if v_after is distinct from v_before then
    raise exception '2: numbering the rooms marked them changed — before % after %', v_before, v_after;
  end if;
  raise notice '2 PASSED — every room kept its version, its Last touched and its history';
  perform set_config('role', 'authenticated', true);

  -- 3 ── a real change is still a change
  v_id := v_rooms[1];
  v_ver := custom.record_update(v_org, v_id, jsonb_build_object('budget', 19800), 1);
  perform set_config('role', v_boss, true);
  select count(*) into v_n from history.row_versions h where h.entity_type = 'custom.record' and h.row_id = v_id;
  perform set_config('role', 'authenticated', true);
  if v_ver <> 2 or v_n <> ((v_before -> v_id::text ->> 'history')::int + 1) then
    raise exception '3: a real budget change answered version % with % history rows', v_ver, v_n;
  end if;
  raise notice '3 PASSED — the Kitchen''s real budget change is version 2 with one more history row';
  raise notice 'uifix18_green: ALL 3 CLAUSES PASSED';
end $seat$;

rollback;
