-- W1-FIELD — THE RED TWIN of `w1_field_t4_t8.sql`, ON THE MAIN DATABASE, FROM THE SEAT
-- `authenticated`.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_field_red.sql
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). It used to refuse to run anywhere
-- but the rehearsal branch — which does not carry `custom.field_declare` and grants a client
-- 29 functions against main's 103 — and it performed every write as the role that OWNS
-- `custom.record`. The owner's 2026-09-18 ruling is that there is no production: everything
-- is the main database. Every ASSERTED write below now goes through the door a signed-in
-- person reaches, and the ONE thing no door covers — removing the guard under test — steps
-- OUT of the seat, says so, and asserts nothing while it is out.
--
-- A guard that cannot be demonstrated FAILING is not a guard. Each transaction below removes
-- one of W1-FIELD's guards by REPLACING ITS TRIGGER FUNCTION WITH A PASS-THROUGH, performs
-- from the seat the very write the green suite proves is refused, and asserts it LANDS — then
-- rolls the whole thing back, guard included. Nothing here takes ACCESS EXCLUSIVE on
-- `custom.record`: `DROP TRIGGER` and `ALTER TABLE … DISABLE TRIGGER` lock the whole live
-- table against every other session for as long as the transaction runs, and on this database
-- that stalls the rest of the campaign. A replaced function body is invisible to every other
-- session until commit, and these transactions never commit.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/` and no sweep can see it.
--
-- WHAT EACH RED SAYS. If an assertion below fails, the guard it names was doing NOTHING and
-- the green suite's matching refusal was passing for some other reason.
--   RED 1  custom._field_shape_guard      — §F's refusals: a constraint smuggled into the
--          behaviour and an invented source both LAND through `custom.field_declare` without
--          it, while the word the DOOR refuses ("two behaviours") stays refused. That split
--          is the finding: §F is two mechanisms and this says which is which.
--   RED 2  custom._record_field_validation — REC-51 on the store: a record MISSING its
--          required field, one whose value is the wrong TYPE and one whose value is not one
--          of its choices all land through `custom.record_write`.
--   RED 3  custom._merge_field_shape_guard — DYN-2's three axes, all three fused into one
--          merge field written through `custom.record_write`.
--   RED 4  custom._entity_custom_fields_guard — REC-51's second half on a STANDARD table.
--          Since B1's move (2026-09-19) this guard follows the organization's own store
--          switch, so the green suite asserts it ON; without the guard the same payload
--          lands with the store still ON, which is what makes the green clause about the
--          guard rather than about the switch.
--   RED 5  custom.assert_client_may_change — the ACCESS wall §K credits, and the one clause
--          no trigger holds: without it `test@test.com`, a member who was shared nothing,
--          adds a column to a table she is not an admin of.

\set ON_ERROR_STOP on
\timing off

-- ── RED 1: THE DEFINITION GUARD ───────────────────────────────────────────────────────
begin;
set local lock_timeout = '60s';
set local statement_timeout = '240s';

-- OUT OF THE SEAT: no client door removes a production guard. Nothing is asserted here.
create or replace function custom._field_shape_guard() returns trigger
  language plpgsql as $g$ begin return new; end $g$;

do $r1$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_mf_kern constant uuid := '11111111-0000-4000-8000-000000000009';
  v_tbl     uuid;
  v_id      uuid;
  v_doc     jsonb;
  v_seen    text;
begin
  if (pg_control_system()).system_identifier <> 7642734024280108049 then
    raise exception 'w1_field_red.sql runs on the MAIN database only, and this is %',
                    (pg_control_system()).system_identifier;
  end if;
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_red');

  -- PART 0 — TAKE THE SEAT AND PROVE IT.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Birchwood Rooms','slug','birchwood_rooms','label_singular','Row','label_plural','Rows',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'title_field','name','parent_id', v_mf_kern::text));

  -- A CONSTRAINT SMUGGLED INTO THE BEHAVIOUR. The green suite's §F proves this refused with
  -- "the field Score writes a constraint into its behavior, and a constraint is a Rule".
  v_id := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','score','label','Score','plain','number','config','{"kind":"number","min":0,"max":100}'::jsonb));
  if v_id is null then raise exception 'RED 1: the constraint-in-behaviour write did not land'; end if;
  v_doc := custom.read_record(v_org, v_id, true);
  if not (v_doc -> 'config' ? 'min') then
    raise exception 'RED 1: the constraint smuggled into config did not survive: %', v_doc;
  end if;

  -- AN INVENTED SOURCE. §F proves this refused with "the field Note says its values come
  -- from typed_by_a_person, and a field is filled in by hand, computed, …".
  v_id := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','note','label','Note','plain','text','source','typed_by_a_person'));
  if v_id is null then raise exception 'RED 1: the invented-source write did not land'; end if;
  v_doc := custom.read_record(v_org, v_id, true);
  if (v_doc ->> 'source') <> 'typed_by_a_person' then
    raise exception 'RED 1: the invented source did not survive — it reads %', v_doc ->> 'source';
  end if;
  -- and both are visible through the definitions door, which is how a broken definition
  -- reaches a consumer: `custom.applicable_fields` re-checks nothing, and never should.
  if not exists (select 1 from custom.applicable_fields(v_org, v_tbl, null) a
                  where a.data ->> 'source' = 'typed_by_a_person') then
    raise exception 'RED 1: the broken definition is not visible through custom.applicable_fields';
  end if;

  -- THE DOOR'S OWN HALF IS UNTOUCHED, which is what makes RED 1 a statement about the GUARD:
  -- a field trying to have two behaviours is still refused, by the word it used.
  v_seen := null;
  begin
    perform custom.field_declare(v_org, v_tbl, '{"key":"two","label":"Two","type":["text","list"]}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null or position('There is no kind of column called' in v_seen) = 0 then
    raise exception 'RED 1: the door stopped refusing a field with two behaviours — %', coalesce(v_seen,'it landed');
  end if;
  raise notice 'RED 1 CONFIRMED — with custom._field_shape_guard gone, a constraint written into the behaviour and an invented source both LAND through custom.field_declare and read back through custom.applicable_fields, while the two-behaviour word the DOOR refuses stays refused';
end;
$r1$;

rollback;

-- ── RED 2: THE VALIDATION TRIGGER (REC-51) ────────────────────────────────────────────
begin;
set local lock_timeout = '60s';
set local statement_timeout = '240s';

do $r2$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_mf_kern constant uuid := '11111111-0000-4000-8000-000000000009';
  v_src_tbl constant uuid := '11111111-0001-4000-8000-000000000001';
  v_tbl     uuid;
  v_boss    text := current_user;
  v_n       integer;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2: this suite did not take the seat — current_user is %', current_user;
  end if;

  -- THE FIXTURE, THROUGH THE DOORS, WITH EVERY GUARD STILL ON: a table with a required list
  -- field and a required text field.
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Birchwood Contractors','slug','birchwood_contractors','label_singular','Row','label_plural','Rows',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'title_field','name','parent_id', v_mf_kern::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','name','label','Name','plain','text','sort',5));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','pick','label','Pick','parity_type','select','options_table_id', v_src_tbl::text,
    'required', true, 'sort', 10));

  -- OUT OF THE SEAT: the validator itself. Nothing is asserted here.
  perform set_config('role', v_boss, true);
  create or replace function custom._record_field_validation() returns trigger
    language plpgsql as $g$ begin return new; end $g$;
  perform set_config('role', 'authenticated', true);

  -- THE THREE WRITES §C AND §E PROVE REFUSED, THROUGH THE SAME DOOR A PERSON USES.
  if custom.record_write(v_org, v_tbl, '{"name":"missing"}'::jsonb) is null then
    raise exception 'RED 2 required: the write did not land';
  end if;
  if custom.record_write(v_org, v_tbl, '{"name":"wrong type","pick":7}'::jsonb) is null then
    raise exception 'RED 2 type: the write did not land';
  end if;
  -- The non-option is given as an ID, not as a word: a WORD that is not one of the choices
  -- is caught earlier and by a DIFFERENT guard (`custom._resolve_choice_words`, which turns
  -- what a person typed into the option it means and says "Pick does not have a choice
  -- called …"), so a word here would prove that guard rather than this one.
  if custom.record_write(v_org, v_tbl, jsonb_build_object('name','not an option','pick', v_mf_kern::text)) is null then
    raise exception 'RED 2 options: the write did not land';
  end if;
  select count(*) into v_n from custom.read_records(v_org, v_tbl, true, 200, 0);
  if v_n <> 3 then raise exception 'RED 2: % of the three invalid records landed', v_n; end if;
  raise notice 'RED 2 CONFIRMED — with custom._record_field_validation gone, a record MISSING its required field, one whose value is a number where words were declared, and one whose value is not one of its choices ALL land through custom.record_write and read back through custom.read_records: 3 of 3';
end;
$r2$;

rollback;

-- ── RED 3: THE MERGE-FIELD GUARD (DYN-2) ──────────────────────────────────────────────
begin;
set local lock_timeout = '60s';
set local statement_timeout = '240s';

-- OUT OF THE SEAT.
create or replace function custom._merge_field_shape_guard() returns trigger
  language plpgsql as $g$ begin return new; end $g$;

do $r3$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_mf_kern constant uuid := '11111111-0000-4000-8000-000000000009';
  v_id      uuid;
  v_doc     jsonb;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 3: this suite did not take the seat — current_user is %', current_user;
  end if;

  v_id := custom.record_write(v_org, v_mf_kern,
    '{"key":"birchwood_room_name","type":"overrideable_state_person_reference_variable",
      "source":["record","tool"],"semantic_type":"everything","modifiers":["urgent"],
      "override_policy":"whenever"}'::jsonb);
  if v_id is null then raise exception 'RED 3: the write did not land'; end if;
  v_doc := custom.read_record(v_org, v_id, true);
  if not (v_doc ? 'type') then raise exception 'RED 3: the fused type did not survive'; end if;
  if jsonb_typeof(v_doc -> 'source') <> 'array' then raise exception 'RED 3: the two sources did not survive'; end if;
  if (v_doc ->> 'semantic_type') <> 'everything' then raise exception 'RED 3: the invented semantic type did not survive'; end if;
  if (v_doc -> 'modifiers' ->> 0) <> 'urgent' then raise exception 'RED 3: the invented modifier did not survive'; end if;
  raise notice 'RED 3 CONFIRMED — with custom._merge_field_shape_guard gone, a merge field that fuses all three axes into one type, names two sources, invents a semantic type and invents a modifier LANDS through custom.record_write and reads back through custom.read_record';
end;
$r3$;

rollback;

-- ── RED 4: REC-51's SECOND HALF, ON A STANDARD TABLE ──────────────────────────────────
begin;
set local lock_timeout = '60s';
set local statement_timeout = '240s';

do $r4$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_src_tbl constant uuid := '11111111-0001-4000-8000-000000000001';
  v_boss    text := current_user;
  v_party   uuid;
  v_msg     text;
  v_n       integer;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 4: this suite did not take the seat — current_user is %', current_user;
  end if;

  -- OUT OF THE SEAT for the whole of RED 4: a Field OF A STANDARD TABLE is named by a
  -- registry token rather than by a Table id, and `custom.field_declare` takes the Table as
  -- its second argument — so no client door makes one, exactly as §H of the green suite says.
  perform set_config('role', v_boss, true);
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'table_token','party','key','birchwood_contractor_trade','label','Birchwood contractor trade','type','list',
    'multi',false,'dated',false,'rules','[]'::jsonb,
    'config', jsonb_build_object('options_table_id', v_src_tbl::text),
    'required', false,'sort',10,'source','manual','source_config','{}'::jsonb,
    'sensitivity','internal','context_policy','include',
    'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));

  -- THE GUARD IS ON (the organization's store is on): the payload is refused BY NAME. This
  -- is the green suite's clause, restated here so RED 4 compares two states rather than one.
  begin
    insert into crm.party (party_kind, display_name, organization_id, custom_fields)
    values ('person','Dominic Ferro', v_org, '{"birchwood_contractor_trade":"not-an-option"}'::jsonb);
    raise exception 'RED 4 INCONCLUSIVE: the invalid payload landed with the guard still in place';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Birchwood contractor trade was given a choice that is not one of its choices' then
      raise exception 'RED 4 INCONCLUSIVE: it was refused for some other reason: "%"', v_msg;
    end if;
  end;

  -- THE GUARD REMOVED: the SAME write lands, with the store still ON — so the green clause
  -- is about the guard and not about the switch.
  create or replace function custom._entity_custom_fields_guard() returns trigger
    language plpgsql as $g$ begin return new; end $g$;
  insert into crm.party (party_kind, display_name, organization_id, custom_fields)
  values ('person','Tanya Iversen', v_org, '{"birchwood_contractor_trade":"not-an-option"}'::jsonb)
    returning id into v_party;
  select count(*) into v_n from crm.party
   where id = v_party and custom_fields ->> 'birchwood_contractor_trade' = 'not-an-option';
  if v_n <> 1 then raise exception 'RED 4: the write did not land with the guard gone'; end if;
  raise notice 'RED 4 CONFIRMED — with the organization''s store ON the invalid custom_fields payload is refused by the field''s own name, and with custom._entity_custom_fields_guard gone the SAME payload lands: what the guard withholds is real';
end;
$r4$;

rollback;

-- ── RED 5: THE ACCESS WALL ────────────────────────────────────────────────────────────
begin;
set local lock_timeout = '60s';
set local statement_timeout = '240s';

do $r5$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_mf_kern constant uuid := '11111111-0000-4000-8000-000000000009';
  v_boss    text := current_user;
  v_tbl     uuid;
  v_id      uuid;
  v_seen    text;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 5: this suite did not take the seat — current_user is %', current_user;
  end if;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Birchwood Purchases','slug','birchwood_purchases','label_singular','Row','label_plural','Rows',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'title_field','name','parent_id', v_mf_kern::text));

  -- THE WALL IS THERE: as test@test.com the shape change is refused.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_seen := null;
  begin
    perform custom.field_declare(v_org, v_tbl, '{"label":"Sneaked in","plain":"text"}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null then
    raise exception 'RED 5 INCONCLUSIVE: she could already add a column, so §K proves nothing';
  end if;

  -- OUT OF THE SEAT: the one predicate that asks whether this person may change this table's
  -- SHAPE is replaced by a body that always says yes.
  perform set_config('role', v_boss, true);
  create or replace function custom.assert_client_may_change(
    p_organization_id uuid, p_subject_id uuid, p_door text,
    p_required public.permission_level default 'admin'::public.permission_level,
    p_subject_word text default 'record')
    returns void language plpgsql stable set search_path to 'pg_catalog'
  as $g$ begin return; end $g$;
  perform set_config('role', 'authenticated', true);

  -- AND NOW SHE DOES IT.
  v_id := custom.field_declare(v_org, v_tbl, '{"key":"sneaked_in","label":"Sneaked in","plain":"text"}'::jsonb);
  if v_id is null then
    raise exception 'RED 5 INCONCLUSIVE: the shape change was still refused, so §K is held by something other than custom.assert_client_may_change';
  end if;
  raise notice 'RED 5 CONFIRMED — with custom.assert_client_may_change neutered, test@test.com adds a column to a table she is not an admin of: %', custom.read_record(v_org, v_id, true) ->> 'label';
end;
$r5$;

rollback;
