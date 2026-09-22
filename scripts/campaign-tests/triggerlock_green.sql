-- TRIGGER-LOCK — THE HONEST GUARD. What does trigger DDL on a PARTITIONED PARENT lock?
--
-- WHY THIS EXISTS BESIDE policylock_green.sql. That guard measures `create policy` and found
-- that Supabase's `supautils.policy_grants` hook freezes 23 `auth.*`/`storage.*`/`realtime.*`
-- relations to COMMIT. Lane OLD-TABLES-1 then hit the SAME freeze from a place nobody had
-- looked: a single `drop trigger` on `custom.record` — ~810 ms with the whole estate's sign-in
-- stopped — which was believed to be a property of our partitioning. It is not. Measured
-- statement by statement on the dev clone, 2026-09-22:
--
--   · `drop trigger`                  ACCESS EXCLUSIVE on its own table, on EVERY partition of
--                                     a partitioned parent, AND on the 23 the hook declares.
--                                     `custom.record` = 40. A plain table = 24.
--   · `create trigger`                SHARE ROW EXCLUSIVE on the table and every partition, and
--                                     NOTHING from the hook set. Writers wait; readers and
--                                     sign-in do not.
--   · `alter table … enable/disable`  SHARE ROW EXCLUSIVE, same fan-out, no hook set.
--   · `create or replace function`    nothing at all on the table.
--
-- So the honest predicate is not "trigger DDL takes no foreign locks" — that is false and a
-- guard asserting it would be red forever and get deleted. It is, per statement kind:
--
--     `create trigger` on a partitioned table locks EXACTLY that table and its partitions, in
--     SHARE ROW EXCLUSIVE, and NOTHING ELSE — no ACCESS EXCLUSIVE, nothing from the hook set;
--     `drop trigger` on the same table locks EXACTLY that table, its partitions AND the hook's
--     set in ACCESS EXCLUSIVE, and NOTHING ELSE.
--
-- RED the day one of OUR event triggers starts escalating trigger DDL onto relations nobody
-- declared (its red twin, `triggerlock_red.sql`, plants exactly that), and RED the day
-- PostgreSQL or Supabase moves either set — both of which we want to hear about before a
-- maintenance window rather than during one. The window rule these numbers justify is the
-- runner's `-- window-class:` refusal (scripts/lib/migration-target.ts) and
-- `scripts/night/README.md`.
--
-- IT MEASURES FROM ITS OWN BACKEND — `pg_locks where pid = pg_backend_pid()` — so it needs no
-- second connection and cannot be mis-attributed by the transaction pooler.
--
-- IT NEVER TOUCHES `custom.record`. The fan-out is PostgreSQL's, so a four-partition scratch
-- table proves the same law without freezing the record store for a single millisecond.
--
-- ITS SCRATCH TABLE IS COMMITTED ON PURPOSE, and that is the whole trick. A table CREATED
-- inside the probe transaction is already held in ACCESS EXCLUSIVE by its own `create table`,
-- so the `drop trigger` this guard is about adds no visible lock and the guard would pass while
-- measuring nothing. (Measured here on the first cut, 2026-09-22 — the same mistake
-- policylock_red.sql was written to avoid making about itself.) So the scratch estate is
-- committed, the PROBE runs in one transaction that ROLLS BACK, and the teardown removes the
-- estate and FAILS if anything is left.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$CLONE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/triggerlock_green.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'triggerlock_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- SETUP, COMMITTED ON PURPOSE (see the header). Step 0 clears anything a dead run left behind.
drop schema if exists triggerlock_guard cascade;
create schema triggerlock_guard;
create table triggerlock_guard.parted (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  primary key (organization_id, id)
) partition by hash (organization_id);
create table triggerlock_guard.parted_p0 partition of triggerlock_guard.parted for values with (modulus 4, remainder 0);
create table triggerlock_guard.parted_p1 partition of triggerlock_guard.parted for values with (modulus 4, remainder 1);
create table triggerlock_guard.parted_p2 partition of triggerlock_guard.parted for values with (modulus 4, remainder 2);
create table triggerlock_guard.parted_p3 partition of triggerlock_guard.parted for values with (modulus 4, remainder 3);
create function triggerlock_guard.noop() returns trigger language plpgsql as $f$ begin return new; end $f$;

begin;

do $$
declare
  v_hook text[];
  v_own text[];
  v_before text[];
  v_delta_ax text[];
  v_delta_sre text[];
  v_extra text[];
  v_missing text[];
  v_raw text;
