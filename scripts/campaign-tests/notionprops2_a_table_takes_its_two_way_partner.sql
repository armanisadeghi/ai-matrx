-- NOTION-PROPS-2 (1) — ARCHIVING A TABLE TAKES ITS TWO-WAY PARTNER COLUMN ALONG, AND RESTORE BRINGS IT BACK.
--
-- THE BREAK THIS CATCHES (measured live, 2026-10-08): "Projects" links to "Clients" with a two-way link
-- (Clients carries the paired column "Projects", config.reverse_of = the forward Field). Archiving
-- Projects was refused — "This table's fields are used by field "Projects", so it was not deleted." —
-- because the paired column names the forward Field by id, so custom.field_dependants counts it as a
-- reader outside the table. Removing the forward column on its own was refused the same way. Notion
-- deletes the paired property with its database and brings it back with it.
--
-- WHAT IT ASSERTS, from the seat (role authenticated, admin@admin.com owns a fresh disposable org):
--   1  custom.table_archive(Projects) completes — the table is archived
--   2  the paired column on Clients is archived in the SAME archive event (it is in the event's took list)
--   2c Clients keeps working while Projects is archived (a client is written; no paired column shows)
--   3  restoring Projects (entity_undelete, the Trash door) brings the paired column back live, and
--      custom.reverse_columns(Clients) shows the writable paired column again
--   4  retiring the forward column alone (custom.field_retire) takes the paired column with it, and
--      Clients no longer declares its key
--   5  custom.field_restore of the forward column brings the paired column back, declared again
--   6  CONTROL: a Rule on Clients that reads the paired column still refuses the archive, by name
--
-- RUN IT (main or clone; ONE transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/notionprops2_a_table_takes_its_two_way_partner.sql
-- RED before migrations/campaign/notionprops2_a_table_takes_its_two_way_partner.sql (1 and 4 refused); GREEN after.

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
  v_home uuid;
  v_clients uuid; v_projects uuid; v_invoices uuid;
  v_fwd uuid; v_rev uuid; v_formula uuid;
  v_acme uuid; v_proj uuid;
  v_res jsonb; v_j jsonb; v_txt text; v_ok boolean; v_at timestamptz;
  v_fail text[] := '{}';
  i integer;
begin
  perform set_config('app.actor_system', 'campaign-test/notionprops2_a', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Design Studio', 'harbor-point-np2-'||substr(v_org::text,1,8), 'HPD', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/notionprops2_a');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Harbor Point — Studio')) returning id into v_home;

  perform set_config('role', 'authenticated', true);

  v_clients := custom.table_declare(v_org, jsonb_build_object(
    'name','Clients','slug','clients_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Client','label_plural','Clients','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  v_projects := custom.table_declare(v_org, jsonb_build_object(
    'name','Projects','slug','projects_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Project','label_plural','Projects','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  v_fwd := custom.field_declare(v_org, v_projects, jsonb_build_object(
    'key','client','label','Client','type','relation','relation_target', v_clients));
  v_rev := custom.relation_reverse_field(v_org, v_fwd, 'Projects');

  v_acme := custom.record_write(v_org, v_clients, jsonb_build_object('name','Lindqvist Bakery','parent_id',v_home::text));
  for i in 1..3 loop
    v_proj := custom.record_write(v_org, v_projects, jsonb_build_object(
      'name', format('Storefront refresh — phase %s', i), 'client', v_acme::text, 'parent_id', v_home::text));
  end loop;

  -- 4 / 5 first (the forward column alone), so the archive below starts from the same pair.
  begin
    perform custom.field_retire(v_org, v_fwd);
    perform set_config('role', 'postgres', true);
    select r.deleted_at into v_at from custom.record r where r.id = v_rev;
    select coalesce(jsonb_path_exists(t.data, '$.fields[*] ? (@.name == $k)', jsonb_build_object('k', r.data ->> 'key')), false)
      into v_ok from custom.record t, custom.record r where t.id = v_clients and r.id = v_rev;
    perform set_config('role', 'authenticated', true);
    if v_at is null then v_fail := v_fail || '4a removing the Client column left its paired column on Clients live'::text; end if;
    if v_ok then v_fail := v_fail || '4b Clients still declares the removed paired column'::text; end if;
    begin
      perform custom.field_restore(v_org, v_fwd);
      perform set_config('role', 'postgres', true);
      select r.deleted_at into v_at from custom.record r where r.id = v_rev;
      select coalesce(jsonb_path_exists(t.data, '$.fields[*] ? (@.name == $k)', jsonb_build_object('k', r.data ->> 'key')), false)
        into v_ok from custom.record t, custom.record r where t.id = v_clients and r.id = v_rev;
      perform set_config('role', 'authenticated', true);
      if v_at is not null then v_fail := v_fail || '5a restoring the Client column did not bring the paired column back'::text; end if;
      if not v_ok then v_fail := v_fail || '5b Clients does not declare the restored paired column'::text; end if;
    exception when others then
      perform set_config('role', 'authenticated', true);
      v_fail := v_fail || ('5 field_restore refused: ' || sqlerrm);
    end;
  exception when others then
    v_fail := v_fail || ('4 removing the Client column was refused: ' || sqlerrm);
  end;

  -- 1 / 2. Archive the Projects table.
  begin
    for i in 1..20 loop
      v_res := custom.table_archive(v_org, v_projects, 50, true);
      exit when coalesce((v_res ->> 'done')::boolean, false);
    end loop;
    if not coalesce((v_res ->> 'table_archived')::boolean, false) then
      v_fail := v_fail || ('1 the Projects table was not archived: ' || coalesce(v_res::text, 'null'));
    end if;
    perform set_config('role', 'postgres', true);
    select r.deleted_at into v_at from custom.record r where r.id = v_rev;
    select m.inverse -> 'also' into v_j from history.migration_log m where m.id = (v_res ->> 'archive_event')::uuid;
    perform set_config('role', 'authenticated', true);
    if v_at is null then v_fail := v_fail || '2a the paired column on Clients stayed live after Projects was archived'::text; end if;
    if not coalesce(v_j ? v_rev::text, false) then
      v_fail := v_fail || ('2b the archive event does not name the paired column: ' || coalesce(v_j::text, 'null'));
    end if;

    -- 2c. Clients still works while Projects is archived: a new client is written, and no paired column shows.
    begin
      perform custom.record_write(v_org, v_clients, jsonb_build_object('name','Okafor Dental Group','parent_id',v_home::text));
      execute 'select coalesce(jsonb_agg(to_jsonb(c)), ''[]''::jsonb) from custom.reverse_columns($1, $2) c'
        into v_j using v_org, v_clients;
      if jsonb_array_length(v_j) > 0 then
        v_fail := v_fail || ('2c Clients still shows a paired column while Projects is archived: ' || v_j::text);
      end if;
    exception when others then
      v_fail := v_fail || ('2c writing a client while Projects is archived was refused: ' || sqlerrm);
    end;

    -- 3. Restore from Trash.
    begin
      v_ok := public.entity_undelete('record', v_projects);
      perform set_config('role', 'postgres', true);
      select r.deleted_at into v_at from custom.record r where r.id = v_rev;
      perform set_config('role', 'authenticated', true);
      if v_at is not null then v_fail := v_fail || '3a restoring Projects did not bring the paired column back'::text; end if;
      execute 'select coalesce(jsonb_agg(to_jsonb(c)), ''[]''::jsonb) from custom.reverse_columns($1, $2) c'
        into v_j using v_org, v_clients;
      if not coalesce(v_j::text like '%"source_field_id": "' || v_fwd::text || '"%', false)
         or not coalesce(v_j::text like '%"read_only": false%', false) then
        v_fail := v_fail || ('3b reverse_columns(Clients) after restore: ' || v_j::text);
      end if;
    exception when others then
      perform set_config('role', 'authenticated', true);
      v_fail := v_fail || ('3 restore refused: ' || sqlerrm);
    end;
  exception when others then
    perform set_config('role', 'authenticated', true);
    v_fail := v_fail || ('1 archiving Projects was refused: ' || sqlerrm);
  end;

  -- 6. CONTROL: a formula elsewhere that reads the forward column by id still refuses, by name.
  begin
    v_invoices := custom.table_declare(v_org, jsonb_build_object(
      'name','Invoices','slug','invoices_'||substr(v_org::text,1,8),'type','entity',
      'label_singular','Invoice','label_plural','Invoices','title_field','name','display','page',
      'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
      'agent_writable',true,'retention_days',365,
      'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
    perform set_config('role', 'postgres', true);
    -- A reader of the PAIRED column, planted as the store: a Rule on Clients whose expr names it.
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','A client has at least one project','kind','predicate','uses', jsonb_build_array('membership'),
      'scope_table_id', v_clients::text, 'applies_to_types', '[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_rev::text)))))
    returning id into v_formula;
    perform set_config('role', 'authenticated', true);
    begin
      for i in 1..20 loop
        v_res := custom.table_archive(v_org, v_projects, 50, true);
        exit when coalesce((v_res ->> 'done')::boolean, false);
      end loop;
      v_fail := v_fail || '6 a Rule on Clients reads the paired column and the archive still went through'::text;
    exception when others then
      if sqlerrm not like '%used by%' then
        v_fail := v_fail || ('6 the control refused with an unexpected message: ' || sqlerrm);
      end if;
    end;
  exception when others then
    perform set_config('role', 'authenticated', true);
    v_fail := v_fail || ('6 the control could not be set up: ' || sqlerrm);
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
    raise exception E'RED — % two-way partner check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — archiving a table takes its two-way partner column along and restore brings it back; removing the forward column alone does the same; a reader outside still refuses by name.';
end
$t$;

rollback;
