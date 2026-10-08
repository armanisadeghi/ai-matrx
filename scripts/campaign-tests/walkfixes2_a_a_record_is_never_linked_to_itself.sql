-- WALK-FIXES-2 (a) — A RECORD IS NEVER LINKED TO ITSELF (walk 2026-10-08 D11).
--
-- WHAT IT ASSERTS, from the seat (role authenticated, admin@admin.com owns a fresh disposable org; a
-- kitchen remodel's task list with a "Blocked by" link to the same table):
--   1  "Install new cabinets" blocked by itself is refused (23514), on an edit and on a new row's own id
--   2  "Install new cabinets" blocked by "Demolish old cabinets" is kept
--
-- RUN IT (main or clone; ONE transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/walkfixes2_a_a_record_is_never_linked_to_itself.sql
-- The store already refused this before WALK-FIXES-2 ("that would make this point back at itself through the
-- same relation"); this test pins it. The picker half (the row is not offered) is records-ui's test.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_tasks uuid; v_demo uuid; v_install uuid; v_ver int;
  v_res jsonb;
  v_fail text[] := '{}';
begin
  perform set_config('app.actor_system', 'campaign-test/walkfixes2_a', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Kitchens', 'harbor-wf2-a-'||substr(v_org::text,1,8), 'HPK', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/walkfixes2_a');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Harbor Point — Remodel')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_tasks := custom.table_declare(v_org, jsonb_build_object(
    'name','Kitchen Remodel Tasks','slug','krt_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Task','label_plural','Tasks','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','title')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_tasks, jsonb_build_object('key','blocked_by','label','Blocked by','type','relation',
    'relation_target', v_tasks::text, 'multi', true));
  v_demo := custom.record_write(v_org, v_tasks, jsonb_build_object('title','Demolish old cabinets','parent_id',v_home::text));
  v_install := custom.record_write(v_org, v_tasks, jsonb_build_object('title','Install new cabinets','parent_id',v_home::text));

  begin
    perform set_config('role', 'postgres', true);
    select version into v_ver from custom.record where id = v_install;
    perform set_config('role', 'authenticated', true);
    perform custom.record_update(v_org, v_install, jsonb_build_object('blocked_by', jsonb_build_array(v_install::text)), v_ver);
    v_fail := v_fail || '1 a row blocked by itself was kept'::text;
  exception when others then
    perform set_config('role', 'authenticated', true);
    if sqlstate <> '23514' then v_fail := v_fail || ('1 refused, but as ' || sqlstate || ': ' || sqlerrm); end if;
  end;
  perform set_config('role', 'authenticated', true);
  begin
    perform set_config('role', 'postgres', true);
    select version into v_ver from custom.record where id = v_install;
    perform set_config('role', 'authenticated', true);
    perform custom.record_update(v_org, v_install, jsonb_build_object('blocked_by', jsonb_build_array(v_demo::text)), v_ver);
  exception when others then
    v_fail := v_fail || ('2 a row blocked by another was refused: ' || sqlerrm);
  end;

  perform set_config('role', 'postgres', true);
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % self-link check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — a record is never linked to itself; a link to another row is kept.';
end
$t$;

rollback;
