-- LANE S6 — the DATA the outsider's portal walk opens, left COMMITTED on the dev clone.
--
-- Rincon Plumbing Co's Ventura Branch (a test organization on the clone, owned by admin@admin.com,
-- its office manager; test@test.com is NOT a member of it, so she walks as a real client) services apartment buildings and HOAs in Ventura
-- County for their property managers. Each manager gets one portal, "Your service calls": the
-- company's own name and blue, a welcome line, three ways to ask for something ("Request a
-- service call", "Update a gate code", "Report an emergency"), and each of her building's calls
-- with where it stands — Requested → Scheduled → On site → Done. test@test.com is Seaside Villas
-- HOA's manager; Mesa Verde Apartments' calls are somebody else's and must never reach her. The
-- office's crew-hours form and its private notes never reach any client.
-- Every business, person, street and number below is synthesized. The nightly clone refresh
-- restores production over all of it.
--
-- CLONE ONLY: `\set expect 'clone'` makes the preamble refuse the main database and the branch.
-- Prints `WALK <key> <value>` for every id the walk needs. Re-running makes a NEW portal and new
-- tables under a fresh suffix, so a walk never inherits an earlier walk's submissions.

\set ON_ERROR_STOP on
\timing off
\set suite '_s6_walk_fixture.sql'
\set expect 'clone'
\set requires 'function:custom.portal_form|function:custom.pipeline_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $w$
declare
  c_admin    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com, the office manager
  c_admin_j  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_test     constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com, Seaside Villas HOA's manager
  c_org      constant uuid := '20b9d1bb-ca75-42ea-827b-2500f48e82c2';   -- Rincon Plumbing Co — Ventura Branch
  v_boss     text := current_user;
  v_sfx      text := to_char(clock_timestamp(), 'MMDDHH24MISS');
  v_home     uuid;
  v_managers uuid;
  v_calls    uuid;
  v_invoices uuid;
  v_hours    uuid;
  v_seaside  uuid;
  v_mesa     uuid;
  v_c1       uuid;
  v_c2       uuid;
  v_f_req    uuid;
  v_f_gate   uuid;
  v_f_emerg  uuid;
  v_portal   uuid;
  v_slug     text;
