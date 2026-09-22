-- LANE MIRROR-2 — THE RED TWIN.
--
-- It executes the REAL BYTES of both inverses (migrations/inverse/mirror2_*_down.sql) inside a
-- transaction it rolls back, and shows the green suite's clauses going red. A guard nobody has
-- seen fail is not a guard.
--
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/mirror2_red.sql
--
-- It TAKES THE SEAT in PART 0 and steps OUT — saying so — for the clauses that are catalogue
-- questions or operator statements no client door covers.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'mirror2_red.sql'
\set requires 'function:iam.record_visible_in_org'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
set local client_min_messages = notice;

do $t$
declare
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_org    constant uuid := '4352d061-ec13-4761-ae32-9c9bd52e7de3';
  v_n      integer;
  v_t0     timestamptz;
  v_ms     numeric;
begin
  perform set_config('mirror2.boss', current_user, true);
  perform set_config('app.actor_system', 'campaign-test/mirror2_red', true);

  -- PART 0 — TAKE THE SEAT AND PROVE IT, exactly as the green suite does.
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0: seated as authenticated, claims = test@test.com.';

  -- STEP OUT for the timed clause: `custom.record` carries no SELECT for any client role, so
  -- the mirror's own arm cannot be evaluated over rows from the seat. The CLAIMS stay the
  -- seat's, so the question is still "what can test@test.com see".
  perform set_config('role', current_setting('mirror2.boss', true), true);

  -- GREEN: the organization-bounded question, timed.
  v_t0 := clock_timestamp();
  select count(*) into v_n from custom.record r
   where r.organization_id = c_org and r.deleted_at is null
     and iam.record_visible_in_org(r.organization_id, r.table_id, r.id, r.visibility, r.created_by,
                                   'viewer'::public.permission_level);
  v_ms := round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1);
  perform set_config('mirror2.green_ms', v_ms::text, true);
  raise notice 'GREEN: the organization-bounded question over one organization names % row(s) in % ms.',
    v_n, v_ms;

  raise notice '--- executing migrations/inverse/mirror2_*_down.sql for real ---';
end;
$t$;

\i migrations/inverse/mirror2_the_mirror_asks_the_rows_own_organization_down.sql

do $t$
declare
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_org    constant uuid := '4352d061-ec13-4761-ae32-9c9bd52e7de3';
  v_reds   integer := 0;
  v_qual   text;
  v_n      integer;
  v_t0     timestamptz;
  v_ms     numeric;
begin
  -- 1 — the policy computes the whole-database record set again.
  select p.qual into v_qual from pg_policies p
   where p.schemaname='custom' and p.tablename='record' and p.policyname='std_select';
  if v_qual ~ 'accessible_entity_ids\(''record''' and v_qual !~ 'record_visible_in_org' then
    v_reds := v_reds + 1;
    raise notice '1: RED — the mirror on custom.record computes the record set for EVERY organization again.';
  else
    raise exception '1: NOT RED — the inverse did not put the whole-database bound back.';
  end if;

  -- 2 — the census names it.
  select count(*) into v_n from custom.mirror_asks_the_whole_database();
  if v_n = 1 then
    v_reds := v_reds + 1;
    raise notice '2: RED — custom.mirror_asks_the_whole_database() names % policy again.', v_n;
  else
    raise exception '2: NOT RED — the census found % rows, expected 1.', v_n;
  end if;

  -- 3 — AND IT COSTS WHAT IT COST BEFORE. Asked from the SEAT, through the bound the policy is
  -- back to, over the same organization the green clause timed.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_t0 := clock_timestamp();
  select count(*) into v_n from custom.record r
   where r.organization_id = c_org and r.deleted_at is null
     and r.id = any (iam.accessible_entity_ids('record', 'viewer'::public.permission_level, 0, true));
  v_ms := round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1);
  if v_ms > 3 * current_setting('mirror2.green_ms', true)::numeric then
    v_reds := v_reds + 1;
    raise notice '3: RED — the same question over the same organization costs % ms again, against % ms bounded.',
      v_ms, current_setting('mirror2.green_ms', true);
  else
    raise exception '3: NOT RED — the whole-database bound cost % ms, against % ms bounded.',
      v_ms, current_setting('mirror2.green_ms', true);
  end if;

  perform set_config('mirror2.reds', v_reds::text, true);
  raise notice '--- executing the second inverse ---';
end;
$t$;

\i migrations/inverse/mirror2_the_mirror_asks_one_organization_once_a_statement_down.sql

do $t$
declare
  v_reds integer := current_setting('mirror2.reds', true)::integer;
  v_n    integer;
begin
  -- 4 — the memo and its fence are gone.
  select count(*) into v_n from pg_proc p
   where (p.pronamespace = 'iam'::regnamespace
          and p.proname in ('record_visible_in_org', 'statement_memo_epoch'))
      or (p.pronamespace = 'custom'::regnamespace
          and p.proname = 'mirror_asks_the_whole_database');
  if v_n = 0 then
    v_reds := v_reds + 1;
    raise notice '4: RED — iam.record_visible_in_org, iam.statement_memo_epoch and the census are gone; nothing can bound the mirror to one organization.';
  else
    raise exception '4: NOT RED — % of the three objects survived the inverse.', v_n;
  end if;

  -- 5 — and the signed-in door that let a person's own read reach it is withdrawn.
  select count(*) into v_n from platform.client_callable_door d
   where d.schema_name = 'iam' and d.function_name = 'record_visible_in_org';
  if v_n = 0 then
    v_reds := v_reds + 1;
    raise notice '5: RED — the declared signed-in door for the memo is withdrawn, so a policy naming it would refuse every client read at 42501.';
  else
    raise exception '5: NOT RED — the door row survived the inverse.';
  end if;

  raise notice 'MIRROR-2: % of 5 blocks are RED. ROLLBACK next.', v_reds;
  if v_reds <> 5 then
    raise exception 'MIRROR-2 red twin: only % of 5 blocks went red.', v_reds;
  end if;
end;
$t$;

rollback;

\echo 'ROLLBACK VERIFIED — the landed state is back:'
select (select count(*) from custom.mirror_asks_the_whole_database()) as policies_asking_the_whole_database,
       (select count(*) from pg_proc p where p.pronamespace='iam'::regnamespace
          and p.proname in ('record_visible_in_org','statement_memo_epoch')) as memo_objects,
       (select count(*) from platform.client_callable_door d
         where d.schema_name='iam' and d.function_name='record_visible_in_org') as door_rows,
       (select (p.qual ~ 'record_visible_in_org') from pg_policies p
         where p.schemaname='custom' and p.tablename='record' and p.policyname='std_select') as mirror_asks_one_organization;
