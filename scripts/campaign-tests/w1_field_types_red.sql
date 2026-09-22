-- W1-FIELD-TYPES — THE RED TWIN of `w1_field_types_c41.sql`, ON THE MAIN DATABASE, FROM THE
-- SEAT `authenticated`.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_field_types_red.sql
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). It used to run on the rehearsal
-- branch, which does not carry the doors these clauses are about, and it asked every question
-- as the role that OWNS `custom.record`. It now runs on main and every ASSERTED clause is
-- asked through the door a signed-in person reaches. The one thing no door covers — removing
-- the production object under test — steps OUT of the seat, says so, and asserts nothing
-- while it is out. Every transaction ends in ROLLBACK, so the dropped trigger and the
-- replaced function bodies come back with it.
--
-- ITS JOB IS UNCHANGED: every guard the green suite credits is demonstrated doing NOTHING
-- when removed, by performing from the seat the very thing the green suite proves is refused
-- or correct, and asserting it LANDS or goes WRONG.
--
--   RED 1  `custom._field_type_parity_guard` neutered -> the three declarations THE
--          GUARD refuses now LAND through `custom.field_declare` (a lookup with nothing to
--          read through, a rollup along a single relation, an attachment that cascades),
--          while the one THE DOOR refuses (a parity name nobody ships) stays refused and the
--          three the door CORRECTS stay corrected. That division is the point: clause J of
--          the green suite is two mechanisms, and this says which is which.
--   RED 2  `custom._derived_fields` neutered -> the write-time formula goes STALE
--          AND SILENT: the input moves 400 -> 1000 through the write door and the answer a
--          person reads is still 440, where clause F reads 1100. Not missing — wrong.
--   RED 3  `custom.derived_values` removed from `custom.record_values` (W1-VAL's body
--          restored verbatim, which is what the lane's inverse does) -> the lookup, the
--          rollup and the formula all read back as NOTHING through `custom.value_read`,
--          where clauses A, C, D and E read "Parity Person", 350 and 440.
--   RED 4  the DISTINCT removed from `custom.relation_targets` -> the rollup answers 450
--          instead of 350: the same line listed twice is counted twice. This is the one that
--          matters most, because the GREEN number alone cannot tell the two apart.
--   RED 5  the ACCESS question from the other side: with `custom.assert_client_may_open`
--          neutered, `test@test.com` — a member who was shared nothing — reads a record
--          nobody gave her. Her control (the record she IS given) is asserted in the same
--          transaction, so the clause is not satisfied by a door that opens everything.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_field_types_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- ── RED 1 ─────────────────────────────────────────────────────────────────────────────
begin;
-- Schema `custom` is LIVE on the main database and other campaign suites are writing it right
-- now, so each operator step below waits rather than dying on the five-second lock_timeout
-- the connection carries. Nothing here is a race.
--
-- AND NOTHING HERE TAKES ACCESS EXCLUSIVE ON `custom.record`. A guard is removed by replacing
-- its trigger FUNCTION with a pass-through, never by dropping or disabling the trigger:
-- `DROP TRIGGER` and `ALTER TABLE … DISABLE TRIGGER` both lock the whole live table against
-- every other session for as long as this transaction runs, and on this database that means
-- stalling the rest of the campaign. A replaced function body is invisible to every other
-- session until commit, and this transaction never commits — so the demonstration is exactly
-- as strong and costs nobody anything.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- OUT OF THE SEAT: no client door removes a production guard. Nothing is asserted here.
create or replace function custom._field_type_parity_guard() returns trigger
  language plpgsql as $g$ begin return new; end $g$;

do $r1$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_tbl  constant uuid := '11111111-0005-4000-8000-000000000003';
  v_case record;
  v_seen text;
  v_id   uuid;
  v_doc  jsonb;
  v_n    integer := 0;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '180s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_types_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_types_red');

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

  -- THE THREE THE GUARD HELD. Without it they land, through the same door a person uses.
  for v_case in
    select * from (values
      ('a lookup with nothing to read through',
       '{"key":"cedar_contractor_contact","label":"Blind lookup","parity_type":"lookup","pick":"full_name"}'::jsonb),
      ('a rollup along a single relation',
       '{"key":"cedar_contractor_job_count","label":"Single rollup","parity_type":"rollup","via":"owner","of":"full_name","agg":"count"}'::jsonb),
      ('an attachment that would cascade',
       '{"key":"cedar_site_photo","label":"Cascading photo","parity_type":"attachment","on_target_delete":"cascade"}'::jsonb)
    ) as t(what, spec)
  loop
    v_id := custom.field_declare(v_org, v_tbl, v_case.spec);
    if v_id is null then
      raise exception 'RED 1 INCONCLUSIVE: % did not land with custom._field_type_parity_guard gone', v_case.what;
    end if;
    -- and it reads back through the door, which is how a broken definition reaches a consumer
    if custom.read_record(v_org, v_id, true) ->> 'parity_type' is null then
      raise exception 'RED 1: % landed and does not read back', v_case.what;
    end if;
    v_n := v_n + 1;
    raise notice 'RED 1 — % LANDED through custom.field_declare with custom._field_type_parity_guard gone', v_case.what;
  end loop;
  if v_n <> 3 then
    raise exception 'RED 1 INCONCLUSIVE: only % of three landed', v_n;
  end if;

  -- THE DOOR'S OWN HALF IS UNTOUCHED, which is what makes RED 1 a statement about the GUARD
  -- and not about the door: a parity name nobody ships is still refused, by name.
  v_seen := null;
  begin
    perform custom.field_declare(v_org, v_tbl, '{"key":"cedar_permit_code","label":"Bad name","parity_type":"barcode"}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null or position('There is no field type called "barcode"' in v_seen) = 0 then
    raise exception 'RED 1: the door stopped refusing a parity name nobody ships — %', coalesce(v_seen, 'it landed');
  end if;
  -- and the three the door CORRECTS are still corrected.
  -- Two statements, deliberately: `custom.read_record` is STABLE, so nesting the declaration
  -- inside the read would hand the read the statement snapshot taken BEFORE the write.
  v_id := custom.field_declare(v_org, v_tbl, '{"key":"cedar_vendor_website","label":"Still a url","parity_type":"url"}'::jsonb);
  v_doc := custom.read_record(v_org, v_id, true);
  if not exists (select 1 from jsonb_array_elements(coalesce(v_doc -> 'rules','[]'::jsonb)) r where r ->> 'kind' = 'pattern') then
    raise exception 'RED 1: the door stopped writing a url its pattern Rule';
  end if;
  raise notice 'RED 1 CONFIRMED — the three declarations the GUARD refuses LAND without it, while the one the DOOR refuses stays refused and the ones it corrects stay corrected';
end;
$r1$;

rollback;

-- ── RED 2 ─────────────────────────────────────────────────────────────────────────────
begin;
-- Schema `custom` is LIVE on the main database and other campaign suites are writing it right
-- now, so each operator step below waits rather than dying on the five-second lock_timeout
-- the connection carries. Nothing here is a race.
--
-- AND NOTHING HERE TAKES ACCESS EXCLUSIVE ON `custom.record`. A guard is removed by replacing
-- its trigger FUNCTION with a pass-through, never by dropping or disabling the trigger:
-- `DROP TRIGGER` and `ALTER TABLE … DISABLE TRIGGER` both lock the whole live table against
-- every other session for as long as this transaction runs, and on this database that means
-- stalling the rest of the campaign. A replaced function body is invisible to every other
-- session until commit, and this transaction never commits — so the demonstration is exactly
-- as strong and costs nobody anything.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- OUT OF THE SEAT: the guard that stamps every write-time answer.
create or replace function custom._derived_fields() returns trigger
  language plpgsql as $g$ begin return new; end $g$;

do $r2$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rec constant uuid := '11111111-0009-4000-8000-000000000011';
  v_v   jsonb;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '180s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_types_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_types_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2: this suite did not take the seat — current_user is %', current_user;
  end if;

  -- THE SAME WRITE THE GREEN SUITE MAKES, through the same door.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('amount_usd', 1000));
  -- The answer is not MISSING, which would at least be visible. It is STALE: the input now
  -- says 1000 and the stamped answer still says 440, and a reader has no way to tell.
  select v.value into v_v from custom.value_read(v_org, v_rec, 'amount_with_tax') v;
  if (v_v #>> '{}')::numeric <> 440 then
    raise exception 'RED 2 INCONCLUSIVE: expected the stale 440 to survive, and the formula answered %', v_v;
  end if;
  raise notice 'RED 2 CONFIRMED — the input moved 400 -> 1000 through the write door and the answer a person reads is still 440: STALE, silently, where clause F reads 1100';
end;
$r2$;

rollback;

-- ── RED 3 and RED 4 ───────────────────────────────────────────────────────────────────
begin;
-- Schema `custom` is LIVE on the main database and other campaign suites are writing it right
-- now, so each operator step below waits rather than dying on the five-second lock_timeout
-- the connection carries. Nothing here is a race.
--
-- AND NOTHING HERE TAKES ACCESS EXCLUSIVE ON `custom.record`. A guard is removed by replacing
-- its trigger FUNCTION with a pass-through, never by dropping or disabling the trigger:
-- `DROP TRIGGER` and `ALTER TABLE … DISABLE TRIGGER` both lock the whole live table against
-- every other session for as long as this transaction runs, and on this database that means
-- stalling the rest of the campaign. A replaced function body is invisible to every other
-- session until commit, and this transaction never commits — so the demonstration is exactly
-- as strong and costs nobody anything.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- OUT OF THE SEAT: W1-VAL's body, verbatim — `custom.derived_values` is simply not called.
create or replace function custom.record_values(p_organization_id uuid, p_record_id uuid)
 returns jsonb language sql stable set search_path to 'pg_catalog'
as $function$
  select (r.data - '_computed' - '_retired' - '_values' - '_sources')
         || coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                        from jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e),
                     '{}'::jsonb)
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
$function$;