begin
  if not exists (select 1 from iam.organizations where id = c_org and name = 'Rincon Plumbing Co — Ventura Branch') then
    raise exception 'the Rincon Plumbing Co — Ventura Branch test organization is not on this clone';
  end if;
  -- THE OUTSIDER'S SEAT IS AN OUTSIDER. test@test.com is a member of the main Rincon Plumbing Co
  -- organization, so a portal there would be read through the member lane; the Ventura branch is
  -- one she has no membership of, which is exactly a client's position.
  if exists (select 1 from iam.memberships where organization_id = c_org and user_id = c_test and status = 'active') then
    raise exception 'test@test.com is a member of the Ventura branch, so she would not be walking as an outsider';
  end if;
  perform set_config('app.actor_system', 'campaign-test/_s6_walk_fixture.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into custom.record (organization_id, table_id, data)
  values (c_org, null, jsonb_build_object('name', 'Property management clients ' || v_sfx)) returning id into v_home;

  perform set_config('role', 'authenticated', true);

  v_managers := custom.table_declare(c_org, jsonb_build_object(
    'name','Property managers','slug','property_managers_' || v_sfx,'type','entity',
    'label_singular','Property manager','label_plural','Property managers','title_field','building','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','building')), 'parent_id', v_home::text));
  perform custom.field_declare(c_org, v_managers, jsonb_build_object('key','building','label','Building','plain','text','sort',10));
  perform custom.field_declare(c_org, v_managers, jsonb_build_object('key','manager_email','label','Manager email','plain','text','sort',20));

  v_calls := custom.table_declare(c_org, jsonb_build_object(
    'name','Service calls','slug','service_calls_' || v_sfx,'type','entity',
    'label_singular','Service call','label_plural','Service calls','title_field','problem','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','problem')), 'parent_id', v_home::text));
  perform custom.field_declare(c_org, v_calls, jsonb_build_object('key','problem','label','What is wrong','plain','text','sort',10));
  perform custom.field_declare(c_org, v_calls, jsonb_build_object('key','unit','label','Unit or area','plain','text','sort',20));
  perform custom.field_declare(c_org, v_calls, jsonb_build_object('key','gate_code','label','Gate code','plain','text','sort',30));
  perform custom.field_declare(c_org, v_calls, jsonb_build_object('key','internal_notes','label','Office notes','plain','text','sort',90));
  perform custom.field_declare(c_org, v_calls, jsonb_build_object(
    'key','building','label','Building','type','relation','relation_target', v_managers));
  perform custom.pipeline_declare(c_org, v_calls, jsonb_build_object(
    'stage_field', jsonb_build_object('key','call_stage','label','Status',
       'options', jsonb_build_array('Requested','Scheduled','On site','Done'))));

  v_invoices := custom.table_declare(c_org, jsonb_build_object(
    'name','Invoices','slug','invoices_' || v_sfx,'type','entity',
    'label_singular','Invoice','label_plural','Invoices','title_field','number','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','number')), 'parent_id', v_home::text));
  perform custom.field_declare(c_org, v_invoices, jsonb_build_object('key','number','label','Invoice','plain','text','sort',10));
  perform custom.field_declare(c_org, v_invoices, jsonb_build_object('key','total','label','Total','plain','text','sort',20));
  perform custom.field_declare(c_org, v_invoices, jsonb_build_object(
    'key','building','label','Building','type','relation','relation_target', v_managers));

  v_hours := custom.table_declare(c_org, jsonb_build_object(
    'name','Crew hours','slug','crew_hours_' || v_sfx,'type','entity',
    'label_singular','Crew hours entry','label_plural','Crew hours','title_field','tech','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','tech')), 'parent_id', v_home::text));
  perform custom.field_declare(c_org, v_hours, jsonb_build_object('key','tech','label','Technician','plain','text','sort',10));
  perform custom.field_declare(c_org, v_hours, jsonb_build_object('key','hours','label','Hours','plain','text','sort',20));

  v_seaside := custom.record_write(c_org, v_managers, jsonb_build_object(
    'building','Seaside Villas HOA','manager_email','test@test.com'));
  v_mesa := custom.record_write(c_org, v_managers, jsonb_build_object(
    'building','Mesa Verde Apartments','manager_email','mesa.manager@rincon-clients.test'));

  v_c1 := custom.record_write(c_org, v_calls, jsonb_build_object(
    'problem','Boiler room floor drain backing up','unit','Building C basement','gate_code','4417',
    'internal_notes','Bill to the HOA reserve account','call_stage','Requested','building', v_seaside::text));
  v_c2 := custom.record_write(c_org, v_calls, jsonb_build_object(
    'problem','Leaking shutoff valve at the pool shower','unit','Pool house','call_stage','Requested',
    'building', v_seaside::text));
  perform custom.record_write(c_org, v_calls, jsonb_build_object(
    'problem','Slow kitchen drain in unit 12','unit','Unit 12','call_stage','Done','building', v_seaside::text));
  perform custom.record_write(c_org, v_calls, jsonb_build_object(
    'problem','Water heater pilot out','unit','Unit 3B','call_stage','Scheduled','building', v_mesa::text));
  perform custom.record_write(c_org, v_calls, jsonb_build_object(
    'problem','Sewer smell in the lobby','unit','Lobby','call_stage','Requested','building', v_mesa::text));
  -- The boiler-room call moves along the board; the office writes a private note on the way.
  perform custom.record_update(c_org, v_c1, jsonb_build_object('call_stage','Scheduled'), null);
  perform custom.record_update(c_org, v_c1, jsonb_build_object('internal_notes','Tech: Luis. Parts: 2in check valve'), null);
  perform custom.record_update(c_org, v_c1, jsonb_build_object('call_stage','On site'), null);
  perform custom.record_update(c_org, v_c2, jsonb_build_object('call_stage','Scheduled'), null);
  perform custom.record_write(c_org, v_invoices, jsonb_build_object(
    'number','RPC-2026-0931','total','$486.00','building', v_seaside::text));
  perform custom.record_write(c_org, v_invoices, jsonb_build_object(
    'number','RPC-2026-0944','total','$1,240.00','building', v_mesa::text));

  v_f_req := custom.form_declare(c_org, v_calls, 'Request a service call', jsonb_build_array(
    jsonb_build_object('field','problem','ask','What is wrong?','required',true),
    jsonb_build_object('field','unit','ask','Which unit or area?','required',true),
    jsonb_build_object('field','gate_code','ask','Gate or lockbox code, if any')));
  v_f_gate := custom.form_declare(c_org, v_calls, 'Update a gate code', jsonb_build_array(
    jsonb_build_object('field','unit','ask','Which gate?','required',true),
    jsonb_build_object('field','gate_code','ask','The new code','required',true)));
  v_f_emerg := custom.form_declare(c_org, v_calls, 'Report an emergency', jsonb_build_array(
    jsonb_build_object('field','problem','ask','What is happening right now?','required',true)));
  perform custom.form_declare(c_org, v_hours, 'Log crew hours', jsonb_build_array(
    jsonb_build_object('field','tech','ask','Technician','required',true),
    jsonb_build_object('field','hours','ask','Hours','required',true)));

  v_portal := custom.portal_declare(c_org, 'Your service calls', v_managers,
    jsonb_build_array(
      jsonb_build_object('table_id', v_calls, 'names_via', 'building',
        'visible_fields', jsonb_build_array('problem','unit','gate_code','call_stage'),
        'editable_fields', '[]'::jsonb, 'comments', true),
      jsonb_build_object('table_id', v_invoices, 'names_via', 'building',
        'visible_fields', jsonb_build_array('number','total'), 'editable_fields', '[]'::jsonb)),
    null, 'rincon-service-calls-' || v_sfx, 'magic_link',
    jsonb_build_object(
      'style', jsonb_build_object(
        'display_name', 'Rincon Plumbing',
        'welcome', 'Your buildings'' service calls, gate codes and invoices, in one place.',
        'accent', 'blue',
        'footer_links', jsonb_build_array(
          jsonb_build_object('label','Call dispatch','url','tel:+1 805 555 0142'),
          jsonb_build_object('label','Email the office','url','mailto:office@rincon-plumbing.test'))),
      'forms', jsonb_build_array(
        jsonb_build_object('form_id', v_f_req, 'order', 1),
        jsonb_build_object('form_id', v_f_gate, 'order', 2),
        jsonb_build_object('form_id', v_f_emerg, 'label', 'Report an emergency', 'order', 3))));
  perform custom.portal_invite(c_org, v_portal, v_seaside, 'test@test.com', c_test);

  perform set_config('role', v_boss, true);
  select slug into v_slug from custom.portal where id = v_portal;
  raise notice 'WALK org %', c_org;
  raise notice 'WALK portal %', v_portal;
  raise notice 'WALK slug %', v_slug;
  raise notice 'WALK calls %', v_calls;
  raise notice 'WALK boiler_call %', v_c1;
  raise notice 'WALK gate_form %', v_f_gate;
end;
$w$;

commit;
