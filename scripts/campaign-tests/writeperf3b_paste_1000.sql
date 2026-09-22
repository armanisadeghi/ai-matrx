-- WRITE-PERF-3 (second run) — WHERE THE 2,894 ms OF A 250-ROW BATCH GO, TRIGGER BY TRIGGER.
--
-- IMPORT-2 measured a 250-row batched insert into `custom.record` at 2,894 ms: 1,930 ms in the
-- BEFORE-ROW guards and 871 ms in the three after-STATEMENT triggers. This file re-measures that
-- on the MAIN database with `EXPLAIN (ANALYZE, BUFFERS)`, which names EVERY trigger's own time
-- and call count, inside ONE transaction that ROLLS BACK. It writes nothing that survives.
--
-- THE REAL USE CASE (2026-09-21 law — no fake test data). Northgate Auto Glass is a mobile
-- windshield shop in Tacoma. Its dispatcher keeps one work order per vehicle: the insurer's
-- claim number, the vehicle, the glass part number, the quoted price, the scheduled arrival
-- window, where the job stands, the technician, and the insurance carrier it bills. Every
-- morning it imports the carriers' overnight assignment files — a few hundred jobs at a time —
-- which is exactly the 250-row batch this file profiles.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf3b_paste_1000.sql
\set ON_ERROR_STOP on
\set suite 'writeperf3b_paste_1000.sql'
\set requires 'grant:authenticated:custom.person_kernel_id'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '30s';
set local lock_timeout = '2s';
set local track_functions = 'all';
set local stats_fetch_consistency = 'none';
set local idle_in_transaction_session_timeout = 0;

create temp table wp3b_fx (slot int, k text, v text, primary key (slot, k)) on commit drop;
grant all on wp3b_fx to authenticated;

create or replace function pg_temp.build(p_slot int, p_slug text) returns void language plpgsql as $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org uuid; v_home uuid; v_tbl uuid; v_car uuid; v_cars uuid[]; i int;
  c_carriers text[] := array['Cascadia Mutual','Puget Sound Casualty','Evergreen Auto Indemnity',
                             'Rainier Direct','Olympic Fleet Cover','Sound Transit Fleet',
                             'Harbor Line Insurance','Tacoma Grange Mutual','Northwest Freight Cover',
                             'Chinook Assurance'];
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Northgate Auto Glass', p_slug, 'NAG', c_admin) returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org),
         (v_org, c_dana,  'member','active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf3b_profile', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this harness did not take the seat — current_user is %', current_user;
  end if;

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
              jsonb_build_object('name','Northgate Auto Glass — Tacoma Shop'));

  v_car := custom.table_declare(v_org, jsonb_build_object(
    'name','Insurance Carriers','slug','carriers_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Carrier','label_plural','Insurance Carriers','title_field','carrier','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','carrier')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_car, jsonb_build_object('label','Carrier','key','carrier','type','text'));
  for i in 1..10 loop
    v_cars := v_cars || custom.record_write(v_org, v_car, jsonb_build_object('carrier', c_carriers[i]));
  end loop;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Work Orders','slug','workorders_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Work Order','label_plural','Work Orders','title_field','claim','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','claim')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Claim number','key','claim','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Vehicle','key','vehicle','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Quoted price','key','quoted','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Arrival window','key','arrives','type','datetime'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Status','key','status','type','select',
    'options', jsonb_build_array('Assigned','Parts ordered','Scheduled','Installed','Invoiced')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Technician','key','tech','type','member'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Carrier','key','carrier','type','relation','relation_target', v_car::text));

  insert into wp3b_fx values (p_slot,'org', v_org::text), (p_slot,'home', v_home::text), (p_slot,'tbl', v_tbl::text),
                             (p_slot,'car', v_car::text), (p_slot,'cars', array_to_string(v_cars, ','));
end;
$$;

-- The overnight assignment file: one work order per vehicle, the shapes a glass shop really sees.
create or replace function pg_temp.docs(p_slot int, p_from int, p_to int) returns jsonb[] language plpgsql as $$
declare
  v_home uuid; v_cars uuid[]; v_docs jsonb[];
  c_make text[] := array['2019 Ford Transit 250','2021 Toyota RAV4','2017 Chevrolet Silverado 1500',
                         '2022 Subaru Outback','2020 Honda CR-V','2018 Ram ProMaster 1500',
                         '2023 Tesla Model Y','2016 Nissan Frontier','2021 Kia Telluride',
                         '2015 Ford F-150'];
  c_stat text[] := array['Assigned','Parts ordered','Scheduled','Installed','Invoiced'];
