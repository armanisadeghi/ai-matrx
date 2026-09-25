-- LANE STORE-TAILS-3 — the shared fixture of its three suites. \i it INSIDE the suite's own
-- `begin; … rollback;` after the preamble; it leaves nothing behind.
--
-- THE USE CASE. The Birchwood Avenue renovation (synthesized, the same business STORE-LEAK-FORMULA
-- rebuilt): the owner (admin@admin.com) tracks Rooms — name, status, budget, a contingency
-- formula — and the contractors' Quotes against each room. Each room rolls up the sum of its
-- quotes (Quoted so far), through the two halves of the Rooms <-> Quotes relation. Dana Whitfield
-- (test@test.com) is a member of the organization. Hand-computed: Kitchen 18,000 -> 19,800;
-- Kitchen's quotes Voltway Electric 7,400 + Harbor Cabinetry 9,950 = 17,350.
--
-- Leaves the ids in the temp table `st3` (k, v): org, home, rooms, quotes, Kitchen, Primary bath,
-- Garage, q_voltway, q_harbor.
create temp table st3 (k text primary key, v uuid) on commit drop;
grant select on st3 to authenticated;
do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid(); v_home uuid; v_rooms uuid; v_quotes uuid; v_id uuid; v_kitchen uuid; v_row jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/storetails3', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Birchwood Avenue Renovation ' || substr(v_org::text, 1, 8), 'birchwood-st3-' || substr(v_org::text, 1, 8), 'BAR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active'), (v_org, 'organization', v_org, c_dana, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'storetails3 fixture');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_quotes := custom.table_declare(v_org, jsonb_build_object('name', 'Quotes', 'slug', 'quotes', 'type', 'entity',
    'label_singular', 'Quote', 'label_plural', 'Quotes', 'title_field', 'contractor', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'default_sort', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'asc')),
    'agent_writable', true, 'retention_days', 3650, 'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'contractor'))));
  v_rooms := custom.table_declare(v_org, jsonb_build_object('name', 'Rooms', 'slug', 'rooms', 'type', 'entity',
    'label_singular', 'Room', 'label_plural', 'Rooms', 'title_field', 'room_name', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'default_sort', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'asc')),
    'agent_writable', true, 'retention_days', 3650, 'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'room_name'))));
  insert into st3 values ('org', v_org), ('rooms', v_rooms), ('quotes', v_quotes), ('home', v_home);
  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'contractor', 'label', 'Contractor', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'amount', 'label', 'Amount', 'type', 'currency', 'unit', '$', 'sort', 20));
  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'room', 'label', 'Room', 'type', 'relation', 'relation_target', v_rooms, 'sort', 30));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'room_name', 'label', 'Room name', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 20,
    'options', jsonb_build_array('Planning', 'Quoting', 'In Progress', 'Complete')));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'budget', 'label', 'Budget', 'type', 'currency', 'unit', '$', 'sort', 30));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'budget_with_contingency', 'label', 'Budget with contingency',
    'type', 'formula', 'formula_text', '{Budget} * 1.1', 'sort', 40));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'quotes_here', 'label', 'Quotes for this room',
    'type', 'relation', 'relation_target', v_quotes, 'multi', true, 'sort', 60));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'quoted_total', 'label', 'Quoted so far',
    'type', 'rollup', 'via', 'quotes_here', 'agg', 'sum', 'of', 'amount', 'sort', 70));
  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('room_name', 'Kitchen', 'status', 'Quoting', 'budget', 18000),
    jsonb_build_object('room_name', 'Primary bath', 'status', 'Planning', 'budget', 61000),
    jsonb_build_object('room_name', 'Garage', 'status', 'In Progress', 'budget', 9500))) e loop
    v_id := custom.record_write(v_org, v_rooms, v_row);
    insert into st3 values (v_row ->> 'room_name', v_id);
  end loop;
  select v into v_kitchen from st3 where k = 'Kitchen';
  v_id := custom.record_write(v_org, v_quotes, jsonb_build_object('contractor', 'Voltway Electric', 'amount', 7400, 'room', v_kitchen));
  insert into st3 values ('q_voltway', v_id);
  v_id := custom.record_write(v_org, v_quotes, jsonb_build_object('contractor', 'Harbor Cabinetry', 'amount', 9950, 'room', v_kitchen));
  insert into st3 values ('q_harbor', v_id);
  perform custom.record_update(v_org, v_kitchen, jsonb_build_object('quotes_here',
    jsonb_build_array((select v from st3 where k = 'q_voltway'), (select v from st3 where k = 'q_harbor'))));
end
$fixture$;
