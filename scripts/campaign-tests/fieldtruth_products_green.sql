-- scripts/campaign-tests/fieldtruth_products_green.sql — LANE FIELD-TRUTH.
--
-- ONE REAL WRITE PER PRODUCT, FROM THE SEAT, SO THIS CLASS CANNOT COME BACK SILENTLY.
--
-- WHY IT EXISTS. `custom._undeclared_key_guard` (FIELD-TRUTH, 2026-09-21) refuses a value
-- for a key no Field declares. That is right for a person's own table and it was WRONG for
-- the Tables the PLATFORM makes for its own products: `custom.work_take_assignment` created
-- every workflow-state Table by declaring four column NAMES and making a Field record for
-- none of them, so on the live screens crew F's five-step checklist was refused with
-- *"State has no field called "name", "next", "sort", "terminal""* — and that door is
-- underneath every checklist, every pipeline and every work template on the platform.
-- A guard that refuses the platform's own products is a guard that gets switched off, so
-- every product that stores its own documents in `custom.record` gets one real write here.
--
-- THE USE CASE (owner's law: no fake test data). Tanner Ridge Tree Care is a three-crew
-- arborist outfit in Asheville, North Carolina — removals, crown reduction and storm
-- cleanup. It runs work orders by address, quotes them, moves them across a board, and
-- follows a written checklist on every storm job because a red oak over a power line kills
-- people. Every name, column and value below is that business's.
--
-- IT TAKES THE SEAT: everything after PART 0 runs as `authenticated`, through the doors
-- alone. The whole suite is ONE transaction ending in ROLLBACK.
--
-- Run: <scratchpad>/prod.sh -f scripts/campaign-tests/fieldtruth_products_green.sql

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'fieldtruth_products_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org    uuid := gen_random_uuid();
  v_home   uuid; v_wo uuid; v_clients uuid;
  v_rec    uuid; v_client uuid;
  v_res    jsonb; v_msg text; v_n integer;
  v_rule   uuid; v_view uuid; v_tmpl uuid; v_field uuid; v_state_tbl uuid;
  v_ok     integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/fieldtruth_products_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Tanner Ridge Tree Care', 'tanner-ridge-tree-care-'||substr(v_org::text,1,8), 'TRT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/fieldtruth_products_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Tanner Ridge Tree Care')) returning id into v_home;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'PART 0 FAILED — this suite is not in the seat; it is %', current_user;
  end if;
  raise notice 'PART 0 PASSED — running as %, the role a signed-in person holds.', current_user;

  v_clients := custom.table_declare(v_org, jsonb_build_object(
    'name','clients','type','entity','slug','clients',
    'label_singular','Client','label_plural','Clients',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','client_name','direction','asc')),
    'title_field','client_name','parent_id',v_home::text,
    'fields', jsonb_build_array(
      jsonb_build_object('name','client_name','type','text'),
      jsonb_build_object('name','phone','type','text'))));
  v_wo := custom.table_declare(v_org, jsonb_build_object(
    'name','work_orders','type','entity','slug','work_orders',
    'label_singular','Work Order','label_plural','Work Orders',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','address','direction','asc')),
    'title_field','address','parent_id',v_home::text,
    'fields', jsonb_build_array(
      jsonb_build_object('name','address','type','text'),
      jsonb_build_object('name','service','type','text'),
      jsonb_build_object('name','crew_lead','type','text'),
      jsonb_build_object('name','quoted','type','range'))));
  -- The "belongs to" link a portal needs: a work order is FOR a client, and that is a
  -- relation column, not a name typed twice.
  perform custom.field_declare(v_org, v_wo, jsonb_build_object(
    'key','client','label','Client','type','relation','relation_target', v_clients::text,
    'relation_max', 1, 'sort', 500));
  v_client := custom.record_write(v_org, v_clients, jsonb_build_object(
    'client_name','Marguerite Oyelaran', 'phone','828-555-0148'));
  v_rec := custom.record_write(v_org, v_wo, jsonb_build_object(
    'address','412 Cragmont Rd', 'service','Storm cleanup — red oak down',
    'crew_lead','Dewayne Poteat', 'quoted', 4200, 'client', v_client::text));

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — CHECKLISTS. Crew F's exact flow: the Checklists "Write one" editor.
  -- This is the clause that was RED on the live screens.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_res := custom.checklist_declare(v_org, jsonb_build_object(
    'name','Storm cleanup over a service drop',
    'about_table_id', v_wo::text,
    'steps', jsonb_build_array(
      jsonb_build_object('ref','site',  'title','Walk the site and photograph the drop zone'),
      jsonb_build_object('ref','power', 'title','Confirm the service drop is de-energised with Duke Energy'),
      jsonb_build_object('ref','rig',   'title','Rig the crown and set the lowering line'),
      jsonb_build_object('ref','cut',   'title','Section the trunk and chip the brush'),
      jsonb_build_object('ref','haul',  'title','Haul the rounds and rake the lawn'))));
  if coalesce((v_res ->> 'steps')::integer, 0) <> 5 then
    raise exception 'PART 1 FAILED — the checklist saved % steps, not five. %', v_res ->> 'steps', v_res;
  end if;
  raise notice 'PART 1 PASSED — checklists: a five-step storm-cleanup checklist saves.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE WORKFLOW-STATE TABLE ITSELF, which is what PART 1 died on. It is a LIST a
  -- person reads, so its four columns are declared columns and not machinery.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- Asked through the doors, the way a screen asks: work_take_assignment answers with the
  -- state Table's id (it is idempotent — PART 1 already made it), and applicable_fields is
  -- what the grid draws its columns from. `custom.record` is not readable from the seat and
  -- must not be.
  v_state_tbl := (custom.work_take_assignment(v_org, v_wo) ->> 'state_table_id')::uuid;
  select count(*) into v_n from custom.applicable_fields(v_org, v_state_tbl, null) f
   where f.data ->> 'key' in ('name','sort','terminal','next');
  if v_n < 4 then
    raise exception 'PART 2 FAILED — a workflow-state Table draws % of its four columns, so the grid cannot show a person their own states.', v_n;
  end if;
  raise notice 'PART 2 PASSED — the workflow-state Table declares name, sort, terminal and next.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — PIPELINES AND STAGE RULES. The board the crews move work across.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_res := custom.pipeline_declare(v_org, v_wo, jsonb_build_object(
    'stage_field', jsonb_build_object('key','stage','label','Stage',
       'options', jsonb_build_array('Quoted','Scheduled','On site','Cleared','Invoiced')),
    'transitions', jsonb_build_array(
       jsonb_build_object('from','Quoted','to','Scheduled'),
       jsonb_build_object('from','Scheduled','to','On site'),
       jsonb_build_object('from','On site','to','Cleared'),
       jsonb_build_object('from','Cleared','to','Invoiced'))));
  raise notice 'PART 3 PASSED — pipelines: a five-stage board declares.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — WORK TEMPLATES. The repeatable job the office instantiates per removal.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_tmpl := custom.work_template_declare(v_org, 'Large removal, three visits', jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object('ref','survey','table', v_wo::text,
        'data', jsonb_build_object('address','412 Cragmont Rd','service','Survey and quote')),
      jsonb_build_object('ref','fell','table', v_wo::text,
        'data', jsonb_build_object('address','412 Cragmont Rd','service','Fell and section')),
      jsonb_build_object('ref','grind','table', v_wo::text,
        'data', jsonb_build_object('address','412 Cragmont Rd','service','Stump grind'))),
    'relations', jsonb_build_array(
      jsonb_build_object('from','survey','to','fell'),
      jsonb_build_object('from','fell','to','grind'))));
  perform custom.work_template_instantiate(v_org, v_tmpl, '{}'::jsonb);
  raise notice 'PART 4 PASSED — work templates: a three-visit removal declares and instantiates.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — FORMS, CAPTURE SHEETS AND BOOKING PAGES.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.form_declare(v_org, v_wo, 'Ask us about a tree',
    jsonb_build_array(
      jsonb_build_object('field','address','ask','Where is the tree?','required',true),
      jsonb_build_object('field','service','ask','What do you need done?','required',true)));
  perform custom.capture_sheet_declare(v_org, v_wo, 'Crew sheet — end of day',
    jsonb_build_array(jsonb_build_object('field','crew_lead','ask','Who led the crew today?')),
    '{}'::jsonb, null, null);
  raise notice 'PART 5 PASSED — forms and capture sheets declare.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 6 — PORTALS. What Marguerite sees when she logs in about her oak.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.portal_declare(v_org, 'Tanner Ridge client portal', v_clients,
    jsonb_build_array(jsonb_build_object('table_id', v_wo, 'names_via', 'client',
      'visible_fields', jsonb_build_array('address','service','quoted'),
      'editable_fields', jsonb_build_array(),
      'comments', true)));
  raise notice 'PART 6 PASSED — portals declare.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 7 — DASHBOARDS, SAVED VIEWS AND DIGESTS.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.dashboard_declare(v_org, v_wo, 'This week on the trucks',
    jsonb_build_array(
      jsonb_build_object('title','Work orders open','kind','number','span',3),
      jsonb_build_object('title','By stage','kind','column','group_by',jsonb_build_array('stage'),
        'measures', jsonb_build_array(jsonb_build_object('op','count')),'span',6)));
  v_view := custom.view_declare(v_org, v_wo,
    jsonb_build_object('name','Storm work', 'filters', jsonb_build_object('stage','Scheduled')));
  perform custom.subscription_declare(v_org, v_wo, jsonb_build_object(
    'name','Monday truck list', 'saved_view_id', v_view, 'cadence', 'weekly'));
  raise notice 'PART 7 PASSED — dashboards, saved views and digests declare.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 8 — DOCUMENT TEMPLATES AND RULES.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  select f.id into v_field from custom.applicable_fields(v_org, v_wo, null) f where f.data ->> 'key' = 'address';
  perform custom.doc_template_save(v_org, v_wo, 'Removal proposal',
    'For the tree at {{field:' || v_field || '}} — Tanner Ridge Tree Care.', null);
  v_rule := custom.rule_declare(v_org, jsonb_build_object(
    'name','a work order names the street it is on', 'kind','predicate',
    'uses', jsonb_build_array('validate'), 'scope_table_id', v_wo, 'applies_to_types','[]'::jsonb,
    'expr', jsonb_build_object('op','present','args',
              jsonb_build_array(jsonb_build_object('field', v_field))),
    'description','FIELD-TRUTH products suite'), null);
  raise notice 'PART 8 PASSED — document templates and rules declare.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 9 — SLOTS AND APPROVALS.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.work_slots_declare(v_org, 'Bucket truck', 'bucket_truck_slots', v_home);
  perform custom.work_approval_request(v_org, v_rec,
    jsonb_build_object('kind','record_patch','patch', jsonb_build_object('quoted', 5400)),
    'The oak is bigger than the photo showed', null, 'person', null);
  raise notice 'PART 9 PASSED — slot holds and approvals declare.';

  raise notice 'ALL PARTS PASSED — Tanner Ridge Tree Care: % products wrote through their own doors.', 9;
end $t$;

rollback;
\echo '>>> rolled back — the main database is untouched'
