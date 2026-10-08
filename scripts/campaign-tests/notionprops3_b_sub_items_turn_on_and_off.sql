-- NOTION-PROPS-3 (b) — A TABLE'S SUB-ITEMS ARE TURNED ON AND OFF ON ITS PARENT LINK.
--
-- WHAT IT ASSERTS, from the seat (role authenticated, admin@admin.com owns a fresh disposable org; a
-- landscaping crew's "Jobs" table):
--   1  a one-record link from Jobs to Jobs ("Part of") is turned into the sub-items link, and off again
--   2  a many-record link to Jobs cannot nest sub-items (23514)
--   3  a link to another table cannot nest sub-items (23514)
--
-- RUN IT (main or clone; ONE transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/notionprops3_b_sub_items_turn_on_and_off.sql
-- RED before migrations/campaign/notionprops3_b_sub_items_turn_on_and_off.sql; GREEN after.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
create temp table np_fail (m text) on commit drop;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_jobs uuid; v_crews uuid;
  f_name uuid; f_site uuid; b_map uuid; f_after uuid; f_crew uuid; f_no uuid;
  v_job uuid;
  v_res jsonb; v_doc jsonb; v_b boolean;
  v_fail text[] := '{}';
begin
  perform set_config('app.actor_system', 'campaign-test/notionprops3_b', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Greenway Landscaping', 'greenway-np3b-'||substr(v_org::text,1,8), 'GWL', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/notionprops3_b');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Greenway — Operations')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name','Jobs','slug','jobs_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Job','label_plural','Jobs','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  v_crews := custom.table_declare(v_org, jsonb_build_object(
    'name','Crews','slug','crews_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Crew','label_plural','Crews','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  f_site := custom.field_declare(v_org, v_jobs, jsonb_build_object('key','site','label','Site address','type','text'));
  b_map  := custom.field_declare(v_org, v_jobs, jsonb_build_object('key','map','label','Map','type','button'));
  v_job  := custom.record_write(v_org, v_jobs, jsonb_build_object('name','Spring cleanup — Alvarez yard','site','1420 Birch Lane','parent_id',v_home::text));

  -- 1. On and off.
  begin
    f_after := custom.field_declare(v_org, v_jobs, jsonb_build_object('key','part_of','label','Part of','type','relation',
      'relation_target', v_jobs::text, 'multi', false));
    perform custom.field_update(v_org, f_after, jsonb_build_object('sub_items', true));
    perform set_config('role', 'postgres', true);
    select f.data into v_doc from custom.record f where f.id = f_after;
    perform set_config('role', 'authenticated', true);
    if (v_doc -> 'config' ->> 'sub_items') is distinct from 'true' then
      v_fail := v_fail || ('1 sub-items did not turn on: ' || coalesce((v_doc -> 'config')::text, 'null'));
    end if;
    perform custom.field_update(v_org, f_after, jsonb_build_object('sub_items', false));
    perform set_config('role', 'postgres', true);
    select f.data into v_doc from custom.record f where f.id = f_after;
    perform set_config('role', 'authenticated', true);
    if v_doc -> 'config' ? 'sub_items' then v_fail := v_fail || '1 sub-items could not be turned off'::text; end if;
  exception when others then
    v_fail := v_fail || ('1 turning sub-items on failed: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 2. A many-record link.
  begin
    f_no := custom.field_declare(v_org, v_jobs, jsonb_build_object('key','related','label','Related jobs','type','relation',
      'relation_target', v_jobs::text, 'multi', true));
    perform custom.field_update(v_org, f_no, jsonb_build_object('sub_items', true));
    v_fail := v_fail || '2 a many-record link nests sub-items'::text;
  exception when others then
    if sqlstate <> '23514' then v_fail := v_fail || ('2 refused with ' || sqlstate || ': ' || sqlerrm); end if;
  end;

  -- 3. A link to another table.
  begin
    f_crew := custom.field_declare(v_org, v_jobs, jsonb_build_object('key','crew','label','Crew','type','relation',
      'relation_target', v_crews::text));
    perform custom.field_update(v_org, f_crew, jsonb_build_object('sub_items', true));
    v_fail := v_fail || '3 a link to Crews nests sub-items'::text;
  exception when others then
    if sqlstate <> '23514' then v_fail := v_fail || ('3 refused with ' || sqlstate || ': ' || sqlerrm); end if;
  end;

  perform set_config('role', 'postgres', true);
  insert into pg_temp.np_fail select unnest(v_fail);
end
$t$;

do $t$
declare v_fail text[];
begin
  perform set_config('role', 'postgres', true);
  select coalesce(array_agg(m), '{}') into v_fail from pg_temp.np_fail;
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — a table''s parent link turns sub-items on and off; no other link can.';
end
$t$;

rollback;
