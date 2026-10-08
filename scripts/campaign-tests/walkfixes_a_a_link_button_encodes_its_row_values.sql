-- WALK-FIXES (a) — A LINK BUTTON ENCODES ITS ROW VALUES (walk 2026-10-08 D3).
--
-- WHAT IT ASSERTS, from the seat (role authenticated, admin@admin.com owns a fresh disposable org; a
-- kitchen remodel's task list):
--   1  a value inside the link is percent-encoded: q={{Title}} on "Demolish old cabinets & trim" opens
--      ?q=Demolish%20old%20cabinets%20%26%20trim
--   2  a value that begins the link (a column holding a whole address) is kept as it is
--
-- RUN IT (main or clone; ONE transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/walkfixes_a_a_link_button_encodes_its_row_values.sql
-- RED before migrations/campaign/walkfixes_a_a_link_button_encodes_its_row_values.sql; GREEN after.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
create temp table wf_fail (m text) on commit drop;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_tasks uuid; f_title uuid; f_site uuid; b_search uuid; b_site uuid; v_task uuid;
  v_res jsonb;
  v_fail text[] := '{}';
begin
  perform set_config('app.actor_system', 'campaign-test/walkfixes_a', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Kitchens', 'harbor-wf-a-'||substr(v_org::text,1,8), 'HPK', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/walkfixes_a');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Harbor Point — Remodel')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_tasks := custom.table_declare(v_org, jsonb_build_object(
    'name','Kitchen Remodel Tasks','slug','krt_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Task','label_plural','Tasks','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','title')),'parent_id',v_home::text));
  f_site := custom.field_declare(v_org, v_tasks, jsonb_build_object('key','supplier_site','label','Supplier site','type','text'));
  perform set_config('role', 'postgres', true);
  select f.id into f_title from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_tasks::text and f.data ->> 'key' = 'title';
  perform set_config('role', 'authenticated', true);
  v_task := custom.record_write(v_org, v_tasks, jsonb_build_object('title','Demolish old cabinets & trim',
              'supplier_site','https://supplier.example.com/orders?id=7','parent_id',v_home::text));

  begin
    b_search := custom.field_declare(v_org, v_tasks, jsonb_build_object('key','search_supplier','label','Search supplier','type','button',
      'button', jsonb_build_object('do','open_url','url','https://example.com/search?q={{' || f_title || '}}')));
    v_res := custom.button_press(v_org, v_task, b_search);
    if v_res ->> 'url' is distinct from 'https://example.com/search?q=Demolish%20old%20cabinets%20%26%20trim' then
      v_fail := v_fail || ('1 a value inside the link answered ' || coalesce(v_res ->> 'url', 'null'));
    end if;
    b_site := custom.field_declare(v_org, v_tasks, jsonb_build_object('key','open_site','label','Open site','type','button',
      'button', jsonb_build_object('do','open_url','url','{{' || f_site || '}}')));
    v_res := custom.button_press(v_org, v_task, b_site);
    if v_res ->> 'url' is distinct from 'https://supplier.example.com/orders?id=7' then
      v_fail := v_fail || ('2 a whole-link value answered ' || coalesce(v_res ->> 'url', 'null'));
    end if;
  exception when others then
    perform set_config('role', 'authenticated', true);
    v_fail := v_fail || ('the link buttons failed: ' || sqlerrm);
  end;

  perform set_config('role', 'postgres', true);
  insert into pg_temp.wf_fail select unnest(v_fail);
end
$t$;

do $t$
declare v_fail text[];
begin
  perform set_config('role', 'postgres', true);
  select coalesce(array_agg(m), '{}') into v_fail from pg_temp.wf_fail;
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % link check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — a link button percent-encodes the row values inside its link and keeps a value that is the whole link.';
end
$t$;

rollback;
