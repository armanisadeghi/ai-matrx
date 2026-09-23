-- LANE STORE-RULE-GAPS — THREE COLUMN SETTINGS THE OLDER GRID HELD, NOW IN THE RECORD STORE.
--
-- THE USE CASE. Tidewater Property Management runs 214 apartments across four buildings in
-- Long Beach, California. Its Maintenance requests table is where the leasing office logs every
-- work order a tenant phones in: the unit, the tenant's callback number, what kind of job it is,
-- how urgent, and what is wrong in enough words for the technician to bring the right parts.
-- Keisha Ramirez runs the leasing desk and logs the calls (test@test.com, a member who edits);
-- the property manager, Daniel Okafor, set the table up (admin@admin.com). Every name, unit and
-- number below is synthesized.
--
-- THE THREE SETTINGS, ONE PER PART, each exactly what the older grid carried:
--   1  a pattern's EXAMPLE (patternHint): "Tenant phone" must be written 949-555-0142, and when
--      Keisha types (562) 555 0198 the refusal says "Enter it like 949-555-0142." — in the hint,
--      and as data in the detail the one refusal builder reads.
--   2  a choice list that takes OTHER VALUES (allowOther): "Category" offers Plumbing ·
--      Electrical · HVAC · Appliance, and a call about ants is logged as "Pest control", which
--      joins the list as typed and is reused, not duplicated, the next time. "Priority" did NOT
--      say so, and "ASAP" is still refused there — the setting is the column's, never global.
--   3  a length rule's SHORTEST (minLength): "What is wrong" needs at least 20 characters, so
--      "Leak" is refused and "Kitchen sink drips under the cabinet" is saved; a blank is
--      `required`'s question and is not refused for being short.
-- Each part also proves the store REFUSES the setting written wrong, by name.
--
-- RED before storerulegaps_an_example_a_shortest_length_and_other_choices.sql (and after its
-- inverse): part 1 fails first — `custom._field_shape_guard` stores the example but
-- `custom.validate_values` never says it ("1b: the refusal did not show the example").

\set ON_ERROR_STOP on
\timing off
\set suite 'storerulegaps_green.sql'
\set requires 'function:custom.field_declare|function:custom.record_write'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_keisha  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_keisha_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_req     uuid;
  f_phone   uuid;
  f_cat     uuid;
  f_prio    uuid;
  f_what    uuid;
  v_id      uuid;
  v_id2     uuid;
  v_msg     text;
  v_hint    text;
  v_detail  text;
  v_cell    jsonb;
  v_cell2   jsonb;
  v_opts    jsonb;
  v_n       integer;
