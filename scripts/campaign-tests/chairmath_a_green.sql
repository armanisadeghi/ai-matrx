-- CHAIR-MATH (a) — A FORMULA THAT READS A WORKED-OUT COLUMN READS ITS ANSWER.
--
-- WHAT THIS PROVES. On every path a formula is evaluated — the whole-record read
-- (custom.record_values → derived_values_of), the one-column read (custom.record_value_one) and
-- the planned-once aggregate path (custom.agg_field_value_sql) — a formula over a roll-up, a
-- formula over a lookup and a formula over a formula-over-a-roll-up answer from the worked-out
-- value, never from a blank read as 0.
--
-- RED before migrations/campaign/chairmath_a_a_formula_reads_a_worked_out_column.sql:
--   charges_plus_one = 1, copay_plus_one = 1, charges_doubled = 1 on every path.
-- GREEN after it: 126, 41, 251.
--
-- THE REAL USE CASE (2026-09-21 law — no fake test data). Lakeside Family Foot Care, a podiatry
-- clinic in Erie. A visit links the services performed (each with a standard fee) and the patient
-- (with a copay). Visit charges is the sum of the services' fees; the front desk wants the fee
-- with the $1 statement charge, the copay with that charge, and the doubled-charges figure the
-- billing export asks for.
--
-- Everything is rolled back: nothing persists on any database.
-- Run: node <scratch>/cpsql.mjs -f scripts/campaign-tests/chairmath_a_green.sql   (clone)
--      binlocal/p.sh -f scripts/campaign-tests/chairmath_a_green.sql               (main)
\set ON_ERROR_STOP on
\set suite 'chairmath_a_green.sql'
\set requires 'exec:custom.record_write|exec:custom.table_declare|exec:custom.field_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table cm_fx (k text primary key, v text) on commit drop;
create temp table cm_res (check_name text, ok boolean, detail text) on commit drop;
grant all on cm_fx, cm_res to authenticated, service_role;

