-- CHAIR-MATH (b) — A ROLL-UP COUNTS ONLY THE LINKED RECORDS THAT MATCH.
--
-- WHAT THIS PROVES. A roll-up Field's `config.filter` — the saved view's own filter grammar,
-- compiled by custom.record_filter_sql against the far table — narrows what the roll-up adds up:
-- the flat form ({"status": "open"}) and the Rule form (by far-side field id) both; a filter
-- naming a column the far table lacks, or an op the grammar lacks, is refused at declaration in a
-- sentence naming the field; the filter is changed and removed through custom.field_update as a
-- plain setting; and a roll-up with no filter still adds up everything.
--
-- RED before migrations/campaign/chairmath_b_a_rollup_counts_only_the_records_that_match.sql:
--   the filter is ignored (3 counted, 410 summed), nothing is refused, field_update ignores it.
-- GREEN after it: 2 open requests, 185 unpaid; both bad filters refused; 1 after the change; 3 after removal.
--
-- THE REAL USE CASE (2026-09-21 law — no fake test data). Harbor Point Property Management,
-- Baltimore. A property has maintenance requests; the owner's statement shows the OPEN requests and
-- the UNPAID balance for each property, not every request ever filed.
--
-- Everything is rolled back: nothing persists on any database.
-- Run: node <scratch>/cpsql.mjs -f scripts/campaign-tests/chairmath_b_green.sql   (clone)
--      binlocal/p.sh -f scripts/campaign-tests/chairmath_b_green.sql               (main)
\set ON_ERROR_STOP on
\set suite 'chairmath_b_green.sql'
\set requires 'exec:custom.record_write|exec:custom.table_declare|exec:custom.field_declare|exec:custom.field_update'
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
  v_org        uuid;
  v_home       uuid;
  v_props      uuid;
  v_reqs       uuid;
  v_paid_fld   uuid;
  v_open_fld   uuid;
  v_prop       uuid;
  v_r1 uuid; v_r2 uuid; v_r3 uuid;
  v_msg        text;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Harbor Point Property Management', 'harbor-point-pm-' || substr(md5(random()::text),1,8), 'HPP', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/chairmath_b_green', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
              jsonb_build_object('name','Harbor Point — Owner statements'));

  v_reqs := custom.table_declare(v_org, jsonb_build_object(
    'name','Maintenance requests','slug','hpp_requests_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Request','label_plural','Maintenance requests','title_field','summary','display','list',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','summary')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_reqs, jsonb_build_object('key','summary','label','Summary','type','text'));
  perform custom.field_declare(v_org, v_reqs, jsonb_build_object('key','status','label','Status','type','select',
    'options', jsonb_build_array('open','in_progress','closed')));
  perform custom.field_declare(v_org, v_reqs, jsonb_build_object('key','amount','label','Amount','type','currency','unit','$'));
  v_paid_fld := custom.field_declare(v_org, v_reqs, jsonb_build_object('key','paid','label','Paid','type','checkbox'));

  v_props := custom.table_declare(v_org, jsonb_build_object(
    'name','Properties','slug','hpp_properties_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Property','label_plural','Properties','title_field','address','display','list',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','address')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_props, jsonb_build_object('key','address','label','Address','type','text'));
  perform custom.field_declare(v_org, v_props, jsonb_build_object('key','requests','label','Requests','type','relation','relation_target',v_reqs,'multi',true));
  -- The flat form, a choice column by its WORD.
  v_open_fld := custom.field_declare(v_org, v_props, jsonb_build_object('key','open_requests','label','Open requests',
    'type','rollup','via','requests','agg','count','filter', jsonb_build_object('status','open')));
  -- The Rule form, by the far-side field's ID.
  perform custom.field_declare(v_org, v_props, jsonb_build_object('key','unpaid_balance','label','Unpaid balance',
    'type','rollup','via','requests','agg','sum','of','amount',
    'filter', jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', v_paid_fld::text), jsonb_build_object('const', false)))));
  -- No filter: everything, exactly as before.
  perform custom.field_declare(v_org, v_props, jsonb_build_object('key','all_requests','label','All requests',
    'type','rollup','via','requests','agg','count'));

  -- ── refusals at declaration ──
  begin
    perform custom.field_declare(v_org, v_props, jsonb_build_object('key','bad_column','label','Bad column',
      'type','rollup','via','requests','agg','count','filter', jsonb_build_object('priority','high')));
    insert into cm_res values ('R1 a filter on a column the far table lacks is refused', false, 'accepted');
  exception when others then
    insert into cm_res values ('R1 a filter on a column the far table lacks is refused',
      sqlerrm ilike '%has no column with that key%', sqlerrm);
  end;
  begin
    perform custom.field_declare(v_org, v_props, jsonb_build_object('key','bad_op','label','Bad op',
      'type','rollup','via','requests','agg','count',
      'filter', jsonb_build_object('op','between','args', jsonb_build_array(jsonb_build_object('field', v_paid_fld::text), jsonb_build_object('const', 1)))));
    insert into cm_res values ('R2 a filter with an op the grammar lacks is refused', false, 'accepted');
  exception when others then
    insert into cm_res values ('R2 a filter with an op the grammar lacks is refused',
      sqlerrm ilike '%cannot answer%' or sqlerrm ilike '%narrows the records%', sqlerrm);
  end;
  begin
    perform custom.field_declare(v_org, v_props, jsonb_build_object('key','bad_shape','label','Bad shape',
      'type','rollup','via','requests','agg','count','filter', to_jsonb('open'::text)));
    insert into cm_res values ('R3 a filter that is not a set of conditions is refused', false, 'accepted');
  exception when others then
    insert into cm_res values ('R3 a filter that is not a set of conditions is refused',
      sqlerrm ilike '%set of conditions%', sqlerrm);
  end;

  v_r1 := custom.record_write(v_org, v_reqs, jsonb_build_object('summary','Leaking kitchen faucet, unit 3B','status','open','amount',120,'paid',false));
  v_r2 := custom.record_write(v_org, v_reqs, jsonb_build_object('summary','Hallway light out, 2nd floor','status','open','amount',65,'paid',false));
  v_r3 := custom.record_write(v_org, v_reqs, jsonb_build_object('summary','Furnace filter replaced','status','closed','amount',225,'paid',true));
  v_prop := custom.record_write(v_org, v_props, jsonb_build_object(
    'address','1420 Thames Street', 'requests', jsonb_build_array(v_r1::text, v_r2::text, v_r3::text)));

  reset role;
  insert into cm_fx values ('org', v_org::text), ('props', v_props::text), ('prop', v_prop::text), ('open_fld', v_open_fld::text);
end;
$t$;

-- ── 1. THE ROLL-UPS, READ WHOLE ──────────────────────────────────────────────────────────────────
do $t$
declare
  v_org  uuid := (select v::uuid from cm_fx where k='org');
  v_prop uuid := (select v::uuid from cm_fx where k='prop');
  v jsonb;
begin
  v := custom.record_values(v_org, v_prop);
  insert into cm_res values
    ('1a flat filter {"status":"open"}: 2 open requests, not 3',      (v ->> 'open_requests')  = '2',   v ->> 'open_requests'),
    ('1b rule filter paid = false: unpaid balance 185, not 410',      (v ->> 'unpaid_balance') = '185', v ->> 'unpaid_balance'),
    ('1c no filter: all 3 requests, exactly as before',               (v ->> 'all_requests')   = '3',   v ->> 'all_requests');
end;
$t$;

-- ── 2. THE FILTER IS A SETTING: changed, then removed, through custom.field_update ──────────────
do $t$
declare
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org  uuid := (select v::uuid from cm_fx where k='org');
  v_prop uuid := (select v::uuid from cm_fx where k='prop');
  v_fld  uuid := (select v::uuid from cm_fx where k='open_fld');
  v jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    perform custom.field_update(v_org, v_fld, jsonb_build_object('filter', jsonb_build_object('status','closed')));
    reset role;
    v := custom.record_values(v_org, v_prop);
    insert into cm_res values ('2a field_update {"filter":{"status":"closed"}}: 1', (v ->> 'open_requests') = '1', v ->> 'open_requests');
  exception when others then
    reset role;
    insert into cm_res values ('2a field_update {"filter":{"status":"closed"}}: 1', false, sqlerrm);
  end;

  perform set_config('role','authenticated', true);
  begin
    perform custom.field_update(v_org, v_fld, jsonb_build_object('filter', 'null'::jsonb));
    reset role;
    v := custom.record_values(v_org, v_prop);
    insert into cm_res values ('2b field_update {"filter":null}: every linked record again, 3', (v ->> 'open_requests') = '3', v ->> 'open_requests');
  exception when others then
    reset role;
    insert into cm_res values ('2b field_update {"filter":null}: every linked record again, 3', false, sqlerrm);
  end;

  perform set_config('role','authenticated', true);
  begin
    perform custom.field_update(v_org, v_fld, jsonb_build_object('filter', jsonb_build_object('priority','high')));
    insert into cm_res values ('2c field_update with a column the far table lacks is refused', false, 'accepted');
  exception when others then
    insert into cm_res values ('2c field_update with a column the far table lacks is refused', sqlerrm ilike '%has no column with that key%', sqlerrm);
  end;
  reset role;
end;
$t$;

select check_name, case when ok then 'ok' else 'FAIL' end as result, left(detail, 110) as detail from cm_res order by check_name;

do $t$
declare v_bad integer := (select count(*) from cm_res where not ok);
begin
  if v_bad > 0 then
    raise exception 'chairmath_b_green: % check(s) FAILED (RED) — a roll-up ignores its filter or accepts a bad one', v_bad;
  end if;
  raise notice 'chairmath_b_green: all % checks passed (GREEN)', (select count(*) from cm_res);
end;
$t$;

rollback;