begin
  -- ── THE ORGANIZATION (as the store's owner; it asserts nothing) ─────────────────────────
  perform set_config('app.actor_system', 'campaign-test/storerulegaps', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Tidewater Property Management ' || substr(v_org::text, 1, 8),
          'tidewater-property-' || substr(v_org::text, 1, 8), 'TPM', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin,  'owner',  'active'),
    (v_org, 'organization', v_org, c_keisha, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'storerulegaps suite'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'storerulegaps suite: the leasing desk logs work orders');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Leasing office')) returning id into v_home;

  -- ── THE PROPERTY MANAGER BUILDS THE TABLE, FROM HIS SEAT ────────────────────────────────
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  v_req := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Maintenance requests', 'slug', 'maintenance_requests', 'type', 'entity',
    'label_singular', 'Maintenance request', 'label_plural', 'Maintenance requests',
    'title_field', 'unit', 'display', 'list', 'weight', 'light', 'ordered', true,
    'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'unit', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'unit'))));
  perform custom.field_declare(v_org, v_req, jsonb_build_object(
    'key', 'unit', 'label', 'Unit', 'type', 'text', 'sort', 10, 'required', true));
  f_phone := custom.field_declare(v_org, v_req, jsonb_build_object(
    'key', 'tenant_phone', 'label', 'Tenant phone', 'type', 'text', 'sort', 20,
    'rules', jsonb_build_array(jsonb_build_object(
      'kind', 'pattern', 'value', '^[0-9]{3}-[0-9]{3}-[0-9]{4}$', 'example', '949-555-0142'))));
  f_cat := custom.field_declare(v_org, v_req, jsonb_build_object(
    'key', 'category', 'label', 'Category', 'type', 'select', 'sort', 30,
    'options', jsonb_build_array('Plumbing', 'Electrical', 'HVAC', 'Appliance'),
    'config', jsonb_build_object('allow_other', true)));
  f_prio := custom.field_declare(v_org, v_req, jsonb_build_object(
    'key', 'priority', 'label', 'Priority', 'type', 'select', 'sort', 40,
    'options', jsonb_build_array('Routine', 'Within 48 hours', 'Emergency')));
  f_what := custom.field_declare(v_org, v_req, jsonb_build_object(
    'key', 'what_is_wrong', 'label', 'What is wrong', 'type', 'long_text', 'sort', 50,
    'rules', jsonb_build_array(jsonb_build_object('kind', 'length', 'min', 20, 'value', 1000))));

  -- ── PART 1 — A PATTERN SAYS HOW TO WRITE IT ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_keisha_j, true);
  begin
    perform custom.record_write(v_org, v_req, jsonb_build_object(
      'unit', 'Harbor View 3B', 'tenant_phone', '(562) 555 0198', 'category', 'Plumbing',
      'priority', 'Within 48 hours', 'what_is_wrong', 'Bathroom faucet will not shut off fully'));
    raise exception '1a: a phone written (562) 555 0198 was accepted by a 949-555-0142 pattern';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
  end;
  if v_msg is distinct from 'Tenant phone is not written the way this field expects' then
    raise exception '1a: the refusal said "%"', v_msg;
  end if;
  if v_hint is distinct from 'Enter it like 949-555-0142.' then
    raise exception '1b: the refusal did not show the example — its hint was "%"', v_hint;
  end if;
  if (v_detail::jsonb ->> 'example') is distinct from '949-555-0142' then
    raise exception '1c: the refusal''s detail does not carry the example as data: %', v_detail;
  end if;
  v_id := custom.record_write(v_org, v_req, jsonb_build_object(
    'unit', 'Harbor View 3B', 'tenant_phone', '562-555-0198', 'category', 'Plumbing',
    'priority', 'Within 48 hours', 'what_is_wrong', 'Bathroom faucet will not shut off fully'));
  -- …and the example is judged when the column is set up: one its own pattern refuses is refused.
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.field_update(v_org, f_phone, jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'kind', 'pattern', 'value', '^[0-9]{3}-[0-9]{3}-[0-9]{4}$', 'example', '949.555.0142'))));
    raise exception '1d: an example its own pattern refuses was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%its own pattern would refuse that%' then raise exception '1d: refused as "%"', v_msg; end if;
  end;
  begin
    perform custom.field_update(v_org, f_what, jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'kind', 'length', 'value', 1000, 'example', 'The dishwasher leaks'))));
    raise exception '1e: an example on a length rule was stored';
  exception when check_violation then null;
  end;
  raise notice '1 PASS — (562) 555 0198 refused with "Enter it like 949-555-0142." (hint and detail); 562-555-0198 saved; a wrong example is refused at setup.';

  -- ── PART 2 — A CHOICE LIST THAT TAKES OTHER VALUES ──────────────────────────────────────
  perform set_config('request.jwt.claims', c_keisha_j, true);
  v_id := custom.record_write(v_org, v_req, jsonb_build_object(
    'unit', 'Pacific Terrace 112', 'tenant_phone', '562-555-0231', 'category', 'Pest control',
    'priority', 'Within 48 hours', 'what_is_wrong', 'Ants along the kitchen counter and under the sink'));
  -- What was stored is read as the store's owner (the seat reads through doors, not the table).
  perform set_config('role', 'postgres', true);
  select r.data -> 'category' into v_cell from custom.record r where r.organization_id = v_org and r.id = v_id;
  v_opts := custom.choice_field_map(v_org, v_req) -> 'category' -> 'options';
  perform set_config('role', 'authenticated', true);
  if v_cell is distinct from '"pest_control"'::jsonb or (v_opts -> 'pest_control' ->> 'label') is distinct from 'Pest control' then
    raise exception '2a: "Pest control" was not added to the list as typed — cell %, options %', v_cell, v_opts;
  end if;
  -- The next ant call reuses the choice rather than adding a second one.
  v_id2 := custom.record_write(v_org, v_req, jsonb_build_object(
    'unit', 'Harbor View 1A', 'tenant_phone', '562-555-0476', 'category', 'pest control',
    'priority', 'Routine', 'what_is_wrong', 'Ants coming in under the patio slider'));
  perform set_config('role', 'postgres', true);
  select r.data -> 'category' into v_cell2 from custom.record r where r.organization_id = v_org and r.id = v_id2;
  select count(*) into v_n from jsonb_object_keys(custom.choice_field_map(v_org, v_req) -> 'category' -> 'options');
  perform set_config('role', 'authenticated', true);
  if v_cell2 is distinct from '"pest_control"'::jsonb or v_n <> 5 then
    raise exception '2b: a second "pest control" made % choices and held %', v_n, v_cell2;
  end if;
  -- Priority never said so: "ASAP" is refused there, with the choices named.
  begin
    perform custom.record_write(v_org, v_req, jsonb_build_object(
      'unit', 'Seaside Court 204', 'tenant_phone', '562-555-0659', 'category', 'HVAC',
      'priority', 'ASAP', 'what_is_wrong', 'No cold air from the living room vent since Monday'));
    raise exception '2c: "ASAP" was accepted by a Priority list that takes no other values';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'Priority does not have a choice called "ASAP"%' then raise exception '2c: refused as "%"', v_msg; end if;
  end;
  -- The manager turns it off for Category through the column door; "Roofing" is then refused.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.field_update(v_org, f_cat, jsonb_build_object('allow_other', false));
  perform set_config('request.jwt.claims', c_keisha_j, true);
  begin
    perform custom.record_write(v_org, v_req, jsonb_build_object(
      'unit', 'Seaside Court 301', 'tenant_phone', '562-555-0712', 'category', 'Roofing',
      'priority', 'Emergency', 'what_is_wrong', 'Water coming through the bedroom ceiling in the rain'));
    raise exception '2d: "Roofing" was accepted after the manager turned other values off';
  exception when check_violation then null;
  end;
  -- …and the setting is judged: on a column that is not a list, or as anything but yes/no, it is refused.
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.field_update(v_org, f_what, jsonb_build_object('allow_other', true));
    raise exception '2e: allow_other was stored on a text column';
  exception when check_violation then null;
  end;
  begin
    perform custom.field_update(v_org, f_prio, jsonb_build_object('allow_other', 'yes'));
    raise exception '2f: allow_other "yes" (a word, not true/false) was stored';
  exception when check_violation then null;
  end;
  raise notice '2 PASS — "Pest control" joined Category as typed and was reused; "ASAP" refused on Priority; off again refuses "Roofing"; wrong settings refused.';

  -- ── PART 3 — A LENGTH HAS A SHORTEST ────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_keisha_j, true);
  begin
    perform custom.record_write(v_org, v_req, jsonb_build_object(
      'unit', 'Pacific Terrace 208', 'tenant_phone', '562-555-0834', 'category', 'Plumbing',
      'priority', 'Routine', 'what_is_wrong', 'Leak'));
    raise exception '3a: "Leak" (4 characters) was accepted where at least 20 are needed';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is distinct from 'What is wrong has to be at least 20 characters long' then
    raise exception '3a: refused as "%"', v_msg;
  end if;
  perform custom.record_write(v_org, v_req, jsonb_build_object(
    'unit', 'Pacific Terrace 208', 'tenant_phone', '562-555-0834', 'category', 'Plumbing',
    'priority', 'Routine', 'what_is_wrong', 'Kitchen sink drips under the cabinet'));
  perform custom.record_write(v_org, v_req, jsonb_build_object(
    'unit', 'Harbor View 5C', 'tenant_phone', '562-555-0901', 'category', 'Appliance',
    'priority', 'Routine', 'what_is_wrong', ''));
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.field_update(v_org, f_what, jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'kind', 'length', 'min', 600, 'value', 500))));
    raise exception '3b: a shortest of 600 and a longest of 500 were stored';
  exception when check_violation then null;
  end;
  begin
    perform custom.field_update(v_org, f_phone, jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'kind', 'pattern', 'value', '^[0-9]{3}-[0-9]{3}-[0-9]{4}$', 'min', 12))));
    raise exception '3c: a shortest length on a pattern rule was stored';
  exception when check_violation then null;
  end;
  raise notice '3 PASS — "Leak" refused ("What is wrong has to be at least 20 characters long"), a full sentence saved, a blank saved, impossible lengths refused.';

  raise notice 'STORE-RULE-GAPS GREEN — every part passed.';
end $t$;
rollback;
