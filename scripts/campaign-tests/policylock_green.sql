-- POLICY-LOCK — THE HONEST GUARD. What does ONE `create policy` actually lock?
--
-- WHAT THIS ASKS, AND WHY IT IS WORTH ASKING EVERY NIGHT. On this database a `create policy`
-- run as `postgres` takes ACCESS EXCLUSIVE on its own table AND on the relations named in
-- Supabase's `supautils.policy_grants` — sixteen `auth.*`, five `storage.*`,
-- `realtime.messages` and `realtime.subscription`. That is not ours and we cannot switch it
-- off: `supautils.policy_grants` is context `sighup`, read from Supabase's configuration file,
-- and `SET`, `SET LOCAL` and `ALTER ROLE … SET` are all refused. PostgreSQL holds what it took
-- until COMMIT, so for as long as that transaction runs NOBODY can sign in, refresh a token,
-- read a file or receive a realtime message.
--
-- So the honest predicate is NOT "policy DDL takes no foreign locks" — that is false today and
-- a guard asserting it would be red forever and get deleted. It is:
--
--     a `create policy` locks its own table plus EXACTLY the `supautils.policy_grants` set,
--     and NOTHING ELSE.
--
-- GREEN TODAY. RED the day one of OUR event triggers starts escalating a policy change into
-- locks on relations nobody declared — which is precisely what lane W1-ORG-PREP believed was
-- happening, and what lane POLICY-LOCK disproved on 2026-09-22 by suppressing all eighteen
-- `evtenabled = 'O'` triggers and watching the same 23 locks appear anyway. Also RED the day
-- Supabase changes the list, which is a thing we want to be told about rather than discover
-- during a window.
--
-- IT MEASURES FROM ITS OWN BACKEND — `pg_locks where pid = pg_backend_pid()` — so it needs no
-- second connection and cannot be mis-attributed by the transaction pooler. (A `SET
-- application_name` outside the transaction can be handed to a backend another client is using;
-- that trap cost W1-ORG-PREP a whole measurement it had to throw away.)
--
-- IT WRITES NOTHING THAT SURVIVES. Everything happens inside ONE transaction that ROLLS BACK:
-- the scratch table, the policy, the locks. It is registered in the nightly clone sweep
-- (scripts/night/clone-suite-sweep.sh picks up every scripts/campaign-tests/*.sql) and in the
-- release gates as `pnpm check:policy-lock-set`.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$CLONE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/policylock_green.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'policylock_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $$
declare
  v_declared text[];
  v_expected text[];
  v_actual text[];
  v_before text[];
  v_extra text[];
  v_missing text[];
  v_raw text;
begin
  -- 1. WHAT SUPABASE DECLARES. The setting is a json object keyed by role; we run as the role
  --    the hook is keyed on, so its own list is the prediction. A relation in the list that does
  --    not exist on this database (e.g. `storage.prefixes`) cannot be locked and is dropped from
  --    the expectation by `to_regclass`, which is why the count is 23 here and not 24.
  v_raw := current_setting('supautils.policy_grants', true);
  if v_raw is null or v_raw = '' then
    raise exception 'POLICY-LOCK: supautils.policy_grants is not set on this database. This guard is written for a Supabase-managed cluster; if the extension is gone the whole finding needs re-measuring, not skipping.';
  end if;
  select coalesce(array_agg(distinct r order by r), '{}')
    into v_declared
    from jsonb_array_elements_text((v_raw::jsonb) -> current_user) as t(r)
   where to_regclass(t.r) is not null;
  if cardinality(v_declared) = 0 then
    raise exception 'POLICY-LOCK: supautils.policy_grants names no existing relation for role %. Either the hook stopped applying to this role — which would be good news worth reading — or the setting changed shape.', current_user;
  end if;

  -- 2. A SCRATCH TABLE NOBODY ELSE CAN SEE, AND ONE POLICY ON IT.
  create temp table policylock_probe_target (id uuid primary key default gen_random_uuid());
  alter table policylock_probe_target enable row level security;

  v_expected := v_declared || array[
    (select c.oid::regclass::text from pg_class c
      where c.oid = 'pg_temp.policylock_probe_target'::regclass)];

  -- The DELTA is the measurement, not the total: creating the scratch table already took
  -- ACCESS EXCLUSIVE on itself and on its primary-key index, and attributing those to
  -- `create policy` would be this guard lying about its own subject.
  select coalesce(array_agg(distinct l.relation::regclass::text order by l.relation::regclass::text), '{}')
    into v_before
    from pg_locks l
   where l.pid = pg_backend_pid()
     and l.locktype = 'relation' and l.mode = 'AccessExclusiveLock' and l.granted;

  create policy policylock_probe_read on policylock_probe_target
    for select to authenticated using (true);

  -- 3. WHAT THE STATEMENT ITSELF TOOK. Relations only; this backend only; ACCESS EXCLUSIVE only;
  --    minus everything that was already held a moment ago.
  select coalesce(array_agg(x order by x), '{}')
    into v_actual
    from (
      select distinct l.relation::regclass::text as x
        from pg_locks l
       where l.pid = pg_backend_pid()
         and l.locktype = 'relation' and l.mode = 'AccessExclusiveLock' and l.granted
      except
      select unnest(v_before)) d;

  select coalesce(array_agg(x order by x), '{}') into v_extra
    from (select unnest(v_actual) except select unnest(v_expected)) s(x);
  select coalesce(array_agg(x order by x), '{}') into v_missing
    from (select unnest(v_declared) except select unnest(v_actual)) s(x);

  if cardinality(v_extra) > 0 then
    raise exception
      'POLICY-LOCK RED — one `create policy` took ACCESS EXCLUSIVE on % relation(s) NOBODY DECLARED: %. Every one of them is frozen for the rest of any transaction that changes a policy. Supabase declares % (supautils.policy_grants) and the statement''s own table is the twenty-fourth; anything beyond that is OURS and is almost certainly an event trigger that started escalating. Find it the way lane POLICY-LOCK did: `set local session_replication_role = replica` suppresses every evtenabled=''O'' trigger, and the locks that survive that are not ours.',
      cardinality(v_extra), array_to_string(v_extra, ', '), cardinality(v_declared);
  end if;
  if cardinality(v_missing) > 0 then
    raise notice
      'POLICY-LOCK — % declared relation(s) were NOT locked this time: %. That is GOOD NEWS and it means the finding of 2026-09-22 has moved: re-measure before trusting any window rule that rests on it.',
      cardinality(v_missing), array_to_string(v_missing, ', ');
  end if;

  raise notice 'POLICY-LOCK clause 1 PASS — `create policy` locked exactly its own table plus the % relation(s) supautils.policy_grants declares, and nothing else.', cardinality(v_declared);

  -- 4. THE OTHER HALF OF THE SAME TRUTH: a GRANT is not a policy. If this ever stopped being
  --    true the operating rule ("do the grants first, the policies last") would be wrong.
  declare
    v_before integer;
    v_after integer;
  begin
    select count(*) into v_before from pg_locks
     where pid = pg_backend_pid() and locktype='relation' and mode='AccessExclusiveLock' and granted;
    execute 'grant select on policylock_probe_target to authenticated';
    execute format('comment on table policylock_probe_target is %L', 'policy-lock probe');
    select count(*) into v_after from pg_locks
     where pid = pg_backend_pid() and locktype='relation' and mode='AccessExclusiveLock' and granted;
    if v_after <> v_before then
      raise exception
        'POLICY-LOCK RED — a GRANT and a COMMENT took % new ACCESS EXCLUSIVE lock(s). The whole shape of iam._apply_rls_unchecked rests on grants being free of this hook; if they are not, the generator''s non-policy phase is inside the freeze again and the 1-4 AM rule has to widen.',
        v_after - v_before;
    end if;
    raise notice 'POLICY-LOCK clause 2 PASS — a GRANT and a COMMENT take no ACCESS EXCLUSIVE lock at all, which is what lets the generator do them first.';
  end;

  raise notice 'POLICY-LOCK: all clauses passed.';
end $$;

rollback;

do $$
begin
  raise notice 'POLICY-LOCK: teardown — the whole suite ran inside one transaction and it has been rolled back; the scratch table, the policy and every lock are gone.';
end $$;
