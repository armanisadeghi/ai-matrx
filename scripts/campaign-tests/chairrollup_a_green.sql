-- CHAIR-ROLLUP-HONEST (a) — A ROLL-UP WHOSE SOURCE IS ARCHIVED SAYS SO (Law 4).
--
-- WHAT THIS PROVES. A roll-up on Patients reads through the back-link of Appointments' "Patient"
-- link. Archiving "Patient" (custom.field_retire, on the OTHER table) leaves the roll-up in place;
-- it must then answer the typed state {"__unavailable": "source_archived", "reads": "link"} naming
-- "Patient" — never 0 — and Column settings' door (custom.field_source_archived) must name it too.
-- Restoring "Patient" (custom.field_restore) brings the 3 back. The same for the FAR column: archive
-- "Fee" and "Billed so far" names "Fee" (reads: column) instead of reading empty; restore → 545.
--
-- RED before migrations/campaign/chairrollup_a_a_rollup_whose_source_is_archived_says_so.sql:
--   with "Patient" archived the roll-up reads 0, and the door does not exist.
-- GREEN after it.
--
-- THE REAL USE CASE (no fake test data). Harbor Dental Group, Long Beach — the front desk's
-- "Booked visits" and "Billed so far" on every patient, and a link column archived by mistake.
--
-- Everything is rolled back: nothing persists on any database.
\set ON_ERROR_STOP on
\set suite 'chairrollup_a_green.sql'
\set requires 'exec:custom.record_write|exec:custom.table_declare|exec:custom.field_declare|exec:custom.field_retire|exec:custom.field_restore'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table cr_fx (k text primary key, v text) on commit drop;
create temp table cr_res (check_name text, ok boolean, detail text) on commit drop;
grant all on cr_fx, cr_res to authenticated, service_role;

do $t$
declare
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org      uuid;
  v_home     uuid;
  v_patients uuid;
  v_appts    uuid;
  v_back     text;
  v_marcus   uuid;
  v_link     uuid;
  v_fee      uuid;
  v_booked   uuid;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Harbor Dental Group', 'harbor-dental-' || substr(md5(random()::text),1,8), 'HDG', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);

  perform set_config('app.actor_system','campaign-test/chairrollup_a_green', true);
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
  v_fee  := custom.field_declare(v_org, v_appts, jsonb_build_object('key','fee','label','Fee','type','currency','unit','$'));
  v_link := custom.field_declare(v_org, v_appts, jsonb_build_object('key','patient','label','Patient','type','relation',
    'relation_target', v_patients, 'multi', false));

  select c.key into v_back from custom.reverse_columns(v_org, v_patients) c where c.source_table_id = v_appts;

  v_marcus := custom.record_write(v_org, v_patients, jsonb_build_object('full_name','Marcus Ellery'));
  perform custom.record_write(v_org, v_appts, jsonb_build_object('visit','Cleaning and exam','fee',185,'patient',v_marcus::text));
  perform custom.record_write(v_org, v_appts, jsonb_build_object('visit','Crown fitting','fee',240,'patient',v_marcus::text));
  perform custom.record_write(v_org, v_appts, jsonb_build_object('visit','Follow-up x-ray','fee',120,'patient',v_marcus::text));

  v_booked := custom.field_declare(v_org, v_patients, jsonb_build_object('key','booked_visits','label','Booked visits',
    'type','rollup','via', v_back,'agg','count'));
  perform custom.field_declare(v_org, v_patients, jsonb_build_object('key','billed_so_far','label','Billed so far',
    'type','rollup','via', v_back,'agg','sum','of','fee'));

  reset role;
  insert into cr_fx values ('org', v_org::text), ('marcus', v_marcus::text), ('link', v_link::text),
                           ('fee', v_fee::text), ('booked', v_booked::text);
end;
$t$;

-- ── 0. the baseline: 3 visits, 545 billed ──
do $t$
declare
  v_org uuid := (select v::uuid from cr_fx where k='org');
  vv jsonb;
