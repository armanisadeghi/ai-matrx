-- LANE WORK-DOORS — THE RED TWIN of `scripts/campaign-tests/workdoors_green.sql`.
--
-- Each block below PUTS ONE DEFECT BACK and asserts it is there. Three of the five put it back
-- by running the REAL BYTES of this lane's own inverse migrations — not a paraphrase of them —
-- so a green suite that would pass over a broken store is impossible to write by accident.
-- Everything happens inside ONE transaction that ends in ROLLBACK, so the main database is
-- byte-identical afterwards; the last block proves that rather than assuming it.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/workdoors_red.sql
--
-- A BLOCK THAT DOES NOT GO RED IS A FAILURE OF THIS FILE. Each one raises if the defect it
-- restored does not actually appear, because a red twin that cannot go red proves nothing.
--
-- THE SEAT. The asserted clauses run as `authenticated`, like the green suite's. The lines
-- that restore a defect are DDL and run as the connected role, which is the only role that
-- could ever issue them — and each one says which file's bytes it is.

\set ON_ERROR_STOP on
\timing off

begin;

set lock_timeout = '60s';
set statement_timeout = '600s';

-- ════════════════════════════════════════════════════════════════════════════════
-- THE FIXTURE, and the two original bodies this file will replace by hand.
-- ════════════════════════════════════════════════════════════════════════════════
create temporary table rincon_millbrook_fixtures (k text primary key, v text) on commit drop;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_tbl  uuid;
  v_rec  uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'workdoors_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  -- The bodies as they stand RIGHT NOW, so the last block can prove the file put them back.
  insert into rincon_millbrook_fixtures values
    ('work_assign',          pg_get_functiondef('custom.work_assign(uuid, uuid, uuid, timestamptz, boolean)'::regprocedure)),
    ('work_approval_decide', pg_get_functiondef('custom.work_approval_decide(uuid, uuid, boolean, text)'::regprocedure)),
    ('work_slots_declare',   pg_get_functiondef('custom.work_slots_declare(uuid, text, text, uuid)'::regprocedure)),
    ('work_transition_refusal', pg_get_functiondef('custom.work_transition_refusal(uuid, uuid, uuid)'::regprocedure)),
    ('work_approval_approvers', pg_get_functiondef('custom.work_approval_approvers(uuid, uuid, uuid)'::regprocedure)),
    ('work_person',          pg_get_functiondef('custom.work_person(uuid, uuid, boolean)'::regprocedure));

  perform set_config('app.actor_system', 'campaign-test/workdoors_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Millbrook Branch ' || substr(v_org::text, 1, 8),
          'rincon-plumbing-millbrook-red-' || substr(v_org::text, 1, 8), 'RPM', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'workdoors_red'),
    ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'workdoors_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Estimates','slug','estimates','type','entity',
    'label_singular','Estimate','label_plural','Estimates','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','price')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','price','label','Price','plain','number','sort',20));
  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Send the quote','price',1000));
  perform custom.work_take_assignment(v_org, v_tbl);
  perform set_config('role', 'postgres', true);

  insert into rincon_millbrook_fixtures values
    ('org', v_org::text), ('home', v_home::text), ('tbl', v_tbl::text), ('rec', v_rec::text);
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════════
-- RED 1 — THE BOOKING DOOR ASKS A RETIRED KNOB, so no booking table can ever exist.
--         The real bytes of the inverse.
-- ════════════════════════════════════════════════════════════════════════════════
\i migrations/inverse/workdoors_the_booking_door_stops_asking_a_retired_knob_down.sql

do $t$
declare
  v_org   uuid := (select v from rincon_millbrook_fixtures where k = 'org')::uuid;
  v_home  uuid := (select v from rincon_millbrook_fixtures where k = 'home')::uuid;
  v_caught text;
begin
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.work_slots_declare(v_org, 'Site Visits', 'site_visits', v_home);
    raise exception 'RED 1 DID NOT GO RED: a booking table was declared while the door still reads the retired knob';
  exception when feature_not_supported then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught !~ 'double-booking' then
    raise exception 'RED 1: refused, but not by the retired knob: %', v_caught;
  end if;
  raise notice 'RED 1 IS RED — every booking table in the platform is refused: "%"', v_caught;
  perform set_config('role', 'postgres', true);
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════════
-- RED 2 — THE WORKFLOW STATES ARE DECIDED ROW BY ROW, so the person holding a task
--         cannot be told where it may go. The real bytes of the inverse.
-- ════════════════════════════════════════════════════════════════════════════════
\i migrations/inverse/workdoors_the_states_are_vocabulary_not_somebody_s_rows_down.sql

