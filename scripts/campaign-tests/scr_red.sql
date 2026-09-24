-- LANE SC-R · REFERENCE-FIELD (P12) — THE RED TWIN: EVERY WRONG SHAPE IS REFUSED BY NAME.
--
-- THE USE CASE. Whitfield & Ames LLP (see scr_green.sql): a Clients table whose "Intake note"
-- column points at the paralegal's intake note. Each part below plants something the store must
-- never hold, the way a careless client, a stale mover or a direct write would, and must see it
-- refused in words:
--   R1  a Field document naming a kind no record may point at (`hr_payroll_banana`), written
--       straight into custom.record as the store owner — custom._field_shape_guard refuses it
--   R2  a Field that points at a Table AND at platform kinds — refused (one or the other)
--   R3  a Field that says it points at platform kinds without target mode `any` — refused
--   R4  a bare note id (a string, the shape a relation takes) in the entity-reference column —
--       refused, naming the {token, id} shape
--   R5  {token, id} with no token — refused the same way
--   R6  a note that is in the trash — refused as "not there"
--   R7  an edge record → <kind> planted for a kind nobody registered — refused by the one
--       association registry, so the edge table cannot hold a link the Field could not
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/scr_red.sql   (ends in ROLLBACK)

\set ON_ERROR_STOP on
\set suite 'scr_red.sql'
\set requires 'function:custom.entity_reference_kinds|grant:authenticated:custom.record_write|grant:authenticated:custom.record_update'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_home uuid; v_clients uuid; v_fnote uuid; v_rec uuid;
  v_intake uuid := gen_random_uuid();
  v_trashed uuid := gen_random_uuid();
  v_doc jsonb; m text; v_passed int := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/scr_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by, settings) values
    (v_org, 'Whitfield & Ames LLP', 'whitfield-ames-llp-red-'||substr(v_org::text,1,8), 'WA', c_admin,
     jsonb_build_object('campaign_test', 'scr_red'));
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/scr_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Whitfield & Ames LLP')) returning id into v_home;
  v_clients := custom.table_declare(v_org, jsonb_build_object(
    'name','clients','type','entity','slug','clients','label_singular','Client','label_plural','Clients',
    'display','list','ordered',false,'weight','light','retention_days',2555,'row_order','sorted',
    'agent_writable',true,'title_field','matter','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','matter','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','matter','type','text'),
                                jsonb_build_object('name','bad_kind'),
                                jsonb_build_object('name','both_ways'),
                                jsonb_build_object('name','no_mode'))));
  v_fnote := custom.field_declare(v_org, v_clients, jsonb_build_object(
    'name','intake_note','label','Intake note','type','entity_reference','allowed_types', jsonb_build_array('note')));
  perform custom.share_grant(v_org, v_clients, 'user', c_dana, 'editor'::public.permission_level);
  insert into workbench.notes (id, label, content, organization_id, created_by, visibility, deleted_at) values
    (v_intake, 'Intake call — Okafor, forklift crush injury 07/30', 'Warehouse lead; left foot.', v_org, c_dana, 'internal', null),
    (v_trashed, 'Intake call — duplicate, discarded', 'Duplicate of the 07/30 call.', v_org, c_dana, 'internal', now());

  -- R1 · a Field naming a kind no record may point at, written straight in as the owner
  begin
    update custom.record set data = jsonb_build_object(
      'key','bad_kind','label','Bad kind','type','relation','multi',false,'dated',false,'required',false,
      'sort',100,'source','manual','source_config','{}'::jsonb,'sensitivity','internal','context_policy','include',
      'applies_to_types','[]'::jsonb,'depends_on','[]'::jsonb,'entity_definition_id',v_clients,
      'relation_max',1,'on_target_delete','set_null','rules','[]'::jsonb,
      'config', jsonb_build_object('target_mode','any','allowed_types', jsonb_build_array('hr_payroll_banana')))
     where organization_id = v_org and table_id = custom.field_kernel_id()
       and data ->> 'entity_definition_id' = v_clients::text and data ->> 'key' = 'bad_kind';
    if not found then raise exception 'R1 SETUP: no sketched bad_kind column to plant into'; end if;
    raise exception 'R1 FAILED: a Field naming hr_payroll_banana was stored';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m not ilike '%points at hr_payroll_banana, and a record cannot point at that kind of thing%' then
      raise exception 'R1 FAILED: refused in the wrong words: %', m;
    end if;
  end;
  v_passed := v_passed + 1; raise notice 'R1 PASS — "%"', m;

  -- R2 · a Table target AND platform kinds
  begin
    update custom.record set data = data || jsonb_build_object('type','relation','relation_target',v_clients,
      'relation_max',1,'on_target_delete','set_null','rules','[]'::jsonb,
      'config', jsonb_build_object('target_mode','any','allowed_types', jsonb_build_array('note')))
     where organization_id = v_org and table_id = custom.field_kernel_id()
       and data ->> 'entity_definition_id' = v_clients::text and data ->> 'key' = 'both_ways';
    raise exception 'R2 FAILED: a Field pointing at a Table and at notes was stored';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m not ilike '%so it names no Table as well%' then raise exception 'R2 FAILED: wrong words: %', m; end if;
  end;
  v_passed := v_passed + 1; raise notice 'R2 PASS — "%"', m;

  -- R3 · platform kinds without target mode any
  begin
    update custom.record set data = data || jsonb_build_object('type','relation',
      'relation_max',1,'on_target_delete','set_null','rules','[]'::jsonb,
      'config', jsonb_build_object('allowed_types', jsonb_build_array('note')))
     where organization_id = v_org and table_id = custom.field_kernel_id()
       and data ->> 'entity_definition_id' = v_clients::text and data ->> 'key' = 'no_mode';
    raise exception 'R3 FAILED: a Field naming kinds without target mode any was stored';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m not ilike '%so its target mode is any%' then raise exception 'R3 FAILED: wrong words: %', m; end if;
  end;
  v_passed := v_passed + 1; raise notice 'R3 PASS — "%"', m;

  -- the seat for R4–R6
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);

  -- R4 · a bare id, the shape a relation takes
  begin
    perform custom.record_write(v_org, v_clients, jsonb_build_object(
      'matter','Okafor v. Harbor Freight Logistics','intake_note', v_intake::text));
    raise exception 'R4 FAILED: a bare id landed in an entity-reference column';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m <> 'Intake note points at something on the platform, and it was given a string' then
      raise exception 'R4 FAILED: wrong words: %', m;
    end if;
  end;
  v_passed := v_passed + 1; raise notice 'R4 PASS — "%"', m;

  -- R5 · {id} with no token
  begin
    perform custom.record_write(v_org, v_clients, jsonb_build_object(
      'matter','Okafor v. Harbor Freight Logistics','intake_note', jsonb_build_object('id', v_intake::text)));
    raise exception 'R5 FAILED: a reference with no kind landed';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m <> 'Intake note points at something on the platform, and it was given something with no kind or no id' then
      raise exception 'R5 FAILED: wrong words: %', m;
    end if;
  end;
  v_passed := v_passed + 1; raise notice 'R5 PASS — "%"', m;

  -- R6 · a note in the trash
  begin
    perform custom.record_write(v_org, v_clients, jsonb_build_object(
      'matter','Okafor v. Harbor Freight Logistics','intake_note', jsonb_build_object('token','note','id', v_trashed::text)));
    raise exception 'R6 FAILED: a trashed note was pointed at';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m <> 'Intake note points at something that is not there' then raise exception 'R6 FAILED: wrong words: %', m; end if;
  end;
  v_passed := v_passed + 1; raise notice 'R6 PASS — "%"', m;

  -- R7 · an edge for a kind nobody registered, planted as the owner
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_rec := custom.record_write(v_org, v_clients, jsonb_build_object(
    'matter','Okafor v. Harbor Freight Logistics','intake_note', jsonb_build_object('token','note','id', v_intake::text)));
  begin
    insert into platform.associations (source_type, source_id, target_type, target_id, role, organization_id, relation_field_id)
    values ('record', v_rec, 'hr_payroll_run', gen_random_uuid(), 'intake_note', v_org, v_fnote);
    raise exception 'R7 FAILED: an edge record → hr_payroll_run was stored';
  exception when check_violation or foreign_key_violation then
    get stacked diagnostics m = message_text;
  end;
  v_passed := v_passed + 1; raise notice 'R7 PASS — "%"', m;

  raise notice 'scr_red.sql: % of 7 plants refused', v_passed;
end $red$;

\echo 'scr_red.sql: ALL PLANTS REFUSED'
rollback;
