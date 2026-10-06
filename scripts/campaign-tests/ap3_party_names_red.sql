-- AP3-PHASEB-PARTY-NAMES — RED probe (run 2026-10-06 BEFORE crm._party_name_key derived all
-- three names; ap3_party_names_green.sql is the identical probe run after).
-- Observed RED verdict: FAILING — A (first+last change) and B (first_name null) kept
-- "Emily Lewis" / "Lewis, Emily" / "emily lewis"; C kept sort_name "Lewis, Emily";
-- E (a create with no sort_name supplied) landed sort_name NULL.
--
-- AP3-PHASEB-PARTY-NAMES — forcing SQL (shared by red and green; the GREEN file is
-- this same probe). Each case runs in its own subtransaction that is rolled back by
-- design (raise P0099 → caught), so NOTHING persists. The final RAISE prints a JSON
-- verdict and rolls the whole DO back as well.
--
-- Writes go through the platform write door (platform.entity_update → custom.entity_row_write)
-- acting as admin@admin.com, on a Holloway Creative contact.
-- RED (before crm._party_name_key derives all three names): cases A/B fail because
-- display_name / sort_name / name_key stay stale when only name PARTS change.
-- GREEN: every case reports ok=true.
do $probe$
declare
  c_org    constant uuid := '344cfaa8-2b0c-4971-854a-9694614816f2'; -- Holloway Creative
  c_person constant uuid := '8aadc29b-bbb2-46ca-afb6-6bed87183958'; -- Emily Lewis
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd'; -- admin@admin.com
  v_out jsonb := '[]'::jsonb;
  v_r   record;
  v_org_party uuid;
  v_case jsonb;

