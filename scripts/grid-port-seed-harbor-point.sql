-- GRID-PORT — the Harbor Point use case (GRIDPRIM G8's suite, gridprim_g8_green.sql) as a
-- PERSISTENT fixture for the headless walk of "When a row changes, run an agent…".
--
-- DEV CLONE ONLY. The first statement refuses anything but the clone's quarantine facts
-- (pg_net absent, no active pg_cron job — never true of production). Idempotent: an existing
-- Harbor Point organization with this slug is left exactly as it is. The G8 suite rolls its
-- own fixture back, so a browser has nothing to open without this.
--
-- Harbor Point Plumbing & Drain (Tacoma, WA): admin@admin.com is the office manager (owner),
-- test@test.com is Sam, a technician (member, editor by the org's default). Service calls
-- carry a Status the invoice agent listens for; CALL-2291 is on site at the Morales residence.
do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_sam   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_slug  constant text := 'harbor-point-plumbing-gridport';
  v_org   uuid;
  v_home  uuid;
  v_calls uuid;
begin
  if exists (select 1 from pg_extension where extname = 'pg_net')
     or exists (select 1 from pg_extension where extname = 'pg_cron')
        and exists (select 1 from cron.job where active) then
    raise exception 'grid-port-seed-harbor-point: this is not the dev clone (pg_net or an active pg_cron job is present). Nothing was written.';
  end if;
  if exists (select 1 from iam.organizations where slug = c_slug) then
    raise notice 'Harbor Point is already seeded; nothing written.';
    return;
  end if;
  perform set_config('app.actor_system', 'grid-port/seed-harbor-point', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  v_org := gen_random_uuid();
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Plumbing & Drain', c_slug, 'HPP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
    (v_org, 'organization', v_org, c_sam, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'grid-port seed'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'grid-port seed: technicians close their own calls');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_calls := custom.table_declare(v_org, jsonb_build_object('name', 'Service calls', 'slug', 'service_calls', 'type', 'entity',
    'label_singular', 'Service call', 'label_plural', 'Service calls', 'title_field', 'call_number', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'call_number', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'call_number'))));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'call_number', 'label', 'Call', 'type', 'text', 'required', true, 'sort', 10));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'customer', 'label', 'Customer', 'type', 'text', 'sort', 20));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 30,
    'options', jsonb_build_array('Scheduled', 'En route', 'On site', 'Complete', 'Invoiced')));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'labor_hours', 'label', 'Labor hours', 'type', 'number', 'sort', 40));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'tech_notes', 'label', 'Technician notes', 'type', 'long_text', 'sort', 50));
  perform custom.record_write(v_org, v_calls, jsonb_build_object('call_number', 'CALL-2291', 'customer', 'Morales residence, 4418 N Pearl St',
    'status', 'On site', 'labor_hours', 2.5, 'tech_notes', 'Water heater T&P valve replaced'));
  perform custom.record_write(v_org, v_calls, jsonb_build_object('call_number', 'CALL-2292', 'customer', 'Bayview Dental, 1102 S 11th St',
    'status', 'En route', 'labor_hours', 1));
  raise notice 'Harbor Point seeded: organization %, Service calls %', v_org, v_calls;
end
$$;
