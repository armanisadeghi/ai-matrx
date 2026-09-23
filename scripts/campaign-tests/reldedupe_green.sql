-- LANE RELATION-TARGETS — A RELATION THAT NAMES THE SAME RECORD TWICE KEEPS IT ONCE. GREEN.
--
-- THE USE CASE. Harborline Heating & Air (the same HVAC contractor as reltargets_green.sql).
-- On a Work Order the technician ticks the "Equipment serviced" — the basement furnace, the
-- side-yard condenser — on a tablet, and a double-tap names the furnace twice. "Technicians on
-- site" is a many-person field; the dispatcher picks Dana from the list (her Person record)
-- and an agent adds her again by her user id.
--
-- WHAT IT PROVES, from test@test.com's `authenticated` seat through the store's doors:
--   1  [furnace, condenser, furnace] lands; the cell reads [furnace, condenser] — first-named
--      order kept, the repeat dropped — and ONE association per piece of equipment
--   2  re-saving [condenser, coil, condenser, furnace] reads [condenser, coil, furnace]; the
--      associations follow (three, the furnace edge kept, nothing doubled)
--   3  "Technicians on site" given Dana's Person record AND her user id holds ONE Person record
--   4  the halves census answers 0 for Harborline (the deferred guard settled on every write)
--
-- Before this lane, clause 1 was refused on the dev clone:
--   21000  ON CONFLICT DO UPDATE command cannot affect row a second time
-- from custom._relation_associations_stmt_insert (two edges proposed for one target and role).
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/reldedupe_green.sql   (ends in ROLLBACK)

\set ON_ERROR_STOP on
\set suite 'reldedupe_green.sql'
\set requires 'function:custom.relation_kernel_record|grant:authenticated:custom.record_write|grant:authenticated:custom.record_update|grant:authenticated:custom.read_record'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create temporary table _rt (k text primary key, v uuid) on commit drop;
grant select on _rt to authenticated;

-- ═══ FIXTURES, as the connected role (an organization, two members, the switch, a Home,
-- ═══ two Tables, and two uploaded files — no client door makes an organization or a file row)
do $fx$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org   uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_home  uuid; v_calls uuid; v_wos uuid;
  v_form  uuid := gen_random_uuid();
  v_theirs uuid := gen_random_uuid();
  v_stranger uuid;
  v_eq uuid; v_furnace uuid; v_condenser uuid; v_coil uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/reldedupe_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org,   'Harborline Heating & Air', 'harborline-heating-air-'||substr(v_org::text,1,8), 'HHA', c_admin),
    (v_other, 'Cedar Point Plumbing',     'cedar-point-plumbing-'||substr(v_other::text,1,8), 'CPP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active'),
    (v_other,'organization',v_other,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/reldedupe_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Harborline Heating & Air')) returning id into v_home;

  v_calls := custom.table_declare(v_org, jsonb_build_object(
    'name','service_calls','type','entity','slug','service_calls',
    'label_singular','Service Call','label_plural','Service Calls',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,'title_field','call_summary','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','call_summary','direction','desc')),
    'fields', jsonb_build_array(jsonb_build_object('name','call_summary','type','text'))));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object(
    'name','assigned_technician','label','Assigned technician','type','relation',
    'relation_target', custom.person_kernel_id()::text, 'relation_max', 1));

  v_wos := custom.table_declare(v_org, jsonb_build_object(
    'name','work_orders','type','entity','slug','work_orders',
    'label_singular','Work Order','label_plural','Work Orders',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,'title_field','order_number','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','order_number','direction','desc')),
    'fields', jsonb_build_array(jsonb_build_object('name','order_number','type','text'))));
  perform custom.field_declare(v_org, v_wos, jsonb_build_object(
    'name','signed_authorization','label','Signed authorization','type','relation',
    'relation_target', custom.file_kernel_id()::text, 'relation_max', 1));

  -- Dana dispatches and works the calls, so she edits both tables (the owner shares them; a
  -- member holds viewer by default, and custom.record_write needs editor).
  perform custom.share_grant(v_org, v_calls, 'user', c_dana, 'editor'::public.permission_level);
  perform custom.share_grant(v_org, v_wos,   'user', c_dana, 'editor'::public.permission_level);

  -- The equipment on site, and the two columns that point at it from a Work Order.
  v_eq := custom.table_declare(v_org, jsonb_build_object(
    'name','equipment','type','entity','slug','equipment',
    'label_singular','Equipment','label_plural','Equipment',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,'title_field','unit_label','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','unit_label','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','unit_label','type','text'))));
  perform custom.field_declare(v_org, v_wos, jsonb_build_object(
    'name','equipment_serviced','label','Equipment serviced','type','relation',
    'relation_target', v_eq::text, 'multi', true, 'relation_max', 10));
  perform custom.field_declare(v_org, v_wos, jsonb_build_object(
    'name','technicians_on_site','label','Technicians on site','type','relation',
    'relation_target', custom.person_kernel_id()::text, 'multi', true, 'relation_max', 4));
  v_furnace   := custom.record_write(v_org, v_eq, jsonb_build_object('unit_label','Carrier 59SC5 gas furnace — basement'));
  v_condenser := custom.record_write(v_org, v_eq, jsonb_build_object('unit_label','Trane XR14 condenser — side yard'));
  v_coil      := custom.record_write(v_org, v_eq, jsonb_build_object('unit_label','Evaporator coil — attic air handler'));
  perform custom.share_grant(v_org, v_eq, 'user', c_dana, 'editor'::public.permission_level);

  -- Two uploaded PDFs: Harborline's own signed form, and one that belongs to Cedar Point.
  insert into files.files (id, created_by, file_path, file_name, mime_type, size_bytes, organization_id, storage_uri) values
    (v_form,   c_dana,  'orgs/'||v_org||'/work-orders/WO-4471-repair-authorization-signed.pdf',
               'WO-4471-repair-authorization-signed.pdf', 'application/pdf', 184320, v_org,
               's3://matrx-files/orgs/'||v_org||'/work-orders/WO-4471-repair-authorization-signed.pdf'),
    (v_theirs, c_admin, 'orgs/'||v_other||'/jobs/CPP-2210-estimate.pdf',
               'CPP-2210-estimate.pdf', 'application/pdf', 96256, v_other,
               's3://matrx-files/orgs/'||v_other||'/jobs/CPP-2210-estimate.pdf');

  -- An id that is no member of Harborline. Never a real person's account: an invented id is
  -- exactly as much "not a member" as a stranger is, and it names nobody.
  v_stranger := gen_random_uuid();

  insert into _rt values ('org',v_org),('calls',v_calls),('wos',v_wos),('dana',c_dana),('admin',c_admin),
                         ('form',v_form),('theirs',v_theirs),('stranger',v_stranger),
                         ('furnace',v_furnace),('condenser',v_condenser),('coil',v_coil);
