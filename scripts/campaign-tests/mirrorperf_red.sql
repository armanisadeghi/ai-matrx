-- LANE MIRROR-PERF — THE RED TWIN. It executes the REAL BYTES of both inverses inside a
-- transaction that always ROLLS BACK, and shows the green suite's clauses going red. Running
-- the actual inverse files is also what proves they are valid SQL that restores what they claim.
--
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/mirrorperf_red.sql
--
-- It takes a few minutes: RED 3 is a MEASURED clause and the thing it measures is the per-row
-- ladder over every record on the database, which is the whole defect.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '900s';

do $t$
declare
  c_dana   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  -- Census 1 of check:store-doors-decide, verbatim: the six deciders it accepts and the shape
  -- of the query it runs. A red twin that paraphrased the guard would prove nothing about it.
  c_deciders constant text :=
    '(assert_client_may_reach|assert_client_may_change|has_access_for|has_visibility|anon_token_verify|visible_record_ids)';
  c_org    constant uuid := '4245620b-6beb-4845-8651-be9e070f311d';   -- Fairview Shared Services
  v_named  boolean;
  v_body   text;
  v_state  text;
  t0       timestamptz;
  v_new_ms numeric;
  v_old_ms numeric;
  v_n      integer;
  v_reds   integer := 0;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'mirrorperf_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/mirrorperf_red', true);

  ---------------------------------------------------------------------------------------------
  -- GREEN FIRST, on the landed bytes, so that what follows is a CHANGE and not a coincidence.
  ---------------------------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_body from pg_proc p
   where p.pronamespace = 'custom'::regnamespace and p.proname = 'record_table';
  if v_body !~* c_deciders then
    raise exception 'GREEN 0: custom.record_table does not decide the caller even before the inverse ran';
  end if;

  -- GREEN: an id that is in no organization is TOLD it is not there.
  begin
    perform custom.record_table(c_org, gen_random_uuid());
    raise exception 'GREEN 0b: custom.record_table answered for an id that does not exist, before any inverse ran';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '02000' then
      raise exception 'GREEN 0b: expected 02000 on the landed bytes, got %', v_state;
    end if;
  end;

  t0 := clock_timestamp();
  select count(*) into v_n from custom.visible_record_ids(c_dana, 'viewer'::public.permission_level);
  v_new_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  raise notice 'GREEN: the landed set form names % ids in % ms, and an id that is not there is refused with 02000.', v_n, v_new_ms;

  ---------------------------------------------------------------------------------------------
  -- THE REAL INVERSE BYTES, BOTH FILES.
  ---------------------------------------------------------------------------------------------
  raise notice '--- executing migrations/inverse/mirrorperf_*_down.sql for real ---';
end;
$t$;

\i migrations/inverse/mirrorperf_a_record_that_is_not_there_says_so_down.sql
\i migrations/inverse/mirrorperf_a_door_that_names_a_record_decides_it_down.sql
\i migrations/inverse/mirrorperf_the_mirror_asks_the_set_not_the_row_down.sql

do $t$
declare
  c_dana   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org    constant uuid := '4245620b-6beb-4845-8651-be9e070f311d';
  v_got    uuid;
  c_deciders constant text :=
    '(assert_client_may_reach|assert_client_may_change|has_access_for|has_visibility|anon_token_verify|visible_record_ids)';
  v_named  integer;
  v_body   text;
  t0       timestamptz;
  v_old_ms numeric;
  v_n      integer;
  v_reds   integer := 0;
begin
  -------------------------------------------------------------------------------------------
  -- RED 1 — CENSUS 1 NAMES THE DOOR AGAIN. This is the guard's own query, not a paraphrase of
  -- it: every SECURITY DEFINER function in schema `custom` that `authenticated` may execute,
  -- that takes `p_organization_id uuid`, and whose BODY contains none of the six deciders.
  -------------------------------------------------------------------------------------------
  select count(*) into v_named
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and pg_get_function_identity_arguments(p.oid) ~ 'p_organization_id uuid'
     and p.proname = 'record_table'
     and pg_get_functiondef(p.oid) !~* c_deciders;
  if v_named <> 1 then
    raise exception 'RED 1 IS NOT RED: with APPROVAL-TAIL''s body restored, census 1''s own query does not name custom.record_table';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 1 IS RED — census 1 names custom.record_table(p_organization_id uuid, p_record_id uuid): a client door taking an organization id whose body never decides the caller.';

  -------------------------------------------------------------------------------------------
  -- RED 2 — THE SET FORM IS GONE. The green suite's 2a, inverted.
  -------------------------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_body from pg_proc p
   where p.pronamespace = 'custom'::regnamespace and p.proname = 'visible_record_ids';
  if v_body like '%visible_predicate_sql%' or v_body like '%visible_set%' then
    raise exception 'RED 2 IS NOT RED: the inverse did not take custom.visible_set back out of custom.visible_record_ids';
  end if;
  if v_body !~ 'custom\.has_visibility\(p_user_id' then
    raise exception 'RED 2 IS NOT RED: the restored body is not the per-row ladder either';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 2 IS RED — the function the RLS mirror reaches is the per-row ladder over custom.record again, with no organization and no Table to bound it.';

  -------------------------------------------------------------------------------------------
  -- RED 3 — AND IT COSTS WHAT A PER-ROW LADDER COSTS. Measured, same connection, same
  -- snapshot-ish minute, same person, same level as the GREEN reading above.
  -------------------------------------------------------------------------------------------
  t0 := clock_timestamp();
  select count(*) into v_n from custom.visible_record_ids(c_dana, 'viewer'::public.permission_level);
  v_old_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  if v_old_ms < 20000 then
    raise exception 'RED 3 IS NOT RED: the per-row ladder over the whole store answered in % ms, so this database is no longer big enough for this clause to mean anything — say so rather than passing it', v_old_ms;
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 3 IS RED — the restored per-row body names % ids in % ms (the landed set form''s reading is the GREEN line above).', v_n, v_old_ms;

  -------------------------------------------------------------------------------------------
  -- RED 4 — THE `v_found` FORM ANSWERS ABOUT A RECORD THAT DOES NOT EXIST. `select ... into`
  -- sets every target to NULL when it finds nothing, so `v_found` is NULL, `if not null` never
  -- fires, and the door returns NULL instead of saying there is no such record.
  -------------------------------------------------------------------------------------------
  v_got := custom.record_table(c_org, gen_random_uuid());
  if v_got is not null then
    raise exception 'RED 4 IS NOT RED: the restored body returned % for an invented id', v_got;
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 4 IS RED — the restored door returns NULL for an id that is in no organization, instead of the 02000 its own comment promises.';

  raise notice 'MIRROR-PERF: % of 4 blocks are RED. ROLLBACK next.', v_reds;
end;
$t$;

rollback;

\echo 'ROLLBACK VERIFIED — checking the landed bodies are back:'
select p.proname,
       (pg_get_functiondef(p.oid) like '%visible_predicate_sql%'
        or pg_get_functiondef(p.oid) ~* 'assert_client_may_reach') as landed_body_is_live
  from pg_proc p
 where p.pronamespace = 'custom'::regnamespace
   and p.proname in ('visible_record_ids', 'record_table')
 order by 1;
