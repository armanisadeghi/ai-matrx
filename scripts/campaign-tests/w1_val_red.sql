-- W1-VAL — THE RED TWIN of `w1_val_t5.sql`, on the MAIN database. It turns the three
-- enforcement points the GREEN suite rests on OFF inside ONE transaction that ends in ROLLBACK, and proves that every
-- write `w1_val_t5.sql` watches being REFUSED then LANDS — THROUGH THE SAME DOOR, FROM THE
-- SAME SEAT. A guard that cannot be demonstrated failing is not a guard (§3 rule 2), and a
-- refusal nobody has seen disappear is a refusal nobody has tested.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_val_red.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it rolls
-- back — the constraint and the trigger come back with it, because `ALTER TABLE` is
-- transactional.
--
-- 🚨 THE MAIN DATABASE (SEAT-SUITES, 2026-09-19). This file used to refuse to run anywhere
-- but the rehearsal branch, which holds 226 of schema `custom`'s 332 functions and grants
-- `authenticated` 29 of the 103 main grants — the store it is about is not there. The owner's
-- 2026-09-18 ruling is that there is no production and everything is the main database.
--
-- 🚨 THE SEAT (SEAT-SUITES, 2026-09-19). Every write below is now made by a SIGNED-IN PERSON
-- through `custom.record_write` / `custom.record_update`, and read back through
-- `custom.value_read` / `custom.read_record`. Only the operator statements that remove the
-- enforcement points step out of the seat, and they say so and assert nothing while out.
-- A value landing for the table's OWNER would say nothing about what a person may store.
--
-- WHAT IT REMOVES, and therefore what each removal proves:
--   · trigger `_value_envelope`      → the actor is no longer resolved or refused, the
--                                      provenance is no longer interned, the author and the
--                                      version are no longer stamped from the write.
--   · constraint `record_value_envelope` → the envelope's shape is no longer law: a confidence
--                                      score, a per-value visibility, a fifth absence word and
--                                      a value that is both present and missing all become
--                                      storable.
--   · trigger `custom_record_field_validation` → `custom.validate_value_envelope` stops
--                                      refusing provenance for a field the table never
--                                      declared. Measured 2026-09-19: the green suite's K
--                                      clause is held by THIS trigger and not by the check
--                                      constraint, which is why the twin names all three.
--
-- IT TAKES ACCESS EXCLUSIVE on `custom.record` and its sixteen partitions for as long as it
-- runs, which under traffic can take a minute to acquire, so the lock and statement timeouts
-- are raised and the whole store waits on it.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_val_red.sql'
\set requires 'grant:authenticated:custom.table_declare|function:platform.settle_deferred_checks'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org    uuid := gen_random_uuid();
  v_home   uuid;
  v_person uuid;
  v_rec    uuid;
  v_txt    text;
  v_j      jsonb;
  v_vals   jsonb;
  v_v      integer;
  v_caught text;
  v_landed integer := 0;
  v_boss   text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/w1_val_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ridgeline Physical Therapy', 'ridgeline-physical-therapy-red-' || substr(v_org::text, 1, 8), 'RPT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_val_red');
  -- A Home has no client door of its own.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Ridgeline Physical Therapy — Clinic'))
  returning id into v_home;

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

  -- THE FIXTURE, identical to the GREEN suite's, built through the doors.
  v_person := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Patients', 'slug', 'patients', 'type', 'entity',
    'label_singular', 'Patient', 'label_plural', 'Patients',
    'title_field', 'full_name', 'display', 'page', 'weight', 'light',
    'ordered', false, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
    'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','full_name'), jsonb_build_object('name','phone')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_person, jsonb_build_object('key','full_name','label','Full name','plain','text'));
  perform custom.field_declare(v_org, v_person, jsonb_build_object('key','phone','label','Phone','plain','text'));

  -- THE CONTROL, BEFORE ANYTHING IS REMOVED (rule 14): the six writes below are refused
  -- RIGHT NOW, from this seat, through these doors. A twin that only showed them landing
  -- would pass if the doors had never refused them at all.
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_person, jsonb_build_object('_actor','robot','full_name','Wei Chen'));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'RED setup: "robot" was accepted as an author BEFORE anything was removed, so this twin measures nothing';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- OFF. The first two enforcement points, out of the seat, sharing one ACCESS EXCLUSIVE
  -- wait. The third is taken at RED 5, where it is the clause under test. Nothing is
  -- asserted here.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  -- SUITES-TIDY-2 2026-09-22: DDL on custom.record after a write in this transaction is refused with 55006 (zzzz_relation_halves_agree is deferred); fire it first, restore after.
  perform platform.settle_deferred_checks('custom.record'::regclass, true);
  alter table custom.record drop constraint record_value_envelope;
  drop trigger _value_envelope on custom.record;
  perform platform.settle_deferred_checks('custom.record'::regclass, false);
  perform set_config('role', 'authenticated', true);

  -- ── RED 1: an author outside the vocabulary, and a forged version, both LAND ──
  v_rec := custom.record_write(v_org, v_person, jsonb_build_object(
    '_actor', 'robot',
    'full_name', 'Wei Chen',
    'phone', '+1-415-555-0101',
    '_values', jsonb_build_object('phone', jsonb_build_object('actor', 'human', 'ver', 99))));
  select actor, value_version into v_txt, v_v from custom.value_read(v_org, v_rec, 'phone');
  if v_txt <> 'human' then
    raise exception 'RED 1: with the trigger gone, the retired word "human" should have survived as the author, and the read door says %', v_txt;
  end if;
  if v_v <> 99 then
    raise exception 'RED 1: with the trigger gone, a forged version 99 should have survived, and the read door says %', v_v;
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 1 — VAL-8 is OFF: the write door took "robot" as its author, kept "human" as a value''s author and believed version 99.';

  -- ── RED 2: a confidence score inside an alternate LANDS (ruling (a) is OFF) ──
  perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
    '_values', jsonb_build_object('phone', jsonb_build_object('ver',1,'actor','user','alternates',
      jsonb_build_array(jsonb_build_object('value','+1-415-555-0102','rank',2,'confidence',0.82))))));
  -- The WRITE is the person's and was made from the seat; whether the score is now IN THE
  -- STORE is a storage question no door answers — `custom.value_read` rebuilds an alternate
  -- as {value, rank, source} and drops anything else — so it is read as the connected role,
  -- and nothing about what a person may do is asserted while out.
  select alternates into v_vals from custom.value_read(v_org, v_rec, 'phone');
  perform set_config('role', v_boss, true);
  select data into v_j from custom.record where organization_id = v_org and id = v_rec;
  perform set_config('role', 'authenticated', true);
  if (v_j -> '_values' -> 'phone' -> 'alternates' -> 0 ->> 'confidence') is null then
    raise exception 'RED 2: with the constraint gone, a confidence score should have landed inside the alternate, and the document holds %',
      v_j -> '_values' -> 'phone';
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 2 — VAL-3/D-3 is OFF: the write door a person uses stored a confidence score inside an alternate (the read door still projects only %).', v_vals;

  -- ── RED 3: a PER-VALUE visibility LANDS (VAL-5/VAL-6 are OFF) ───────────────
  perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
    '_values', jsonb_build_object('phone', jsonb_build_object('ver',1,'actor','user',
      'visibility','private','secret', true))));
  perform set_config('role', v_boss, true);
  select data into v_j from custom.record where organization_id = v_org and id = v_rec;
  perform set_config('role', 'authenticated', true);
  if (v_j -> '_values' -> 'phone' ->> 'visibility') is null then
    raise exception 'RED 3: with the constraint gone, a per-value visibility should have landed';
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 3 — VAL-5/VAL-6 is OFF: the write door took a value that carries its own visibility and its own secret flag.';

  -- ── RED 4: a fifth reason for absence LANDS ─────────────────────────────────
  perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user','phone', null,
    '_values', jsonb_build_object('phone', jsonb_build_object('ver',1,'actor','user','absent','dunno'))));
  select absent_reason into v_txt from custom.value_read(v_org, v_rec, 'phone');
  if v_txt is distinct from 'dunno' then
    raise exception 'RED 4: with the constraint gone, "dunno" should have landed as a reason a value is missing, and the read door says %', v_txt;
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 4 — VAL-2 is OFF: the write door took an invented reason for absence and the read door reads it back.';

  -- ── RED 5: an envelope for a field NOBODY DECLARED LANDS ────────────────────
  -- THE THIRD REMOVAL, and it is a different enforcement point: the green suite's K clause is
  -- not the check constraint at all — `custom.validate_value_envelope`, called from the
  -- trigger `custom_record_field_validation`, is what refuses provenance for a column the
  -- table never declared. Measured here, 2026-09-19: with the constraint and `_value_envelope`
  -- both gone, the `fax` envelope was still refused, naming VAL-1. So the twin names the
  -- trigger that actually holds K and takes that out too — out of the seat, asserting nothing.
  perform set_config('role', v_boss, true);
  -- SUITES-TIDY-2 2026-09-22: DDL on custom.record after a write in this transaction is refused with 55006 (zzzz_relation_halves_agree is deferred); fire it first, restore after.
  perform platform.settle_deferred_checks('custom.record'::regclass, true);
  alter table custom.record disable trigger custom_record_field_validation;
  perform platform.settle_deferred_checks('custom.record'::regclass, false);
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
    '_values', jsonb_build_object('fax', jsonb_build_object('ver',1,'actor','user','absent','none'))));
  perform set_config('role', v_boss, true);
  select data into v_j from custom.record where organization_id = v_org and id = v_rec;
  perform set_config('role', 'authenticated', true);
  if not (v_j -> '_values' ? 'fax') then
    raise exception 'RED 5: with the constraint gone, provenance for a field this table never declared should have landed';
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 5 — the undeclared-key rule is OFF: the write door stored provenance for a column nobody can read.';

  -- ── RED 6: a value that is BOTH present and missing LANDS ───────────────────
  -- ONE patch that both writes the number and says why it is missing. (`data || patch`
  -- replaces `_values` wholesale, so the envelope has to travel with the value.)
  perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user','phone','+1-415-555-0999',
    '_values', jsonb_build_object('phone', jsonb_build_object('ver',1,'actor','user','absent','dunno'))));
  perform set_config('role', v_boss, true);
  select data into v_j from custom.record where organization_id = v_org and id = v_rec;
  perform set_config('role', 'authenticated', true);
  if (v_j ->> 'phone') is null or (v_j -> '_values' -> 'phone' ->> 'absent') is null then
    raise exception 'RED 6: with the constraint gone, a value that both holds a number and says why it is missing should have landed: %', v_j;
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 6 — VAL-2''s contradiction rule is OFF: one value both holds a number and says it is missing.';

  -- ── THE SEAT IS NOT VACUOUS EITHER ──────────────────────────────────────────
  -- Removing the STORE's three rules removes nothing from the ACCESS ladder: test@test.com is still
  -- refused the same write, which is how we know RED 1-6 measured the envelope and not the seat.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_person, jsonb_build_object('key','she_added','label','She added','plain','text'));
  exception when others then v_caught := sqlerrm;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  if v_caught is null then
    raise exception 'RED 7: with the envelope rules gone, test@test.com could also change the table''s shape — these three removals were supposed to touch the store and not the ladder';
  end if;
  raise notice 'RED 7 — the access ladder is untouched by all three removals: test@test.com is still refused ("%").', left(v_caught, 80);

  if v_landed <> 6 then
    raise exception 'the RED twin proved % of its six removals, and six is the number', v_landed;
  end if;
  raise notice '=== W1-VAL RED — all six writes the GREEN suite watches being REFUSED LAND through the same doors, from the seat `authenticated`, once the three enforcement points this twin names are removed. Rolling back. ===';
end;
$t$;

rollback;
