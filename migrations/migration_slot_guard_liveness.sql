-- migration_slot_guard_liveness.sql
--
-- WHY THIS EXISTS: migrations/migration_slot_guard.sql installed a BEFORE INSERT
-- ROW trigger on public._schema_migrations after four migration-number collisions
-- in two days. It shipped with NO LIVENESS ASSERTION. Nothing anywhere would have
-- noticed if the trigger were dropped, disabled, or its function replaced with a
-- body that returns NEW unconditionally -- the collisions would simply resume,
-- silently, and the next agent would read the guard's SQL file and believe it was
-- protected. A guard's source on disk is not proof the guard is bound; only the
-- catalog is (systems/platform/db-rules FEATURE.md §1). This file supplies the
-- proof for the ROW-trigger guard, mirroring what check 36
-- (definer_grant_ddl_guard_installed) already does for the DDL EVENT trigger.
--
-- WHY IT IS NOT PART OF check:db-guards: that checker reads
-- `pg_catalog.pg_event_trigger` filtered to `nspname = 'platform'` (see
-- scripts/check-db-guards.ts:167-176 and its EXPECTED list at :84-109). A row
-- trigger never appears in pg_event_trigger at all, and this one's function lives
-- in `public`, so it fails that query twice over. Adding `schema_migrations_slot_guard`
-- to EXPECTED would report it permanently MISSING -- a red gate that can never go
-- green, which is how a gate gets muted. It needs its own reader, and this is it.
--
-- WHY IT IS NOT PART OF the HR punch battery: the punch conformance function is
-- the HR write path's contract. The migration ledger is not HR. A check whose
-- subject is unrelated to its host function is a check nobody thinks to look at.
--
-- THE ONE DEGENERATE OUTCOME THIS FORBIDS: returning zero rows. The frontend
-- reader (scripts/check-migration-slot-guard.ts) compares the returned check_keys
-- against its own EXPECTED list and treats an absentee as a finding, so this
-- function cannot silently stop measuring something. Adding a check here means
-- adding its key there in the same change.
--
-- SECURITY INVOKER on purpose. Every catalog table it reads (pg_trigger, pg_proc,
-- pg_class, pg_namespace) is world-readable, so no elevation is needed -- and a
-- SECURITY DEFINER function would be an undeclared client-callable definer door,
-- which platform.enforce_definer_client_grants would strip the grants from at
-- creation time (correctly). Invoker sidesteps the whole class.
--
-- Idempotent. Safe to re-run.

begin;