begin
  vv := custom.record_values(v_org, (select v::uuid from cr_fx where k='marcus'));
  insert into cr_res values
    ('0a baseline: 3 booked visits', (vv ->> 'booked_visits') = '3', coalesce(vv ->> 'booked_visits', 'null')),
    ('0b baseline: billed 545',      (vv ->> 'billed_so_far')::numeric = 545, coalesce(vv ->> 'billed_so_far', 'null'));
end;
$t$;

-- ── 1. archive the LINK on the other table ──
do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org  uuid := (select v::uuid from cr_fx where k='org');
  v_link uuid := (select v::uuid from cr_fx where k='link');
  vv jsonb; s jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  perform custom.field_retire(v_org, v_link);
  begin
    s := custom.field_source_archived(v_org, (select v::uuid from cr_fx where k='booked'));
    insert into cr_res values ('1c the door names the archived link',
      s ->> '__unavailable' = 'source_archived' and s ->> 'field_id' = v_link::text and s ->> 'label' = 'Patient',
      coalesce(s::text, 'null'));
  exception when others then
    insert into cr_res values ('1c the door names the archived link', false, sqlerrm);
  end;
  reset role;

  vv := custom.record_values(v_org, (select v::uuid from cr_fx where k='marcus'));
  insert into cr_res values
    ('1a link archived: booked visits is the typed state, never 0',
       vv -> 'booked_visits' ->> '__unavailable' = 'source_archived'
       and vv -> 'booked_visits' ->> 'reads' = 'link'
       and vv -> 'booked_visits' ->> 'field_id' = v_link::text
       and vv -> 'booked_visits' ->> 'table' = 'Appointments',
       coalesce((vv -> 'booked_visits')::text, 'null')),
    ('1b link archived: billed so far names the link too',
       vv -> 'billed_so_far' ->> 'label' = 'Patient', coalesce((vv -> 'billed_so_far')::text, 'null'));
end;
$t$;

-- ── 2. restore the link: the values come back; then archive the FAR column ──
do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org  uuid := (select v::uuid from cr_fx where k='org');
  v_fee  uuid := (select v::uuid from cr_fx where k='fee');
  vv jsonb; ww jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  perform custom.field_restore(v_org, (select v::uuid from cr_fx where k='link'));
  reset role;
  vv := custom.record_values(v_org, (select v::uuid from cr_fx where k='marcus'));
  insert into cr_res values
    ('2a link restored: 3 booked visits again', (vv ->> 'booked_visits') = '3', coalesce((vv -> 'booked_visits')::text, 'null')),
    ('2b link restored: billed 545 again', (vv ->> 'billed_so_far') ~ '^545(\.0+)?$', coalesce((vv -> 'billed_so_far')::text, 'null'));

  perform set_config('role','authenticated', true);
  perform custom.field_retire(v_org, v_fee);
  reset role;
  ww := custom.record_values(v_org, (select v::uuid from cr_fx where k='marcus'));
  insert into cr_res values
    ('2c fee archived: billed so far names Fee (reads: column)',
       ww -> 'billed_so_far' ->> 'reads' = 'column' and ww -> 'billed_so_far' ->> 'field_id' = v_fee::text,
       coalesce((ww -> 'billed_so_far')::text, 'null')),
    ('2d fee archived: the count needs no column and still reads 3', (ww ->> 'booked_visits') = '3',
       coalesce((ww -> 'booked_visits')::text, 'null'));

  perform set_config('role','authenticated', true);
  perform custom.field_restore(v_org, v_fee);
  reset role;
  ww := custom.record_values(v_org, (select v::uuid from cr_fx where k='marcus'));
  insert into cr_res values
    ('2e fee restored: billed 545 again', (ww ->> 'billed_so_far') ~ '^545(\.0+)?$', coalesce((ww -> 'billed_so_far')::text, 'null'));
exception when others then
  insert into cr_res values ('2 restore and the far column', false, sqlerrm);
end;
$t$;

select check_name, case when coalesce(ok, false) then 'ok' else 'FAIL' end as result, left(detail, 140) as detail from cr_res order by check_name;

do $t$
declare v_bad integer := (select count(*) from cr_res where not coalesce(ok, false));
begin
  if v_bad > 0 then
    raise exception 'chairrollup_a_green: % check(s) FAILED (RED) — a roll-up whose source is archived does not say so', v_bad;
  end if;
end;
$t$;

rollback;
