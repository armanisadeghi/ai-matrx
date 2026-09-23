-- LANE STORE-VERSION-NOOP — THE RED TWIN of storeversionnoop_green.sql.
--
-- A guard nobody has seen fail is not a guard. Inside ONE rolled-back transaction this takes the
-- STORE-VERSION-NOOP trigger off each table in turn (`alter table … disable trigger`, SHARE ROW
-- EXCLUSIVE, rolled back) and shows the defect coming back through the same doors the green suite
-- uses, then puts it back and shows it gone. Every arm must come out the way it says, or the file
-- raises.
--   ARM A  trigger OFF on custom.record: a no-op record_update answers version 2, history stays 1
--   ARM B  trigger OFF on custom.record: a no-op field_update moves the Field's version, not its history
--   ARM C  trigger OFF on platform.saved_view: re-saving an unchanged view moves its version, not its history
--   CONTROL  both triggers ON: the same three writes move nothing
--
-- The organization is the lane's one fixture, Cascade Backflow Testing. Ends in ROLLBACK.

\set ON_ERROR_STOP on
\set suite 'storeversionnoop_red.sql'
\set requires 'function:platform.no_change_keeps_its_version|grant:authenticated:custom.record_update|grant:authenticated:custom.field_update|grant:authenticated:custom.view_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss text := current_user;
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_tbl uuid; v_f_psi uuid; v_view uuid; v_rd uuid;
  v_ver int; v_hist int; v_a int; v_b int; v_ha int; v_hb int;
  v_arm text;
begin
  perform set_config('app.actor_system', 'campaign-test/storeversionnoop_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Cascade Backflow Testing', 'cascade-backflow-testing-'||substr(v_org::text,1,8), 'CBT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'), (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/storeversionnoop_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cascade Backflow Testing')) returning id into v_home;
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','backflow_test_readings','type','entity','slug','backflow_test_readings',
    'label_singular','Backflow Test Reading','label_plural','Backflow Test Readings',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,'title_field','assembly','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','assembly','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','assembly','type','text'))));
  v_f_psi := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Pressure (psi)','key','pressure_psi','type','number'));
  perform custom.share_grant(v_org, v_tbl, 'user', c_dana, 'editor'::public.permission_level);
  perform set_config('role', 'authenticated', true);
  v_view := custom.view_declare(v_org, v_tbl, jsonb_build_object('name','Failed this season','filters', jsonb_build_object('pressure_psi', 0)));
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_rd := custom.record_write(v_org, v_tbl, jsonb_build_object('assembly','DC assembly SN 2210-C, 88 Birch Ln','pressure_psi',4.2));
  perform set_config('role', v_boss, true);

  foreach v_arm in array array['A','CONTROL'] loop
    if v_arm = 'A' then execute 'alter table custom.record disable trigger zzzzz_no_change_keeps_its_version';
    else execute 'alter table custom.record enable trigger zzzzz_no_change_keeps_its_version'; end if;
    select version into v_a from custom.record where organization_id = v_org and id = v_rd;
    select count(*) into v_ha from history.row_versions where entity_type='custom.record' and row_id = v_rd;
    perform set_config('request.jwt.claims', c_dana_j, true);
    perform set_config('role', 'authenticated', true);
    v_ver := custom.record_update(v_org, v_rd, jsonb_build_object('pressure_psi', 4.2), v_a);
    perform set_config('role', v_boss, true);
    select count(*) into v_hb from history.row_versions where entity_type='custom.record' and row_id = v_rd;
    if v_arm = 'A' and not (v_ver = v_a + 1 and v_hb = v_ha) then
      raise exception 'ARM A did not go red: with the trigger off a no-op answered % from %, history % -> %', v_ver, v_a, v_ha, v_hb;
    elsif v_arm = 'CONTROL' and not (v_ver = v_a and v_hb = v_ha) then
      raise exception 'CONTROL A failed: with the trigger on a no-op answered % from %, history % -> %', v_ver, v_a, v_ha, v_hb;
    end if;
    raise notice 'record_update % — no-op answered % from %, history rows % -> %', v_arm, v_ver, v_a, v_ha, v_hb;

    if v_arm = 'A' then
      select version into v_a from custom.record where organization_id = v_org and id = v_f_psi;
      select count(*) into v_ha from history.row_versions where entity_type='custom.record' and row_id = v_f_psi;
      perform set_config('request.jwt.claims', c_admin_j, true);
      perform set_config('role', 'authenticated', true);
      perform custom.field_update(v_org, v_f_psi, jsonb_build_object('label','Pressure (psi)'));
      perform set_config('role', v_boss, true);
      select version into v_b from custom.record where organization_id = v_org and id = v_f_psi;
      select count(*) into v_hb from history.row_versions where entity_type='custom.record' and row_id = v_f_psi;
      if not (v_b > v_a and v_hb = v_ha) then
        raise exception 'ARM B did not go red: Field version % -> %, history % -> %', v_a, v_b, v_ha, v_hb;
      end if;
      raise notice 'ARM B RED as expected — field_update no-op moved the Field % -> %, history stayed %', v_a, v_b, v_hb;
    end if;
  end loop;

  foreach v_arm in array array['C','CONTROL'] loop
    if v_arm = 'C' then execute 'alter table platform.saved_view disable trigger zzzzz_no_change_keeps_its_version';
    else execute 'alter table platform.saved_view enable trigger zzzzz_no_change_keeps_its_version'; end if;
    select version into v_a from platform.saved_view where id = v_view;
    select count(*) into v_ha from history.row_versions where entity_type='platform_saved_view' and row_id = v_view;
    perform set_config('request.jwt.claims', c_admin_j, true);
    perform set_config('role', 'authenticated', true);
    perform custom.view_declare(v_org, v_tbl, jsonb_build_object('view_id', v_view, 'name','Failed this season','filters', jsonb_build_object('pressure_psi', 0)));
    perform set_config('role', v_boss, true);
    select version into v_b from platform.saved_view where id = v_view;
    select count(*) into v_hb from history.row_versions where entity_type='platform_saved_view' and row_id = v_view;
    if v_arm = 'C' and not (v_b > v_a and v_hb = v_ha) then
      raise exception 'ARM C did not go red: view version % -> %, history % -> %', v_a, v_b, v_ha, v_hb;
    elsif v_arm = 'CONTROL' and not (v_b = v_a and v_hb = v_ha) then
      raise exception 'CONTROL C failed: view version % -> %, history % -> %', v_a, v_b, v_ha, v_hb;
    end if;
    raise notice 'view_declare % — view version % -> %, history rows % -> %', v_arm, v_a, v_b, v_ha, v_hb;
  end loop;
  raise notice 'storeversionnoop_red: ARMS A, B, C RED AS EXPECTED; CONTROLS GREEN';
end $red$;

rollback;