end $fx$;


do $seat$
declare
  v_org uuid := (select v from _rt where k='org');
  v_wos uuid := (select v from _rt where k='wos');
  v_dana uuid := (select v from _rt where k='dana');
  v_f uuid := (select v from _rt where k='furnace');
  v_c uuid := (select v from _rt where k='condenser');
  v_k uuid := (select v from _rt where k='coil');
  v_wo uuid; v_val jsonb; v_n int; v_person uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  -- 1
  v_wo := custom.record_write(v_org, v_wos, jsonb_build_object(
    'order_number', 'WO-4480',
    'equipment_serviced', jsonb_build_array(v_f::text, v_c::text, v_f::text)));
  v_val := custom.read_record(v_org, v_wo, true) -> 'equipment_serviced';
  if v_val is distinct from jsonb_build_array(v_f::text, v_c::text) then
    raise exception 'CLAUSE 1 FAILED: the cell reads %, not [furnace, condenser]', v_val;
  end if;
  select count(*) into v_n from platform.relations_from(v_org, v_wo) r where r.role = 'equipment_serviced';
  if v_n <> 2 then
    raise exception 'CLAUSE 1 FAILED: % association(s) for Equipment serviced, not 2', v_n;
  end if;
  raise notice 'CLAUSE 1 PASS — [furnace, condenser, furnace] reads [furnace, condenser], with 2 associations';

  -- 2
  perform custom.record_update(v_org, v_wo, jsonb_build_object(
    'equipment_serviced', jsonb_build_array(v_c::text, v_k::text, v_c::text, v_f::text)));
  v_val := custom.read_record(v_org, v_wo, true) -> 'equipment_serviced';
  if v_val is distinct from jsonb_build_array(v_c::text, v_k::text, v_f::text) then
    raise exception 'CLAUSE 2 FAILED: the cell reads %, not [condenser, coil, furnace]', v_val;
  end if;
  select count(*) into v_n from platform.relations_from(v_org, v_wo) r where r.role = 'equipment_serviced';
  if v_n <> 3 then
    raise exception 'CLAUSE 2 FAILED: % association(s) after the re-save, not 3', v_n;
  end if;
  raise notice 'CLAUSE 2 PASS — the re-save keeps first-named order [condenser, coil, furnace], 3 associations';

  -- 3
  perform custom.record_update(v_org, v_wo, jsonb_build_object(
    'technicians_on_site', jsonb_build_array(v_dana::text)));
  v_person := (custom.read_record(v_org, v_wo, true) -> 'technicians_on_site' ->> 0)::uuid;
  perform custom.record_update(v_org, v_wo, jsonb_build_object(
    'technicians_on_site', jsonb_build_array(v_person::text, v_dana::text)));
  v_val := custom.read_record(v_org, v_wo, true) -> 'technicians_on_site';
  if v_val is distinct from jsonb_build_array(v_person::text) then
    raise exception 'CLAUSE 3 FAILED: Dana by Person record and by user id reads %', v_val;
  end if;
  raise notice 'CLAUSE 3 PASS — Dana named twice (record id and user id) is one Person record %', v_person;
end $seat$;

reset role;
do $c$
declare v_n int;
begin
  set constraints all immediate;
  select count(*) into v_n from custom.relation_halves_disagreements((select v from _rt where k='org'));
  if v_n <> 0 then
    raise exception 'CLAUSE 4 FAILED: % half/halves disagree in Harborline', v_n;
  end if;
  raise notice 'CLAUSE 4 PASS — 0 relation halves disagree; the deferred guard settled on every write';
end $c$;

\echo 'reldedupe_green: all clauses PASS.'
rollback;