do $r3$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rec constant uuid := '11111111-0009-4000-8000-000000000011';
  v_n   integer;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '180s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_types_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_types_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 3: this suite did not take the seat — current_user is %', current_user;
  end if;

  select count(*) into v_n
    from custom.record_values_versioned(v_org, v_rec) v
   where v.field_key in ('owner_name', 'line_total', 'amount_with_tax') and v.value is not null;
  if v_n <> 0 then
    raise exception 'RED 3 INCONCLUSIVE: % of the three computed Values still answered', v_n;
  end if;
  raise notice 'RED 3 CONFIRMED — through custom.record_values_versioned the lookup, the rollup and the write-time formula all read back as nothing';
end;
$r3$;

rollback;

begin;
-- Schema `custom` is LIVE on the main database and other campaign suites are writing it right
-- now, so each operator step below waits rather than dying on the five-second lock_timeout
-- the connection carries. Nothing here is a race.
--
-- AND NOTHING HERE TAKES ACCESS EXCLUSIVE ON `custom.record`. A guard is removed by replacing
-- its trigger FUNCTION with a pass-through, never by dropping or disabling the trigger:
-- `DROP TRIGGER` and `ALTER TABLE … DISABLE TRIGGER` both lock the whole live table against
-- every other session for as long as this transaction runs, and on this database that means
-- stalling the rest of the campaign. A replaced function body is invisible to every other
-- session until commit, and this transaction never commits — so the demonstration is exactly
-- as strong and costs nobody anything.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- OUT OF THE SEAT: the DISTINCT removed, and nothing else.
create or replace function custom.relation_targets(p_organization_id uuid, p_record_id uuid, p_via_key text)
  returns setof uuid language sql stable set search_path to 'pg_catalog'
