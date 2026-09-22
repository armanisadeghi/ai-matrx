-- DOORS-DECIDE-3 — THE GREEN SUITE. The two doors that now ask the organization wall in their
-- OWN body, run THROUGH THE DOOR a signed-in person reaches, FROM THE SEAT a signed-in person
-- has, as admin@admin.com (an owner) AND as test@test.com (a member here, a stranger there).
--
-- THE REAL USE CASE THIS DATA IS. Northgate Mechanical is a 22-person commercial HVAC service
-- contractor in Portland. Their dispatcher keeps every service call in a Work Orders Table —
-- building, unit tag, fault, technician, labor hours, parts total, status — and closed-out
-- calls from last quarter are ARCHIVED rather than deleted, because a warranty claim on a
-- rooftop unit can arrive eleven months late. Their building-owner customers see their own
-- equipment and open calls through a client Portal. The second organization, Cascade Property
-- Group, is a property manager Northgate invoices: a real neighbour in this market, and a
-- company whose Matrx organization a Northgate technician has no business reaching at all.
-- Dana (test@test.com) is Northgate's dispatcher: a member there, a stranger at Cascade.
--
-- RUN IT (main database, or the rehearsal branch when it carries the objects):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/doorsdecide3_green.sql
--
-- WHAT IT PROVES, and why each clause could only pass after this lane's change:
--   1  the seat is `authenticated`, so the wall, the grant and SECURITY DEFINER are all real.
--   2  custom.portals answers for an owner and for an ordinary member.
--   3  custom.portals REFUSES a stranger with 42501 — and the refusal now names
--      `custom.portals`, the door she actually called. Before, the wall was only reached
--      inside custom.list_portals and the sentence named a function no client can execute.
--   4  custom.read_records_archived answers for an owner and for an ordinary member, and
--      hands back the archived work order with its own fields.
--   5  custom.read_records_archived REFUSES a stranger with 42501 — and now refuses her
--      BEFORE it validates the `p_lane` word. This is the behavioural difference: the lane
--      vocabulary check used to run first, so a stranger who passed a nonsense lane learned
--      Northgate's lane vocabulary (22023, "Two lanes: mine and org") from an organization
--      she cannot reach. She now gets the wall, and learns nothing.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, is swept by nothing, and its single
-- transaction ends in ROLLBACK. Its red twin is doorsdecide3_red.sql, which puts the two old
-- bodies back inside a rolled-back transaction and proves clauses 3 and 5 flip.

\set ON_ERROR_STOP on
\timing off

\set suite 'doorsdecide3_green.sql'
\set requires 'grant:authenticated:custom.portals|grant:authenticated:custom.read_records_archived|exec:custom.portal_declare|exec:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  j_admin   constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  j_dana    constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_north   uuid := gen_random_uuid();   -- Northgate Mechanical — Dana is a member
  v_cascade uuid := gen_random_uuid();   -- Cascade Property Group — Dana is a stranger
  v_home_n uuid; v_home_c uuid;
  v_bldgs uuid; v_wo uuid; v_portal uuid;
  v_c_bldgs uuid; v_c_wo uuid;
  v_b1 uuid; v_b2 uuid; v_cb1 uuid;
  v_i integer; v_n integer; v_doc jsonb; v_id uuid;
  v_sql text; v_caught text; v_state text;
