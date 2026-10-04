-- CHAIR-UI-STORE (a) — A ROLL-UP READS THROUGH A BACK-LINK.
--
-- WHAT THIS PROVES. A roll-up on the LINKED-TO table may read through the reverse column a link
-- from another table gives it (REL-9, virtual — keyed by the linking Field's inverse_key):
-- declared through custom.field_declare, it counts and sums the linking records whose edge points
-- at each record, its filter is checked against the LINKING table's columns, and a filter naming a
-- column that table lacks is refused by sentence. A forward roll-up still answers as before.
--
-- RED before migrations/campaign/chairuistore_a_a_rollup_reads_through_a_back_link.sql: the
--   declaration through the back-link is refused ("this table has no field called …").
-- GREEN after it: 3 booked visits, 2 still scheduled, fees 545; bad filter refused; forward roll-up 3.
--
-- THE REAL USE CASE (no fake test data). Harbor Dental Group, Long Beach. Each appointment names
-- its patient; the front desk wants "Booked visits" and "Billed so far" on every patient.
--
-- Everything is rolled back: nothing persists on any database.
\set ON_ERROR_STOP on
\set suite 'chairuistore_a_green.sql'
\set requires 'exec:custom.record_write|exec:custom.table_declare|exec:custom.field_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table cu_fx (k text primary key, v text) on commit drop;
create temp table cu_res (check_name text, ok boolean, detail text) on commit drop;
grant all on cu_fx, cu_res to authenticated, service_role;

do $t$
declare
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org      uuid;
  v_home     uuid;
  v_patients uuid;
  v_appts    uuid;
  v_back     text;
  v_marcus   uuid;
  v_lena     uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Harbor Dental Group', 'harbor-dental-' || substr(md5(random()::text),1,8), 'HDG', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/chairuistore_a_green', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
              jsonb_build_object('name','Harbor Dental — Front desk'));

  v_patients := custom.table_declare(v_org, jsonb_build_object(
    'name','Patients','slug','hdg_patients_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Patient','label_plural','Patients','title_field','full_name','display','list',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','full_name')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_patients, jsonb_build_object('key','full_name','label','Patient name','type','text'));

  v_appts := custom.table_declare(v_org, jsonb_build_object(
    'name','Appointments','slug','hdg_appointments_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Appointment','label_plural','Appointments','title_field','visit','display','list',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','visit')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_appts, jsonb_build_object('key','visit','label','Visit','type','text'));
  perform custom.field_declare(v_org, v_appts, jsonb_build_object('key','status','label','Status','type','select',
    'options', jsonb_build_array('scheduled','completed','cancelled')));
  perform custom.field_declare(v_org, v_appts, jsonb_build_object('key','fee','label','Fee','type','currency','unit','$'));
  perform custom.field_declare(v_org, v_appts, jsonb_build_object('key','patient','label','Patient','type','relation',
    'relation_target', v_patients, 'multi', false));

  -- The reverse column's key, exactly as custom.reverse_columns publishes it.
  select c.key into v_back from custom.reverse_columns(v_org, v_patients) c where c.source_table_id = v_appts;
  insert into cu_fx values ('back', coalesce(v_back, ''));

  v_marcus := custom.record_write(v_org, v_patients, jsonb_build_object('full_name','Marcus Ellery'));
  v_lena   := custom.record_write(v_org, v_patients, jsonb_build_object('full_name','Lena Okafor'));
  v_a1 := custom.record_write(v_org, v_appts, jsonb_build_object('visit','Cleaning and exam','status','completed','fee',185,'patient',v_marcus::text));
  v_a2 := custom.record_write(v_org, v_appts, jsonb_build_object('visit','Crown fitting','status','scheduled','fee',240,'patient',v_marcus::text));
  v_a3 := custom.record_write(v_org, v_appts, jsonb_build_object('visit','Follow-up x-ray','status','scheduled','fee',120,'patient',v_marcus::text));
  perform custom.record_write(v_org, v_appts, jsonb_build_object('visit','Whitening consult','status','scheduled','fee',90,'patient',v_lena::text));

  -- ── the roll-ups through the back-link ──
  begin
    perform custom.field_declare(v_org, v_patients, jsonb_build_object('key','booked_visits','label','Booked visits',
      'type','rollup','via', v_back,'agg','count'));
    perform custom.field_declare(v_org, v_patients, jsonb_build_object('key','still_scheduled','label','Still scheduled',
      'type','rollup','via', v_back,'agg','count','filter', jsonb_build_object('status','scheduled')));
    perform custom.field_declare(v_org, v_patients, jsonb_build_object('key','billed_so_far','label','Billed so far',
      'type','rollup','via', v_back,'agg','sum','of','fee'));
    insert into cu_res values ('D1 a roll-up may be declared through the back-link', true, v_back);
  exception when others then
    insert into cu_res values ('D1 a roll-up may be declared through the back-link', false, sqlerrm);
  end;
  begin
    perform custom.field_declare(v_org, v_patients, jsonb_build_object('key','bad_filter','label','Bad filter',
      'type','rollup','via', v_back,'agg','count','filter', jsonb_build_object('chair','3')));
    insert into cu_res values ('D2 a back-link filter on a column the linking table lacks is refused', false, 'accepted');
  exception when others then
    insert into cu_res values ('D2 a back-link filter on a column the linking table lacks is refused',
      sqlerrm ilike '%has no column with that key%', sqlerrm);
  end;

  reset role;
  insert into cu_fx values ('org', v_org::text), ('marcus', v_marcus::text), ('lena', v_lena::text);
end;
$t$;

do $t$
declare
  v_org    uuid := (select v::uuid from cu_fx where k='org');
  v_marcus uuid := (select v::uuid from cu_fx where k='marcus');
  v_lena   uuid := (select v::uuid from cu_fx where k='lena');
  v jsonb; w jsonb;
begin
  begin
    v := custom.record_values(v_org, v_marcus);
    w := custom.record_values(v_org, v_lena);
    insert into cu_res values
      ('1a Marcus: 3 booked visits',                  (v ->> 'booked_visits')   = '3',   coalesce(v ->> 'booked_visits', 'null')),
      ('1b Marcus: 2 still scheduled (filter)',       (v ->> 'still_scheduled') = '2',   coalesce(v ->> 'still_scheduled', 'null')),
      ('1c Marcus: billed so far 545',                (v ->> 'billed_so_far')::numeric = 545, coalesce(v ->> 'billed_so_far', 'null')),
      ('1d Lena: 1 booked visit, never Marcus''s',    (w ->> 'booked_visits')   = '1',   coalesce(w ->> 'booked_visits', 'null'));
  exception when others then
    insert into cu_res values ('1 the back-link roll-ups read', false, sqlerrm);
  end;
end;
$t$;

select check_name, case when coalesce(ok, false) then 'ok' else 'FAIL' end as result, left(detail, 110) as detail from cu_res order by check_name;

do $t$
declare v_bad integer := (select count(*) from cu_res where not coalesce(ok, false));
begin
  if v_bad > 0 then
    raise exception 'chairuistore_a_green: % check(s) FAILED (RED) — a roll-up cannot read through a back-link', v_bad;
  end if;
end;
$t$;

rollback;
