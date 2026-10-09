-- NOTION-PROPS-3 (a) — A BUTTON IS SET UP IN ITS COLUMN'S SETTINGS, A LINK TO ITS OWN TABLE CAN BE A DEPENDENCY,
-- A RECORD NUMBER TAKES A PREFIX, AND THE TIMELINE'S DEPENDENCY SHIFT IS A KNOB.
--
-- WHAT IT ASSERTS, from the seat (role authenticated, admin@admin.com owns a fresh disposable org; a
-- landscaping crew's "Jobs" table):
--   1  a label-only button (Notion's shape) is given a colour and a link through custom.field_update, and a
--      press then answers the link filled from the row
--   2  button settings on a column that is not a button are refused (23514)
--   3  button settings whose do is none of the three are refused (23514)
--   4  a link from Jobs to Jobs is marked as a dependency, and unmarked again
--   5  a link to another table cannot be a dependency (23514)
--   6  a record number takes the prefix "JOB-"; a prefix ending in a digit is refused (23514)
--   7  custom.timeline_dependency_shift answers true (the knob's default)
--
-- RUN IT (main or clone; ONE transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/notionprops3_a_button_settings_dependency_prefix.sql
-- RED before migrations/campaign/notionprops3_a_button_settings_dependency_prefix.sql; GREEN after.

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
  perform set_config('app.actor_system', 'campaign-test/notionprops3_a', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Greenway Landscaping', 'greenway-np3a-'||substr(v_org::text,1,8), 'GWL', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/notionprops3_a');
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

  -- 1. Notion's label-only button is set up in its settings.
  begin
    perform custom.field_update(v_org, b_map, jsonb_build_object('button', jsonb_build_object(
      'color','green','do','open_url','url','https://maps.google.com/?q={{' || f_site || '}}')));
    perform set_config('role', 'postgres', true);
    select f.data into v_doc from custom.record f where f.id = b_map;
    perform set_config('role', 'authenticated', true);
    if v_doc -> 'config' -> 'button' ->> 'color' is distinct from 'green' or v_doc -> 'config' -> 'button' ->> 'label' is distinct from 'Map' then
      v_fail := v_fail || ('1 the button settings did not land: ' || coalesce((v_doc -> 'config')::text, 'null'));
    end if;
    v_res := custom.button_press(v_org, v_job, b_map);
    if v_res ->> 'url' is distinct from 'https://maps.google.com/?q=1420 Birch Lane' then
      v_fail := v_fail || ('1 the press answered ' || v_res::text);
    end if;
  exception when others then
    v_fail := v_fail || ('1 setting up the button failed: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 2. Not a button.
  begin
    perform custom.field_update(v_org, f_site, jsonb_build_object('button', jsonb_build_object('label','Go')));
    v_fail := v_fail || '2 button settings landed on a text column'::text;
  exception when others then
    if sqlstate <> '23514' then v_fail := v_fail || ('2 refused with ' || sqlstate || ': ' || sqlerrm); end if;
  end;

  -- 3. A do that is none of the three.
  begin
    perform custom.field_update(v_org, b_map, jsonb_build_object('button', jsonb_build_object('do','call_phone')));
    v_fail := v_fail || '3 a button that does "call_phone" was saved'::text;
  exception when others then
    if sqlstate <> '23514' then v_fail := v_fail || ('3 refused with ' || sqlstate || ': ' || sqlerrm); end if;
  end;

  -- 4. A link from Jobs to Jobs is a dependency.
  begin
    f_after := custom.field_declare(v_org, v_jobs, jsonb_build_object('key','blocked_by','label','Blocked by','type','relation',
      'relation_target', v_jobs::text, 'multi', true));
    perform custom.field_update(v_org, f_after, jsonb_build_object('dependency', true));
    perform set_config('role', 'postgres', true);
    select f.data into v_doc from custom.record f where f.id = f_after;
    perform set_config('role', 'authenticated', true);
    if (v_doc -> 'config' ->> 'dependency') is distinct from 'true' then
      v_fail := v_fail || ('4 the dependency did not land: ' || coalesce((v_doc -> 'config')::text, 'null'));
    end if;
    perform custom.field_update(v_org, f_after, jsonb_build_object('dependency', false));
    perform set_config('role', 'postgres', true);
    select f.data into v_doc from custom.record f where f.id = f_after;
    perform set_config('role', 'authenticated', true);
    if v_doc -> 'config' ? 'dependency' then v_fail := v_fail || '4 the dependency could not be turned off'::text; end if;
  exception when others then
    v_fail := v_fail || ('4 marking the dependency failed: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 5. A link to another table.
  begin
    f_crew := custom.field_declare(v_org, v_jobs, jsonb_build_object('key','crew','label','Crew','type','relation',
      'relation_target', v_crews::text));
    perform custom.field_update(v_org, f_crew, jsonb_build_object('dependency', true));
    v_fail := v_fail || '5 a link to Crews became a dependency'::text;
  exception when others then
    if sqlstate <> '23514' then v_fail := v_fail || ('5 refused with ' || sqlstate || ': ' || sqlerrm); end if;
  end;

  -- 6. A record number's prefix.
  begin
    f_no := custom.field_declare(v_org, v_jobs, jsonb_build_object('key','job_no','label','Job number','type','autonumber'));
    perform custom.field_update(v_org, f_no, jsonb_build_object('display_format',
      jsonb_build_object('id','autonumber','options', jsonb_build_object('prefix','JOB-'))));
    perform set_config('role', 'postgres', true);
    select f.data into v_doc from custom.record f where f.id = f_no;
    perform set_config('role', 'authenticated', true);
    if v_doc -> 'display_format' -> 'options' ->> 'prefix' is distinct from 'JOB-' then
      v_fail := v_fail || ('6 the prefix did not land: ' || coalesce((v_doc -> 'display_format')::text, 'null'));
    end if;
  exception when others then
    v_fail := v_fail || ('6 the prefix failed: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform custom.field_update(v_org, f_no, jsonb_build_object('display_format',
      jsonb_build_object('id','autonumber','options', jsonb_build_object('prefix','JOB1'))));
    v_fail := v_fail || '6 a prefix ending in a digit was saved'::text;
  exception when others then
    if sqlstate <> '23514' then v_fail := v_fail || ('6 refused with ' || sqlstate || ': ' || sqlerrm); end if;
  end;

  -- 7. The knob.
  begin
    execute 'select custom.timeline_dependency_shift($1)' into v_b using v_org;
    if v_b is not true then v_fail := v_fail || ('7 the knob answered ' || coalesce(v_b::text, 'null')); end if;
  exception when others then
    v_fail := v_fail || ('7 the knob door failed: ' || sqlstate || ' ' || sqlerrm);
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
  raise notice 'GREEN — a button is set up in its settings and pressed; a self-link is a dependency; a record number takes a prefix; the timeline dependency knob answers.';
end
$t$;

rollback;
