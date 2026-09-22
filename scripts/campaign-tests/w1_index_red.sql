-- W1-INDEX — THE RED TWIN of `w1_index_c5.sql`. It turns this lane's enforcement points OFF
-- inside ONE transaction that ends in ROLLBACK, and proves that every refusal the GREEN suite
-- watches happening actually STOPS happening. A guard that cannot be demonstrated failing is
-- not a guard (§3 rule 2), and a refusal nobody has seen disappear is a refusal nobody tested.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w1_index_red.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it rolls
-- back. EVERY REMOVAL IS RESTORED BY THE `rollback` AT THE END; nothing here survives the
-- session, and the disposable organization it builds goes with it.
--
-- 🚨 RE-POINTED TO THE MAIN DATABASE (lane SEAT-SUITES, 2026-09-19), for the same reason as
-- its green twin: the rehearsal branch does not carry the store these clauses are about, and
-- the owner's 2026-09-18 ruling is that there is no production. It now names main's
-- system_identifier 7642734024280108049 and builds its own disposable organization rather
-- than writing into Matrx System, a live tenant.
--
-- 🚨 THE SEAT. A red twin's job is to prove its green twin's clauses FLIP, so it has to flip
-- the same clauses, in the same seat. Every REMOVAL below is operator DDL and steps out of
-- the seat saying so; every WRITE THAT THEN LANDS goes through the door a signed-in person
-- reaches — `custom.field_declare`, `custom.field_update`, `custom.record_write` — because a
-- refusal that only ever reached the superuser was never a refusal anybody met.
--
-- WHAT IT REMOVES, and therefore what each removal proves:
--   · trigger `zz_promoted_field_cap`            → a NINTH column a PERSON asks to be indexed
--                                                  lands on a Table REC-N-5 caps at eight.
--   · `custom.promoted_value_path`'s derived arm → a Field worked out at READ time gets an
--                                                  index over `data ->> 'key'`, which holds
--                                                  nothing: REC-N-3's silent wrong answer.
--   · the three envelope doors                   → the envelope REC-N-3's punctuation names
--                                                  is written by a PERSON through
--                                                  `custom.record_write`, so ruling (b)'s
--                                                  refusal is a real refusal.
--   · `custom.promote_field`'s child rename      → the duplicate refusal a PERSON is handed
--                                                  goes back to quoting
--                                                  `record_pNN_organization_id_expr_idx`,
--                                                  which names no field and no table.
--   · nothing at all                             → RED 5: what the removals do NOT take down
--                                                  is the ACCESS wall. test@test.com is still
--                                                  refused, and still reads what she may.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_index_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- THE FLOOR. Every write here lands in `custom.record`, a LIVE table with sixteen hash
-- partitions other campaign lanes are indexing at the same time. MEASURED on main 2026-09-19:
-- `lock_timeout` is 5s and `statement_timeout` is 30s by default, and under that traffic even
-- the fixture writes lose on both.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org   uuid := gen_random_uuid();
  v_home  uuid;
  v_table uuid;
  v_fid   uuid;
  v_json  jsonb;
  v_name  text;
  v_msg   text;
  v_cap   integer;
  v_n     integer;
  v_red   integer := 0;
  v_boss  text := current_user;   -- the connected role, for the removals and the catalogue