do $t$
declare
  c_dana   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org    uuid := (select v from rincon_millbrook_fixtures where k = 'org')::uuid;
  v_rec    uuid := (select v from rincon_millbrook_fixtures where k = 'rec')::uuid;
  v_caught text;
  v_n      integer;
  v_started uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  perform custom.work_assign(v_org, v_rec, c_dana, now() + interval '1 day');
  -- It has to BE in a state, or the door never asks the model about a move at all and the
  -- row-by-row decision is never reached. The admin owns the state records, so he can.
  select s.state_id into v_started from custom.work_record_states(v_org, v_rec) s where s.name = 'Not started';
  perform custom.work_set_state(v_org, v_rec, v_started);

  -- Now SHE looks at the task she was handed.
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select count(*) into v_n from custom.work_list(v_org, 'mine', false, 10, 0);
  if v_n <> 1 then
    raise exception 'RED 2: the fixture is wrong — she holds % records, not 1', v_n;
  end if;
  begin
    perform count(*) from custom.work_record_states(v_org, v_rec);
    raise exception 'RED 2 DID NOT GO RED: she was told where her task can go, with the row-by-row decision back in place';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught !~ 'state' then
    raise exception 'RED 2: refused, but not about a state: %', v_caught;
  end if;
  raise notice 'RED 2 IS RED — she holds the task and cannot be told where it goes: "%"', v_caught;
  perform set_config('role', 'postgres', true);
end
$t$;

-- Put those two back, so RED 3-5 measure only their own defect.
\i migrations/campaign/workdoors_the_booking_door_stops_asking_a_retired_knob.sql
\i migrations/campaign/workdoors_the_states_are_vocabulary_not_somebody_s_rows.sql

-- ════════════════════════════════════════════════════════════════════════════════
-- RED 3 — THE TWO THINGS `check:store-doors-decide` CAUGHT. The real bytes of the
--         inverse: the roster reads with no wall, and the person record writes past
--         the OFF switch.
-- ════════════════════════════════════════════════════════════════════════════════
\i migrations/inverse/workdoors_both_new_doors_ask_the_census_questions_down.sql

do $t$
declare
  c_dana   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org    uuid := (select v from rincon_millbrook_fixtures where k = 'org')::uuid;
  v_rec    uuid := (select v from rincon_millbrook_fixtures where k = 'rec')::uuid;
  v_other  uuid := gen_random_uuid();
  v_n      integer;
  v_person uuid;
  v_shome  uuid;
  v_stbl   uuid;
  v_srec   uuid;
