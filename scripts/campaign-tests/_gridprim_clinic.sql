-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- LANE GRID-PRIMITIVES — THE SHARED FIXTURE. Included by every gridprim_*.sql suite, INSIDE
-- the suite's own `begin; … rollback;`, after the preamble. It asserts nothing.
--
-- THE USE CASE. Marisol Vega runs the front desk at Cedar Ridge Veterinary Clinic, a
-- three-doctor small-animal practice in Bend, Oregon. Her Appointments table is the day
-- sheet: every visit, the patient and species, the owner's phone, where the visit is in its
-- life (Scheduled → Checked in → In exam → Completed, or No-show), the visit fee and the
-- deposit taken at booking. She colors overdue and no-show rows, sets the grid to compact on
-- busy mornings, runs "Check in" on a selection of arrivals, and her practice manager keeps a
-- webhook to their reminder service. Marisol is test@test.com; the practice manager, Dr. Ana
-- Whitfield, is admin@admin.com. Every name, phone and pet below is synthesized.
--
-- WHAT IT LEAVES BEHIND (in the suite's transaction only), as psql variables and as the temp
-- table gp — one row, read with `select * from gp`:
--   org, admin, dana, appts (the Appointments table), f_patient, f_species, f_status,
--   f_fee, f_deposit, f_phone, f_notes, f_visit_on (Field ids), r1 … r10 (record ids),
--   other_table (a second table of the same clinic, Suppliers), s1 (a Supplier record).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create temp table gp (k text primary key, v uuid) on commit drop;
grant select on gp to authenticated;

do $gp_fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_appts   uuid;
  v_sup     uuid;
  v_id      uuid;
  v_row     jsonb;
  v_n       integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/gridprim', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Veterinary Clinic ' || substr(v_org::text, 1, 8),
          'cedar-ridge-veterinary-' || substr(v_org::text, 1, 8), 'CRV', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- A three-doctor practice where the front desk edits the day sheet: members edit by default.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'gridprim fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'gridprim fixture: the front desk edits the day sheet');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- The practice manager builds the table through the same doors a person uses. The fixture
  -- runs as the role that owns the store (it asserts nothing); every suite takes the seat after.

  v_appts := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Appointments', 'slug', 'appointments', 'type', 'entity',
    'label_singular', 'Appointment', 'label_plural', 'Appointments',
    'title_field', 'patient', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'visit_on', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient'))));
  insert into gp values ('org', v_org), ('admin', c_admin), ('dana', c_dana), ('appts', v_appts), ('home', v_home);

  insert into gp values ('f_patient', custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'patient', 'label', 'Patient', 'type', 'text', 'sort', 10, 'required', true)));
  insert into gp values ('f_species', custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'species', 'label', 'Species', 'type', 'select', 'sort', 20,
    'options', jsonb_build_array('Dog', 'Cat', 'Rabbit', 'Bird'))));
  insert into gp values ('f_status', custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'visit_status', 'label', 'Visit status', 'type', 'select', 'sort', 30,
    'options', jsonb_build_array('Scheduled', 'Checked in', 'In exam', 'Completed', 'No-show'))));
  insert into gp values ('f_visit_on', custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'visit_on', 'label', 'Visit date', 'type', 'datetime', 'sort', 40)));
  insert into gp values ('f_fee', custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'visit_fee', 'label', 'Visit fee', 'type', 'currency', 'unit', '$', 'sort', 50)));
  insert into gp values ('f_deposit', custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'deposit', 'label', 'Deposit taken', 'type', 'currency', 'unit', '$', 'sort', 60)));
  insert into gp values ('f_phone', custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'owner_phone', 'label', 'Owner phone', 'type', 'text', 'sort', 70)));
  insert into gp values ('f_notes', custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'desk_notes', 'label', 'Desk notes', 'type', 'long_text', 'sort', 80)));

  -- Ten visits on one Tuesday. Fees are what a small-animal practice charges in 2026.
  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('patient','Biscuit (Hollis)',   'species','Dog',    'visit_status','Completed',  'visit_on','2026-09-22', 'visit_fee',185,  'deposit',50, 'owner_phone','(541) 389-2214', 'desk_notes','Annual wellness, rabies booster'),
    jsonb_build_object('patient','Juniper (Okafor)',   'species','Cat',    'visit_status','Completed',  'visit_on','2026-09-22', 'visit_fee',142.5,'deposit',50, 'owner_phone','(541) 317-0842', 'desk_notes','Dental cleaning estimate sent'),
    jsonb_build_object('patient','Moose (Delgado)',    'species','Dog',    'visit_status','In exam',    'visit_on','2026-09-22', 'visit_fee',365,  'deposit',100,'owner_phone','(541) 480-7731', 'desk_notes',''),
    jsonb_build_object('patient','Pepper (Lindqvist)', 'species','Rabbit', 'visit_status','Checked in', 'visit_on','2026-09-22', 'visit_fee',98,   'deposit',0,  'owner_phone','(541) 255-6190'),
    jsonb_build_object('patient','Tango (Fairweather)','species','Bird',   'visit_status','Scheduled',  'visit_on','2026-09-22', 'visit_fee',120,  'owner_phone','(541) 633-4028', 'desk_notes','Wing clip + nail trim'),
    jsonb_build_object('patient','Olive (Nakamura)',   'species','Cat',    'visit_status','Scheduled',  'visit_on','2026-09-22', 'visit_fee',142.5,'deposit',50, 'owner_phone','(541) 728-3356'),
    jsonb_build_object('patient','Rocco (Abernathy)',  'species','Dog',    'visit_status','No-show',    'visit_on','2026-09-22', 'visit_fee',185,  'deposit',50, 'owner_phone','(541) 912-4470', 'desk_notes','Second no-show this year'),
    jsonb_build_object('patient','Maple (Ferreira)',   'species','Dog',    'visit_status','Scheduled',  'visit_on','2026-09-22', 'visit_fee',410,  'deposit',150,'owner_phone','(541) 506-1182', 'desk_notes','Post-op check, TPLO'),
    jsonb_build_object('patient','Ziggy (Castellanos)','species','Cat',    'visit_status','Scheduled',  'visit_on','2026-09-22',                   'owner_phone','(541) 344-9075'),
    jsonb_build_object('patient','Hazel (Brennan)',    'species','Dog',    'visit_status','Scheduled',  'visit_on','2026-09-22', 'visit_fee',185,  'deposit',50, 'owner_phone','(541) 861-2037')
  )) e loop
    v_n := v_n + 1;
    v_id := custom.record_write(v_org, v_appts, v_row);
    insert into gp values ('r' || v_n, v_id);
  end loop;

  -- A second table of the same clinic, so "not this table" has a real neighbour.
  v_sup := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Suppliers', 'slug', 'suppliers', 'type', 'entity',
    'label_singular', 'Supplier', 'label_plural', 'Suppliers',
    'title_field', 'supplier', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'supplier', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'supplier'))));
  insert into gp values ('other_table', v_sup);
  insert into gp values ('f_supplier', custom.field_declare(v_org, v_sup, jsonb_build_object(
    'key', 'supplier', 'label', 'Supplier', 'type', 'text', 'sort', 10)));
  insert into gp values ('s1', custom.record_write(v_org, v_sup, jsonb_build_object('supplier', 'Cascade Veterinary Supply')));

end
$gp_fixture$;