begin
  -- ── THE FIXTURES, as the connected role. A seat is a PERSON: an organization, a
  --    membership for both identities, the store switched on for it, and a Home.
  perform set_config('app.actor_system', 'campaign-test/w1_index_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Greenline Landscaping Crew', 'greenline-landscaping-' || substr(v_org::text, 1, 8), 'GLC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_index_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- 🚨 `custom/field_index_guard` IS RETIRED on main, and the branch-era version of this file
  -- turned it on here. The knob row says so itself: "Nothing reads this knob. Promoting a
  -- field, generating its index DDL, the cap on promoted fields per table and declaring work
  -- slots all follow the organization's own custom/system_enabled, read through
  -- custom.store_is_open (DOOR-FIX, 2026-09-19, defect B1)." The override written above IS
  -- that switch, on, which is what the cap trigger below reads.
  v_cap := custom.promoted_field_cap();

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — TAKE THE SEAT AND PROVE IT.
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

  -- ── THE TABLE AND ITS EIGHT INDEXED COLUMNS, all asked for by a PERSON: declared with
  --    `custom.field_declare` and promoted with `custom.field_update`.
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W1-INDEX RED', 'slug', 'greenline_jobs', 'type', 'entity',
    'label_singular', 'Thing', 'label_plural', 'Things', 'title_field', 'code',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name', 'code')) ||
              (select jsonb_agg(jsonb_build_object('name', 'job_tag_' || g)) from generate_series(2, 9) g),
    'parent_id', v_home::text));
  v_fid := custom.field_declare(v_org, v_table, jsonb_build_object(
    'key', 'code', 'label', 'Code', 'plain', 'text', 'sort', 10));
  perform custom.field_update(v_org, v_fid, jsonb_build_object('promoted', true, 'unique', true));
  for v_n in 2..8 loop
    perform custom.field_update(v_org,
      custom.field_declare(v_org, v_table, jsonb_build_object(
        'key', 'job_tag_' || v_n, 'label', 'P' || v_n, 'plain', 'text', 'sort', v_n)),
      jsonb_build_object('promoted', true));
  end loop;
  select count(*) into v_n from custom.applicable_fields(v_org, v_table, null) f
   where (f.data ->> 'promoted')::boolean;
  if v_n <> v_cap then
    raise exception 'RED fixture is wrong: the Table carries % indexed columns, not the % the cap allows', v_n, v_cap;
  end if;

  -- ── RED 1 — the cap ────────────────────────────────────────────────────────────────────
  -- THE REMOVAL steps out of the seat: dropping a trigger is operator DDL.
  perform set_config('role', v_boss, true);
  drop trigger zz_promoted_field_cap on custom.record;
  perform set_config('role', 'authenticated', true);
  -- THE WRITE THAT NOW LANDS is a PERSON'S: exactly the call the green twin watches being
  -- refused, from the same seat, on the same Table.
  perform custom.field_update(v_org,
    custom.field_declare(v_org, v_table, jsonb_build_object(
      'key', 'job_tag_9', 'label', 'P9', 'plain', 'text', 'sort', 9)),
    jsonb_build_object('promoted', true));
  select count(*) into v_n from custom.applicable_fields(v_org, v_table, null) f
   where (f.data ->> 'promoted')::boolean;
  if v_n <= v_cap then
    raise exception 'RED 1 FAILED TO GO RED: the cap trigger is gone and the Table still holds only % indexed columns', v_n;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1 — cap trigger dropped: a signed-in person now holds % indexed columns against a published cap of %. GREEN PART 5 is a real refusal, handed to a real person.',
               v_n, v_cap;

  -- ── RED 2 — REC-N-3's derived arm ──────────────────────────────────────────────────────
  -- ENTIRELY OUT OF THE SEAT, and it asserts nothing about what a person may do:
  -- `custom.promoted_value_path` and `custom.promoted_index_expr` are the server lane's own
  -- map of where an index goes, with no client grant and no door row.
  perform set_config('role', v_boss, true);
  v_json := jsonb_build_object('key', 'crew_hours', 'type', 'text', 'compute_on', 'read');
  if custom.promoted_index_expr(v_json) is not null then
    raise exception 'RED 2 fixture is wrong: a derived Field already answers an expression';
  end if;
  create or replace function custom.promoted_value_path(p_field_data jsonb)
    returns text language sql immutable parallel safe set search_path to 'pg_catalog' as $red$
    select 'stored';
  $red$;
  if custom.promoted_index_expr(v_json) is null then
    raise exception 'RED 2 FAILED TO GO RED: the derived arm is gone and the expression is still NULL';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 2 — derived arm removed: a field worked out at READ time is now indexed at %, a path that holds nothing. GREEN PART 3 is what stops that.',
               custom.promoted_index_expr(v_json);

  -- ── RED 3 — the envelope refusal ───────────────────────────────────────────────────────
  -- THREE doors stand between this store and REC-N-3's envelope, each found by taking the
  -- previous one off:
  --   1. trigger `_value_envelope`                — refuses the KEY `v` by name.
  --   2. trigger `custom_record_field_validation` — refuses an envelope for a field the Table
  --      never declared ('Provenance nobody can read is worse than none').
  --   3. CHECK constraint `record_value_envelope` — refuses the SHAPE outright, on every
  --      partition, with no trigger involved at all.
  -- All three come off, and that is the finding rather than the obstacle: ruling (b) does not
  -- rest on one guard. The REMOVALS are operator DDL and step out; the WRITE that then lands
  -- is a PERSON'S, through `custom.record_write`, which is where the green twin measures it.
  perform set_config('role', v_boss, true);
  alter table custom.record disable trigger _value_envelope;
  alter table custom.record disable trigger custom_record_field_validation;
  alter table custom.record drop constraint record_value_envelope;
  perform set_config('role', 'authenticated', true);
  if custom.record_write(v_org, v_table, jsonb_build_object(
       'code', 'red3',
       '_values', jsonb_build_object('code', jsonb_build_object('v', 'x')))) is null then
    raise exception 'RED 3 FAILED TO GO RED: the write door still refused the envelope with all three doors off';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 3 — all three envelope doors removed: a signed-in person wrote `data -> ''_values'' -> ''code'' -> ''v''` through custom.record_write. GREEN PART 2''s refusal is a refusal, not an absence.';
  perform set_config('role', v_boss, true);
  alter table custom.record enable trigger _value_envelope;
  alter table custom.record enable trigger custom_record_field_validation;
  perform set_config('role', 'authenticated', true);

  -- ── RED 4 — the child-index rename ROUTE A now does ────────────────────────────────────
  for v_n in 1..50 loop
    perform custom.record_write(v_org, v_table, jsonb_build_object('code', 'r' || v_n));
  end loop;

  -- Build the unique index the way `custom.promote_field` built it BEFORE the fix:
  -- `CREATE INDEX` on the partitioned parent, children named by Postgres. OUT OF THE SEAT —
  -- it is CREATE INDEX, and it takes ACCESS EXCLUSIVE on all sixteen live partitions.
  perform set_config('role', v_boss, true);
  set local lock_timeout = '10s';
  set local statement_timeout = '60s';
  v_name := 'greenline_unrenamed_code_idx';
  execute format('create unique index %I on custom.record (organization_id, ((data->>''code''))) where table_id = %L::uuid and deleted_at is null',
                 v_name, v_table);
  perform set_config('role', 'authenticated', true);

  -- AND THE DUPLICATE IS WRITTEN BY A PERSON, through the door they write through, because
  -- the whole clause is about the sentence that person is handed.
  v_msg := null;
  begin
    perform custom.record_write(v_org, v_table, jsonb_build_object('code', 'r7'));
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then
    raise exception 'RED 4 fixture is wrong: the duplicate landed';
  end if;
  if position('greenline_unrenamed_code_idx' in v_msg) > 0 then
    raise exception 'RED 4 FAILED TO GO RED: Postgres named the partition index after its parent, so the defect this fix closes does not exist here. Message: %', v_msg;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 4 — without the rename, the loser of a duplicate write is handed: %', v_msg;
  raise notice 'RED 4 —   with it (GREEN PART 4), the same person is handed a name carrying the field: cpu_<field>_<table hash>.';

  -- ── RED 5 — WHAT THE REMOVALS DO NOT TAKE DOWN: THE ACCESS WALL ────────────────────────
  -- Five enforcement points are off and one CHECK constraint is dropped, and `test@test.com`
  -- — a member of this organization who was shared nothing — still may not change the shape
  -- of this Table. A red twin that could not tell a store rule from an access wall would have
  -- shown her walking through both.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_msg := null;
  begin
    perform custom.field_declare(v_org, v_table, jsonb_build_object(
      'key', 'crew_note', 'label', 'Sneaked in', 'plain', 'text', 'sort', 99));
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then
    raise exception 'RED 5: with the campaign guards off, test@test.com also walked through the ACCESS wall — that is a defect, not a red clause';
  end if;
  -- THE CONTROL, so RED 5 is not a door that refuses her everything.
  select count(*) into v_n from custom.read_records(v_org, v_table, true, 5, 0);
  if v_n < 1 then
    raise exception 'RED 5: the member who was refused the shape change cannot read a single record either';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 5 — the ACCESS wall is untouched by all of it: she is refused ("%") and still reads % record(s).', v_msg, v_n;
  perform set_config('request.jwt.claims', c_admin_j, true);

  if v_red <> 5 then
    raise exception 'only % of the five RED clauses ran', v_red;
  end if;
  raise notice '=== RED PASS — four enforcement points were removed and all four failures appeared from the seat `authenticated`, the access wall stayed up, and this transaction rolls back. ===';
end
$t$;

rollback;
