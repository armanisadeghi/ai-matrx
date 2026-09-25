-- LANE S6 — THE GREEN SUITE. A client portal carries the business's own look, several forms, and
-- a status line per job — and every one of those is answered to the client through the portal's
-- own reach, never through the owner's. Proved end to end in one transaction that ends in
-- ROLLBACK.
--
-- THE REAL USE CASE (owner law 2026-09-21, no fake test data):
--   Harbor Point Plumbing & Drain services apartment buildings and HOAs for property managers.
--   Each manager gets a portal, "Your service calls": Harbor Point's logo and blue on the sign-in
--   page she opens from a text message, three ways to ask for something ("Request a service
--   call", "Update a gate code", "Report an emergency"), and each of her building's calls with
--   where it stands — Requested → Scheduled → On site → Done. Bayview Terrace HOA's manager
--   (synthesized principal "Ada") has three calls; Mesa Verde Apartments' manager ("Bruno") has
--   two. The office's own crew-hours form and its private notes never reach either of them.
--   Every business, person, street and amount below is synthesized. Nobody in it is real.
--
-- RUN IT (clone):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/uichamp_s6_green.sql
--
-- ITS RED: the same file, run before uichamp_s6_a_portal_carries_its_look_and_its_forms.sql (or
-- after its inverse), fails at PART 0 naming the missing door; run with the doors but WITHOUT the
-- chair-step grant it fails at PART 0 naming the grant. The grant is judged BEFORE the fixture on
-- purpose: nothing below re-opens a door, but a suite that did would hide a missing grant.
--
-- THE SEATS. Every asserted clause runs as `authenticated` with a person's own claims:
--   owner      admin@admin.com   (owner of Harbor Point; declares the portals)
--   Ada        a synthesized external principal — Bayview Terrace HOA's manager
--   Bruno      a synthesized external principal — Mesa Verde Apartments' manager
--   stranger   a signed-in account in no Harbor Point organization and on no portal
-- The only steps that leave the seat are the organization, its membership, the knob, the Home
-- record and three rows of files.files (the logo candidates), and they assert nothing while out.

\set ON_ERROR_STOP on
\timing off

\set suite 'uichamp_s6_green.sql'
\set requires 'function:custom.portal_invite|function:custom.pipeline_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin      constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_ada        constant uuid := '6ce17b70-0792-44a1-8dca-52ec42fc76dc';   -- synthesized principal
  c_bruno      constant uuid := '3b6cd2e6-bc7e-4ac2-910b-0676cf3a66c9';   -- synthesized principal
  c_admin_j    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_ada_j      constant text := '{"sub":"6ce17b70-0792-44a1-8dca-52ec42fc76dc","role":"authenticated"}';
  c_bruno_j    constant text := '{"sub":"3b6cd2e6-bc7e-4ac2-910b-0676cf3a66c9","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_boss       text := current_user;
  v_org        uuid := gen_random_uuid();
  v_other_org  uuid;
  v_home       uuid;
  v_managers   uuid;
  v_calls      uuid;
  v_invoices   uuid;
  v_hours      uuid;
  v_bayview    uuid;
  v_mesa       uuid;
  v_call_a1    uuid;
  v_call_a2    uuid;
  v_f_request  uuid;
  v_f_gate     uuid;
  v_f_emerg    uuid;
  v_f_hours    uuid;
  v_f_crew     uuid;
  v_logo       uuid := gen_random_uuid();
  v_private    uuid := gen_random_uuid();
  v_foreign    uuid := gen_random_uuid();
  v_portal     uuid;
  v_portal_b   uuid;
  v_tables     jsonb;
  v_config     jsonb;
  v_card       jsonb;
  v_me         jsonb;
  v_p          jsonb;
  v_t          jsonb;
  v_form       jsonb;
  v_ans        jsonb;
  v_ans2       jsonb;
  v_hist       jsonb;
  v_n          integer;
  v_txt        text;
  v_state      text;
  v_msg        text;
  v_caught     boolean;
begin
  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE DOORS EXIST AND A SIGNED-IN PERSON MAY CALL THEM. Judged first.
  -- ════════════════════════════════════════════════════════════════════════════
  if to_regprocedure('custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text, jsonb)') is null then
    raise exception '0a: custom.portal_declare takes no p_config — a portal cannot carry its look or its forms';
  end if;
  if to_regprocedure('custom.portal_form(uuid, uuid, uuid)') is null
     or to_regprocedure('custom.portal_form_submit(uuid, uuid, uuid, jsonb, text)') is null then
    raise exception '0a: custom.portal_form / custom.portal_form_submit do not exist — a client cannot open or send a portal form';
  end if;
  if not has_function_privilege('authenticated', 'custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text, jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'custom.portal_form(uuid, uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'custom.portal_form_submit(uuid, uuid, uuid, jsonb, text)', 'execute') then
    raise exception '0b: a signed-in person is refused EXECUTE on a portal door — the chair-step grant file has not run';
  end if;
  if has_function_privilege('anon', 'custom.portal_form(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'custom.portal_form_submit(uuid, uuid, uuid, jsonb, text)', 'execute') then
    raise exception '0c: an anonymous caller may call a portal form door';
  end if;
  raise notice 'PART 0 PASSED — portal_declare takes p_config; portal_form and portal_form_submit exist; signed-in people hold EXECUTE, anon does not.';

  -- ── the organization, and the logo candidates (out of the seat; asserts nothing) ──
  perform set_config('app.actor_system', 'campaign-test/uichamp_s6_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Plumbing & Drain',
          'harbor-point-s6-' || substr(v_org::text, 1, 8), 'HPD', c_admin);  -- matrx-real-data:allow HPD is Harbor Point (Plumbing &) Drain's own initials
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'uichamp_s6_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Harbor Point')) returning id into v_home;
  select o.id into v_other_org from iam.organizations o
   where o.id <> v_org and not o.is_personal and o.archived_at is null order by o.created_at limit 1;
  -- Three pictures: Harbor Point's public logo, a private photo of a job, and another company's
  -- public picture. Only the first may ever be this portal's logo.
  insert into files.files (id, created_by, file_path, file_name, mime_type, visibility, organization_id, storage_uri, checksum)
  values (v_logo, c_admin, 'Shared Assets/logos/harbor-point-logo.png', 'harbor-point-logo.png', 'image/png', 'public',
          v_org, 's3://cdn.matrxserver.com/' || c_admin || '/' || v_logo, 'a1b2c3d4e5f6a7b8'),
         (v_private, c_admin, 'Jobs/bayview-boiler-room.jpg', 'bayview-boiler-room.jpg', 'image/jpeg', 'internal',
          v_org, 's3://matrx-user-files/' || c_admin || '/' || v_private, null),
         (v_foreign, c_admin, 'Shared Assets/logos/someone-else.png', 'someone-else.png', 'image/png', 'public',
          v_other_org, 's3://cdn.matrxserver.com/' || c_admin || '/' || v_foreign, null);

  -- ── take the seat ─────────────────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0d: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0d: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  -- ════════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE, AS THE OWNER: managers, service calls on a board, invoices, crew hours, forms.
  -- ════════════════════════════════════════════════════════════════════════════
  v_managers := custom.table_declare(v_org, jsonb_build_object(
    'name','Property managers','slug','property_managers_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Property manager','label_plural','Property managers','title_field','building','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','building')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_managers, jsonb_build_object('key','building','label','Building','plain','text','sort',10));
  perform custom.field_declare(v_org, v_managers, jsonb_build_object('key','manager_email','label','Manager email','plain','text','sort',20));

  v_calls := custom.table_declare(v_org, jsonb_build_object(
    'name','Service calls','slug','service_calls_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Service call','label_plural','Service calls','title_field','problem','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','problem')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key','problem','label','What is wrong','plain','text','sort',10));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key','unit','label','Unit','plain','text','sort',20));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key','gate_code','label','Gate code','plain','text','sort',30));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key','internal_notes','label','Office notes','plain','text','sort',90));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object(
    'key','building','label','Building','type','relation','relation_target', v_managers));
  perform custom.pipeline_declare(v_org, v_calls, jsonb_build_object(
    'stage_field', jsonb_build_object('key','call_stage','label','Status',
       'options', jsonb_build_array('Requested','Scheduled','On site','Done'))));

  v_invoices := custom.table_declare(v_org, jsonb_build_object(
    'name','Invoices','slug','invoices_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Invoice','label_plural','Invoices','title_field','number','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','number')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('key','number','label','Invoice','plain','text','sort',10));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('key','total','label','Total','plain','text','sort',20));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object(
    'key','building','label','Building','type','relation','relation_target', v_managers));

  v_hours := custom.table_declare(v_org, jsonb_build_object(
    'name','Crew hours','slug','crew_hours_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Crew hours entry','label_plural','Crew hours','title_field','tech','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','tech')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_hours, jsonb_build_object('key','tech','label','Technician','plain','text','sort',10));
  perform custom.field_declare(v_org, v_hours, jsonb_build_object('key','hours','label','Hours','plain','text','sort',20));

  v_bayview := custom.record_write(v_org, v_managers, jsonb_build_object(
    'building','Bayview Terrace HOA','manager_email','ada.client@ridgelinept.test'));
  v_mesa := custom.record_write(v_org, v_managers, jsonb_build_object(
    'building','Mesa Verde Apartments','manager_email','bruno.client@ridgelinept.test'));

  v_call_a1 := custom.record_write(v_org, v_calls, jsonb_build_object(
    'problem','Boiler room floor drain backing up','unit','Building C basement','gate_code','4417',
    'internal_notes','Bill to the HOA reserve account','call_stage','Requested','building', v_bayview::text));
  v_call_a2 := custom.record_write(v_org, v_calls, jsonb_build_object(
    'problem','Leaking shutoff valve at the pool shower','unit','Pool house','call_stage','Requested',
    'building', v_bayview::text));
  perform custom.record_write(v_org, v_calls, jsonb_build_object(
    'problem','Slow drain in unit 12 kitchen','unit','Unit 12','call_stage','Done','building', v_bayview::text));
  perform custom.record_write(v_org, v_calls, jsonb_build_object(
    'problem','Water heater pilot out','unit','Unit 3B','call_stage','Scheduled','building', v_mesa::text));
  perform custom.record_write(v_org, v_calls, jsonb_build_object(
    'problem','Sewer smell in the lobby','unit','Lobby','call_stage','Requested','building', v_mesa::text));
  -- The boiler-room call moves along the board, and the office writes a private note on the way.
  perform custom.record_update(v_org, v_call_a1, jsonb_build_object('call_stage','Scheduled'), null);
  perform custom.record_update(v_org, v_call_a1, jsonb_build_object('internal_notes','Tech: Luis. Parts: 2in check valve'), null);
  perform custom.record_update(v_org, v_call_a1, jsonb_build_object('call_stage','On site'), null);
  perform custom.record_write(v_org, v_invoices, jsonb_build_object(
    'number','HPD-2026-0931','total','$486.00','building', v_bayview::text));  -- matrx-real-data:allow invoice number of the synthesized company

  v_f_request := custom.form_declare(v_org, v_calls, 'Request a service call', jsonb_build_array(
    jsonb_build_object('field','problem','ask','What is wrong?','required',true),
    jsonb_build_object('field','unit','ask','Which unit or area?','required',true),
    jsonb_build_object('field','gate_code','ask','Gate or lockbox code, if any')));
  v_f_gate := custom.form_declare(v_org, v_calls, 'Update a gate code', jsonb_build_array(
    jsonb_build_object('field','unit','ask','Which gate?','required',true),
    jsonb_build_object('field','gate_code','ask','The new code','required',true)));
  v_f_emerg := custom.form_declare(v_org, v_calls, 'Report an emergency', jsonb_build_array(
    jsonb_build_object('field','problem','ask','What is happening right now?','required',true)));
  v_f_hours := custom.form_declare(v_org, v_hours, 'Log crew hours', jsonb_build_array(
    jsonb_build_object('field','tech','ask','Technician','required',true),
    jsonb_build_object('field','hours','ask','Hours','required',true)));
  v_f_crew := custom.capture_sheet_declare(v_org, v_calls, 'Crew sheet — end of day',
    jsonb_build_array(jsonb_build_object('field','unit','ask','Which unit did you finish?')),
    '{}'::jsonb, null, null);

  v_tables := jsonb_build_array(
    jsonb_build_object('table_id', v_calls, 'names_via', 'building',
      'visible_fields', jsonb_build_array('problem','unit','gate_code','call_stage'),
      'editable_fields', '[]'::jsonb, 'comments', true),
    jsonb_build_object('table_id', v_invoices, 'names_via', 'building',
      'visible_fields', jsonb_build_array('number','total'), 'editable_fields', '[]'::jsonb));
  v_config := jsonb_build_object(
    'style', jsonb_build_object(
      'display_name', 'Harbor Point Plumbing',
      'welcome', 'Your buildings'' service calls, gate codes and invoices, in one place.',
      'logo_file_id', v_logo,
      'accent', 'blue',
      'footer_links', jsonb_build_array(
        jsonb_build_object('label','Call dispatch','url','tel:+1 760-555-0142'),
        jsonb_build_object('label','Email the office','url','mailto:office@harborpoint-plumbing.test'))),
    'forms', jsonb_build_array(
      jsonb_build_object('form_id', v_f_request, 'order', 1),
      jsonb_build_object('form_id', v_f_gate, 'label', 'Update a gate code', 'order', 2),
      jsonb_build_object('form_id', v_f_emerg, 'order', 3)));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE OWNER GIVES THE PORTAL ITS LOOK AND THREE FORMS, THROUGH portal_declare.
  -- ════════════════════════════════════════════════════════════════════════════
  v_portal := custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, null, null, 'magic_link', v_config);
  v_card := custom.portal_card(v_org, v_portal);
  if (v_card -> 'style' ->> 'display_name') <> 'Harbor Point Plumbing'
     or (v_card -> 'style' ->> 'accent') <> 'blue'
     or (v_card -> 'style' ->> 'logo_url') <> 'https://cdn.matrxserver.com/' || c_admin || '/' || v_logo || '?v=a1b2c3d4'
     or jsonb_array_length(v_card -> 'style' -> 'footer_links') <> 2 then
    raise exception '1a: the card does not carry the look the owner gave it: %', v_card -> 'style';
  end if;
  if jsonb_array_length(v_card -> 'forms') <> 3
     or (v_card -> 'forms' -> 0 ->> 'form_id')::uuid <> v_f_request
     or (v_card -> 'forms' -> 1 ->> 'label') <> 'Update a gate code'
     or (v_card -> 'forms' -> 2 ->> 'title') <> 'Report an emergency'
     or (v_card -> 'forms' -> 0 ->> 'table') <> 'Service calls'
     or (v_card -> 'forms' -> 0 ->> 'state') <> 'open' then
    raise exception '1b: the card does not list the three forms in the owner''s order: %', v_card -> 'forms';
  end if;
  if not (v_card -> 'accents') ? 'teal' or jsonb_array_length(v_card -> 'accents') <> 7 then
    raise exception '1c: the card does not offer the design system''s seven accent names: %', v_card -> 'accents';
  end if;
  -- The builder's logo choices are the organization's own PUBLIC pictures, and nothing else.
  if not exists (select 1 from jsonb_array_elements(v_card -> 'logo_candidates') c where (c ->> 'file_id')::uuid = v_logo)
     or exists (select 1 from jsonb_array_elements(v_card -> 'logo_candidates') c
                 where (c ->> 'file_id')::uuid in (v_private, v_foreign)) then
    raise exception '1c2: the logo choices are not exactly this organization''s public pictures: %', v_card -> 'logo_candidates';
  end if;
  -- Re-stating with no p_config (every caller before S6) keeps the look and the forms.
  perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal);
  v_card := custom.portal_card(v_org, v_portal);
  if (v_card -> 'style' ->> 'display_name') is distinct from 'Harbor Point Plumbing'
     or jsonb_array_length(v_card -> 'forms') <> 3 then
    raise exception '1d: re-stating a portal without p_config lost its look or its forms: %', v_card -> 'config';
  end if;
  -- Giving only the forms keeps the look (a key not given is kept).
  perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
            jsonb_build_object('forms', v_config -> 'forms'));
  v_card := custom.portal_card(v_org, v_portal);
  if (v_card -> 'style' ->> 'accent') is distinct from 'blue' then
    raise exception '1e: sending only forms dropped the portal''s look: %', v_card -> 'config';
  end if;
  raise notice 'PART 1 PASSED — the card carries the name, welcome, logo address, blue accent, two footer links and three forms in order; the logo choices are its public pictures only; re-stating without p_config, or with forms only, keeps the look.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — WHAT THE STORE REFUSES, EACH BY NAME, AND NOTHING IS WRITTEN.
  -- ════════════════════════════════════════════════════════════════════════════
  -- A form whose answers land in a table the portal does not show.
  begin
    perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
      jsonb_build_object('forms', (v_config -> 'forms') || jsonb_build_array(jsonb_build_object('form_id', v_f_hours))));
    raise exception '2a: a form on an unexposed table (Crew hours) was accepted onto the portal';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%Log crew hours%Crew hours%does not show that table%' then
      raise exception '2a: refused, but not in the words that name the form and the table: %', v_msg;
    end if;
  end;
  -- A crew form.
  begin
    perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
      jsonb_build_object('forms', jsonb_build_array(jsonb_build_object('form_id', v_f_crew))));
    raise exception '2b: a crew form was accepted onto a client portal';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%crew form%' then raise exception '2b: refused, but not as a crew form: %', v_msg; end if;
  end;
  -- A private picture as the logo.
  begin
    perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
      jsonb_build_object('style', jsonb_build_object('logo_file_id', v_private)));
    raise exception '2c: a private picture was accepted as the logo an outsider is shown';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%private to your organization%' then raise exception '2c: refused, but not as private: %', v_msg; end if;
  end;
  -- Another organization's public picture answers exactly as one that does not exist.
  begin
    perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
      jsonb_build_object('style', jsonb_build_object('logo_file_id', v_foreign)));
    raise exception '2d: another organization''s picture was accepted as this portal''s logo';
  exception when sqlstate '02000' then
    get stacked diagnostics v_msg = message_text;
    begin
      perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
        jsonb_build_object('style', jsonb_build_object('logo_file_id', gen_random_uuid())));
    exception when sqlstate '02000' then
      get stacked diagnostics v_txt = message_text;
    end;
    if v_msg is distinct from v_txt then
      raise exception '2d: a foreign file and an invented one answer differently ("%" vs "%")', v_msg, v_txt;
    end if;
  end;
  -- A colour that is not one of the design system's names.
  begin
    perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
      jsonb_build_object('style', jsonb_build_object('accent', '#0b2545')));
    raise exception '2e: a raw hex accent was accepted';
  exception when invalid_parameter_value then null;
  end;
  -- A key nobody declared, and a footer link that is not https, mailto or tel.
  begin
    perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
      jsonb_build_object('theme', 'dark'));
    raise exception '2f: an undeclared settings key was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
      jsonb_build_object('style', jsonb_build_object('footer_links',
        jsonb_build_array(jsonb_build_object('label','Pay','url','javascript:alert(1)')))));
    raise exception '2g: a javascript: footer link was accepted';
  exception when invalid_parameter_value then null;
  end;
  -- Taking Service calls off the portal while its forms are still on it.
  begin
    perform custom.portal_declare(v_org, 'Your service calls', v_managers,
      jsonb_build_array(v_tables -> 1), v_portal);
    raise exception '2h: a table was taken off the portal and took three forms with it in silence';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%Request a service call%Service calls%' then raise exception '2h: refused, but not naming the form: %', v_msg; end if;
  end;
  v_card := custom.portal_card(v_org, v_portal);
  if jsonb_array_length(v_card -> 'forms') <> 3 or (v_card -> 'style' ->> 'accent') <> 'blue'
     or jsonb_array_length(v_card -> 'tables') <> 2 then
    raise exception '2i: a refused declaration still wrote something: %', v_card;
  end if;
  raise notice 'PART 2 PASSED — refused by name: a form on an unexposed table, a crew form, a private logo, another company''s logo (same words as an invented id), a hex colour, an undeclared key, a javascript: link, a table taken off with its forms; nothing was written.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — A NEW PORTAL IS NEVER BLANK: THE ORGANIZATION'S BRAND IS THE DEFAULT.
  -- ════════════════════════════════════════════════════════════════════════════
  v_portal_b := custom.portal_declare(v_org, 'Invoices for board members', v_managers,
                  jsonb_build_array(v_tables -> 1), null, 'harbor-point-s6-board-' || substr(v_org::text, 1, 8));
  v_card := custom.portal_card(v_org, v_portal_b);
  if (v_card -> 'style' ->> 'display_name') <> 'Harbor Point Plumbing & Drain'
     or not ((v_card -> 'style' -> 'from_organization') ? 'display_name')
     or (v_card -> 'style' ->> 'accent') is not null
     or jsonb_array_length(v_card -> 'forms') <> 0 then
    raise exception '3a: a portal with no look of its own does not fall back to the organization''s: %', v_card -> 'style';
  end if;
  -- Clearing the look puts the organization's brand back.
  perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link',
            jsonb_build_object('style', null));
  v_card := custom.portal_card(v_org, v_portal);
  if (v_card -> 'style' ->> 'display_name') <> 'Harbor Point Plumbing & Drain' or (v_card -> 'style' ->> 'logo_url') is not null then
    raise exception '3b: clearing the look did not put the organization''s brand back: %', v_card -> 'style';
  end if;
  perform custom.portal_declare(v_org, 'Your service calls', v_managers, v_tables, v_portal, null, 'magic_link', v_config);
  raise notice 'PART 3 PASSED — a portal with no look shows the organization''s name and says so; clearing a look restores it.';

  -- ── the two managers are invited and bound (the owner's act) ──────────────────
  perform custom.portal_invite(v_org, v_portal, v_bayview, 'ada.client@ridgelinept.test', c_ada);
  perform custom.portal_invite(v_org, v_portal, v_mesa, 'bruno.client@ridgelinept.test', c_bruno);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — ADA, BAYVIEW TERRACE'S MANAGER: HER OWN READ CARRIES THE LOOK, THE FORMS, THE STAGES.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_ada_j, true);
  v_me := custom.portal_me();
  select p into v_p from jsonb_array_elements(v_me -> 'portals') p where (p ->> 'portal_id')::uuid = v_portal;
  if v_p is null then raise exception '4a: portal_me does not name the portal she was invited to'; end if;
  if (v_p -> 'style' ->> 'display_name') <> 'Harbor Point Plumbing'
     or (v_p -> 'style' ->> 'logo_url') not like 'https://cdn.matrxserver.com/%' || v_logo || '?v=a1b2c3d4'
     or (v_p -> 'style' ->> 'welcome') not like 'Your buildings%' then
    raise exception '4b: her portal does not carry the owner''s look: %', v_p -> 'style';
  end if;
  if jsonb_array_length(v_p -> 'forms') <> 3 or (v_p -> 'forms' -> 2 ->> 'label') <> 'Report an emergency' then
    raise exception '4c: her portal does not list the three open forms in order: %', v_p -> 'forms';
  end if;
  select t into v_t from jsonb_array_elements(v_p -> 'tables') t where (t ->> 'table_id')::uuid = v_calls;
  if (v_t -> 'stage' ->> 'field') <> 'call_stage' or (v_t -> 'stage' ->> 'label') <> 'Status'
     or (select string_agg(s ->> 'label', ' > ' order by o) from jsonb_array_elements(v_t -> 'stage' -> 'stages') with ordinality x(s, o))
        <> 'Requested > Scheduled > On site > Done'
     or (select string_agg(s ->> 'key', ' > ' order by o) from jsonb_array_elements(v_t -> 'stage' -> 'stages') with ordinality x(s, o))
        <> 'requested > scheduled > on_site > done' then
    raise exception '4d: Service calls does not carry its stages in the declared order: %', v_t -> 'stage';
  end if;
  select t into v_t from jsonb_array_elements(v_p -> 'tables') t where (t ->> 'table_id')::uuid = v_invoices;
  if v_t -> 'stage' is not null and jsonb_typeof(v_t -> 'stage') <> 'null' then
    raise exception '4e: Invoices has no stage, yet one was named: %', v_t -> 'stage';
  end if;

  -- Each Table names the Field that says whose a record is, so a screen can keep her list to her
  -- own client even when she can read more (an employee who is also a client).
  select t into v_t from jsonb_array_elements(v_p -> 'tables') t where (t ->> 'table_id')::uuid = v_calls;
  if (v_t ->> 'names_via') is distinct from 'building' then
    raise exception '4e2: portal_me does not say which Field names her client on Service calls: %', v_t;
  end if;

  -- THE TIMELINE, THROUGH THE EXISTING HISTORY DOOR, AS HER.
  select jsonb_agg(jsonb_build_object('op', h.operation, 'changes', h.changes) order by h.version)
    into v_hist from custom.record_history(v_org, v_call_a1, 50, 0) h;
  select string_agg(coalesce(c ->> 'after', c -> 'after' ->> 'value', ''), ' > ' order by h.ord)
    into v_txt
    from jsonb_array_elements(v_hist) with ordinality h(e, ord),
         jsonb_array_elements(h.e -> 'changes') c
   where c ->> 'key' = 'call_stage';
  -- The store keeps a choice as its option KEY; the stages above carry key and label both, which
  -- is what the timeline draws from.
  if v_txt is distinct from 'requested > scheduled > on_site' then
    raise exception '4f: her boiler-room call''s history does not read requested > scheduled > on_site (read "%"): %', v_txt, v_hist;
  end if;
  if exists (select 1 from jsonb_array_elements(v_hist) h(e), jsonb_array_elements(h.e -> 'changes') c
              where c ->> 'key' = 'internal_notes' and (c ? 'after' or c ? 'before')) then
    raise exception '4g: the office''s private note reached her through the history door: %', v_hist;
  end if;
  raise notice 'PART 4 PASSED — portal_me carries the look (name, welcome, logo address), three open forms in order, Service calls'' four stages in order and none for Invoices; her call''s history reads requested > scheduled > on_site (the stage keys) and withholds the office note.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — SHE OPENS A FORM AND SENDS IT; IT LANDS AS HERS.
  -- ════════════════════════════════════════════════════════════════════════════
  v_form := custom.portal_form(v_org, v_portal, v_f_request);
  if (v_form ->> 'title') <> 'Request a service call'
     or exists (select 1 from jsonb_array_elements(v_form -> 'fields') f where f ->> 'key' = 'building')
     or (select count(*) from jsonb_array_elements(v_form -> 'fields')) <> 3
     or (v_form ->> 'state') <> 'open' then
    raise exception '5a: the form she opened is not the three questions without the building field: %', v_form;
  end if;
  v_ans := custom.portal_form_submit(v_org, v_portal, v_f_request,
             jsonb_build_object('problem','Garage gate motor grinding and stalling half open',
                                'unit','Garage entrance','gate_code','8812'), 's6-green-ada-1');
  if (v_ans ->> 'state') <> 'accepted' or (v_ans ->> 'record_id') is null then
    raise exception '5b: her request did not land: %', v_ans;
  end if;
  select count(*) into v_n from custom.read_records(v_org, v_calls, true, 200, 0);
  if v_n <> 4 then raise exception '5c: after sending, she sees % service calls, expected 4 (her three and the new one)', v_n; end if;
  if not exists (select 1 from custom.read_records(v_org, v_calls, false, 200, 0) r
                  where r.id = (v_ans ->> 'record_id')::uuid
                    and r.document ->> 'problem' like 'Garage gate motor%') then
    raise exception '5d: the request she just sent (%) is not in her own list: %', v_ans,
      (select jsonb_agg(jsonb_build_object('id', r.id, 'doc', r.document)) from custom.read_records(v_org, v_calls, false, 200, 0) r);
  end if;
  -- A replay is the same answer and no second record.
  v_ans2 := custom.portal_form_submit(v_org, v_portal, v_f_request,
             jsonb_build_object('problem','Garage gate motor grinding and stalling half open',
                                'unit','Garage entrance','gate_code','8812'), 's6-green-ada-1');
  if (v_ans2 ->> 'submission_id') <> (v_ans ->> 'submission_id') then
    raise exception '5e: a replay made a second submission: % vs %', v_ans, v_ans2;
  end if;
  -- She may not say which client it is for.
  begin
    perform custom.portal_form_submit(v_org, v_portal, v_f_gate,
      jsonb_build_object('unit','Main gate','gate_code','2290','building', v_mesa::text), null);
    raise exception '5f: she filled the client field herself and pointed it at another building';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%decided by the portal%' then raise exception '5f: refused, but not in the portal''s words: %', v_msg; end if;
  end;
  begin
    perform custom.portal_form_submit(v_org, v_portal, v_f_gate,
      jsonb_build_object('unit','Main gate','gate_code','2290','internal_notes','free parts'), null);
    raise exception '5g: a key the form does not ask for was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.portal_form_submit(v_org, v_portal, v_f_gate, jsonb_build_object('unit','Main gate'), null);
    raise exception '5h: a form missing its required code was accepted';
  exception when null_value_not_allowed then null;
  end;
  begin
    perform custom.portal_form(v_org, v_portal, v_f_hours);
    raise exception '5i: she opened the office''s crew-hours form';
  exception when sqlstate '02000' then null;
  end;
  raise notice 'PART 5 PASSED — the form opens without the building field; her request lands and appears in her own list (4 calls); a replay is the same submission; filling the client field, an undeclared key and a missing required answer are refused; the crew-hours form is not hers.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — BRUNO, MESA VERDE: HIS OWN, AND NONE OF HERS.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_bruno_j, true);
  select count(*) into v_n from custom.read_records(v_org, v_calls, true, 200, 0);
  if v_n <> 2 then raise exception '6a: Bruno sees % service calls, expected his own 2 (Ada''s new request must not reach him)', v_n; end if;
  begin
    perform custom.portal_form(v_org, v_portal_b, v_f_request);
    raise exception '6b: Bruno opened a form on a portal he is not on';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.record_history(v_org, v_call_a1, 50, 0);
    raise exception '6c: Bruno read the history of Ada''s call';
  exception when insufficient_privilege or sqlstate '02000' then null;
  end;
  raise notice 'PART 6 PASSED — Bruno sees his 2 calls, not Ada''s new one; a portal he is not on and Ada''s call history are refused.';

  -- ── 6d: THE STORE SWITCHED OFF, SAID TO HER IN HER WORDS ─────────────────────
  -- The office turns the record store off (out of the seat; asserts nothing while out). Ada's form
  -- doors refuse with the sentence her sign-in page shows — never the owner's "turn it back on" instructions
  -- addressed to her, and never a door's machine name.
  perform set_config('role', v_boss, true);
  update platform.knob_override set value = 'false'::jsonb
   where feature = 'custom' and key = 'system_enabled' and organization_id = v_org;
  v_txt := custom.store_off_sentence(v_org);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_ada_j, true);
  v_caught := false;
  begin
    perform custom.portal_form(v_org, v_portal, v_f_gate);
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    v_caught := true;
  end;
  if not v_caught or v_msg is distinct from v_txt
     or v_msg ~* 'custom\.|role that owns|not taking writes' then
    raise exception '6d: with the store off, her form door did not say so in her words: %', v_msg;
  end if;
  v_caught := false;
  begin
    perform custom.portal_form_submit(v_org, v_portal, v_f_gate, jsonb_build_object('unit','Side gate','gate_code','1190'), null);
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    v_caught := true;
  end;
  if not v_caught or v_msg ~* 'custom\.|role that owns|not taking writes' then
    raise exception '6d: with the store off, her send did not say so in her words: %', v_msg;
  end if;
  -- The READ doors her portal pages call ask `custom.assert_store_door` too; the class fix
  -- (uichamp_s6_a_client_hears_the_store_is_off_in_her_own_words.sql) makes every one of them
  -- tell a non-member the same sentence, and leaves a member's word for word.
  v_caught := false;
  begin
    perform custom.read_records(v_org, v_calls, false, 20, 0);
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    v_caught := true;
  end;
  if not v_caught or v_msg is distinct from v_txt then
    raise exception '6e: with the store off, her read door did not say so in her words: %', v_msg;
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_caught := false;
  begin
    perform custom.read_records(v_org, v_calls, false, 20, 0);
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    v_caught := true;
  end;
  if not v_caught or v_msg !~ 'has turned the record store off' then
    raise exception '6e: with the store off, the owner''s own refusal changed: %', v_msg;
  end if;
  perform set_config('role', v_boss, true);
  update platform.knob_override set value = 'true'::jsonb
   where feature = 'custom' and key = 'system_enabled' and organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  raise notice 'PART 6d PASSED — with the store off, both form doors and her read door refuse her with her sign-in page''s sentence; the owner still gets the owner''s.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 7 — A STRANGER, AND THE SIGN-IN PAGE.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.portal_form(v_org, v_portal, v_f_request);
    raise exception '7a: a stranger opened a portal form';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.portal_form_submit(v_org, v_portal, v_f_request, jsonb_build_object('problem','x','unit','y'), null);
    raise exception '7b: a stranger sent a portal form';
  exception when insufficient_privilege then null;
  end;
  -- The sign-in page is the server lane's read (custom.portal_public is granted to service_role).
  perform set_config('role', v_boss, true);
  v_p := custom.portal_public((select slug from custom.portal where id = v_portal));
  if (v_p -> 'style' ->> 'display_name') <> 'Harbor Point Plumbing'
     or (v_p -> 'style' ->> 'logo_url') is null or (v_p -> 'style' ->> 'accent') <> 'blue' then
    raise exception '7c: the sign-in page does not carry the portal''s look: %', v_p;
  end if;
  -- THE PAGE THAT CRASHED (2026-09-23, found by ACCESS-IS-PERSONAL on the clone): a portal with no
  -- look of its own, in an organization with no logo, is the branch where the store names what it
  -- took from the organization. The first cut of `_portal_style` appended to a text[] with `||`
  -- and an untyped literal, which Postgres reads as an ARRAY literal ("malformed array literal:
  -- display_name"), so every read door over such a portal — the sign-in page first — raised.
  -- Opened here through both doors the page calls, as the page calls them.
  v_p := custom.portal_public((select slug from custom.portal where id = v_portal_b));
  if v_p is null or (v_p ->> 'state') <> 'open'
     or (v_p -> 'style' ->> 'display_name') <> 'Harbor Point Plumbing & Drain'
     or not ((v_p -> 'style' -> 'from_organization') ? 'display_name')
     or (v_p -> 'style' ->> 'logo_url') is not null then
    raise exception '7d: the sign-in page of a portal with no look of its own does not open on the organization''s name: %', v_p;
  end if;
  perform custom.portal_invite(v_org, v_portal_b, v_mesa, 'bruno.client@ridgelinept.test', c_bruno);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_bruno_j, true);
  select p into v_p from jsonb_array_elements(custom.portal_me() -> 'portals') p
   where (p ->> 'portal_id')::uuid = v_portal_b;
  if v_p is null or (v_p -> 'style' ->> 'display_name') <> 'Harbor Point Plumbing & Drain'
     or jsonb_array_length(v_p -> 'forms') <> 0 then
    raise exception '7e: the signed-in read of a portal with no look of its own does not open: %', v_p;
  end if;
  perform set_config('role', v_boss, true);
  raise notice 'PART 7 PASSED — a stranger is refused both form doors; the sign-in page carries the name, logo and accent; a portal with no look of its own opens on the organization''s name through portal_public and portal_me.';

  raise notice 'ALL CLAUSES PASSED';
  -- SUITE-TAIL-3: this used to be `raise exception`, which aborted the do-block before the
  -- `rollback;` below could ever run — the script's actual rollback happened only on
  -- disconnect, and psql's exit code stayed non-zero (3) even on a full pass. `raise notice`
  -- lets the do-block finish normally so the explicit `rollback;` below does the work, with
  -- an honest exit code: 0 on a real pass, non-zero only when a clause actually raised above.
  raise notice 'TEARDOWN — this suite rolls back and leaves nothing';
end $t$;

rollback;