begin
  -- 1. WHAT SUPABASE DECLARES — the same list policylock_green.sql reads, for the same reason.
  v_raw := current_setting('supautils.policy_grants', true);
  if v_raw is null or v_raw = '' then
    raise exception 'TRIGGER-LOCK: supautils.policy_grants is not set on this database. This guard is written for a Supabase-managed cluster; if the extension is gone the whole finding needs re-measuring, not skipping.';
  end if;
  select coalesce(array_agg(distinct r order by r), '{}') into v_hook
    from jsonb_array_elements_text((v_raw::jsonb) -> current_user) as t(r)
   where to_regclass(t.r) is not null;
  if cardinality(v_hook) = 0 then
    raise exception 'TRIGGER-LOCK: supautils.policy_grants names no existing relation for role %. Either the hook stopped applying to this role — which would be good news worth reading — or the setting changed shape.', current_user;
  end if;

  -- 2. THE SCRATCH ESTATE IS ALREADY COMMITTED (above), so nothing this transaction measures is
  --    an artefact of having created it.
  v_own := array[
    'triggerlock_guard.parted',
    'triggerlock_guard.parted_p0',
    'triggerlock_guard.parted_p1',
    'triggerlock_guard.parted_p2',
    'triggerlock_guard.parted_p3'];

  -- 3. CLAUSE 1 — `create trigger`: SHARE ROW EXCLUSIVE on exactly the five, zero ACCESS
  --    EXCLUSIVE anywhere.
  select coalesce(array_agg(distinct l.relation::regclass::text || ' @ ' || l.mode), '{}') into v_before
    from pg_locks l where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted;

  create trigger tl_guard_probe before insert on triggerlock_guard.parted
    for each row execute function triggerlock_guard.noop();

  select coalesce(array_agg(x order by x), '{}') into v_delta_sre from (
    select distinct l.relation::regclass::text as x from pg_locks l
     where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted
       and l.mode = 'ShareRowExclusiveLock'
       and (l.relation::regclass::text || ' @ ' || l.mode) <> all (v_before)) d;
  select coalesce(array_agg(x order by x), '{}') into v_delta_ax from (
    select distinct l.relation::regclass::text as x from pg_locks l
     where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted
       and l.mode = 'AccessExclusiveLock'
       and (l.relation::regclass::text || ' @ ' || l.mode) <> all (v_before)) d;

  if cardinality(v_delta_ax) > 0 then
    raise exception
      'TRIGGER-LOCK RED — a `create trigger` took ACCESS EXCLUSIVE on %: %. Measured 2026-09-22 it takes NONE: it is SHARE ROW EXCLUSIVE, which is why a CREATE is the cheap half of replacing a trigger. If this is now true, the window rule has to widen and scripts/night/README.md is wrong.',
      cardinality(v_delta_ax), array_to_string(v_delta_ax, ', ');
  end if;
  select coalesce(array_agg(x order by x), '{}') into v_extra
    from (select unnest(v_delta_sre) except select unnest(v_own)) s(x);
  select coalesce(array_agg(x order by x), '{}') into v_missing
    from (select unnest(v_own) except select unnest(v_delta_sre)) s(x);
  if cardinality(v_extra) > 0 then
    raise exception
      'TRIGGER-LOCK RED — a `create trigger` on a four-partition scratch table locked % relation(s) NOBODY DECLARED: %. Its own table and its four partitions are the whole legitimate set; anything beyond that is OURS and is almost certainly an event trigger that started escalating. Find it the way lane POLICY-LOCK did: `set local session_replication_role = replica` suppresses every evtenabled=''O'' trigger, and what survives that is not ours.',
      cardinality(v_extra), array_to_string(v_extra, ', ');
  end if;
  if cardinality(v_missing) > 0 then
    raise exception
      'TRIGGER-LOCK RED — a `create trigger` on a partitioned parent did NOT lock % of its own relations: %. The fan-out across partitions is the measured basis of the window rule; if PostgreSQL stopped doing it, re-measure before trusting any rule that rests on it.',
      cardinality(v_missing), array_to_string(v_missing, ', ');
  end if;
  raise notice 'TRIGGER-LOCK clause 1 PASS — `create trigger` took SHARE ROW EXCLUSIVE on exactly its own table and its 4 partitions, no ACCESS EXCLUSIVE, and nothing from the % hook relations.', cardinality(v_hook);

  -- 4. CLAUSE 2 — `drop trigger`: ACCESS EXCLUSIVE on exactly the five PLUS the hook's set.
  select coalesce(array_agg(distinct l.relation::regclass::text || ' @ ' || l.mode), '{}') into v_before
    from pg_locks l where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted;

  drop trigger tl_guard_probe on triggerlock_guard.parted;

  select coalesce(array_agg(x order by x), '{}') into v_delta_ax from (
    select distinct l.relation::regclass::text as x from pg_locks l
     where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted
       and l.mode = 'AccessExclusiveLock'
       and (l.relation::regclass::text || ' @ ' || l.mode) <> all (v_before)) d;

  select coalesce(array_agg(x order by x), '{}') into v_extra
    from (select unnest(v_delta_ax) except (select unnest(v_own) union select unnest(v_hook))) s(x);
  select coalesce(array_agg(x order by x), '{}') into v_missing
    from (select unnest(v_own) except select unnest(v_delta_ax)) s(x);
  if cardinality(v_extra) > 0 then
    raise exception
      'TRIGGER-LOCK RED — a `drop trigger` took ACCESS EXCLUSIVE on % relation(s) beyond its own table, its partitions and the % supautils relations: %. Every one of them is frozen — no read, no write, no sign-in — for the rest of any transaction that drops a trigger.',
      cardinality(v_extra), cardinality(v_hook), array_to_string(v_extra, ', ');
  end if;
  if cardinality(v_missing) > 0 then
    raise exception
      'TRIGGER-LOCK RED — a `drop trigger` did NOT take ACCESS EXCLUSIVE on % of its own relations: %. Re-measure: the window rule is sized on this fan-out.',
      cardinality(v_missing), array_to_string(v_missing, ', ');
  end if;
  if cardinality(v_delta_ax) < cardinality(v_hook) then
    raise notice
      'TRIGGER-LOCK — a `drop trigger` locked % relation(s), FEWER than the % the hook declares plus its own 5. That is GOOD NEWS and it means the finding of 2026-09-22 has moved: re-measure before trusting any window rule that rests on it.',
      cardinality(v_delta_ax), cardinality(v_hook);
  end if;
  raise notice 'TRIGGER-LOCK clause 2 PASS — `drop trigger` took ACCESS EXCLUSIVE on exactly its own table, its 4 partitions and the % supautils relations (% in total), and nothing more.', cardinality(v_hook), cardinality(v_delta_ax);

  -- 5. CLAUSE 3 — `alter table … disable trigger` is the cheap kind too. If this ever became
  --    ACCESS EXCLUSIVE, "switch the trigger off for the backfill" would stop being a safe
  --    daytime move and the runner's message would be lying.
  create trigger tl_guard_toggle before insert on triggerlock_guard.parted
    for each row execute function triggerlock_guard.noop();
  select coalesce(array_agg(distinct l.relation::regclass::text || ' @ ' || l.mode), '{}') into v_before
    from pg_locks l where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted;

  alter table triggerlock_guard.parted disable trigger tl_guard_toggle;

  select coalesce(array_agg(x order by x), '{}') into v_delta_ax from (
    select distinct l.relation::regclass::text as x from pg_locks l
     where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted
       and l.mode = 'AccessExclusiveLock'
       and (l.relation::regclass::text || ' @ ' || l.mode) <> all (v_before)) d;
  if cardinality(v_delta_ax) > 0 then
    raise exception
      'TRIGGER-LOCK RED — `alter table … disable trigger` took ACCESS EXCLUSIVE on %: %. Measured 2026-09-22 it takes SHARE ROW EXCLUSIVE and nothing else; if that changed, disabling a trigger now freezes sign-in and the runner''s window-class message is wrong about it.',
      cardinality(v_delta_ax), array_to_string(v_delta_ax, ', ');
  end if;
  raise notice 'TRIGGER-LOCK clause 3 PASS — `alter table … disable trigger` took no ACCESS EXCLUSIVE lock at all.';

  -- 6. CLAUSE 4 — replacing the trigger FUNCTION's body locks no table. This is the whole
  --    reason a lane may fix trigger LOGIC at midday and must wait for the night to change
  --    which triggers EXIST.
  select coalesce(array_agg(distinct l.relation::regclass::text || ' @ ' || l.mode), '{}') into v_before
    from pg_locks l where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted;

  create or replace function triggerlock_guard.noop() returns trigger language plpgsql as $f$ begin return new; end $f$;

  select coalesce(array_agg(x order by x), '{}') into v_extra from (
    select distinct l.relation::regclass::text as x from pg_locks l
     where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted
       and l.mode in ('AccessExclusiveLock','ShareRowExclusiveLock')
       and (l.relation::regclass::text || ' @ ' || l.mode) <> all (v_before)) d;
  if cardinality(v_extra) > 0 then
    raise exception
      'TRIGGER-LOCK RED — `create or replace function` of a trigger function took a blocking lock on %: %. Measured 2026-09-22 it takes none, which is what lets trigger LOGIC be fixed outside the maintenance window.',
      cardinality(v_extra), array_to_string(v_extra, ', ');
  end if;
  raise notice 'TRIGGER-LOCK clause 4 PASS — replacing a trigger function''s body took no blocking lock on any table.';

  raise notice 'TRIGGER-LOCK: all clauses passed.';
end $$;

rollback;

-- TEARDOWN. The probe transaction rolled back; the scratch estate was committed and is removed
-- here. A census follows, and it FAILS if anything is left.
drop schema if exists triggerlock_guard cascade;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'triggerlock_guard') then
    raise exception 'TRIGGER-LOCK: teardown FAILED — the scratch schema is still on this database. Remove it by hand before anything else runs: drop schema triggerlock_guard cascade;';
  end if;
  raise notice 'TRIGGER-LOCK: teardown — the probe transaction rolled back and the scratch schema is gone.';
end $$;
