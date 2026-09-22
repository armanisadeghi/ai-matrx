-- LANE LADDER-PERF — THE RED TWIN.
--
-- It executes the REAL BYTES of both inverses inside ONE transaction that ends in ROLLBACK, so
-- the ladder goes back to re-planning itself and every clause of ladderperf_green.sql's PART 3
-- and PART 4 goes red. Running the inverse bodies for real is also what proves they are valid
-- SQL against the live catalogue.
--
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/ladderperf_red.sql
--
-- IT STEPS OUT OF THE SEAT AND SAYS SO. Every clause here is about what the SYSTEM CATALOGUE
-- holds and what a body costs; `authenticated` holds no EXECUTE on `custom.ladder_replanners`,
-- `platform.static_row_probes_stale` or `platform.partitioned_row_attrs`, and it must not — so
-- there is no seat to take for these three questions and no product clause is asserted while
-- out. PART 0 takes the seat first and proves it exists, the way the recipe asks.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'ladderperf_red.sql'
\set requires 'function:custom.ladder_replanners'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local client_min_messages = notice;   -- the clauses below SAY what they found

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/ladderperf_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0: the seat exists and is a client seat. The three clauses below are catalogue '
               'questions no client door covers, so the suite steps out for them and says so.';
  perform set_config('role', v_boss, true);
end;
$t$;

-- ---------------------------------------------------------------------------------------------
-- GREEN FIRST — so a red twin that proved nothing cannot pass.
-- ---------------------------------------------------------------------------------------------
do $t$
declare v_n integer; v_ms numeric; t0 timestamptz; i integer; b boolean; v_rec uuid;
begin
  select count(*) into v_n from custom.ladder_replanners();
  if v_n <> 0 then raise exception 'PRE: the database is not green to start with — % replanner(s)', v_n; end if;
  select count(*) into v_n from platform.static_row_probes_stale();
  if v_n <> 0 then raise exception 'PRE: the generated probes are not current to start with'; end if;
  raise notice 'PRE: green — 0 re-planning functions on the ladder, 0 stale probes.';
end;
$t$;

-- ---------------------------------------------------------------------------------------------
-- THE INVERSES, FOR REAL.
-- ---------------------------------------------------------------------------------------------
\ir ../../migrations/inverse/ladderperf_a_probe_arm_that_cannot_fire_is_not_coverage_down.sql
\ir ../../migrations/inverse/ladderperf_the_two_new_probes_render_their_own_signature_down.sql
\ir ../../migrations/inverse/ladderperf_a_partitioned_row_is_probed_by_a_cached_plan_down.sql
\ir ../../migrations/inverse/ladderperf_the_one_ladder_plans_once_down.sql

-- ---------------------------------------------------------------------------------------------
-- AND NOW IT IS RED.
-- ---------------------------------------------------------------------------------------------
do $t$
declare
  v_n integer;
  v_probe_gone boolean;
  v_census_gone boolean;
  t0 timestamptz; i integer; b boolean;
  v_rec uuid; v_user uuid; v_ms numeric;
  v_red integer := 0;