as $function$
  select (t #>> '{}')::uuid
    from custom.record r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.data -> p_via_key) = 'array' then r.data -> p_via_key
           when r.data ? p_via_key and jsonb_typeof(r.data -> p_via_key) = 'string'
                then jsonb_build_array(r.data -> p_via_key)
           else '[]'::jsonb end) t
   where r.organization_id = p_organization_id
     and r.id = p_record_id
     and r.deleted_at is null
     and (t #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$function$;

do $r4$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rec constant uuid := '11111111-0009-4000-8000-000000000011';
  v_v   jsonb;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '180s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_types_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_types_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 4: this suite did not take the seat — current_user is %', current_user;
  end if;

  select v.value into v_v from custom.value_read(v_org, v_rec, 'line_total') v;
  if (v_v #>> '{}')::numeric <> 450 then
    raise exception 'RED 4 INCONCLUSIVE: without DISTINCT the rollup answered % and the double-counted sum is 450', v_v;
  end if;
  raise notice 'RED 4 CONFIRMED — the same line listed twice is counted twice: 450, where clause D reads 350';
end;
$r4$;

rollback;

-- ── RED 5: THE ACCESS QUESTION ────────────────────────────────────────────────────────
begin;
-- Schema `custom` is LIVE on the main database and other campaign suites are writing it right
-- now, so each operator step below waits rather than dying on the five-second lock_timeout
-- the connection carries. Nothing here is a race.
--
-- AND NOTHING HERE TAKES ACCESS EXCLUSIVE ON `custom.record`. A guard is removed by replacing
-- its trigger FUNCTION with a pass-through, never by dropping or disabling the trigger:
-- `DROP TRIGGER` and `ALTER TABLE … DISABLE TRIGGER` both lock the whole live table against
-- every other session for as long as this transaction runs, and on this database that means
-- stalling the rest of the campaign. A replaced function body is invisible to every other
-- session until commit, and this transaction never commits — so the demonstration is exactly
-- as strong and costs nobody anything.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- OUT OF THE SEAT: the one predicate that asks whether this person may open this record is
-- replaced by a body that always says yes. This is the wall clause K of the green suite
-- credits, and it is the one clause no trigger holds.
create or replace function custom.assert_client_may_open(
  p_organization_id uuid, p_subject_id uuid, p_door text,
  p_required public.permission_level default 'viewer'::public.permission_level,
  p_subject_word text default 'record')
  returns void language plpgsql stable set search_path to 'pg_catalog'
as $function$
begin
  return;   -- RED 5 only: every person may open everything
end;
$function$;

do $r5$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rec constant uuid := '11111111-0009-4000-8000-000000000011';
  v_doc jsonb;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '180s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_types_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_types_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 5: this suite did not take the seat — current_user is %', current_user;
  end if;

  -- AS test@test.com, who was shared nothing.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_doc := custom.read_record(v_org, v_rec, true);
  if v_doc is null or (v_doc ->> 'title') is null then
    raise exception 'RED 5 INCONCLUSIVE: the read was still refused, so clause K is held by something other than custom.assert_client_may_open';
  end if;
  raise notice 'RED 5 CONFIRMED — with custom.assert_client_may_open neutered, test@test.com reads "%" — a record nobody ever shared with her', v_doc ->> 'title';
end;
$r5$;

rollback;
