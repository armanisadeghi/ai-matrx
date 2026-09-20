-- LANE MIRROR-PERF — THE RED TWIN. It executes the REAL BYTES of all three inverses inside a
-- transaction that always ROLLS BACK, and shows the green suite's clauses going red.
--
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/mirrorperf_red.sql
--
-- IT TAKES THE SEAT for the clauses a person can reach (PART 0, then every `custom.record_table`
-- clause as `test@test.com`), and STEPS OUT — saying so — for the three that no client door
-- covers: `custom.visible_record_ids` carries no EXECUTE for `authenticated` (census 7 is what
-- keeps it that way) and the two catalogue clauses are about what a census can SEE in a body.
--
-- It takes about a minute: RED 3 is a MEASURED clause and the thing it measures is the per-row
-- ladder over every record on the database, which is the whole defect.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '900s';

do $t$
declare
  c_dana   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_org    constant uuid := '4245620b-6beb-4845-8651-be9e070f311d';   -- Fairview Shared Services
  -- Census 1 of check:store-doors-decide, verbatim: the six deciders it accepts. A red twin
  -- that paraphrased the guard would prove nothing about the guard.
  c_deciders constant text :=
    '(assert_client_may_reach|assert_client_may_change|has_access_for|has_visibility|anon_token_verify|visible_record_ids)';
  v_boss   text := current_user;
  v_state  text;
  t0       timestamptz;
  v_new_ms numeric;
  v_n      integer;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'mirrorperf_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/mirrorperf_red', true);
  perform set_config('mirrorperf.boss', v_boss, true);

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
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- GREEN 0b, FROM THE SEAT — on the landed bytes an id that is in no organization is TOLD it
  -- is not there. This is the clause the seat suite found the defect with.
  begin
    perform custom.record_table(c_org, gen_random_uuid());
    raise exception 'GREEN 0b: custom.record_table answered for an id that does not exist, before any inverse ran';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '02000' then
      raise exception 'GREEN 0b: expected 02000 on the landed bytes from the seat, got %', v_state;
    end if;
  end;
  raise notice 'GREEN 0b: from the seat, an id that is in no organization is refused with 02000.';

  -- STEPPING OUT, AND SAYING SO. `custom.visible_record_ids` carries no EXECUTE for
  -- `authenticated` — no client door covers it — so the measured clause below and its red half
  -- are the connected role's, and they assert nothing about a product surface while out.
  perform set_config('role', v_boss, true);

  t0 := clock_timestamp();
  select count(*) into v_n from custom.visible_record_ids(c_dana, 'viewer'::public.permission_level);
  v_new_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  perform set_config('mirrorperf.new_ms', v_new_ms::text, true);
  raise notice 'GREEN: the landed set form names % ids in % ms.', v_n, v_new_ms;

  raise notice '--- executing migrations/inverse/mirrorperf_*_down.sql for real ---';
end;
$t$;

\i migrations/inverse/mirrorperf_a_record_that_is_not_there_says_so_down.sql
\i migrations/inverse/mirrorperf_a_door_that_names_a_record_decides_it_down.sql
\i migrations/inverse/mirrorperf_the_mirror_asks_the_set_not_the_row_down.sql

do $t$
declare
  c_dana   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_org    constant uuid := '4245620b-6beb-4845-8651-be9e070f311d';
  c_deciders constant text :=
    '(assert_client_may_reach|assert_client_may_change|has_access_for|has_visibility|anon_token_verify|visible_record_ids)';
  v_boss   text := current_setting('mirrorperf.boss', true);
  v_named  integer;
  v_body   text;
  v_got    uuid;
  t0       timestamptz;
  v_old_ms numeric;
  v_new_ms numeric;
  v_n      integer;
  v_reds   integer := 0;
begin
  -------------------------------------------------------------------------------------------
  -- RED 1 — CENSUS 1 NAMES THE DOOR AGAIN. The guard's own query, not a paraphrase: a
  -- SECURITY DEFINER function in schema `custom` that `authenticated` may execute, taking
  -- `p_organization_id uuid`, whose BODY contains none of the six deciders. Read as the
  -- connected role because it is a catalogue question, and it asserts nothing about a surface.
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
  -- RED 3 — AND IT COSTS WHAT A PER-ROW LADDER COSTS. Same connection, same person, same
  -- level, minutes apart. THE CLAUSE IS THE RATIO, NOT A WALL-CLOCK THRESHOLD: an absolute
  -- number would go green on a loaded database for the wrong reason and red on an empty one for
  -- the wrong reason.
  -------------------------------------------------------------------------------------------
  t0 := clock_timestamp();
  select count(*) into v_n from custom.visible_record_ids(c_dana, 'viewer'::public.permission_level);
  v_old_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  v_new_ms := current_setting('mirrorperf.new_ms', true)::numeric;
  if v_old_ms <= v_new_ms * 1.25 then
    raise exception 'RED 3 IS NOT RED: the per-row ladder took % ms against the set form''s % ms on the same connection, which is not a difference. Either this database is too small for the clause to mean anything or the set form stopped being set-based — say which rather than passing it', v_old_ms, v_new_ms;
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 3 IS RED — the restored per-row body names % ids in % ms against the landed set form''s % ms for the same person, same level, same connection (x%).',
    v_n, v_old_ms, v_new_ms, round(v_old_ms / nullif(v_new_ms, 0), 2);

  -------------------------------------------------------------------------------------------
  -- RED 4 — FROM THE SEAT: THE `v_found` FORM ANSWERS ABOUT A RECORD THAT DOES NOT EXIST.
  -- `select ... into` sets every target to NULL when it finds nothing, so `v_found` is NULL,
  -- `if not null` never fires, and the door hands back NULL instead of saying there is no such
  -- record. GREEN 0b above is the same call on the landed bytes.
  -------------------------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_got := custom.record_table(c_org, gen_random_uuid());
  if v_got is not null then
    raise exception 'RED 4 IS NOT RED: the restored body returned % for an invented id', v_got;
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 4 IS RED — from the same seat, the restored door hands back NULL for an id that is in no organization, instead of the 02000 GREEN 0b got.';
  perform set_config('role', v_boss, true);

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
