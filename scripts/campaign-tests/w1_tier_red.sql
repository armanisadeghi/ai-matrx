-- W1-TIER — THE RED TWIN of this lane's six guards (rules 2 and 3), on the MAIN database.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w1_tier_red.sql
--
-- A guard that cannot be demonstrated FAILING is not a guard. This file removes each of this
-- lane's six guards INSIDE ONE TRANSACTION — by dropping a constraint, by flipping the opt-in
-- behind its own door, or by replacing a body with one missing the clause under test —
-- performs the write or the read the green suite proves is refused or hidden, and asserts it
-- LANDS. Then it rolls the whole thing back, guards included, because `ALTER TABLE … DROP
-- CONSTRAINT` and `CREATE OR REPLACE FUNCTION` are both transactional.
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). Two changes.
--
-- (1) IT RUNS ON THE MAIN DATABASE. It used to refuse anything but the rehearsal branch. That
--     branch carries 226 functions in schema `custom` against main's 332 and the owner's
--     2026-09-18 ruling is that there is no production and everything is the main database.
--     It also used to pick THE FIRST REAL ORGANIZATION on the server and write its fixtures
--     into it — harmless on a throwaway branch, somebody's real data here. It now makes its
--     own disposable organization, and its stranger is a person who belongs to nothing rather
--     than a real account read out of `auth.users`.
--
-- (2) IT TAKES THE SEAT, AND THE SEAT IS WHAT IT FOUND. PART 0 takes `authenticated` and
--     proves it. PART 0b then asks the only question a person can ask about this feature —
--     may I call any of it? — and the answer, MEASURED ON MAIN 2026-09-19, is no: not one of
--     the eight `custom.external_*` functions is EXECUTE-able by `authenticated`. So the
--     external-source feature has no client door at all, and the six guard demonstrations
--     below are OPERATOR work by their nature: they drop constraints and replace function
--     bodies, which no person can do through any door. They run OUTSIDE the seat, under a
--     banner that says so, and they assert nothing about what a person may do. PART 0b and
--     PART 5 are this file's seated clauses; PART 0b is the one that will go red — and force
--     this file to be rewritten around the doors — the day the feature is given any.
--
-- WHAT EACH RED SAYS. If an assertion below fails, the guard it names was doing NOTHING and
-- the green clause it stands behind was passing for some other reason — a typo in the call, a
-- constraint somewhere else, a policy that hid the row for an unrelated reason.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_tier_red.sql'
\set requires 'function:custom.organization_kernel_id'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';

do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  -- THE STRANGER: a person who is in no organization at all. The old file read a real account
  -- out of `auth.users`; on the main database that is somebody, and nothing here needs it to be.
  v_b       uuid := gen_random_uuid();
  v_b_j     text;
  v_home    uuid;
  v_table   uuid;
  v_src     uuid;
  v_stub    uuid;
  v_mine    uuid;
  v_link    uuid;
  v_landed  uuid;
  v_event   bigint;
  v_rowid   uuid;
  v_n       integer;
  v_caught  text;
  v_conname text;
  v_boss    text := current_user;
