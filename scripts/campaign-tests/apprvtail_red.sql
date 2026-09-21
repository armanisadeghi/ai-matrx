-- LANE APPROVAL-TAIL — THE RED TWIN. It runs the REAL BYTES of this lane's two inverses and
-- asserts each defect exactly as it stood before the fix. Every clause below must FAIL on the
-- live database and PASS here, inside the rolled-back transaction where the fix is undone.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/apprvtail_red.sql
--
-- IT ENDS IN ROLLBACK AND LEAVES NOTHING — including the two inverses it ran. The fix is back
-- the moment the transaction closes; PART 4 proves that inside the same session by re-running
-- the two clauses against the restored bodies after the inverses have been undone.
--
-- ITS GREEN HALVES are `aidream/packages/matrx-records/tests/test_a_delete_and_a_new_table_wait_too.py`
-- (the product behaviour, against the live store) and
-- `aidream/packages/matrx-records/tests/test_every_verb_declares_how_it_is_decided.py`
-- (the census: no verb of the tool bypasses the decision).
--
-- THE THREE DEFECTS, ONE PER PART:
--   1  the ONE queue could not hold a delete, a restore or a new table, so the only verb that
--      TAKES SOMETHING AWAY was the one nobody was asked about, and an `always_ask`
--      organization was told to go and make its own table.
--   2  a row of the Field kernel could be written with any class at all, which is how 1156
--      live Field rows came to be marked 'record' — invisible to every reader that asks for a
--      Field by class, including the duplicate check that stops one table having the same
--      column twice.
--   3  `custom._options_table_for` named no class on either of the two columns it writes, so
--      every dropdown anybody ever made left second-class Field rows behind.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'apprvtail_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end
$t$;