do $t$
declare
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org      uuid;
  v_home     uuid;
  v_services uuid;
  v_patients uuid;
  v_visits   uuid;
  v_svc_a    uuid;
  v_svc_b    uuid;
  v_patient  uuid;
  v_visit    uuid;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Lakeside Family Foot Care', 'lakeside-foot-care-' || substr(md5(random()::text),1,8), 'LFF', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/chairmath_a_green', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
              jsonb_build_object('name','Lakeside Family Foot Care — Front desk'));

  v_services := custom.table_declare(v_org, jsonb_build_object(
    'name','Services','slug','lff_services_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Service','label_plural','Services','title_field','service_name','display','list',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','service_name')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_services, jsonb_build_object('key','service_name','label','Service','type','text'));
  perform custom.field_declare(v_org, v_services, jsonb_build_object('key','standard_fee','label','Standard fee','type','currency','unit','$'));

  v_patients := custom.table_declare(v_org, jsonb_build_object(
    'name','Patients','slug','lff_patients_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Patient','label_plural','Patients','title_field','patient_name','display','list',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','patient_name')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_patients, jsonb_build_object('key','patient_name','label','Patient','type','text'));
  perform custom.field_declare(v_org, v_patients, jsonb_build_object('key','copay','label','Copay','type','currency','unit','$'));

  v_visits := custom.table_declare(v_org, jsonb_build_object(
    'name','Visits','slug','lff_visits_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Visit','label_plural','Visits','title_field','chart_number','display','list',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','chart_number')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_visits, jsonb_build_object('key','chart_number','label','Chart number','type','text'));
  perform custom.field_declare(v_org, v_visits, jsonb_build_object('key','services','label','Services','type','relation','relation_target',v_services,'multi',true));
  perform custom.field_declare(v_org, v_visits, jsonb_build_object('key','patient','label','Patient','type','relation','relation_target',v_patients));
  perform custom.field_declare(v_org, v_visits, jsonb_build_object('key','visit_charges','label','Visit charges','type','rollup','via','services','agg','sum','of','standard_fee'));
  perform custom.field_declare(v_org, v_visits, jsonb_build_object('key','patient_copay','label','Patient copay','type','lookup','via','patient','pick','copay'));
  perform custom.field_declare(v_org, v_visits, jsonb_build_object('key','charges_plus_one','label','Charges plus one','type','formula','formula_text','{Visit charges} + 1'));
  perform custom.field_declare(v_org, v_visits, jsonb_build_object('key','copay_plus_one','label','Copay plus one','type','formula','formula_text','{Patient copay} + 1'));
  -- Declared BEFORE the formula it reads, so dependency order (not declaration order) is what is proven.
  perform custom.field_declare(v_org, v_visits, jsonb_build_object('key','charges_doubled','label','Charges doubled','type','formula','formula_text','{Charges plus one} * 2 - 1'));

  v_svc_a := custom.record_write(v_org, v_services, jsonb_build_object('service_name','Diabetic foot exam','standard_fee',85));
  v_svc_b := custom.record_write(v_org, v_services, jsonb_build_object('service_name','Nail debridement','standard_fee',40));
  v_patient := custom.record_write(v_org, v_patients, jsonb_build_object('patient_name','Rosa Delgado','copay',40));
  v_visit := custom.record_write(v_org, v_visits, jsonb_build_object(
    'chart_number','LFF-10417',
    'services', jsonb_build_array(v_svc_a::text, v_svc_b::text),
    'patient', v_patient::text));

  reset role;
  insert into cm_fx values ('org', v_org::text), ('visits', v_visits::text), ('visit', v_visit::text);
end;
$t$;

-- ── 1. THE WHOLE-RECORD READ ─────────────────────────────────────────────────────────────────────
do $t$
declare
  v_org   uuid := (select v::uuid from cm_fx where k='org');
  v_visit uuid := (select v::uuid from cm_fx where k='visit');
  v jsonb;
begin
  v := custom.record_values(v_org, v_visit);
  insert into cm_res values
    ('1a record_values: the roll-up itself is 125',            (v ->> 'visit_charges')    = '125', v ->> 'visit_charges'),
    ('1b record_values: formula over the roll-up = 126',       (v ->> 'charges_plus_one') = '126', v ->> 'charges_plus_one'),
    ('1c record_values: formula over the lookup = 41',         (v ->> 'copay_plus_one')   = '41',  v ->> 'copay_plus_one'),
    ('1d record_values: formula over that formula = 251',      (v ->> 'charges_doubled')  = '251', v ->> 'charges_doubled');
end;
$t$;

-- ── 2. THE ONE-COLUMN READ ───────────────────────────────────────────────────────────────────────
do $t$
declare
  v_org   uuid := (select v::uuid from cm_fx where k='org');
  v_visit uuid := (select v::uuid from cm_fx where k='visit');
begin
  insert into cm_res values
    ('2a record_value_one: formula over the roll-up = 126',
       custom.record_value_one(v_org, v_visit, 'charges_plus_one') #>> '{}' = '126',
       custom.record_value_one(v_org, v_visit, 'charges_plus_one') #>> '{}'),
    ('2b record_value_one: formula over the lookup = 41',
       custom.record_value_one(v_org, v_visit, 'copay_plus_one') #>> '{}' = '41',
       custom.record_value_one(v_org, v_visit, 'copay_plus_one') #>> '{}'),
    ('2c record_value_one: formula over that formula = 251',
       custom.record_value_one(v_org, v_visit, 'charges_doubled') #>> '{}' = '251',
       custom.record_value_one(v_org, v_visit, 'charges_doubled') #>> '{}');
end;
$t$;

-- ── 3. THE PLANNED-ONCE AGGREGATE PATH (the grid's summary bar, filters on worked-out columns) ──
do $t$
declare
  v_org    uuid := (select v::uuid from cm_fx where k='org');
  v_visits uuid := (select v::uuid from cm_fx where k='visits');
  v_visit  uuid := (select v::uuid from cm_fx where k='visit');
  v_sql    text;
  v_txt    text;
  v_key    text;
  v_want   text;
begin
  for v_key, v_want in select * from (values ('charges_plus_one','126'), ('copay_plus_one','41'), ('charges_doubled','251')) x loop
    v_sql := custom.agg_field_value_sql(v_org, v_visits, v_key);
    execute format('select %s from custom.record r where r.organization_id = $1 and r.id = $2', v_sql)
       into v_txt using v_org, v_visit;
    insert into cm_res values
      (format('3 agg_field_value_sql: %s = %s', v_key, v_want), v_txt = v_want, coalesce(v_txt, '(null)'));
  end loop;
end;
$t$;

select check_name, case when ok then 'ok' else 'FAIL' end as result, detail from cm_res order by check_name;

do $t$
declare v_bad integer := (select count(*) from cm_res where not ok);
begin
  if v_bad > 0 then
    raise exception 'chairmath_a_green: % check(s) FAILED (RED) — a formula over a worked-out column reads a blank as 0', v_bad;
  end if;
  raise notice 'chairmath_a_green: all % checks passed (GREEN)', (select count(*) from cm_res);
end;
$t$;

rollback;
