-- TRIGGER-LOCK — THE RED TWIN. It plants exactly the defect the green guard exists to catch,
-- proves the guard would SEE it on BOTH of its arms, and removes everything it planted.
--
-- WHAT IT PLANTS. An event trigger of OURS on `ddl_command_end` that takes ACCESS EXCLUSIVE on
-- an unrelated relation whenever a trigger is created or dropped. That is the shape lane
-- OLD-TABLES-1's 41-relation `drop trigger` was first believed to be — it was not (the 23
-- foreign relations are Supabase's `supautils.policy_grants` hook, and the rest are the table's
-- own partitions; both are proven by triggerlock_green.sql) — but it is exactly what COULD
-- become true the next time somebody adds an event trigger, and it is what the green guard is
-- pointed at. A guard nobody has watched fail is not a guard.
--
-- BOTH ARMS, because the green guard makes two different assertions and a twin that only
-- exercises one leaves the other unproven:
--   arm 1  `create trigger` must take NO ACCESS EXCLUSIVE at all — the planted trigger gives it
--          one, and the guard's clause-1 predicate must reject that.
--   arm 2  `drop trigger` must take ACCESS EXCLUSIVE on its own relations and the hook's set and
--          NOTHING ELSE — the planted trigger adds a stranger, and clause 2 must name it.
--
-- The scratch estate and the event trigger are committed (the probe must not create its own
-- subject; see triggerlock_green.sql's header for why) and removed at the end, and the probe
-- transaction ROLLS BACK. Nothing survives this file.

\set ON_ERROR_STOP on
\timing off

\set suite 'triggerlock_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- SETUP, COMMITTED ON PURPOSE. Step 0 clears anything a dead run left behind.
drop event trigger if exists triggerlock_red_escalates;
drop schema if exists triggerlock_red_probe cascade;

create schema triggerlock_red_probe;
create table triggerlock_red_probe.innocent_bystander (id int);
create table triggerlock_red_probe.parted (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  primary key (organization_id, id)
) partition by hash (organization_id);
create table triggerlock_red_probe.parted_p0 partition of triggerlock_red_probe.parted for values with (modulus 2, remainder 0);
create table triggerlock_red_probe.parted_p1 partition of triggerlock_red_probe.parted for values with (modulus 2, remainder 1);
create function triggerlock_red_probe.noop() returns trigger language plpgsql as $f$ begin return new; end $f$;
create trigger tl_red_drop_me before insert on triggerlock_red_probe.parted
  for each row execute function triggerlock_red_probe.noop();

create or replace function triggerlock_red_probe.escalate() returns event_trigger
language plpgsql as $$
begin
  if tg_tag in ('CREATE TRIGGER','DROP TRIGGER','ALTER TABLE') then
    lock table triggerlock_red_probe.innocent_bystander in access exclusive mode;
  end if;
end $$;

create event trigger triggerlock_red_escalates on ddl_command_end
  execute function triggerlock_red_probe.escalate();

begin;

do $$
declare
  v_hook text[];
  v_own text[];
  v_before text[];
  v_delta_ax text[];
  v_extra text[];
begin
  select coalesce(array_agg(distinct r order by r), '{}') into v_hook
    from jsonb_array_elements_text((current_setting('supautils.policy_grants', true)::jsonb) -> current_user) as t(r)
   where to_regclass(t.r) is not null;
  v_own := array[
    'triggerlock_red_probe.parted',
    'triggerlock_red_probe.parted_p0',
    'triggerlock_red_probe.parted_p1'];

  -- ARM 1 — `create trigger` must take NO ACCESS EXCLUSIVE. The plant gives it one.
  select coalesce(array_agg(distinct l.relation::regclass::text || ' @ ' || l.mode), '{}') into v_before
    from pg_locks l where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted;

  create trigger tl_red_probe before insert on triggerlock_red_probe.parted
    for each row execute function triggerlock_red_probe.noop();

  select coalesce(array_agg(x order by x), '{}') into v_delta_ax from (
    select distinct l.relation::regclass::text as x from pg_locks l
     where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted
       and l.mode = 'AccessExclusiveLock'
       and (l.relation::regclass::text || ' @ ' || l.mode) <> all (v_before)) d;
  if cardinality(v_delta_ax) = 0 then
    raise exception
      'TRIGGER-LOCK RED TWIN FAILED (arm 1): a planted event trigger took ACCESS EXCLUSIVE on triggerlock_red_probe.innocent_bystander during a `create trigger`, and the predicate triggerlock_green.sql clause 1 uses — "a create trigger takes NO ACCESS EXCLUSIVE" — did not see it. The guard is blind on that arm and must be fixed before it is believed.';
  end if;
  raise notice
    'TRIGGER-LOCK RED TWIN arm 1 PASS — the planted event trigger gave a `create trigger` % ACCESS EXCLUSIVE lock(s) (%), which is exactly what triggerlock_green.sql clause 1 refuses.',
    cardinality(v_delta_ax), array_to_string(v_delta_ax, ', ');

  raise notice 'TRIGGER-LOCK RED TWIN arm 1: done; arm 2 runs in its OWN transaction, because an
ACCESS EXCLUSIVE lock this one already took would be invisible to the next statement''s delta.';
end $$;

rollback;

-- ARM 2 IN A FRESH TRANSACTION. Arm 1's planted lock on `innocent_bystander` is held to COMMIT,
-- so measuring the `drop trigger` in the same transaction would find nothing new and this twin
-- would report itself blind while the guard was fine. (Measured here on the first cut,
-- 2026-09-22.)
begin;

do $$
declare
  v_hook text[];
  v_own text[];
  v_before text[];
  v_delta_ax text[];
  v_extra text[];
begin
  select coalesce(array_agg(distinct r order by r), '{}') into v_hook
    from jsonb_array_elements_text((current_setting('supautils.policy_grants', true)::jsonb) -> current_user) as t(r)
   where to_regclass(t.r) is not null;
  v_own := array[
    'triggerlock_red_probe.parted',
    'triggerlock_red_probe.parted_p0',
    'triggerlock_red_probe.parted_p1'];

  -- ARM 2 — `drop trigger` must take ACCESS EXCLUSIVE on its own relations and the hook's set
  -- and nothing else. The plant adds a stranger.
  select coalesce(array_agg(distinct l.relation::regclass::text || ' @ ' || l.mode), '{}') into v_before
    from pg_locks l where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted;

  drop trigger tl_red_drop_me on triggerlock_red_probe.parted;

  select coalesce(array_agg(x order by x), '{}') into v_delta_ax from (
    select distinct l.relation::regclass::text as x from pg_locks l
     where l.pid = pg_backend_pid() and l.locktype='relation' and l.granted
       and l.mode = 'AccessExclusiveLock'
       and (l.relation::regclass::text || ' @ ' || l.mode) <> all (v_before)) d;
  select coalesce(array_agg(x order by x), '{}') into v_extra
    from (select unnest(v_delta_ax) except (select unnest(v_own) union select unnest(v_hook))) s(x);
  if cardinality(v_extra) = 0 then
    raise exception
      'TRIGGER-LOCK RED TWIN FAILED (arm 2): a planted event trigger escalated a `drop trigger` onto an unrelated relation and the predicate triggerlock_green.sql clause 2 uses — "its own relations plus the supautils set and NOTHING ELSE" — did not name it. The guard is blind on that arm and must be fixed before it is believed.';
  end if;
  raise notice
    'TRIGGER-LOCK RED TWIN arm 2 PASS — the planted event trigger escalated the `drop trigger` onto % undeclared relation(s) (%), which is exactly what triggerlock_green.sql clause 2 refuses.',
    cardinality(v_extra), array_to_string(v_extra, ', ');

  raise notice 'TRIGGER-LOCK RED TWIN: all clauses passed.';
end $$;

rollback;

-- TEARDOWN. The probe transaction rolled back; the planted trigger and its schema were
-- committed and are removed here. A census follows, and it FAILS if anything is left.
drop event trigger if exists triggerlock_red_escalates;
drop schema if exists triggerlock_red_probe cascade;

do $$
begin
  if exists (select 1 from pg_event_trigger where evtname = 'triggerlock_red_escalates')
     or exists (select 1 from pg_namespace where nspname = 'triggerlock_red_probe') then
    raise exception 'TRIGGER-LOCK RED TWIN: teardown FAILED — the planted event trigger or its schema is still on this database. Remove it by hand before anything else runs: drop event trigger if exists triggerlock_red_escalates; drop schema if exists triggerlock_red_probe cascade;';
  end if;
  raise notice 'TRIGGER-LOCK RED TWIN: teardown — the planted event trigger and its schema are gone, and the probe transaction rolled back.';
end $$;
