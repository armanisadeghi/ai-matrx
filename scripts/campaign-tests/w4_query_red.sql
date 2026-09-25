-- W4-QUERY — THE RED TWIN of the W4-QUERY green clauses.
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file breaks THIS
-- LANE'S enforcement points, one at a time, and asserts that the thing the green suite proves
-- DISAPPEARS — and, where the failure is a wrong answer rather than an error, that the WRONG
-- NUMBER is actually returned, which is the half that matters.
--
--   RED 1 — DOOR-10. The Visibility helper the read door actually asks — `custom.visible_set`
--           on the main database — is rewritten to say "everything is visible". test@test.com
--           then reads the jobs she may not see. The green suite's 0 becomes 3.
--   RED 2 — DOOR-6. `custom.query_by_coordinates` loses `count(distinct n)` for `count(*)`.
--           Two coordinates then match J2 through one edge counted twice, and the intersection
--           silently returns rows that satisfy only ONE of them.
--   RED 3 — DOOR-7. `custom.query_rollup` loses `group by`, and the loop-plus-diamond graph
--           returns more nodes than it has.
--   RED 4 — DOOR-8. `custom.query_record_as_of` ignores `p_recorded_at`, and "what did the
--           store say in August" answers with September's correction — one clock wearing two
--           argument names.
--   RED 5 — DOOR-N-3. `custom.query_prepare_hot` becomes a no-op and the hot paths are
--           unprepared, which is the 86 ms cold plan DOOR-N-3 measured.
--
-- 🚨 WHERE IT RUNS (lane SEAT-SUITES, 2026-09-19). It used to refuse anything but the rehearsal
-- branch, and that branch is now ~100 functions behind and has no `custom.field_declare` at all,
-- so this suite had not run anywhere since the owner's "there is no production, everything goes
-- live" ruling. It now runs on the MAIN database, by system identifier, in ONE transaction that
-- is rolled back; each break is undone with `rollback to savepoint clean`, which restores the
-- replaced body and keeps the fixture.
--
-- 🚨 THE SEAT. RED 1 to RED 4 are questions a signed-in person's SCREEN asks, and they are now
-- asked from the seat `authenticated` through the four client doors themselves —
-- `custom.query_visible_ids`, `custom.query_by_coordinates`, `custom.query_rollup` and
-- `custom.query_record_as_of` — after PART 0 proves the seat is real. That also means this
-- suite no longer uses `scripts/campaign-tests/_w4_query_red_fixture.sql`: that fixture
-- hard-codes the `Matrx System` organization, which is a `global_readable` system org —
-- measured on the main database 2026-09-19, `test@test.com` is answered every record of it
-- with no grant of any kind, because the system-organization lane admits every signed-in
-- account at viewer. "A principal with no grant" cannot exist in that organization, so RED 1's
-- precondition can never hold in it. The fixture is therefore built here, through the doors,
-- in a throwaway organization this suite creates and rolls back.
--
-- RED 5 is the SERVER'S OWN LANE. `custom.query_prepare_hot` and
-- `custom.query_hot_paths_prepared` hold no client grant: preparing a statement is something a
-- connection does for itself, never something a browser asks for. That block steps OUT of the
-- seat and says so, and asserts nothing about what a person may do.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w4_query_red.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

select set_config('app.actor_system', 'campaign.w4_query.red', true);

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

