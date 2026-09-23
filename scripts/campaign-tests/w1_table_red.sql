-- W1-TABLE — THE RED TWIN of `w1_table_t4_t10.sql` (rules 2 and 3), on the MAIN database.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_table_red.sql
--
-- A guard that cannot be demonstrated FAILING is not a guard. This file turns each of
-- W1-TABLE's two guards off INSIDE ONE TRANSACTION, performs the write the green suite
-- proves is refused — THROUGH THE SAME DOOR, FROM THE SAME SEAT — and asserts it LANDS,
-- then rolls the whole thing back, guards included, because `ALTER TABLE … DISABLE TRIGGER`
-- is itself transactional.
--
-- IT IS NOT A MIGRATION and it lives outside `migrations/`.
--
-- 🚨 THE MAIN DATABASE (SEAT-SUITES, 2026-09-19). This file used to refuse to run anywhere
-- but the rehearsal branch, which holds 226 of schema `custom`'s 332 functions, grants
-- `authenticated` 29 of the 103 it has on main, and has no `custom.field_declare` at all —
-- so the store these clauses are about is not there. The owner's 2026-09-18 ruling is that
-- there is no production and everything is the main database.
--
-- 🚨 THE SEAT (SEAT-SUITES, 2026-09-19). Every WRITE below now goes through the door a
-- signed-in person reaches (`custom.record_write`, `custom.record_reparent`,
-- `custom.table_declare`, `custom.field_declare`) from the seat `authenticated`, and every
-- READ through `custom.read_record` / `custom.tables_at_home`. Only the steps NO client door
-- covers — the Home record, the `ALTER TABLE … TRIGGER` itself and the removal of a Home
-- placement — step out of the seat, and they say so and assert nothing while they are out.
-- That matters here more than anywhere: a guard demonstrated failing for the table's OWNER
-- says nothing about the guard a person meets.
--
-- WHAT EACH RED SAYS. If an assertion below fails, the guard it names was doing NOTHING and
-- the green suite's matching refusal was passing for some other reason - a typo in the
-- write, a constraint somewhere else, an exception handler catching the wrong thing.
--
-- IT TAKES ACCESS EXCLUSIVE on `custom.record` and its sixteen partitions for as long as it
-- runs, which under traffic can take a minute to acquire, so it runs with the lock and
-- statement timeouts raised and the whole store waits on it. It ends in ROLLBACK.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_table_red.sql'
\set requires 'grant:authenticated:custom.table_declare|function:platform.settle_deferred_checks'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org        uuid := gen_random_uuid();
  v_hq         uuid;
  v_project    uuid;
  v_prev       uuid;
  v_landed     uuid;
  v_walk       uuid;
  v_doc        jsonb;
  v_n          integer;
  v_ids        uuid[];
  v_x          uuid;
  v_risk       uuid;
  v_caught     text;
  v_boss       text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/w1_table_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co', 'rincon-plumbing-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_table_red');
  -- A Home has no client door of its own.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'W1-TABLE RED HQ'))
  returning id into v_hq;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  v_project := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Project', 'slug', 'projects',
    'label_singular', 'Project', 'label_plural', 'Projects',
    'type', 'entity', 'display', 'page', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'pname')),
    'title_field', 'pname', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_project, jsonb_build_object('key','pname','label','Name','plain','text'));

  -- ── RED 1: the containment trigger, at the depth-17 edge ─────────────────────
  v_prev := v_hq;
  for i in 2..16 loop
    v_prev := custom.record_write(v_org, v_project,
      jsonb_build_object('pname', format('chain %s', i), 'parent_id', v_prev::text));
  end loop;

  -- THE ONE OPERATOR STATEMENT. `ALTER TABLE` is not a person's verb and no door covers it,
  -- so it steps out of the seat and says so — and asserts nothing while it is out. Both
  -- triggers are taken in ONE statement so the ACCESS EXCLUSIVE lock is waited for once; the
  -- re-enables below cost nothing because the transaction already holds it.
  perform set_config('role', v_boss, true);
  -- SUITES-TIDY-2 2026-09-22: DDL on custom.record after a write in this transaction is refused with 55006 (zzzz_relation_halves_agree is deferred); fire it first, restore after.
  perform platform.settle_deferred_checks('custom.record'::regclass, true);
  alter table custom.record
    disable trigger custom_record_containment_guard,
    disable trigger custom_record_table_shape_guard;
  perform platform.settle_deferred_checks('custom.record'::regclass, false);
  perform set_config('role', 'authenticated', true);

  v_landed := custom.record_write(v_org, v_project,
    jsonb_build_object('pname', 'chain 17', 'parent_id', v_prev::text));
  if v_landed is null then
    raise exception 'RED 1 did not go red: a depth-17 record did not land through custom.record_write with custom_record_containment_guard DISABLED, so that trigger is not what refuses it';
  end if;
  -- The ancestors are counted the way a screen counts them: `parent_id` out of
  -- `custom.read_record`. `custom.containment_chain` carries no client grant.
  v_walk := v_landed; v_n := 0;
  for i in 1..64 loop
    v_doc := custom.read_record(v_org, v_walk, true);
    exit when v_doc is null or (v_doc ->> 'parent_id') is null;
    v_walk := (v_doc ->> 'parent_id')::uuid;
    v_n := v_n + 1;
  end loop;
  if v_n <> 16 then
    raise exception 'RED 1: the record that landed sits % ancestors up, expected 16', v_n;
  end if;
  raise notice 'RED 1 - with custom_record_containment_guard DISABLED, the SAME door write a person makes landed a record at depth 17 (id %, % ancestors). The ceiling is that trigger and nothing else.', v_landed, v_n;

  -- and the cycle, with the same trigger off, through the same reparent door.
  perform custom.record_reparent(v_org, v_hq, v_landed);
  if (custom.read_record(v_org, v_hq, true) ->> 'parent_id')::uuid is distinct from v_landed then
    raise exception 'RED 1b did not go red: a reparent under its own deepest descendant did not take with the guard DISABLED';
  end if;
  raise notice 'RED 1b - with the same trigger DISABLED, custom.record_reparent put HQ inside its own deepest descendant. "this would put it inside itself" comes from the trigger.';

  -- put the cycle back before anything else walks the tree. There is no "unparent" door, so
  -- this repair is the operator's, and it says so.
  perform set_config('role', v_boss, true);
  update custom.record set data = data - 'parent_id'
   where organization_id = v_org and id = v_hq;
  -- SUITES-TIDY-2 2026-09-22: DDL on custom.record after a write in this transaction is refused with 55006 (zzzz_relation_halves_agree is deferred); fire it first, restore after.
  perform platform.settle_deferred_checks('custom.record'::regclass, true);
  alter table custom.record enable trigger custom_record_containment_guard;
  perform platform.settle_deferred_checks('custom.record'::regclass, false);
  perform set_config('role', 'authenticated', true);

  -- ── RED 2: the Table shape guard ─────────────────────────────────────────────
  -- Still disabled from the one statement above.
  v_landed := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Untitled', 'slug', 'untitled',
    'label_singular', 'U', 'label_plural', 'Us',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
    'parent_id', v_hq::text));
  if v_landed is null then
    raise exception 'RED 2 did not go red: a Table with no title field did not land through custom.table_declare with the shape guard DISABLED';
  end if;
  -- read it back through the READ DOOR, not out of the jsonb the door was handed.
  v_doc := custom.read_record(v_org, v_landed, true);
  if v_doc is null or (v_doc ->> 'title_field') is not null then
    raise exception 'RED 2: the half-declared Table did not read back through custom.read_record with NO title field: %', v_doc;
  end if;
  raise notice 'RED 2 - with custom_record_table_shape_guard DISABLED, custom.table_declare stored a Table carrying no title field (id %) and the read door hands it back that way. REC-1 and REC-2 are that trigger.', v_landed;

  perform set_config('role', v_boss, true);
  -- SUITES-TIDY-2 2026-09-22: DDL on custom.record after a write in this transaction is refused with 55006 (zzzz_relation_halves_agree is deferred); fire it first, restore after.
  perform platform.settle_deferred_checks('custom.record'::regclass, true);
  alter table custom.record enable trigger custom_record_table_shape_guard;
  perform platform.settle_deferred_checks('custom.record'::regclass, false);
  perform set_config('role', 'authenticated', true);

  -- ── RED 3: T10's Home assertion is not vacuous ───────────────────────────────
  -- Remove the additional-Home placement and the same positive assertion the green suite
  -- makes goes false, which is what stops it being a query that could never fail.
  v_x := custom.record_write(v_org, v_project, jsonb_build_object('pname', 'Project X', 'parent_id', v_hq::text));
  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk', 'slug', 'risks',
    'label_singular', 'Risk', 'label_plural', 'Risks',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title')),
    'title_field', 'title', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_risk, jsonb_build_object('key','title','label','Title','plain','text'));
  perform custom.home_add(v_org, v_risk, v_x);

  select array_agg(table_id) into v_ids from custom.tables_at_home(v_org, array[v_x]);
  if not (v_risk = any (coalesce(v_ids, '{}'::uuid[]))) then
    raise exception 'RED 3 setup: Risk is not at Home in X even with its placement present';
  end if;

  -- TAKING a Home back has no client door (`custom.home_add` has no twin), so the removal is
  -- the operator's and says so. The ASSERTION after it is the person's, and is asked seated.
  perform set_config('role', v_boss, true);
  delete from custom.record
   where organization_id = v_org and data_class = 'relation'
     and (data ->> 'to')::uuid = v_risk and (data ->> 'from')::uuid = v_x;
  perform set_config('role', 'authenticated', true);

  select array_agg(table_id) into v_ids from custom.tables_at_home(v_org, array[v_x]);
  if v_risk = any (coalesce(v_ids, '{}'::uuid[])) then
    raise exception 'RED 3 did not go red: Risk is still at Home in X after its only placement there was removed, so custom.tables_at_home is not reading the placement at all';
  end if;
  raise notice 'RED 3 - with the referenced carrying placement removed, the door a person asks no longer puts Risk at Home in X. custom.tables_at_home''s `additional` branch is what T10 reads.';

  -- ── RED 4: the SEAT itself is not vacuous ────────────────────────────────────
  -- The green suite's PART 5 says test@test.com cannot change a Table's shape. A refusal is
  -- only a refusal if somebody is refused, so here is the same call by the person who CAN,
  -- and it lands — and the same call by her, refused. Two inputs, two expected answers.
  if custom.field_declare(v_org, v_risk, jsonb_build_object('key','owner_added','label','Owner added','plain','text')) is null then
    raise exception 'RED 4: the organization''s owner could not add a column, so PART 5''s refusal proves nothing';
  end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_risk, jsonb_build_object('key','she_added','label','She added','plain','text'));
  exception when others then v_caught := sqlerrm;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  if v_caught is null then
    raise exception 'RED 4 did not go red: test@test.com added a column, so the access wall in PART 5 is not there';
  end if;
  raise notice 'RED 4 - the owner adds a column and it lands; test@test.com makes the same call and is refused ("%"). PART 5''s wall is the access ladder and not a door that refuses everybody.', left(v_caught, 90);

  raise notice 'W1-TABLE RED SUITE COMPLETE - every guard the green suite relies on has been shown failing, from the seat `authenticated`, on the main database';
end;
$r$;

rollback;