begin
  -- 1 — the census itself is gone with the conversion it was written for, which is the bluntest
  -- statement that the class is open again: nothing is left watching it.
  v_census_gone := to_regprocedure('custom.ladder_replanners(text[])') is null;
  if not v_census_gone then
    raise exception '1: custom.ladder_replanners still exists after its own inverse ran';
  end if;
  v_red := v_red + 1;
  raise notice '1: RED — custom.ladder_replanners() is gone, so nothing counts the re-planners.';

  -- 2 — and they are back: the twenty bodies are LANGUAGE sql and non-inlinable again.
  select count(*) into v_n
    from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
    join pg_language l on l.oid = pr.prolang
   where l.lanname = 'sql' and (pr.prosecdef or pr.proconfig is not null) and pr.provolatile <> 'i'
     and ns.nspname || '.' || pr.proname in (
       'custom.carrying_edges_of','custom.carrying_edges_in','custom.visibility_ancestors',
       'custom.derive_visibility','custom.read_door_granted_ids','iam.content_levels',
       'iam.granted_level','iam.grant_addressed_level','iam.top_content_level','iam.is_client_lane',
       'iam.is_trusted_backend','iam.my_orgs','public.is_pack_curator','public.is_rulebook_curator',
       'public.library_is_open','public.is_admin','public.is_platform_admin',
       'platform.carrying_cycle_is_declared','platform.carrying_cycles',
       'platform.undeclared_carrying_cycles');
  if v_n <> 20 then
    raise exception '2: expected all 20 bodies back as LANGUAGE sql, found %', v_n;
  end if;
  v_red := v_red + 1;
  raise notice '2: RED — all 20 ladder helpers are LANGUAGE sql and non-inlinable again, so each '
               'one re-plans its body on every call.';

  -- 3 — the generated probes are gone and the census that would have said so is gone too.
  v_probe_gone := to_regprocedure('platform.partitioned_row_attrs(text,text,uuid)') is null
              and to_regprocedure('iam.registry_owner_of(text,uuid)') is null
              and to_regprocedure('platform.static_row_probes_stale()') is null;
  if not v_probe_gone then
    raise exception '3: the generated probes or their census survived their own inverse';
  end if;
  v_red := v_red + 1;
  raise notice '3: RED — platform.partitioned_row_attrs, iam.registry_owner_of and '
               'platform.static_row_probes_stale are all gone; the kernel is back on EXECUTE.';

  -- 4 — AND IT COSTS WHAT IT COST. The live clock, on a real record, in the state the inverse
  -- has put the database in. This is the number the lane exists to move.
  -- THE PAIR HAS TO BE A MISS. The ladder is cheap when the kernel's owner arm fires on its
  -- first line (0.24 ms even after this lane), so a red twin that measured the creator reading
  -- her own row would prove nothing. This picks a plain member of an organization whose store is
  -- open and whose `custom/member_default_visibility` is `shared_only`, against a record she did
  -- NOT create — the question every per-row read actually asks.
  select r.id, m.user_id into v_rec, v_user
    from custom.record r
    join iam.memberships m
      on m.container_type = 'organization' and m.container_id = r.organization_id
     and m.deleted_at is null and m.role <> 'owner'
   where r.deleted_at is null and r.data_class = 'record'
     and custom.store_is_open(r.organization_id)
     and m.user_id is distinct from r.created_by
     and not iam.member_lane_open(r.organization_id)
   order by r.id limit 1;
  if v_rec is null then
    raise notice '4: SKIPPED — no live record in an organization whose store is open.';
  else
    b := custom.has_visibility(v_user, 'record', v_rec, 'viewer');   -- warm
    t0 := clock_timestamp();
    for i in 1..20 loop b := custom.has_visibility(v_user, 'record', v_rec, 'viewer'); end loop;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000 / 20, 3);
    if v_ms < 8 then
      raise exception '4: the ladder still answers in % ms with the inverses run — the red twin '
                      'is not reproducing the cost it claims to', v_ms;
    end if;
    v_red := v_red + 1;
    raise notice '4: RED — one (member, record) question this person does not own costs % ms again, against 3.2 ms for the same shape of question with the lane applied.', v_ms;
  end if;

  -- 5 — platform.entity_row_access_attrs is back on a fresh plan per call.
  if (select pg_get_functiondef(pr.oid) from pg_proc pr
       where pr.pronamespace = 'platform'::regnamespace and pr.proname = 'entity_row_access_attrs')
     like '%partitioned_row_attrs%' then
    raise exception '5: entity_row_access_attrs still asks the generated probe after the inverse';
  end if;
  v_red := v_red + 1;
  raise notice '5: RED — platform.entity_row_access_attrs asks EXECUTE format() first again, so a '
               'sixteen-partition Append is planned from scratch once per node of every walk.';

  raise notice '% of 5 blocks are RED.', v_red;
end;
$t$;

rollback;

\echo 'ROLLBACK VERIFIED — the inverses ran for real and nothing is left behind.'
do $t$
declare v_n integer;
begin
  select count(*) into v_n from custom.ladder_replanners();
  if v_n <> 0 then raise exception 'POST: the rollback did not restore the lane — % replanner(s)', v_n; end if;
  select count(*) into v_n from platform.static_row_probes_stale();
  if v_n <> 0 then raise exception 'POST: the rollback did not restore the generated probes'; end if;
  raise notice 'POST: green again — 0 re-planning functions on the ladder, 0 stale probes.';
end;
$t$;