-- ══════════════════ THE FIXTURE, THROUGH THE DOORS, AND THE SEAT
do $fix$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org   uuid := gen_random_uuid();
  v_boss  text := current_user;
  v_home  uuid; v_tjob uuid; v_tcli uuid;
  v_alpha uuid; v_beta uuid;
  v_j1 uuid; v_j2 uuid; v_j3 uuid; v_hers uuid;
  n int;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ironclad Mobile Mechanic', 'ironclad-mobile-mechanic-' || substr(v_org::text, 1, 8), 'IMM', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- The store answers a person only where it is switched ON, and `shared_only` because RED 1's
  -- whole subject is a principal with no grant at all.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb,          'w4_query_red'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb, 'w4_query_red');
  -- A HOME record has no client door of its own. This step asserts nothing.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
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

  v_tcli := custom.table_declare(v_org, jsonb_build_object(
    'name','Customers','slug','customers','type','entity','display','list',
    'label_singular','Client','label_plural','Clients','ordered',false,'weight','light',
    'retention_days',365,'row_order','sorted','agent_writable',true,'parent_id',v_home::text,
    'title_field','title','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));
  v_tjob := custom.table_declare(v_org, jsonb_build_object(
    'name','Service Calls','slug','service_calls','type','entity','display','list',
    'label_singular','Job','label_plural','Jobs','ordered',false,'weight','light',
    'retention_days',365,'row_order','sorted','agent_writable',true,'parent_id',v_home::text,
    'title_field','title','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));

  -- THE TWO RELATION COLUMNS. 🚨 FINDING (SEAT-SUITES, 2026-09-19): THERE IS NO CLIENT DOOR
  -- THAT DECLARES A RELATION TO ONE OF THE ORGANIZATION'S OWN TABLES. `custom.field_declare`
  -- is the door for adding a column, and `custom._field_document_for` refuses the word
  -- `relation` outright — "say member for a person or attachment for a file" — and its only
  -- two relation arms hard-code `custom.person_kernel_id()` and `custom.file_kernel_id()`.
  -- `lookup` and `rollup` become formulas that READ an existing relation; neither creates one.
  -- So "a Job has a Client" — the shape this whole suite is about — cannot be built by a
  -- signed-in person at all today. That is a missing capability in the door, not a small
  -- mis-wiring, so it is reported rather than patched here: these two statements step OUT of
  -- the seat and SAY SO, they assert nothing, and every clause about the graph below is asked
  -- back inside, through `custom.query_by_coordinates` and `custom.query_rollup`.
  perform set_config('role', v_boss, true);
  update custom.record set data = jsonb_set(data, '{fields}',
           (data -> 'fields') || '[{"name":"client"},{"name":"next_job"}]'::jsonb)
   where organization_id = v_org and id = v_tjob;
  insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                            relation_target, relation_max, on_target_delete, config, source,
                            source_config, sensitivity, context_policy, rules, depends_on,
                            applies_to_types, multi, dated, required, sort)
  values (v_org, v_tjob, 'client', 'Client', 'Client', 'relation', v_tcli,
          50, 'set_null', '{"target_mode":"one","loops":true}'::jsonb, 'manual', '{}'::jsonb,
          'internal', 'include', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 10),
         (v_org, v_tjob, 'next_job', 'Next', 'Next', 'relation', v_tjob,
          50, 'set_null', '{"target_mode":"one","loops":true}'::jsonb, 'manual', '{}'::jsonb,
          'internal', 'include', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 20);
  perform set_config('role', 'authenticated', true);

  v_alpha := custom.record_write(v_org, v_tcli, '{"title":"Alpha"}'::jsonb);
  v_beta  := custom.record_write(v_org, v_tcli, '{"title":"Beta"}'::jsonb);
  v_j1 := custom.record_write(v_org, v_tjob, '{"title":"J1"}'::jsonb);
  v_j2 := custom.record_write(v_org, v_tjob, '{"title":"J2"}'::jsonb);
  v_j3 := custom.record_write(v_org, v_tjob, '{"title":"J3"}'::jsonb);
  -- ONE record shared with `test@test.com`, so RED 1's zero has a control beside it.
  v_hers := custom.record_write(v_org, v_tcli, '{"title":"Hers"}'::jsonb);
  perform custom.share_grant(v_org, v_hers, 'person', c_dana, 'viewer'::public.permission_level);

  -- THE EDGES. `platform.relation_set` is the store's own relation writer and holds no client
  -- grant (it writes `platform.associations` and `custom.record` directly), so these five
  -- statements step OUT of the seat and SAY SO. They assert nothing; every clause about the
  -- graph below is asked back inside, through `custom.query_by_coordinates` and
  -- `custom.query_rollup`.
  perform set_config('role', v_boss, true);
  perform platform.relation_set(v_org, v_j1, 'client',   jsonb_build_array(v_alpha::text));
  perform platform.relation_set(v_org, v_j2, 'client',   jsonb_build_array(v_alpha::text, v_beta::text));
  perform platform.relation_set(v_org, v_j1, 'next_job', jsonb_build_array(v_j2::text));
  perform platform.relation_set(v_org, v_j2, 'next_job', jsonb_build_array(v_j3::text));
  perform platform.relation_set(v_org, v_j3, 'next_job', jsonb_build_array(v_j1::text));
  perform set_config('role', 'authenticated', true);

  -- ── THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON, and the control beside it.
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into n from custom.query_visible_ids(v_org, v_tjob);
  if n <> 0 then
    raise exception 'N1: test@test.com reads % of the jobs nobody shared with her.', n;
  end if;
  if (custom.read_record(v_org, v_hers, false) ->> 'title') <> 'Hers' then
    raise exception 'N2: the one record shared with test@test.com at viewer does not read back for her.';
  end if;
  raise notice 'NEGATIVE PASSED — test@test.com reads none of the jobs and reads the one record she was given.';

  perform set_config('zz.org',   v_org::text,   true);
  perform set_config('zz.tjob',  v_tjob::text,  true);
  perform set_config('zz.alpha', v_alpha::text, true);
  perform set_config('zz.beta',  v_beta::text,  true);
  perform set_config('zz.j1',    v_j1::text,    true);

  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', c_admin_j, true);
end $fix$;

savepoint clean;

\echo ''
\echo '══ RED 1 — DOOR-10: the Visibility helper is made to say "everything"'
\echo ''

do $red1$
declare v_boss text := current_user; v_before int;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 1: this block did not take the seat — current_user is %', current_user;
  end if;
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select count(*) into v_before from custom.query_visible_ids(current_setting('zz.org')::uuid,
                                                              current_setting('zz.tjob')::uuid);
  if v_before <> 0 then
    raise exception 'RED 1 cannot run: the GREEN state is meant to be 0 for test@test.com here, and it is %', v_before;
  end if;
  perform set_config('role', v_boss, true);
end $red1$;

-- THE BREAK. DDL on the store's own helper: an operator step, asserting nothing.
-- 🚨 WHICH HELPER (SEAT-SUITES, 2026-09-19). This block used to rewrite
-- `custom.query_access_ids` to answer "everything". On the MAIN database that function is no
-- longer what `custom.query_visible_ids` reads — SHARED-ONLY moved the decision into
-- `custom.visible_set`, and breaking the old helper now changes nothing at all (measured: 0
-- stayed 0). A red twin that breaks a helper the door no longer asks proves NOTHING, so the
-- break moved with the enforcement point: the helper that decides what a principal reaches is
-- made to say "everything is visible", which is the identical defect DOOR-10 names.
create or replace function custom.visible_set(p_user uuid, p_organization_id uuid, p_table_id uuid,
    p_required public.permission_level default 'viewer'::public.permission_level,
    out o_all_visible boolean, out o_true_visibility platform.visibility[],
    out o_granted_all uuid[], out o_granted_visible uuid[], out o_carried_visible uuid[],
    out o_ladder_calls integer, out o_fallback boolean, out o_note text)
returns record language plpgsql stable security definer set search_path to '' as $b$
begin
  o_all_visible     := true;          -- THE BREAK
  o_true_visibility := '{}'::platform.visibility[];
  o_granted_all     := '{}'::uuid[];
  o_granted_visible := '{}'::uuid[];
  o_carried_visible := '{}'::uuid[];
  o_ladder_calls    := 0;
  o_fallback        := false;
  o_note            := null;
end $b$;

do $red1b$
declare v_boss text := current_user; v_after int;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 1b: this block did not take the seat — current_user is %', current_user;
  end if;
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select count(*) into v_after from custom.query_visible_ids(current_setting('zz.org')::uuid,
                                                             current_setting('zz.tjob')::uuid);
  if v_after <> 3 then
    raise exception 'RED 1 DID NOT GO RED: with the helper answering "everything", test@test.com should read all 3 jobs and read %', v_after;
  end if;
  raise notice 'RED 1 PASS (it went red): from the seat `authenticated`, 0 → % for a principal with no grant. The helper is load-bearing, and the whole lane reads it', v_after;
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
end $red1b$;

rollback to savepoint clean;

\echo ''
\echo '══ RED 2 — DOOR-6: DISTINCT is removed from the coordinate count'
\echo ''

do $red2$
declare
  v_boss text := current_user;
  v_org uuid := current_setting('zz.org')::uuid;
  v_tjob uuid := current_setting('zz.tjob')::uuid;
  v_alpha uuid := current_setting('zz.alpha')::uuid;
  v_beta uuid := current_setting('zz.beta')::uuid;
  v_before int;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2: this block did not take the seat — current_user is %', current_user;
  end if;
  -- GREEN: "related to Alpha AND to Beta" is J2 alone.
  select count(*) into v_before from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_alpha),
                      jsonb_build_object('role','client','target_id',v_beta)), 100, 0);
  if v_before <> 1 then
    raise exception 'RED 2 cannot run: the GREEN answer for the intersection is 1, and it is %', v_before;
  end if;
  perform set_config('role', v_boss, true);