begin
  select v::uuid into v_home from wp3b_fx where slot=p_slot and k='home';
  select string_to_array(v, ',')::uuid[] into v_cars from wp3b_fx where slot=p_slot and k='cars';
  select array_agg(jsonb_strip_nulls(jsonb_build_object(
           'claim',   'NAG-2026-' || lpad(g.i::text, 5, '0'),
           'vehicle', c_make[1 + (g.i % 10)],
           'quoted',  round((289.00 + (g.i % 47) * 18.65)::numeric, 2),
           'arrives', to_char(timestamp '2026-09-22 07:30' + ((g.i % 40) * 45 || ' minutes')::interval,
                              'YYYY-MM-DD"T"HH24:MI:SS'),
           'status',  c_stat[1 + (g.i % 5)],
           'tech',    case when g.i % 10 = 0 then v_home::text else null end,
           'carrier', case when g.i % 7 = 0 then null else v_cars[1 + (g.i % 10)]::text end))
           order by g.i)
    into v_docs from generate_series(p_from, p_to) g(i);
  return v_docs;
end;
$$;


select pg_temp.build(1, 'northgate-auto-glass-a1-' || substr(md5(random()::text),1,8));
reset role;
select pg_temp.build(2, 'northgate-auto-glass-a2-' || substr(md5(random()::text),1,8));
reset role;
select pg_temp.build(3, 'northgate-auto-glass-b1-' || substr(md5(random()::text),1,8));
reset role;
select pg_temp.build(4, 'northgate-auto-glass-b2-' || substr(md5(random()::text),1,8));
reset role;
reset role;

select v as org1 from wp3b_fx where slot=1 and k='org' \gset
select v as tbl1 from wp3b_fx where slot=1 and k='tbl' \gset
select v as org2 from wp3b_fx where slot=2 and k='org' \gset
select v as tbl2 from wp3b_fx where slot=2 and k='tbl' \gset
select v as org3 from wp3b_fx where slot=3 and k='org' \gset
select v as tbl3 from wp3b_fx where slot=3 and k='tbl' \gset
select v as org4 from wp3b_fx where slot=4 and k='org' \gset
select v as tbl4 from wp3b_fx where slot=4 and k='tbl' \gset


\echo '###### OLD BODIES ######'
\i migrations/inverse/writeperf3b_the_relation_fields_are_read_once_per_statement_down.sql
\i migrations/inverse/writeperf3b_the_outbox_asks_its_questions_once_per_statement_down.sql
\i migrations/inverse/writeperf3b_a_tables_declared_keys_are_read_once_per_statement_down.sql
\i migrations/inverse/writeperf3b_a_standard_tables_fields_are_read_once_per_statement_down.sql

do $t$
declare b int; t0 timestamptz; t1 timestamptz; v_org uuid; v_tbl uuid; n int := 0;
begin
  select v::uuid into v_org from wp3b_fx where slot=1 and k='org';
  select v::uuid into v_tbl from wp3b_fx where slot=1 and k='tbl';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  t0 := clock_timestamp();
  for b in 0..3 loop
    n := n + coalesce(array_length(custom.record_write_many(v_org, v_tbl, pg_temp.docs(1, b*250+1, b*250+250)), 1), 0);
  end loop;
  t1 := clock_timestamp();
  raise notice 'PASTE OLD: % rows in 4 statements of 250 = % ms = % ms/row', n,
    round(extract(epoch from (t1-t0))*1000)::text,
    round((extract(epoch from (t1-t0))*1000/greatest(n,1))::numeric, 2);
end;
$t$;
reset role;

\echo '###### NEW BODIES ######'
\i migrations/campaign/writeperf3b_the_relation_fields_are_read_once_per_statement.sql
\i migrations/campaign/writeperf3b_the_outbox_asks_its_questions_once_per_statement.sql
\i migrations/campaign/writeperf3b_a_tables_declared_keys_are_read_once_per_statement.sql
\i migrations/campaign/writeperf3b_a_standard_tables_fields_are_read_once_per_statement.sql

do $t$
declare b int; t0 timestamptz; t1 timestamptz; v_org uuid; v_tbl uuid; n int := 0;
begin
  select v::uuid into v_org from wp3b_fx where slot=2 and k='org';
  select v::uuid into v_tbl from wp3b_fx where slot=2 and k='tbl';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  t0 := clock_timestamp();
  for b in 0..3 loop
    n := n + coalesce(array_length(custom.record_write_many(v_org, v_tbl, pg_temp.docs(2, b*250+1, b*250+250)), 1), 0);
  end loop;
  t1 := clock_timestamp();
  raise notice 'PASTE NEW: % rows in 4 statements of 250 = % ms = % ms/row', n,
    round(extract(epoch from (t1-t0))*1000)::text,
    round((extract(epoch from (t1-t0))*1000/greatest(n,1))::numeric, 2);
end;
$t$;
reset role;

rollback;