begin
  perform set_config('app.actor_system', 'campaign-test/doorsdecide3_green', true);
  perform set_config('request.jwt.claims', j_admin, true);

  -- ── THE TWO ORGANIZATIONS ───────────────────────────────────────────────────────────────
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_north,   'Northgate Mechanical - safe to delete', 'northgate-mechanical-'||left(v_north::text,8), 'NGM', c_admin),
    (v_cascade, 'Cascade Property Group - safe to delete', 'cascade-property-'||left(v_cascade::text,8), 'CPG', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by) values
    (v_north,   'organization', v_north,   c_admin, 'owner',  'active', c_admin),
    (v_north,   'organization', v_north,   c_dana,  'member', 'active', c_admin),
    (v_cascade, 'organization', v_cascade, c_admin, 'owner',  'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by) values
    ('custom','system_enabled','organization',v_north,  v_north,  'true'::jsonb,'DOORS-DECIDE-3 proof', c_admin),
    ('custom','system_enabled','organization',v_cascade,v_cascade,'true'::jsonb,'DOORS-DECIDE-3 proof', c_admin)
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = 'true'::jsonb;

  v_home_n := custom.record_write(v_north, custom.organization_kernel_id(),
                jsonb_build_object('name','Northgate Mechanical','description','Portland commercial HVAC service','_actor','user'));
  v_home_c := custom.record_write(v_cascade, custom.organization_kernel_id(),
                jsonb_build_object('name','Cascade Property Group','description','property manager, Northgate customer','_actor','user'));

  -- ── NORTHGATE'S TWO TABLES ──────────────────────────────────────────────────────────────
  v_bldgs := custom.table_declare(v_north, jsonb_build_object(
      'name','Buildings','slug','buildings','description','the properties we hold service contracts on',
      'type','entity','display','list','ordered',false,'weight','light','row_order','sorted',
      'agent_writable',true,'retention_days',365,'label_singular','Building','label_plural','Buildings',
      'title_field','name','default_sort',jsonb_build_array(jsonb_build_object('field','name','direction','asc')),
      'fields',jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home_n));
  perform custom.field_declare(v_north, v_bldgs, jsonb_build_object('label','Building','key','name','type','text','required',true));
  perform custom.field_declare(v_north, v_bldgs, jsonb_build_object('label','Site contact','key','site_contact','type','text'));

  v_wo := custom.table_declare(v_north, jsonb_build_object(
      'name','Work Orders','slug','work_orders','description','every service call, open and closed out',
      'type','entity','display','list','ordered',false,'weight','light','row_order','sorted',
      'agent_writable',true,'retention_days',365,'label_singular','Work Order','label_plural','Work Orders',
      'title_field','wo_number','default_sort',jsonb_build_array(jsonb_build_object('field','wo_number','direction','desc')),
      'fields',jsonb_build_array(jsonb_build_object('name','wo_number')),'parent_id',v_home_n));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','WO number','key','wo_number','type','text','required',true));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','Unit tag','key','unit_tag','type','text'));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','Reported fault','key','fault','type','text'));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','Technician','key','technician','type','text'));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','Labor hours','key','labor_hours','type','text'));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','Parts total','key','parts_total','type','text'));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','Status','key','status','type','text'));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','Building','key','building','type','relation','relation_target',v_bldgs));

  v_b1 := custom.record_write(v_north, v_bldgs, jsonb_build_object('name','Alder Court Medical Plaza','site_contact','Renata Vogel, facilities','_actor','user'));
  v_b2 := custom.record_write(v_north, v_bldgs, jsonb_build_object('name','Harbour Line Distribution Center','site_contact','Ibrahim Sow, night super','_actor','user'));

  for v_i in 1..12 loop
    v_id := custom.record_write(v_north, v_wo, jsonb_build_object(
      'wo_number',     format('WO-2026-%s', lpad((3100 + v_i)::text, 4, '0')),
      'unit_tag',      (array['RTU-3','RTU-7','AHU-1','CU-12','VAV-204'])[1 + (v_i % 5)],
      'fault',         (array['No cooling on second floor','Condensate overflow tripped the float switch',
                              'Compressor short-cycling','Economizer damper stuck closed',
                              'Belt squeal on supply fan'])[1 + (v_i % 5)],
      'technician',    (array['Marisol Trejo','Dov Feinstein','Kwame Boateng'])[1 + (v_i % 3)],
      'labor_hours',   format('%s.%s', 1 + (v_i % 5), (v_i * 3) % 10),
      'parts_total',   format('$%s.%s', 60 + v_i * 47, lpad(((v_i * 17) % 100)::text, 2, '0')),
      'status',        case when v_i <= 5 then 'Closed out' else 'Scheduled' end,
      'building',      (case when v_i % 2 = 0 then v_b1 else v_b2 end)::text,
      '_actor','user'));
    -- Last quarter's closed-out calls go to the archive, where a warranty claim can find them.
    if v_i <= 5 then
      perform custom.record_delete(v_north, v_id);
    end if;
  end loop;

  v_portal := custom.portal_declare(v_north, 'Northgate Mechanical building-owner portal', v_bldgs,
    jsonb_build_array(jsonb_build_object('table_id', v_wo, 'names_via', 'building',
      'visible_fields', jsonb_build_array('wo_number','unit_tag','fault','status'),
      'editable_fields', '[]'::jsonb, 'comments', true)));

  -- ── CASCADE'S ONE TABLE, so the stranger clauses name a Table that really exists ────────
  v_c_bldgs := custom.table_declare(v_cascade, jsonb_build_object(
      'name','Properties','slug','properties','description','buildings under management',
      'type','entity','display','list','ordered',false,'weight','light','row_order','sorted',
      'agent_writable',true,'retention_days',365,'label_singular','Property','label_plural','Properties',
      'title_field','name','default_sort',jsonb_build_array(jsonb_build_object('field','name','direction','asc')),
      'fields',jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home_c));
  perform custom.field_declare(v_cascade, v_c_bldgs, jsonb_build_object('label','Property','key','name','type','text','required',true));
  v_cb1 := custom.record_write(v_cascade, v_c_bldgs, jsonb_build_object('name','Cascade Riverfront Tower','_actor','user'));

  v_c_wo := custom.table_declare(v_cascade, jsonb_build_object(
      'name','Service Requests','slug','service_requests','description','what tenants have asked us to fix',
      'type','entity','display','list','ordered',false,'weight','light','row_order','sorted',
      'agent_writable',true,'retention_days',365,'label_singular','Service Request','label_plural','Service Requests',
      'title_field','summary','default_sort',jsonb_build_array(jsonb_build_object('field','summary','direction','asc')),
      'fields',jsonb_build_array(jsonb_build_object('name','summary')),'parent_id',v_home_c));
  perform custom.field_declare(v_cascade, v_c_wo, jsonb_build_object('label','Summary','key','summary','type','text','required',true));
  perform custom.field_declare(v_cascade, v_c_wo, jsonb_build_object('label','Property','key','property','type','relation','relation_target',v_c_bldgs));
  perform custom.record_write(v_cascade, v_c_wo, jsonb_build_object('summary','Lobby vestibule heater blowing cold','property',v_cb1::text,'_actor','user'));
  perform custom.portal_declare(v_cascade, 'Cascade Property Group tenant portal', v_c_bldgs,
    jsonb_build_array(jsonb_build_object('table_id', v_c_wo, 'names_via', 'property',
      'visible_fields', jsonb_build_array('summary'), 'editable_fields', '[]'::jsonb, 'comments', false)));

  -- ═══════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE SEAT. Everything below runs as a signed-in person, not as the store's owner.
  -- ═══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '1: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    raise exception '1: the seat is still a member of the role that owns custom.record — the wall would never run';
  end if;
  raise notice '1 PASSED — the seat is %, and it does not own the store.', current_user;

  -- ═══════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — custom.portals ANSWERS FOR A MEMBER (the owner, then the ordinary member).
  -- ═══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', j_admin, true);
  select count(*) into v_n from custom.portals(v_north);
  if v_n < 1 then
    raise exception '2a: the owner asked for Northgate''s portals and got % of them', v_n;
  end if;

  perform set_config('request.jwt.claims', j_dana, true);
  select count(*) into v_n from custom.portals(v_north);
  if v_n < 1 then
    raise exception '2b: Northgate''s dispatcher asked for her own organization''s portals and got % of them', v_n;
  end if;
  raise notice '2 PASSED — custom.portals answers for the owner and for the dispatcher (% portal(s)).', v_n;

  -- ═══════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — custom.portals REFUSES A STRANGER, AND THE REFUSAL NAMES THE DOOR SHE CALLED.
  -- ═══════════════════════════════════════════════════════════════════════════════════════
  v_caught := null; v_state := null;
  begin
    select count(*) into v_n from custom.portals(v_cascade);
    raise exception '3a: Dana is not a member of Cascade and custom.portals answered her with % row(s)', v_n;
  exception when others then
    v_caught := sqlerrm; v_state := sqlstate;
  end;
  if v_state <> '42501' then
    raise exception '3a: the stranger was refused with % (%), not 42501', v_state, v_caught;
  end if;
  if v_caught !~ 'not a member of that organization' then
    raise exception '3a: the refusal is not the organization wall''s sentence: %', v_caught;
  end if;
  if v_caught !~ 'custom\.portals' then
    raise exception '3b: the refusal names a function she never called, not custom.portals: %', v_caught;
  end if;
  raise notice '3 PASSED — 42501 naming custom.portals: "%"', v_caught;

  -- ═══════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — custom.read_records_archived ANSWERS FOR A MEMBER, WITH THE REAL WORK ORDERS.
  -- ═══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', j_admin, true);
  select count(*) into v_n from custom.read_records_archived(v_north, v_wo, 'org', false, 200, 0);
  if v_n <> 5 then
    raise exception '4a: the owner sees % archived work order(s) in Northgate''s archive, expected 5', v_n;
  end if;

  perform set_config('request.jwt.claims', j_dana, true);
  select count(*) into v_n from custom.read_records_archived(v_north, v_wo, 'org', false, 200, 0);
  if v_n <> 5 then
    raise exception '4b: the dispatcher sees % archived work order(s), expected 5', v_n;
  end if;
  select document into v_doc from custom.read_records_archived(v_north, v_wo, 'org', false, 200, 0) limit 1;
  if coalesce(v_doc ->> 'wo_number', '') !~ '^WO-2026-' then
    raise exception '4c: the archived row came back without its work-order number: %', v_doc;
  end if;
  raise notice '4 PASSED — 5 archived work orders for the owner and the dispatcher; first is %.', v_doc ->> 'wo_number';

  -- ═══════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE STRANGER MEETS THE WALL BEFORE SHE LEARNS THE LANE VOCABULARY.
  -- ═══════════════════════════════════════════════════════════════════════════════════════
  v_caught := null; v_state := null;
  begin
    select count(*) into v_n from custom.read_records_archived(v_cascade, v_c_bldgs, 'org', false, 200, 0);
    raise exception '5a: Dana is not a member of Cascade and the archive door answered her with % row(s)', v_n;
  exception when others then
    v_caught := sqlerrm; v_state := sqlstate;
  end;
  if v_state <> '42501' then
    raise exception '5a: the stranger was refused with % (%), not 42501', v_state, v_caught;
  end if;
  if v_caught !~ 'custom\.read_records_archived' then
    raise exception '5a: the refusal does not name the door she called: %', v_caught;
  end if;

  -- THE ORDER, WHICH IS THE WHOLE POINT. A nonsense lane word is a 22023 the door raises on
  -- its own; a stranger must never reach it, because the message spells out the vocabulary of
  -- an organization she cannot reach. The wall now runs first, so she gets 42501 here too.
  v_caught := null; v_state := null;
  begin
    select count(*) into v_n from custom.read_records_archived(v_cascade, v_c_bldgs, 'everything', false, 200, 0);
    raise exception '5b: the archive door answered a stranger asking for a lane that does not exist';
  exception when others then
    v_caught := sqlerrm; v_state := sqlstate;
  end;
  if v_state = '22023' then
    raise exception '5b: the stranger reached the lane vocabulary check — she was told "%" about an organization she cannot reach', v_caught;
  end if;
  if v_state <> '42501' then
    raise exception '5b: expected the wall (42501), got % (%)', v_state, v_caught;
  end if;
  -- And a MEMBER still gets the lane refusal, because for her the wall says yes first.
  perform set_config('request.jwt.claims', j_dana, true);
  v_caught := null; v_state := null;
  begin
    select count(*) into v_n from custom.read_records_archived(v_north, v_wo, 'everything', false, 200, 0);
    raise exception '5c: the archive door accepted "everything" as a lane';
  exception when others then
    v_caught := sqlerrm; v_state := sqlstate;
  end;
  if v_state <> '22023' then
    raise exception '5c: the dispatcher''s bad lane word was refused with % (%), not 22023', v_state, v_caught;
  end if;
  raise notice '5 PASSED — the stranger meets the wall (42501) even with a nonsense lane; the member still gets 22023.';

  raise notice 'DOORS-DECIDE-3 GREEN — all five parts passed from the authenticated seat.';
end $t$;

rollback;