end $red2$;

-- THE BREAK: `count(distinct n)` becomes `count(*)`, so J1's ONE edge to Alpha, counted
-- against a two-coordinate question, no longer distinguishes "two coordinates satisfied"
-- from "one coordinate satisfied twice".
create or replace function custom.query_by_coordinates(
  p_organization_id uuid, p_table_id uuid default null, p_coordinates jsonb default '[]'::jsonb,
  p_limit integer default 50, p_offset integer default 0, p_required text default 'viewer')
returns table(record_id uuid, table_id uuid, data jsonb, coordinates_matched integer)
language plpgsql stable security definer set search_path to 'pg_catalog' as $b$
declare v_n integer;
begin
  select count(*) into v_n from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb));
  return query
  with coord as (
    select ord as n, c ->> 'role' as role, (c ->> 'target_id')::uuid as target_id,
           coalesce(c ->> 'direction', 'from') as direction
      from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb)) with ordinality as t(c, ord)),
  hit as (
    select case when co.direction = 'to' then a.target_id else a.source_id end as rec_id, co.n
      from coord co
      join platform.associations a
        on a.organization_id = p_organization_id and a.deleted_at is null
       and a.relation_field_id is not null and (co.role is null or a.role = co.role)
       and ((co.direction = 'from' and a.source_type = 'record' and a.target_id = co.target_id)
         or (co.direction = 'to' and a.source_id = co.target_id))),
  satisfied as (
    select rec_id, count(*)::integer as matched from hit group by rec_id
    having count(*) >= v_n)                       -- THE BREAK
  select r.id, r.table_id, r.data, coalesce(s.matched, 0)
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r on r.organization_id = p_organization_id and r.id = v
    left join satisfied s on s.rec_id = v
   where v_n = 0 or s.rec_id is not null
   order by r.created_at desc, r.id limit 100;