create or replace function public.__migration_slot_guard_conformance()
returns table (
  check_key text,
  ok        boolean,
  severity  text,
  detail    jsonb
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  -- ── 1. The slot rule itself still exists ──────────────────────────────────
  -- public.migration_slot(text) is the ONE definition of what a numeric slot is;
  -- the trigger and matrx-frontend/scripts/check-migrations.ts both defer to it.
  -- Dropped, it takes the guard down with it (the trigger body calls it).
  select
    'slot_rule_function_present'::text,
    exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'migration_slot'
         and p.pronargs = 1
    ),
    'blocking'::text,
    jsonb_build_object(
      'why', 'public.migration_slot(text) is the single definition of a numeric migration slot. '
             'The trigger body calls it; without it the guard raises instead of guarding.',
      'found', (
        select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'migration_slot'
      )
    )

  union all

  -- ── 2. The grandfather baseline table still exists ────────────────────────
  -- The trigger reads it to allow re-recording the 31 historical files that
  -- already shared a slot. Dropped, every --rerun of a historical migration
  -- starts failing and the guard gets disabled in anger rather than fixed.
  select
    'slot_guard_baseline_present'::text,
    to_regclass('public._schema_migration_slot_grandfather') is not null,
    'blocking'::text,
    jsonb_build_object(
      'why', 'public._schema_migration_slot_grandfather exempts the specific filenames that already '
             'shared a slot when the guard was installed. Without it, re-recording any historical '
             'migration is refused and the guard becomes the problem instead of the protection.',
      -- Read from pg_class, NOT `select count(*) from _schema_migration_slot_grandfather`.
      -- A direct reference to the table fails at PLAN time when the table is gone,
      -- which takes down the whole RPC in precisely the case this check exists to
      -- report (proven 2026-08-29: `relation does not exist`, raised before a single
      -- row was evaluated). An estimate that survives the failure beats an exact
      -- number that only exists when nothing is wrong.
      'approx_rows', (
        select c.reltuples::bigint
          from pg_class c
         where c.oid = to_regclass('public._schema_migration_slot_grandfather')
      )
    )

  union all

  -- ── 3. THE GUARD IS BOUND AND ENABLED ─────────────────────────────────────
  -- The whole point. `tgenabled` must not be 'D': the sanctioned escape hatch is
  -- DISABLE + re-ENABLE inside ONE transaction, so a guard found disabled at rest
  -- is a mistake, never a state (the same rule check:db-guards applies to the
  -- event triggers). The shape is pinned too -- a guard moved to AFTER, or to
  -- FOR EACH STATEMENT, still appears in pg_trigger while protecting nothing:
  -- an AFTER trigger cannot refuse the row it was handed, and a statement-level
  -- trigger has no NEW to inspect.
  select
    'slot_guard_trigger_installed'::text,
    coalesce(bool_or(
          t.tgenabled <> 'D'
      and (t.tgtype & 1) = 1   -- FOR EACH ROW
      and (t.tgtype & 2) = 2   -- BEFORE
      and (t.tgtype & 4) = 4   -- ON INSERT
    ), false),
    'blocking'::text,
    jsonb_build_object(
      'why', 'schema_migrations_slot_guard is a BEFORE INSERT FOR EACH ROW trigger on '
             'public._schema_migrations calling public._schema_migrations_slot_guard(). It is the '
             'ONLY choke point shared by all four migration apply paths, and public._schema_migrations '
             'is keyed on (source, filename) -- so two files sharing a NUMBER both insert cleanly and '
             'nothing else in the system notices. See migrations/migration_slot_guard.sql.',
      'found', coalesce(jsonb_agg(jsonb_build_object(
                 'tgname', t.tgname,
                 'function', fn.nspname || '.' || fp.proname || '()',
                 'enabled', t.tgenabled::text,
                 'for_each_row', (t.tgtype & 1) = 1,
                 'before', (t.tgtype & 2) = 2,
                 'on_insert', (t.tgtype & 4) = 4
               ) order by t.tgname), '[]'::jsonb),
      'remedy', 'Re-apply migrations/migration_slot_guard.sql. It is idempotent.'
    )
  -- The guard function is matched BY NAME through pg_proc, never by casting a
  -- literal to ::regprocedure. Proven the hard way (2026-08-29 falsification): the
  -- cast RAISES `function does not exist` when the function is dropped, so the
  -- whole RPC errors out in exactly the scenario the check was written for. The
  -- reader treats an erroring RPC as UNMEASURED and still fails closed, but
  -- "unmeasured" and "your guard is gone" are different sentences and the operator
  -- deserves the second one.
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc fp on fp.oid = t.tgfoid
  join pg_namespace fn on fn.oid = fp.pronamespace
  where not t.tgisinternal
    and n.nspname = 'public'
    and c.relname = '_schema_migrations'
    and t.tgname = 'schema_migrations_slot_guard'
    and fn.nspname = 'public'
    and fp.proname = '_schema_migrations_slot_guard';
$$;

comment on function public.__migration_slot_guard_conformance() is
  'Liveness proof for the migration numeric-slot ROW trigger (migrations/migration_slot_guard.sql). '
  'One row per structural check. Read by matrx-frontend pnpm check:migration-slot-guard, which runs '
  'strict in .github/workflows/ci.yml. Deliberately NOT part of check:db-guards, which reads '
  'pg_event_trigger only and would report this row trigger as permanently missing.';

-- The reader authenticates with the secret key (service_role) in CI and with a
-- developer session locally. anon is deliberately excluded: nothing anonymous has
-- any business enumerating the ledger's protections.
revoke all on function public.__migration_slot_guard_conformance() from public;
grant execute on function public.__migration_slot_guard_conformance() to authenticated, service_role;

commit;