begin
  v_b_j := json_build_object('sub', v_b, 'role', 'authenticated')::text;

  perform set_config('app.actor_system', 'campaign-test/w1_tier_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ironline Fitness', 'ironline-fitness-' || substr(v_org::text,1,8), 'IRF', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_tier_red');

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.organization_kernel_id(), 'record', jsonb_build_object('name','W1-TIER RED Home'))
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

  -- The Table, through the door a person has.
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name','External Widget','slug','external_class_bookings',
    'label_singular','External Widget','label_plural','External Widgets',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'title_field','title','parent_id', v_home::text));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  -- One record admin writes THROUGH THE DOOR, for PART 5's negative clause.
  v_mine := custom.record_write(v_org, v_table, jsonb_build_object('title','Admin''s widget'));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0b — THE SEATED CLAUSE: WHAT OF THIS FEATURE A PERSON MAY REACH. Measured on the
  -- main database 2026-09-19: nothing. Every `custom.external_*` function is SECURITY DEFINER
  -- owned by the store and holds no grant to `authenticated`, so the external-source feature
  -- is reachable only by a server lane. That is the standing fact this file records, and the
  -- reason every block below it runs outside the seat.
  -- ════════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname like 'external%'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_n <> 0 then
    raise exception 'PART 0b: % of the custom.external_* functions are now EXECUTE-able by a signed-in person (%). The feature has client doors, so this file must be rewritten to ask its clauses THROUGH them instead of stepping out of the seat.',
      v_n,
      (select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
        where p.pronamespace = 'custom'::regnamespace and p.proname like 'external%'
          and has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  end if;
  raise notice 'PART 0b PASSED — no custom.external_* function is reachable from the seat, so every guard below is a server lane''s and is demonstrated outside it.';

  -- ╔══════════════════════════════════════════════════════════════════════════╗
  -- ║  OUT OF THE SEAT FROM HERE TO PART 5.                                     ║
  -- ║  Everything below drops a constraint or replaces a function body — DDL no  ║
  -- ║  person can reach through any door — and then calls functions that hold no ║
  -- ║  client grant. NOTHING here asserts what a signed-in person may do.        ║
  -- ╚══════════════════════════════════════════════════════════════════════════╝
  perform set_config('role', v_boss, true);

  v_src  := custom.external_source_declare(v_org, 'foreign_table', 'main_pg', 'public', 'w1_tier_widgets', 'https://example.invalid/rows/{key}');
  v_stub := custom.external_stub_upsert(v_org, v_src, v_table, 'EXT-1', null, 'Widget A');
  select id into v_link from custom.external_link where organization_id = v_org and record_id = v_stub;

  -- ── RED 1: REC-N-11's opt-in column ─────────────────────────────────────────
  -- Flip `writes_enabled` behind the door's back. If the write is STILL refused with 42501,
  -- the green 42501 came from something other than the opt-in.
  update custom.external_source set writes_enabled = true where id = v_src;
  begin
    perform custom.external_write_through(v_org, v_stub, jsonb_build_object('title','x'));
    raise exception 'RED 1 FAIL: with the opt-in on, the write returned without raising at all — the 0A000 that names the missing connection is gone too';
  exception when insufficient_privilege then
    raise exception 'RED 1 FAIL: still 42501 with writes_enabled = true — the opt-in column is NOT what refuses the write';
  when others then
    raise notice 'RED 1 PASS  writes_enabled = true removes the 42501 (what is left is the honest 0A000) — the column is the switch';
  end;
  update custom.external_source set writes_enabled = false where id = v_src;

  -- ── RED 2: REL-N-1's CHECK on target_ref ────────────────────────────────────
  select c.conname into v_conname
    from pg_constraint c
   where c.conrelid = 'custom.external_link'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%target_ref%';
  if v_conname is null then
    raise exception 'RED 2 FAIL: custom.external_link carries NO check constraint on target_ref — REL-N-1 is a convention, not a law';
  end if;
  execute format('alter table custom.external_link drop constraint %I', v_conname);
  insert into custom.external_link (organization_id, record_id, source_id, external_key, target_ref)
  values (v_org, v_home, v_src, 'MALFORMED', jsonb_build_object('kind','external','key','k'))
  returning record_id into v_landed;
  if v_landed is null then
    raise exception 'RED 2 FAIL: the malformed target_ref was refused with the constraint dropped — something else refuses it and the CHECK proves nothing';
  end if;
  raise notice 'RED 2 PASS  with % dropped, a target_ref missing connection and external_table LANDS', v_conname;
  delete from custom.external_link where record_id = v_home and external_key = 'MALFORMED';

  -- ── RED 3: DOOR-N-6's Visibility filter inside the definer door ─────────────
  create table custom_external.ironline_class_bookings (external_key text primary key, title text);
  insert into custom_external.ironline_class_bookings values ('EXT-1','Widget A remote'), ('EXT-9','Never linked');
  update custom.external_source set external_table = 'ironline_class_bookings' where id = v_src;
  perform set_config('request.jwt.claims', v_b_j, true);
  select count(*) into v_n from custom.external_rows(v_org, v_src) x;
  if v_n <> 0 then
    raise exception 'RED 3 SETUP FAIL: the stranger already reads % row(s) with the filter in place', v_n;
  end if;

  create or replace function custom.external_rows(p_organization_id uuid, p_source_id uuid)
    returns setof jsonb language plpgsql security definer set search_path to 'pg_catalog'
  as $red$
  declare
    v_src custom.external_source%rowtype;
    v_row jsonb;
  begin
    select * into v_src from custom.external_source
     where organization_id = p_organization_id and id = p_source_id and deleted_at is null;
    for v_row in execute format(
        'select to_jsonb(t) from custom_external.%I t join custom.external_link l on l.external_key = t.external_key and l.organization_id = $1 and l.source_id = $2',
        v_src.external_table)
      using p_organization_id, p_source_id
    loop
      return next v_row;
    end loop;
    return;
  end;
  $red$;
  select count(*) into v_n from custom.external_rows(v_org, v_src) x;
  if v_n <> 1 then
    raise exception 'RED 3 FAIL: with iam.has_access removed the stranger reads % row(s), expected 1 — the filter is not what hides the external row', v_n;
  end if;
  raise notice 'RED 3 PASS  with iam.has_access removed from the definer door, a stranger reads the external row — the filter is what applies our Visibility';
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── RED 4: HIS-N-3's null row_id ────────────────────────────────────────────
  v_event := custom.external_history_event(v_org, v_link, 'linked');
  select row_id into v_rowid from history.row_versions where id = v_event;
  if v_rowid is not null then
    raise exception 'RED 4 SETUP FAIL: the door already writes a row_id (%)', v_rowid;
  end if;
  create or replace function custom.external_history_event(p_organization_id uuid, p_link_id uuid, p_operation text)
    returns bigint language plpgsql security definer set search_path to 'pg_catalog'
  as $red$
  declare
    v_link custom.external_link%rowtype;
    v_id   bigint;
  begin
    select * into v_link from custom.external_link
     where organization_id = p_organization_id and id = p_link_id;
    insert into history.row_versions
      (entity_type, row_id, organization_id, version, operation, row_data, actor_id, occurred_at)
    values ('external_link', v_link.record_id, p_organization_id, 1, p_operation,
            jsonb_build_object('about','external_link'), auth.uid(), now())
    returning id into v_id;
    return v_id;
  end;
  $red$;
  v_event := custom.external_history_event(v_org, v_link, 'linked');
  select row_id into v_rowid from history.row_versions where id = v_event;
  if v_rowid is null then
    raise exception 'RED 4 FAIL: history.row_versions refused to store a row_id at all — the green NULL says nothing about the door';
  end if;
  raise notice 'RED 4 PASS  history.row_versions CAN hold a row_id (%) — the NULL the door writes is a decision, not a limitation', v_rowid;

  -- ── RED 5: REC-N-8 / REC-N-9's refusal ──────────────────────────────────────
  create or replace function custom.external_source_declare(
      p_organization_id uuid, p_tier text, p_connection_token text,
      p_external_schema text, p_external_table text, p_link_template text)
    returns uuid language plpgsql security definer set search_path to 'pg_catalog'
  as $red$
  declare
    v_id uuid;
  begin
    insert into custom.external_source
      (organization_id, tier, connection_token, external_schema, external_table, link_template)
    values (p_organization_id, p_tier, p_connection_token, coalesce(p_external_schema,''), p_external_table, p_link_template)
    returning id into v_id;
    return v_id;
  end;
  $red$;
  if custom.external_source_declare(v_org, 'managed_postgres', 'their_instance', '', 'invoice', null) is null then
    raise exception 'RED 5 FAIL: tier managed_postgres was refused with the refusal removed — the 0A000 is not this door''s';
  end if;
  raise notice 'RED 5 PASS  with the refusal removed, tier managed_postgres is stored — the 0A000 is the door''s own, and the row shape was never the obstacle';

  -- ── RED 6: DOOR-N-6's exposure guard ────────────────────────────────────────
  grant select on table custom_external.ironline_class_bookings to authenticated;
  select count(*) into v_n from custom.external_foreign_table_findings();
  if v_n <> 1 then
    raise exception 'RED 6 SETUP FAIL: the live guard reports % finding(s) for a client-granted private relation, expected 1', v_n;
  end if;
  create or replace function custom.external_foreign_table_findings()
    returns setof text language sql security definer set search_path to 'pg_catalog'
  as $red$ select null::text where false; $red$;
  select count(*) into v_n from custom.external_foreign_table_findings();
  if v_n <> 0 then
    raise exception 'RED 6 FAIL: the neutered guard still reports % finding(s)', v_n;
  end if;
  raise notice 'RED 6 PASS  a guard with no query reports 0 on the same grant the real one names — the green 0 is a measurement, not an empty function';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — BACK IN THE SEAT, AS A REAL SECOND PERSON.
  -- `test@test.com` is a member of this organization and was shared nothing. The external
  -- stub is an ordinary record of this store, so it is the one part of this feature a person
  -- meets — and the ladder is what decides what she may do with it.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 5a. THE CONTROL FIRST, so 5b is not a door that refuses her everything: the stub is an
  --     ordinary record of this store on her organization's lane, and she opens it. MEASURED
  --     2026-09-19: its document is `{}` — `custom.external_stub_upsert` keeps the cached
  --     title on `custom.external_link` and puts nothing in the record — so what this clause
  --     asserts is that the door ANSWERS her, not what it answers.
  v_caught := null;
  begin
    perform custom.read_record(v_org, v_stub, false);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is not null then
    raise exception '5a: test@test.com cannot open the external stub on her own organization''s lane ("%"), so 5b proves nothing', v_caught;
  end if;
  raise notice '5a. control — test@test.com opens the external stub on the organization lane.';

  -- 5b. THE NEGATIVE: she may not delete a record somebody else made and nobody gave her.
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_mine);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception '5b: test@test.com deleted a record nobody shared with her';
  end if;
  raise notice '5b. test@test.com is refused a delete of a record nobody gave her: "%"', left(v_caught, 110);
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice '════ W1-TIER RED: all six guards demonstrated FAILING, outside the seat and said so; the two seated clauses (0b and 5) passed. Rolling back. ════';
end
$r$;

rollback;
