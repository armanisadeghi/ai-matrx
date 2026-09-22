-- POLICY-LOCK — THE RED TWIN. It plants exactly the defect the green guard exists to catch,
-- proves the guard would SEE it, and rolls the whole thing back.
--
-- WHAT IT PLANTS. An event trigger of OURS on `ddl_command_end` that takes ACCESS EXCLUSIVE on
-- an unrelated relation. That is the shape lane W1-ORG-PREP believed was behind the 23 foreign
-- locks a `create policy` takes on this database — it was not (the cause is Supabase's
-- `supautils.policy_grants` hook, proven 2026-09-22 by suppressing all eighteen of our
-- `evtenabled = 'O'` triggers and watching the locks appear anyway) — but it is exactly what
-- COULD become true the next time somebody adds a trigger, and it is what the green guard is
-- pointed at. A guard nobody has watched fail is not a guard.
--
-- Everything is inside ONE transaction that ROLLS BACK: the scratch tables, the event trigger,
-- the policy and the locks. Nothing survives this file.

\set ON_ERROR_STOP on
\timing off

\set suite 'policylock_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- SETUP, COMMITTED ON PURPOSE. The victim relation must already exist when the probe
-- transaction starts, or its ACCESS EXCLUSIVE lock is taken by `create table` and the probe's
-- own before/after delta would hide it — which is the mistake this twin was written to avoid
-- making about itself. Step 0 clears anything a dead run left behind, and the last block
-- removes it again.
drop event trigger if exists policylock_red_escalates;
drop schema if exists policylock_red_probe cascade;

create schema policylock_red_probe;
create table policylock_red_probe.innocent_bystander (id int);

create or replace function policylock_red_probe.escalate() returns event_trigger
language plpgsql as $$
begin
  if tg_tag in ('CREATE POLICY','ALTER POLICY','DROP POLICY') then
    lock table policylock_red_probe.innocent_bystander in access exclusive mode;
  end if;
end $$;

create event trigger policylock_red_escalates on ddl_command_end
  execute function policylock_red_probe.escalate();

begin;

do $$
declare
  v_declared text[];
  v_before text[];
  v_actual text[];
  v_extra text[];
begin
  select coalesce(array_agg(distinct r order by r), '{}')
    into v_declared
    from jsonb_array_elements_text((current_setting('supautils.policy_grants', true)::jsonb) -> current_user) as t(r)
   where to_regclass(t.r) is not null;

  create temp table policylock_red_target (id uuid primary key default gen_random_uuid());
  alter table policylock_red_target enable row level security;

  select coalesce(array_agg(distinct l.relation::regclass::text order by l.relation::regclass::text), '{}')
    into v_before
    from pg_locks l
   where l.pid = pg_backend_pid()
     and l.locktype='relation' and l.mode='AccessExclusiveLock' and l.granted;

  create policy policylock_red_read on policylock_red_target
    for select to authenticated using (true);

  select coalesce(array_agg(x order by x), '{}') into v_actual
    from (
      select distinct l.relation::regclass::text as x from pg_locks l
       where l.pid = pg_backend_pid()
         and l.locktype='relation' and l.mode='AccessExclusiveLock' and l.granted
      except select unnest(v_before)) d;

  select coalesce(array_agg(x order by x), '{}') into v_extra
    from (select unnest(v_actual)
          except select unnest(v_declared || array[(select c.oid::regclass::text from pg_class c
                    where c.oid = 'pg_temp.policylock_red_target'::regclass)])) s(x);

  if cardinality(v_extra) = 0 then
    raise exception
      'POLICY-LOCK RED TWIN FAILED: an event trigger of ours took ACCESS EXCLUSIVE on policylock_red_probe.innocent_bystander during a `create policy`, and the green guard''s predicate did not notice. The guard is blind and must be fixed before it is believed.';
  end if;
  raise notice
    'POLICY-LOCK RED TWIN PASS — the planted event trigger escalated the `create policy` onto % undeclared relation(s) (%), which is exactly what policylock_green.sql refuses. The guard can fail.',
    cardinality(v_extra), array_to_string(v_extra, ', ');
  raise notice 'POLICY-LOCK RED TWIN: all clauses passed.';
end $$;

rollback;

-- TEARDOWN. The probe transaction rolled back; the planted trigger and its schema were
-- committed and are removed here. A census follows, and it FAILS if anything is left.
drop event trigger if exists policylock_red_escalates;
drop schema if exists policylock_red_probe cascade;

do $$
begin
  if exists (select 1 from pg_event_trigger where evtname = 'policylock_red_escalates')
     or exists (select 1 from pg_namespace where nspname = 'policylock_red_probe') then
    raise exception 'POLICY-LOCK RED TWIN: teardown FAILED — the planted event trigger or its schema is still on this database. Remove it by hand before anything else runs: drop event trigger if exists policylock_red_escalates; drop schema if exists policylock_red_probe cascade;';
  end if;
  raise notice 'POLICY-LOCK RED TWIN: teardown — the planted event trigger and its schema are gone, and the probe transaction rolled back.';
end $$;
