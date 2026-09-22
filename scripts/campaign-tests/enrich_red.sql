-- scripts/campaign-tests/enrich_red.sql — LANE ENRICH's RED TWIN.
--
-- IT RUNS THE REAL BYTES OF THIS LANE'S OWN INVERSES, in the middle of one transaction,
-- and then proves that each of the four things the green suite asserts STOPS BEING TRUE.
-- A guard nobody has watched fail is not a guard.
--
-- The whole thing — the fixture, the DDL, the reds — is inside ONE transaction that ends in
-- ROLLBACK, so the live bodies are back the moment it finishes and nothing is left behind.
--
-- Run: <scratchpad>/p.sh -f scripts/campaign-tests/enrich_red.sql
-- The green suite is scripts/campaign-tests/enrich_green.sql.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'enrich_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create temporary table textiles_wing_fixtures (k text primary key, v text) on commit drop;

-- ══ PART A — THE FIXTURE, WITH THIS LANE'S BYTES LIVE ══════════════════════════════════
do $setup$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_ind     uuid;
  v_head    uuid;
  v_one     uuid;
  v_i       integer;
begin
  perform set_config('app.actor_system', 'campaign-test/enrich_red.sql', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Wraithmoor Regional Museum of Art & Craft — Textiles Wing', 'wraithmoor-textiles-wing-red-' || replace(v_org::text,'-',''), 'WTW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, custom.organization_kernel_id(), 'record', jsonb_build_object('name','Workspace'), c_admin)
  returning id into v_home;

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Companies','slug','companies','description','','type','entity','display','list',
    'ordered', false, 'weight','light','retention_days',30,'row_order','sorted',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'agent_writable', true, 'label_singular','Company','label_plural','Companies',
    'title_field','title', 'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Name','key','title','type','text'));
  v_ind  := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Industry','key','industry','type','text'));
  v_head := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Headcount','key','headcount','type','number'));

  for v_i in 1..3 loop
    v_one := custom.record_write(v_org, v_tbl, jsonb_build_object('title','Company ' || v_i));
  end loop;

  perform custom.enrich_declare(v_org, v_ind, jsonb_build_object(
    'instruction','the industry this company is in, in two or three words',
    'inputs', jsonb_build_array('title'), 'review_interval_days', 30, 'enabled', true));
  perform custom.enrich_land(v_org, v_ind,
    jsonb_build_array(jsonb_build_object('record_id', v_one, 'value','Commercial recycling',
                                         'confidence', 0.9)),
    jsonb_build_object('trigger','batch','model','claude-fable-5-latest','cost_cents', 0.4));

  perform set_config('role', v_boss, true);
  insert into textiles_wing_fixtures values ('org', v_org::text), ('tbl', v_tbl::text),
                                   ('ind', v_ind::text), ('head', v_head::text),
                                   ('one', v_one::text);
  raise notice 'FIXTURE READY — one company, one agent-written value, with this lane''s bytes live';
end;
$setup$;

-- ══ THE INVERSES, FOR REAL. This is the lane's own rollback, run here on purpose. ═══════
\i migrations/inverse/enrich_the_trigger_takes_the_pin_down.sql
\i migrations/inverse/enrich_a_persons_edit_holds_the_cell_down.sql