-- ════════════════════════════════════════════════════ THE FIX, UNDONE, REAL BYTES
\i migrations/inverse/apprvtail_the_queue_holds_a_delete_and_a_new_table_down.sql
\i migrations/inverse/apprvtail_a_field_row_is_a_field_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_rec     uuid;
  v_field   uuid;
  v_caught  text;
  v_code    text;
  v_class   text;
  v_kinds   integer;
  v_boss    text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/apprvtail_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cascade Electronics Recovery — Tacoma Yard ' || substr(v_org::text, 1, 8),
          'cascade-electronics-tacoma-' || substr(v_org::text, 1, 8), 'CET', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'apprvtail_red');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Crews', 'slug', 'crews_' || substr(v_org::text, 1, 8), 'type', 'entity',
    'label_singular', 'Crew', 'label_plural', 'Crews', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'crew_name',
    'retention_days', 365, 'agent_writable', true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','crew_name','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','crew_name')),
    'parent_id', v_home));
  v_field := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','crew_name','label','Crew name','type','text','multi',false,'dated',false,
    'rules','[]'::jsonb,'config','{}'::jsonb,'source','manual','source_config','{}'::jsonb,
    'sensitivity','internal','context_policy','include','applies_to_types','[]'::jsonb,
    'depends_on','[]'::jsonb));
  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object('crew_name','North'));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — TAKE THE SEAT AND PROVE IT. Everything above is fixture, written before the
  -- seat is taken and asserting nothing; everything below runs as `authenticated`, the role
  -- PostgREST gives a signed-in person, through the doors that person reaches.
  -- ════════════════════════════════════════════════════════════════════════════
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

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE ONE QUEUE COULD NOT HOLD A DELETE, A RESTORE OR A NEW TABLE.
  -- On the live database each of these three files a wait and answers with its id.
  -- ════════════════════════════════════════════════════════════════════════════
  begin
    perform custom.work_approval_request(v_org, v_rec, jsonb_build_object('kind','record_delete'),
                                         null, null, 'agent', null);
    raise exception '1a: the queue accepted a record_delete, so the fix is still in place';
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_caught = message_text;
    if v_code <> '22023' then raise; end if;
    raise notice '1a RED: a delete could not be queued — %', v_caught;
  end;

  begin
    perform custom.work_approval_request(v_org, v_rec, jsonb_build_object('kind','record_restore'),
                                         null, null, 'agent', null);
    raise exception '1b: the queue accepted a record_restore, so the fix is still in place';
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_caught = message_text;
    if v_code <> '22023' then raise; end if;
    raise notice '1b RED: a restore could not be queued — %', v_caught;
  end;

  begin
    perform custom.work_approval_request(v_org, v_home,
      jsonb_build_object('kind','table_add','table',jsonb_build_object('name','Approved Crews','parent_id',v_home::text)),
      null, null, 'agent', null);
    raise exception '1c: the queue accepted a table_add, so the fix is still in place';
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_caught = message_text;
    if v_code <> '22023' then raise; end if;
    raise notice '1c RED: an always_ask organization could not queue a new table — %', v_caught;
  end;

  -- AND THE ONE LIST IS GONE WITH THEM. The three kinds were written out in three places,
  -- which is how a kind gets accepted by the row guard and refused by the door that applies it.
  select count(*) into v_kinds from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'work_approval_kinds';
  if v_kinds <> 0 then
    raise exception '1d: custom.work_approval_kinds() still exists, so the inverse did not run';
  end if;
  raise notice '1d RED: there is no single list of kinds — each door carries its own copy';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — A FIELD ROW COULD BE WRITTEN WITH ANY CLASS AT ALL.
  -- This is the exact write `RecordStore.table_propose` made 1156 times: the Field
  -- document, fully valid, through the plain record door, class defaulting to 'record'.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The Table declares the name first — custom._field_shape_guard refuses a definition for a
  -- column the Table never named, and it is right to. That refusal is not the defect; the
  -- CLASS the row is then written with is.
  -- 🚨 THE NAME GOES ON OUT OF THE SEAT NOW, AND SAYS SO (lane RED-SUITES-3, 2026-09-21).
  -- This used to go through `custom.record_update`, and FIELD-TRUTH closed that door:
  -- `custom.assert_columns_are_defined` refuses a Table that claims a column no Field record
  -- backs — "Crews says it has a column called "region", and there is no such field." — which
  -- is RIGHT, and is exactly why `custom.field_declare` now adds the name and the definition
  -- together. But a Table claiming a name with no definition is the PRECONDITION this block
  -- needs: the defect it plants is the CLASS the Field row is then written with, and the row
  -- has to be written through the raw record door for that to be possible at all. So the name
  -- is put on as the connected role, deliberately, with no product clause asserted while out.
  perform set_config('role', v_boss, true);
  set local session_replication_role = 'replica';
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  jsonb_build_array(jsonb_build_object('name','crew_name'),
                                    jsonb_build_object('name','region')))
   where organization_id = v_org and id = v_tbl;
  set local session_replication_role = 'origin';
  perform set_config('role', 'authenticated', true);
  v_field := custom.record_write(v_org, custom.field_kernel_id(), jsonb_build_object(
    'key','region','label','Region','type','text','multi',false,'dated',false,
    'rules','[]'::jsonb,'config','{}'::jsonb,'source','manual','source_config','{}'::jsonb,
    'sensitivity','internal','context_policy','include','applies_to_types','[]'::jsonb,
    'depends_on','[]'::jsonb,'entity_definition_id', v_tbl));

  -- READING THE ROW'S CLASS IS A CATALOGUE QUESTION AND NO CLIENT DOOR ANSWERS IT — every
  -- door answers DOCUMENTS, which is the whole reason the wrong class went unnoticed for
  -- 1156 rows. It steps out for exactly one SELECT and asserts nothing else while out.
  perform set_config('role', v_boss, true);
  select data_class into v_class from custom.record
   where organization_id = v_org and id = v_field;
  perform set_config('role', 'authenticated', true);
  if v_class <> 'record' then
    raise exception '2a: the Field row came back as %, so the guard is still in place', v_class;
  end if;
  raise notice '2a RED: a column of a table was stored as a plain record (data_class = %)', v_class;

  -- AND THAT IS WHY IT COULD BE ADDED TWICE. `custom.field_declare` asks for a Field BY
  -- CLASS, so the row above is invisible to its duplicate check and the same column goes in
  -- again — which is the pair that exists on the main database today.
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','region','label','Region','type','text','multi',false,'dated',false,
    'rules','[]'::jsonb,'config','{}'::jsonb,'source','manual','source_config','{}'::jsonb,
    'sensitivity','internal','context_policy','include','applies_to_types','[]'::jsonb,
    'depends_on','[]'::jsonb));
  -- THE DOOR ONLY EVER SEES ONE OF THEM, which is the cost of the wrong class stated as a
  -- measurement: custom.applicable_fields reads Fields BY CLASS, so the second-class row is
  -- invisible to it and to custom.field_declare's duplicate check alike.
  -- AND THE PERSON SEES BOTH. custom.field_declare's duplicate check asks for Fields BY
  -- CLASS, so it cannot see the second-class row and lets the same key in again — while
  -- custom.applicable_fields, the door that draws a table's columns, does NOT filter by class
  -- and hands back both. The column appears twice on the screen and nothing refused it.
  -- Measured from the seat, through the doors.
  if (select count(*) from custom.applicable_fields(v_org, v_tbl, null) f
       where f.data ->> 'key' = 'region') <> 2 then
    raise exception '2b: the same column was not added twice, so the guard is still in place — the door sees % of them',
      (select count(*) from custom.applicable_fields(v_org, v_tbl, null) f where f.data ->> 'key' = 'region');
  end if;
  raise notice '2b RED: one table now shows the column "region" twice, and nothing refused it';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — EVERY DROPDOWN LEFT SECOND-CLASS COLUMNS BEHIND.
  -- `custom._options_table_for` is what a list field's choices go through, and it named
  -- no class on either column it writes.
  -- ════════════════════════════════════════════════════════════════════════════
  begin
    -- THROUGH THE CLIENT DOOR, because that is how a person makes a dropdown:
    -- custom.field_declare makes the choices table for a `list` column, and
    -- custom._options_table_for is what it calls.
    -- Same precondition, same reason as PART 2 above: the name without the definition, put on
    -- as the connected role because no client door will do it and the block is about what
    -- `custom._options_table_for` writes, not about how the name got there.
    perform set_config('role', v_boss, true);
    set local session_replication_role = 'replica';
    update custom.record
       set data = jsonb_set(data, '{fields}',
                    jsonb_build_array(jsonb_build_object('name','crew_name'),
                                      jsonb_build_object('name','region'),
                                      jsonb_build_object('name','area')))
     where organization_id = v_org and id = v_tbl;
    set local session_replication_role = 'origin';
    perform set_config('role', 'authenticated', true);
    -- 🚨 THE DEFECT NOW SURFACES LOUDER, AND THIS BLOCK SAYS SO (lane RED-SUITES-3,
    -- 2026-09-21). This used to make the dropdown, let it succeed, and then count the
    -- second-class Field rows it left behind. The undeclared-key guard landed since, and it
    -- reads a table's columns through `custom.applicable_fields`, which filters on
    -- `data_class = 'field'` — so the two columns the pre-fix `custom._options_table_for`
    -- writes WITHOUT a class are invisible to it, and the very next statement, the one that
    -- writes "North" and "South" into the Choice table, is refused:
    --     Choice has no field called "key", "title", so there is nowhere to keep those values.
    -- That is the same defect with a bigger consequence: with the fix removed a person cannot
    -- MAKE a dropdown at all. The block asserts the refusal, and names its cause, instead of
    -- asserting a silent count that can no longer be reached.
    begin
      perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
        'key','area','label','Area','type','list','multi',false,'dated',false,
        'rules','[]'::jsonb,'config','{}'::jsonb,'source','manual','source_config','{}'::jsonb,
        'sensitivity','internal','context_policy','include','applies_to_types','[]'::jsonb,
        'depends_on','[]'::jsonb, 'options', jsonb_build_array('North','South')));
      raise exception '3: the dropdown was made, so the choices table wrote its columns as fields and the fix is still in place';
    exception when others then
      get stacked diagnostics v_caught = message_text;
      if v_caught not like '%has no field called%' then
        raise exception '3: making a dropdown failed for another reason: "%"', v_caught;
      end if;
    end;
    raise notice '3 RED: with the pre-fix choices body in place a person cannot make a dropdown at all — the two columns it writes carry no class, so custom.applicable_fields cannot see them and the store refuses the choices themselves: "%"', v_caught;
  end;
end
$t$;

rollback;

-- ════════════════════════════════════════════════════════════════════════════════
-- PART 4 — THE FIX IS BACK, IN THIS SAME SESSION, AFTER THE ROLLBACK.
-- The two clauses that were RED above are run again against the restored bodies. A red twin
-- that left the database undone would be worse than no red twin.
-- ════════════════════════════════════════════════════════════════════════════════
do $t$
declare
  v_kinds text[];
begin
  select custom.work_approval_kinds() into v_kinds;
  if not ('record_delete' = any (v_kinds) and 'record_restore' = any (v_kinds)
          and 'table_add' = any (v_kinds)) then
    raise exception '4a: the one list of kinds did not come back after the rollback: %', v_kinds;
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'custom.record'::regclass
                    and t.tgname = 'custom_record_field_shape_guard_class') then
    raise exception '4b: the Field class guard did not come back after the rollback';
  end if;
  raise notice '4 GREEN AGAIN: the six kinds are % and the class guard is back on custom.record', v_kinds;
end
$t$;