end $b$;

do $red2b$
declare
  v_boss text := current_user;
  v_org uuid := current_setting('zz.org')::uuid;
  v_tjob uuid := current_setting('zz.tjob')::uuid;
  v_alpha uuid := current_setting('zz.alpha')::uuid;
  v_after int;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2b: this block did not take the seat — current_user is %', current_user;
  end if;
  select count(*) into v_after from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_alpha),
                      jsonb_build_object('role','client','target_id',v_alpha)), 100, 0);
  if v_after < 2 then
    raise exception 'RED 2 DID NOT GO RED: with count(*) for count(distinct n), asking Alpha TWICE should admit J1 as well as J2 and returned %', v_after;
  end if;
  raise notice 'RED 2 PASS (it went red): from the seat, the same coordinate asked twice now admits % records where the intersection is 1 — the DISTINCT is what makes "any subset" mean anything', v_after;
  perform set_config('role', v_boss, true);
end $red2b$;

rollback to savepoint clean;

\echo ''
\echo '══ RED 3 — DOOR-7: the rollup loses its grouping and double-counts the loop'
\echo ''

do $red3$
declare
  v_boss text := current_user;
  v_org uuid := current_setting('zz.org')::uuid;
  v_j1 uuid := current_setting('zz.j1')::uuid;
  v_before int;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 3: this block did not take the seat — current_user is %', current_user;
  end if;
  select count(*) into v_before from custom.query_rollup(v_org, array[v_j1], 'referenced', 'next_job');
  if v_before <> 3 then
    raise exception 'RED 3 cannot run: the GREEN rollup over this three-node loop is 3, and it is %', v_before;
  end if;
  perform set_config('role', v_boss, true);
end $red3$;

create or replace function custom.query_rollup(p_organization_id uuid, p_roots uuid[],
    p_flavor text default null, p_role text default null, p_max_depth integer default 33,
    p_required text default 'viewer')
returns table(record_id uuid, depth integer)
language plpgsql stable security definer set search_path to 'pg_catalog' as $b$
begin
  return query
  with recursive edge as (
    select e.parent_id, e.child_id from custom.query_relation_edges(p_organization_id, p_flavor, p_role) e),
  walk (node, d) as (
      select x, 0 from unnest(p_roots) as x
    union all
      select e.child_id, walk.d + 1 from walk join edge e on e.parent_id = walk.node where walk.d < 8)
  select w.node, w.d                               -- THE BREAK: no cycle stop, no grouping
    from walk w
    join custom.query_visible_ids(p_organization_id, null, p_required) v on v = w.node;
end $b$;

do $red3b$
declare
  v_boss text := current_user;
  v_org uuid := current_setting('zz.org')::uuid;
  v_j1 uuid := current_setting('zz.j1')::uuid;
  v_after int;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 3b: this block did not take the seat — current_user is %', current_user;
  end if;
  select count(*) into v_after from custom.query_rollup(v_org, array[v_j1], 'referenced', 'next_job');
  if v_after <= 3 then
    raise exception 'RED 3 DID NOT GO RED: without the grouping the loop should overcount 3 nodes and returned %', v_after;
  end if;
  raise notice 'RED 3 PASS (it went red): from the seat, 3 nodes became % — the number a caller would have shown a person as "how many jobs are downstream"', v_after;
  perform set_config('role', v_boss, true);
