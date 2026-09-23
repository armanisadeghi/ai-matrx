-- LANE RELATION-TARGETS — THE RED TWIN of reltargets_green.sql. Passes only when the store
-- REFUSES what it must and the halves census NAMES what it must.
--
-- Same use case and fixtures as the green suite (Harborline Heating & Air: Service Calls with an
-- "Assigned technician" Person field, Work Orders with a "Signed authorization" File field).
--
--   R1  a Person cell whose Person record has since been removed underneath it (planted as the
--       connected role: the call is assigned to Dana through the door, then her Person record is
--       soft-deleted by a raw write — the one thing no door does) is a value the store refuses on
--       the record's next save. From test@test.com's seat, saving that call is REFUSED.
--   R2  relhalvescensus_green.sql clause 3's cell census (same query, same words) NAMES that
--       record — so the census cannot read 0 while a save would be refused.
--   R3  from the seat: another organization's file, and an id that is nobody in Harborline, are
--       refused BY NAME, and neither leaves a Person or File record behind.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/reltargets_red.sql   (ends in ROLLBACK)

\set ON_ERROR_STOP on
\set suite 'reltargets_red.sql'
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
begin
  perform set_config('app.actor_system', 'campaign-test/reltargets_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org,   'Harborline Heating & Air', 'harborline-heating-air-'||substr(v_org::text,1,8), 'HHA', c_admin),
    (v_other, 'Cedar Point Plumbing',     'cedar-point-plumbing-'||substr(v_other::text,1,8), 'CPP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active'),
    (v_other,'organization',v_other,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/reltargets_red');
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
                         ('form',v_form),('theirs',v_theirs),('stranger',v_stranger);
end $fx$;


-- ═══ THE PLANT, as the connected role ═════════════════════════════════════════════════════
do $plant$
declare
  v_org uuid := (select v from _rt where k='org');
  v_calls uuid := (select v from _rt where k='calls');
  v_call uuid; v_person uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  v_call := custom.record_write(v_org, v_calls, jsonb_build_object(
    'call_summary', 'Carbon monoxide alarm chirping — 57 Lantern Row', 'assigned_technician',
    (select v from _rt where k='dana')::text));
  select (r.data ->> 'assigned_technician')::uuid into v_person
    from custom.record r where r.organization_id = v_org and r.id = v_call;
  -- THE PLANT: the Person record goes away underneath the cell. No door does this.
  update custom.record set deleted_at = now() where organization_id = v_org and id = v_person;
  insert into _rt values ('call', v_call), ('gone_person', v_person);
end $plant$;

-- ═══ R2 · the census names it (relhalvescensus_green.sql clause 3's cell query) ═════════════
do $r2$
declare v_n int; v_org uuid := (select v from _rt where k='org'); v_call uuid := (select v from _rt where k='call');
begin
  with f as (
    select f.organization_id, coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') as k,
           nullif(f.data ->> 'entity_definition_id', '')::uuid as tbl,
           (f.data ->> 'relation_target')::uuid as tgt
      from custom.record f
     where f.table_id = custom.field_kernel_id() and f.data_class <> 'kernel'
       and f.deleted_at is null and f.data ->> 'type' = 'relation'
       and f.data ->> 'relation_target' in (custom.person_kernel_id()::text, custom.file_kernel_id()::text)
  ), cells as (
    select f.organization_id, r.id as record_id, f.k, f.tgt, x.val #>> '{}' as v
      from f
      join custom.record r
        on r.organization_id = f.organization_id and r.table_id = f.tbl
       and r.data_class = 'record' and r.deleted_at is null
     cross join lateral jsonb_array_elements(
             case jsonb_typeof(r.data -> f.k) when 'array' then r.data -> f.k
                                               when 'string' then jsonb_build_array(r.data -> f.k)
                                               else '[]'::jsonb end) x(val)
  )
  select count(*) into v_n
    from cells c
   where c.organization_id = v_org and c.record_id = v_call
     and not exists (select 1 from custom.record t
                      where t.organization_id = c.organization_id and t.id::text = c.v
                        and t.table_id = c.tgt and t.deleted_at is null);
  if v_n <> 1 then
    raise exception 'R2 FAILED: the cell census did not name the planted call (% match(es)); clause 3 would read 0 while its save is refused', v_n;
  end if;
  raise notice 'R2 PASS — the census names the planted call';
end $r2$;

-- ═══ THE SEAT ════════════════════════════════════════════════════════════════════════════
do $seat$
declare
  v_org uuid := (select v from _rt where k='org');
  v_calls uuid := (select v from _rt where k='calls');
  v_wos uuid := (select v from _rt where k='wos');
  v_call uuid := (select v from _rt where k='call');
  v_n int; m text;
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

  -- R1 · saving the call whose technician's Person record is gone is refused
  begin
    perform custom.record_update(v_org, v_call, jsonb_build_object(
      'call_summary', 'Carbon monoxide alarm chirping — 57 Lantern Row (tenant home after 4pm)'));
    raise exception 'R1 FAILED: a record whose Person cell names a removed Person record was saved';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m not ilike '%Assigned technician names a person that was removed from Harborline Heating & Air%' then
      raise exception 'R1 FAILED: refused, but in the wrong words: %', m;
    end if;
    raise notice 'R1 PASS — the save is refused: %', m;
  end;

  -- R3 · a foreign file and a nobody, refused by name, nothing left behind
  begin
    perform custom.record_write(v_org, v_wos, jsonb_build_object(
      'order_number', 'WO-4473', 'signed_authorization', (select v from _rt where k='theirs')::text));
    raise exception 'R3 FAILED: Cedar Point''s file was attached to a Harborline order';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m not ilike '%Signed authorization names a file Harborline Heating & Air does not have%' then
      raise exception 'R3 FAILED: refused in the wrong words: %', m;
    end if;
  end;
  begin
    perform custom.record_write(v_org, v_calls, jsonb_build_object(
      'call_summary', 'Gas smell near water heater — 12 Oriole Ct', 'assigned_technician',
      (select v from _rt where k='stranger')::text));
    raise exception 'R3 FAILED: an id that is nobody in Harborline was assigned';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m not ilike '%Assigned technician names someone who is not a member of Harborline Heating & Air%' then
      raise exception 'R3 FAILED: refused in the wrong words: %', m;
    end if;
  end;
  select count(*) into v_n from custom.read_records(v_org, custom.file_kernel_id(), true, 200, 0) x
   where x.document ->> 'file_id' = (select v from _rt where k='theirs')::text;
  if v_n <> 0 then
    raise exception 'R3 FAILED: a File record was left for the other organization''s file';
  end if;
  raise notice 'R3 PASS — a foreign file and a nobody are refused by name; no File record left behind';
end $seat$;

\echo 'reltargets_red: all RED arms PASS (the store refused, the census named it).'
rollback;