begin
  -- helper: act as the admin through the door
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', c_admin, 'role', 'authenticated', 'email', 'admin@admin.com')::text, true);

  -- A. change first + last through the door → all three derived names follow.
  begin
    perform set_config('role', 'authenticated', true);
    perform platform.entity_update('party', c_person, null, '{"first_name":"Emma","last_name":"Lane"}'::jsonb);
    perform set_config('role', 'none', true);
    select display_name, sort_name, name_key into v_r from crm.party where id = c_person;
    raise exception using errcode = 'P0099', message = jsonb_build_object('case','A first+last change',
      'display_name', v_r.display_name, 'sort_name', v_r.sort_name, 'name_key', v_r.name_key,
      'ok', v_r.display_name = 'Emma Lane' and v_r.sort_name = 'Lane, Emma' and v_r.name_key = 'emma lane')::text;
  exception when sqlstate 'P0099' then v_out := v_out || sqlerrm::jsonb;
  end;

  -- B. first_name → null → the rule's answer from what is left ("Lewis").
  begin
    perform set_config('role', 'authenticated', true);
    perform platform.entity_update('party', c_person, null, '{"first_name":null}'::jsonb);
    perform set_config('role', 'none', true);
    select display_name, sort_name, name_key into v_r from crm.party where id = c_person;
    raise exception using errcode = 'P0099', message = jsonb_build_object('case','B first_name null',
      'display_name', v_r.display_name, 'sort_name', v_r.sort_name, 'name_key', v_r.name_key,
      'ok', v_r.display_name = 'Lewis' and v_r.sort_name = 'Lewis' and v_r.name_key = 'lewis')::text;
  exception when sqlstate 'P0099' then v_out := v_out || sqlerrm::jsonb;
  end;

  -- C. a person-chosen display name is KEPT when the parts later change; sort_name still follows.
  begin
    perform set_config('role', 'authenticated', true);
    perform platform.entity_update('party', c_person, null, '{"display_name":"Em Lewis-Hart"}'::jsonb);
    perform platform.entity_update('party', c_person, null, '{"first_name":"Emmeline"}'::jsonb);
    perform set_config('role', 'none', true);
    select display_name, sort_name, name_key into v_r from crm.party where id = c_person;
    raise exception using errcode = 'P0099', message = jsonb_build_object('case','C manual display kept',
      'display_name', v_r.display_name, 'sort_name', v_r.sort_name, 'name_key', v_r.name_key,
      'ok', v_r.display_name = 'Em Lewis-Hart' and v_r.sort_name = 'Lewis, Emmeline' and v_r.name_key = 'em lewis hart')::text;
  exception when sqlstate 'P0099' then v_out := v_out || sqlerrm::jsonb;
  end;

  -- D. organization contact: legal_name never rewrites display_name; a rename re-keys; sort_name stays null.
  begin
    insert into crm.party (party_kind, display_name, record_class, organization_id, created_by, updated_by, source)
    values ('organization', 'Probe Widgets Inc', 'contact', c_org, c_admin, c_admin, 'manual')
    returning id into v_org_party;
    perform set_config('role', 'authenticated', true);
    perform platform.entity_update('party', v_org_party, null, '{"legal_name":"Probe Widgets Holdings LLC"}'::jsonb);
    select display_name, sort_name, name_key into v_r from crm.party where id = v_org_party;
    v_case := jsonb_build_object('after_legal', jsonb_build_object('display_name', v_r.display_name, 'sort_name', v_r.sort_name, 'name_key', v_r.name_key));
    perform platform.entity_update('party', v_org_party, null, '{"display_name":"Probe Gadgets Co"}'::jsonb);
    perform set_config('role', 'none', true);
    select display_name, sort_name, name_key into v_r from crm.party where id = v_org_party;
    raise exception using errcode = 'P0099', message = (v_case || jsonb_build_object('case','D organization',
      'display_name', v_r.display_name, 'sort_name', v_r.sort_name, 'name_key', v_r.name_key,
      'ok', v_case #>> '{after_legal,display_name}' = 'Probe Widgets Inc'
            and v_case #>> '{after_legal,name_key}' = 'probe widgets'
            and v_r.display_name = 'Probe Gadgets Co' and v_r.name_key = 'probe gadgets' and v_r.sort_name is null))::text;
  exception when sqlstate 'P0099' then v_out := v_out || sqlerrm::jsonb;
  end;

  -- E. a resolver-shaped create (display + parts, NO sort_name / name_key supplied — what
  --    party_resolver._create_party now sends) lands with the same names it used to compute.
  begin
    insert into crm.party (party_kind, display_name, first_name, last_name, record_class, organization_id, created_by, updated_by, source)
    values ('person', 'José Fábio Lana', 'José', 'Lana', 'discovered', c_org, c_admin, c_admin, 'research')
    returning display_name, sort_name, name_key into v_r;
    raise exception using errcode = 'P0099', message = jsonb_build_object('case','E resolver create',
      'display_name', v_r.display_name, 'sort_name', v_r.sort_name, 'name_key', v_r.name_key,
      'ok', v_r.display_name = 'José Fábio Lana' and v_r.sort_name = 'Lana, José' and v_r.name_key = 'jose fabio lana')::text;
  exception when sqlstate 'P0099' then v_out := v_out || sqlerrm::jsonb;
  end;

  -- F. an unrelated edit (job_title) leaves every derived name exactly as stored.
  begin
    select display_name, sort_name, name_key into v_r from crm.party where id = c_person;
    v_case := to_jsonb(v_r);
    perform set_config('role', 'authenticated', true);
    perform platform.entity_update('party', c_person, null, '{"job_title":"Probe Title"}'::jsonb);
    perform set_config('role', 'none', true);
    select display_name, sort_name, name_key into v_r from crm.party where id = c_person;
    raise exception using errcode = 'P0099', message = jsonb_build_object('case','F unrelated edit',
      'before', v_case, 'after', to_jsonb(v_r), 'ok', v_case = to_jsonb(v_r))::text;
  exception when sqlstate 'P0099' then v_out := v_out || sqlerrm::jsonb;
  end;

  raise exception 'VERDICT % %',
    case when (select bool_and((e ->> 'ok')::boolean) from jsonb_array_elements(v_out) e) then 'ALL_OK' else 'FAILING' end,
    v_out::text;
end
$probe$;