end $red3b$;

rollback to savepoint clean;

\echo ''
\echo '══ RED 4 — DOOR-8: the recorded clock is ignored and answers with today'
\echo ''

do $red4$
declare
  v_boss text := current_user;
  v_org uuid := current_setting('zz.org')::uuid;
  v_j1 uuid := current_setting('zz.j1')::uuid;
  v_t constant timestamptz := '2026-08-10 12:00:00+00';
  v_then jsonb;
begin
  -- OUT OF THE SEAT for one fixture statement and no clause: `history.row_versions` is the
  -- capture ledger, no person has a door onto it, and back-dating a capture is how this suite
  -- makes "August" exist at all.
  update history.row_versions set occurred_at = v_t
   where entity_type = 'custom.record' and row_id = v_j1 and organization_id = v_org;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 4: this block did not take the seat — current_user is %', current_user;
  end if;
  perform custom.record_update(v_org, v_j1, '{"title":"J1 corrected"}'::jsonb, null);
  v_then := custom.query_record_as_of(v_org, v_j1, v_t + interval '1 second', null);
  if v_then ->> 'title' <> 'J1' then
    raise exception 'RED 4 cannot run: the GREEN recorded-clock answer is "J1", and it is %', v_then ->> 'title';
  end if;
  perform set_config('role', v_boss, true);
end $red4$;

create or replace function custom.query_record_as_of(p_organization_id uuid, p_record_id uuid,
    p_recorded_at timestamptz default null, p_world_on date default null,
    p_required text default 'viewer')
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog' as $b$
declare v_doc jsonb;
begin
  if not custom.query_can_see(p_organization_id, p_record_id, p_required) then return null; end if;
  select r.data into v_doc from custom.record r          -- THE BREAK: p_recorded_at ignored
   where r.organization_id = p_organization_id and r.id = p_record_id;
  return v_doc;
end $b$;

do $red4b$
declare
  v_boss text := current_user;
  v_org uuid := current_setting('zz.org')::uuid;
  v_j1 uuid := current_setting('zz.j1')::uuid;
  v_t constant timestamptz := '2026-08-10 12:00:00+00';
  v_then_broken jsonb;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 4b: this block did not take the seat — current_user is %', current_user;
  end if;
  v_then_broken := custom.query_record_as_of(v_org, v_j1, v_t + interval '1 second', null);
  if v_then_broken ->> 'title' <> 'J1 corrected' then
    raise exception 'RED 4 DID NOT GO RED: ignoring p_recorded_at should answer with today''s "J1 corrected" and answered %', v_then_broken ->> 'title';
  end if;
  raise notice 'RED 4 PASS (it went red): from the seat, the store now says it said "%" in August, which it did not. This is the silent wrong answer, not an error', v_then_broken ->> 'title';
  perform set_config('role', v_boss, true);
end $red4b$;

\echo ''
\echo '══ RED 5 — DOOR-N-3: the hot paths stop being prepared'
\echo ''

-- 🚨 OUT OF THE SEAT, DELIBERATELY. `custom.query_prepare_hot` and
-- `custom.query_hot_paths_prepared` hold no EXECUTE grant for `authenticated`: preparing a
-- statement is something a CONNECTION does for itself before it serves anybody, never
-- something a browser asks for. This block asserts nothing about what a person may do.
do $red5$
declare
  n_before int; n_after int;
begin
  if current_user = 'authenticated' then
    raise exception 'RED 5: this block must run as the server lane, not the seat.';
  end if;
  perform custom.query_prepare_hot();
  select count(*) into n_before from custom.query_hot_paths_prepared() where prepared;
  if n_before < 4 then
    raise exception 'RED 5 cannot run: the GREEN state prepares 4 hot paths and prepared %', n_before;
  end if;
  deallocate all;

  create or replace function custom.query_prepare_hot() returns integer
  language sql set search_path to 'pg_catalog' as $b$ select 0 $b$;   -- THE BREAK

  perform custom.query_prepare_hot();
  select count(*) into n_after from custom.query_hot_paths_prepared() where prepared;
  if n_after <> 0 then
    raise exception 'RED 5 DID NOT GO RED: a no-op prepare should leave 0 hot paths prepared and left %', n_after;
  end if;
  raise notice 'RED 5 PASS (it went red): % prepared → 0. Every hot read goes back to planning against a table that grows one promoted index per organization per Field', n_before;
end $red5$;

\echo ''
\echo '══ W4-QUERY RED TWIN: every break went red ══'

rollback;