-- ══ PART B — THE FOUR REDS ═════════════════════════════════════════════════════════════
do $red$
declare
  c_admin_j text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss  text := current_user;
  v_org   uuid := (select v from textiles_wing_fixtures where k = 'org')::uuid;
  v_tbl   uuid := (select v from textiles_wing_fixtures where k = 'tbl')::uuid;
  v_ind   uuid := (select v from textiles_wing_fixtures where k = 'ind')::uuid;
  v_head  uuid := (select v from textiles_wing_fixtures where k = 'head')::uuid;
  v_one   uuid := (select v from textiles_wing_fixtures where k = 'one')::uuid;
  v_doc   jsonb;
  v_at    timestamptz;
  v_at2   timestamptz;
  v_msg   text;
  v_src   text;
  v_reds  integer := 0;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  -- ── RED 1: A PERSON'S EDIT NO LONGER HOLDS THE CELL ──────────────────────────────────
  perform custom.record_update(v_org, v_one, jsonb_build_object('industry','Metal recovery'));
  perform set_config('role', v_boss, true);
  select r.data into v_doc from custom.record r where r.organization_id = v_org and r.id = v_one;
  perform set_config('role', 'authenticated', true);
  if coalesce((v_doc -> '_values' -> 'industry' ->> 'pinned')::boolean, false) then
    raise exception 'RED 1 DID NOT GO RED: the old trigger pinned the cell, so the forward change was not the thing that does it';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 1 — a person typed over an agent-owned cell and NOTHING held it: the envelope carries no pin';

  -- …and the very next run takes their answer away.
  perform custom.enrich_land(v_org, v_ind,
    jsonb_build_array(jsonb_build_object('record_id', v_one, 'value','Something the model prefers',
                                         'confidence', 0.95)),
    jsonb_build_object('trigger','batch','model','claude-fable-5-latest','cost_cents', 0.4));
  perform set_config('role', v_boss, true);
  select r.data ->> 'industry' into v_msg from custom.record r
   where r.organization_id = v_org and r.id = v_one;
  perform set_config('role', 'authenticated', true);
  if v_msg = 'Metal recovery' then
    raise exception 'RED 1b DID NOT GO RED: the person''s answer survived without the pin';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 1b — the next run wrote "%" straight over the person''s "Metal recovery"', v_msg;

  -- ── RED 2: EVERY VALUE'S MOMENT MOVES WHEN ANY COLUMN IS WRITTEN ─────────────────────
  -- Against an AGED moment, because `now()` is constant inside a transaction: a value
  -- written a statement ago cannot tell the two behaviours apart, and a red that cannot
  -- fail for the right reason is not a red. The moment is moved back with the triggers
  -- off, which is the same step the green suite states and for the same reason —
  -- custom._value_envelope refuses a caller's own `at`.
  perform set_config('role', v_boss, true);
  set local session_replication_role = 'replica';
  update custom.record r
     set data = jsonb_set(r.data, array['_values','industry','at'],
                          to_jsonb((now() - interval '40 days')::text))
   where r.organization_id = v_org and r.id = v_one;
  set local session_replication_role = 'origin';
  select (r.data -> '_values' -> 'industry' ->> 'at')::timestamptz into v_at
    from custom.record r where r.organization_id = v_org and r.id = v_one;
  perform set_config('role', 'authenticated', true);

  perform custom.record_update(v_org, v_one, jsonb_build_object('headcount', 41));

  perform set_config('role', v_boss, true);
  select (r.data -> '_values' -> 'industry' ->> 'at')::timestamptz into v_at2
    from custom.record r where r.organization_id = v_org and r.id = v_one;
  perform set_config('role', 'authenticated', true);
  if v_at2 is not distinct from v_at then
    raise exception 'RED 2 DID NOT GO RED: the industry kept its own moment without custom.carry_unchanged_value_stamps';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 2 — writing the HEADCOUNT threw away the industry''s real moment (%) and restamped it %, so every freshness answer is wrong', v_at, v_at2;

  -- ── RED 3: THE DOOR SAYS YES AND CHANGES NOTHING ─────────────────────────────────────
  begin
    perform custom.enrich_declare(v_org, v_head, jsonb_build_object(
      'instruction','how many people work there, as a number', 'review_interval_days', 30));
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise notice 'RED 3 — custom.enrich_declare could not even run: %', v_msg;
  end;
  perform set_config('role', v_boss, true);
  select f.data ->> 'source' into v_src from custom.record f
   where f.organization_id = v_org and f.id = v_head;
  perform set_config('role', 'authenticated', true);
  if v_src = 'agent' then
    raise exception 'RED 3 DID NOT GO RED: custom.field_update carried `source` without this lane''s arm';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 3 — the column''s source is still "%": the door reported success and changed nothing, so no enrichment can be declared at all', coalesce(v_src,'absent');

  -- ── RED 4: A CELL CANNOT BE HELD AT ALL ──────────────────────────────────────────────
  begin
    perform custom.enrich_pin(v_org, v_one, 'industry', true);
    raise exception 'RED 4 DID NOT GO RED: a pin was written into an envelope whose key set does not allow one';
  exception when check_violation or invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    v_reds := v_reds + 1;
    raise notice 'RED 4 — pinning is refused by the envelope law itself: "%"', v_msg;
  end;

  if v_reds <> 5 then
    raise exception 'only % of 5 reds fired', v_reds;
  end if;
  raise notice '=== ALL FIVE REDS FIRED — every one of them with this lane''s own inverse bytes live ===';
end;
$red$;

rollback;