begin
  -- 3a — A STRANGER'S ORGANIZATION. Dana is a member of the fixture organization and of
  --      nothing else; this id is one she has never heard of.
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_other, 'Rincon Plumbing Co — Fairhaven Branch ' || substr(v_other::text, 1, 8),
          'rincon-plumbing-fairhaven-' || substr(v_other::text, 1, 8), 'RPF',
          '87a6e699-3622-4869-8843-d0867456c0dd');
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_other, 'organization', v_other, '87a6e699-3622-4869-8843-d0867456c0dd', 'owner', 'active');

  -- The stranger organization gets a Home and a record of its own, because the leak runs
  -- through the `admin on the subject` arm: `custom.effective_level` is SECURITY DEFINER and
  -- answers about anybody. (The `owner or admin of the organization` arm is separately walled
  -- by `public.is_org_admin_for`'s own client-lane guard — which is the platform working, and
  -- is exactly why a door may never lean on another door's wall instead of asking its own.)
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_other, v_other, 'true'::jsonb, 'workdoors_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_other, null, jsonb_build_object('name', 'Home')) returning id into v_shome;
  -- Written by the ADMIN through the doors, so he really is at `admin` on it — that is the arm
  -- of the approver query the leak runs through.
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  v_stbl := custom.table_declare(v_other, jsonb_build_object(
    'name','Service Calls','slug','service_calls','type','entity',
    'label_singular','Service Call','label_plural','Service Calls','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',false,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'parent_id', v_shome::text));
  perform custom.field_declare(v_other, v_stbl, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  v_srec := custom.record_write(v_other, v_stbl, jsonb_build_object('name','Water heater replacement — 114 5th St'));
  perform set_config('role', 'postgres', true);

  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from custom.work_approval_approvers(v_other, v_srec, null);
  if v_n = 0 then
    raise exception 'RED 3a DID NOT GO RED: the roster of an organization she is not in came back empty';
  end if;
  raise notice 'RED 3a IS RED — a member of another organization read % name(s) off a roster she has no business seeing.', v_n;

  -- 3b — THE OFF SWITCH. Turn this organization's store OFF and write a person anyway.
  perform set_config('role', 'postgres', true);
  update platform.knob_override
     set value = 'false'::jsonb
   where feature = 'custom' and key = 'system_enabled' and organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  v_person := custom.work_person(v_org, c_dana, true);
  if v_person is null then
    raise exception 'RED 3b: the fixture is wrong — no person came back at all';
  end if;
  -- The person already existed from RED 2's assignment, so the proof is that the door
  -- ANSWERED AT ALL with the store switched off, rather than refusing.
  raise notice 'RED 3b IS RED — the store is switched off for this organization and the person door answered anyway (%).', v_person;

  perform set_config('role', 'postgres', true);
  update platform.knob_override
     set value = 'true'::jsonb
   where feature = 'custom' and key = 'system_enabled' and organization_id = v_org;
end
$t$;

\i migrations/campaign/workdoors_both_new_doors_ask_the_census_questions.sql

-- ════════════════════════════════════════════════════════════════════════════════
-- RED 4 — AN ASSIGNMENT THAT DOES NOT GIVE ACCESS. Stated as code, because there is
--         no earlier version of `custom.work_assign` to restore: the defect is the
--         one line this lane refused to leave out.
-- ════════════════════════════════════════════════════════════════════════════════
create or replace function custom.work_assign(p_organization_id uuid, p_record_id uuid,
                                              p_assignee_user_id uuid,
                                              p_due_date timestamptz default null,
                                              p_clear_due boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_person uuid;
  v_version integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_assign');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.work_assign',
                                          'editor'::public.permission_level, 'record');
  v_person := custom.work_person(p_organization_id, p_assignee_user_id, true);
  -- THE DEFECT: the value is written and the access is not.
  v_version := custom.record_update(p_organization_id, p_record_id,
                                    jsonb_build_object('assignee', v_person::text), null);
  return jsonb_build_object('record_id', p_record_id, 'assigned', true,
                            'assignee', v_person, 'version', v_version,
                            'message', 'assigned (red twin: no share)');
end
$$;

do $t$
declare
  c_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org   uuid := (select v from rincon_millbrook_fixtures where k = 'org')::uuid;
  v_tbl   uuid := (select v from rincon_millbrook_fixtures where k = 'tbl')::uuid;
  v_new   uuid;
  v_n     integer;
begin
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  v_new := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Chase the invoice','price',200));
  perform custom.work_assign(v_org, v_new, c_dana, now() + interval '1 day');

  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  -- It is HERS, and she cannot open it. That is the dead end, exactly.
  select count(*) into v_n from custom.work_list(v_org, 'mine', false, 50, 0) w where w.record_id = v_new;
  if v_n <> 0 then
    raise exception 'RED 4 DID NOT GO RED: the work list showed her a record she has no access to';
  end if;
  begin
    perform custom.read_record(v_org, v_new, true);
    raise exception 'RED 4 DID NOT GO RED: she could open a record that was never shared with her';
  exception when insufficient_privilege or no_data_found then null;
  end;
  raise notice 'RED 4 IS RED — the record says she is the assignee and she can neither open it nor see it in her work.';
  perform set_config('role', 'postgres', true);
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════════
-- RED 5 — AN APPROVAL THAT APPROVES NOTHING: the row is marked and the change is
--         never made. Stated as code, for the same reason as RED 4.
-- ════════════════════════════════════════════════════════════════════════════════
create or replace function custom.work_approval_decide(p_organization_id uuid, p_approval_id uuid,
                                                       p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_decide');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_decide');
  -- THE DEFECT: it records the decision and applies nothing.
  update custom.record r
     set data = r.data || jsonb_build_object(
           'state', case when p_approve then 'approved' else 'declined' end,
           'decided_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where r.organization_id = p_organization_id and r.id = p_approval_id;
  return jsonb_build_object('approval_id', p_approval_id, 'applied', p_approve,
                            'message', 'decided (red twin: nothing applied)');
end
$$;

do $t$
declare
  c_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org   uuid := (select v from rincon_millbrook_fixtures where k = 'org')::uuid;
  v_rec   uuid := (select v from rincon_millbrook_fixtures where k = 'rec')::uuid;
  v_appr  jsonb;
  v_res   jsonb;
  v_price numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  v_appr := custom.work_approval_request(v_org, v_rec,
              jsonb_build_object('kind','record_patch','patch', jsonb_build_object('price', 750)),
              'A 25% discount.');

  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  v_res := custom.work_approval_decide(v_org, (v_appr ->> 'approval_id')::uuid, true, null);
  if not (v_res ->> 'applied')::boolean then
    raise exception 'RED 5: the fixture is wrong — the red body did not even claim to apply';
  end if;
  v_price := (custom.read_record(v_org, v_rec, true) ->> 'price')::numeric;
  if v_price <> 1000 then
    raise exception 'RED 5 DID NOT GO RED: the change was applied, so this body is not the defect';
  end if;
  raise notice 'RED 5 IS RED — the approval says applied and the record still says %.', v_price;
  perform set_config('role', 'postgres', true);
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════════
-- RED 6 — THE ORIGINAL DEFECT OF THE WHOLE LANE: the door is there and the client
--         cannot reach it.
-- ════════════════════════════════════════════════════════════════════════════════
-- THE DECLARATION GOES FIRST, and finding that out is worth writing down: a bare REVOKE on a
-- DECLARED door is undone inside the same statement by `platform.reopen_declared_doors`, which
-- prints "a revoke sweep took EXECUTE back from declared client doors and they were re-granted
-- in the same transaction". So the pre-lane state is the one this lane actually found — no door
-- row AND no grant — and that is what this block restores.
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'work_inbox';
revoke execute on function custom.work_inbox(uuid, integer, integer, boolean) from authenticated;

do $t$
declare
  v_org    uuid := (select v from rincon_millbrook_fixtures where k = 'org')::uuid;
  v_caught text;
begin
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform count(*) from custom.work_inbox(v_org, 10, 0, false);
    raise exception 'RED 6 DID NOT GO RED: the inbox answered a client that holds no EXECUTE on it';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  raise notice 'RED 6 IS RED — this is what the whole work layer answered before this lane: "%"', v_caught;
  perform set_config('role', 'postgres', true);
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════════
-- AND THE STORE IS PUT BACK. The rollback does it; this proves it rather than
-- assuming it, because W1-INDEX's inverse once reported success with every object
-- it was written to drop still standing.
-- ════════════════════════════════════════════════════════════════════════════════
do $t$
declare
  r record;
  v_now text;
  v_bad text[] := '{}';
begin
  for r in select k, v from rincon_millbrook_fixtures where k not in ('org','home','tbl','rec') loop
    v_now := case r.k
      when 'work_assign' then pg_get_functiondef('custom.work_assign(uuid, uuid, uuid, timestamptz, boolean)'::regprocedure)
      when 'work_approval_decide' then pg_get_functiondef('custom.work_approval_decide(uuid, uuid, boolean, text)'::regprocedure)
      when 'work_slots_declare' then pg_get_functiondef('custom.work_slots_declare(uuid, text, text, uuid)'::regprocedure)
      when 'work_transition_refusal' then pg_get_functiondef('custom.work_transition_refusal(uuid, uuid, uuid)'::regprocedure)
      when 'work_approval_approvers' then pg_get_functiondef('custom.work_approval_approvers(uuid, uuid, uuid)'::regprocedure)
      when 'work_person' then pg_get_functiondef('custom.work_person(uuid, uuid, boolean)'::regprocedure)
    end;
    -- RED 4, RED 5 and RED 6 are still standing here ON PURPOSE: the ROLLBACK below is what
    -- takes them out, and naming them is how this block stays honest about what it checked.
    if r.k in ('work_assign', 'work_approval_decide') then
      continue;
    end if;
    if v_now is distinct from r.v then
      v_bad := v_bad || r.k;
    end if;
  end loop;
  if array_length(v_bad, 1) is not null then
    raise exception 'the inverses did not put these back byte for byte: %', v_bad;
  end if;
  raise notice 'THE FOUR BODIES THE INVERSES TOUCHED ARE BYTE-IDENTICAL AGAIN; work_assign, work_approval_decide and the inbox grant are restored by the ROLLBACK on the next line.';
  raise notice '6 of 6 blocks are RED (the defect each one asserts is gone from the live store).';
end
$t$;

rollback;
