-- dd153 — THE SLOT GUARD'S EXEMPTION LIST WAS WRITABLE BY A SIGNED-OUT STRANGER.
--
-- WHAT WAS WRONG (measured live on brsgrqvjdzwihsvnfqkf, 2026-09-12, B-39 §9):
--
--   public._schema_migration_slot_grandfather had **RLS switched off entirely**
--   and full client grants —
--     anon:          SELECT, INSERT, UPDATE, DELETE
--     authenticated: SELECT, INSERT, UPDATE, DELETE
--   Its own comment says "Nothing writes here after install."
--
--   This table is the exemption list for the migration SLOT guard
--   (migrations/migration_slot_guard.sql, installed 2026-08-29 after four
--   migration-number collisions in two days, one of which left twelve function
--   bodies stamped with an unrelated migration's number). A row in it tells the
--   guard "these specific filenames already shared this slot before I existed —
--   let them through". So an anonymous caller holding the publishable key, which
--   ships in the frontend bundle, could INSERT a row and make the collision guard
--   stand down for any migration number it liked. Nothing leaks here: this is a
--   door onto a SAFETY GATE, and a peer's guard is never cleared to make an error
--   go away, least of all by a stranger.
--
--   WHY NOTHING CAUGHT IT FOR A FORTNIGHT: the public-exposure detector added
--   2026-08-25 reads `pg_policy`. A table with RLS switched OFF has no policy
--   rows, so it was invisible to that query no matter how wide open it was. The
--   "Unprotected relations" arm of `pnpm check:db-guards` (added 2026-09-12) is
--   what finally found it, and it is the one finding keeping that gate red.
--
-- SAFE, AND HERE IS WHY (consumers traced before writing this, not after):
--
--   * Writers: NONE after install. The table is seeded by computation from the
--     ledger inside migration_slot_guard.sql itself, which runs as the migration
--     runner's own Postgres role — neither the grants nor RLS apply to a table's
--     owner. `scripts/hr/migration-slot-collision-residue-cleanup.sql` deletes
--     from it on the same footing.
--   * Readers: `public._schema_migrations_slot_guard()`, the trigger, which is
--     SECURITY DEFINER owned by postgres — so it reads the table as its owner and
--     is unaffected by both the revoke and RLS.
--     `public.__migration_slot_guard_conformance()` (the liveness reporter behind
--     `pnpm check:migration-slot-guard`) touches only pg_catalog —
--     `to_regclass(...)` and `pg_class.reltuples` — never the rows.
--   * supabase-js call sites in any repo: NONE. Censused across matrx-frontend,
--     aidream, matrx-extend, matrx-local, matrx-sandbox and common-docs on
--     2026-09-12; every hit is SQL, a generated type, or documentation.
--   * `service_role` keeps its grants and bypasses RLS, so the admin door and
--     `pnpm check:*` readers are untouched.
--
--   Closed TWICE on purpose: the grant is the ceiling and RLS (enabled, with no
--   policy at all) is the floor. Either one alone is a single point of failure —
--   the grant was the entire security model here, and that is precisely how a
--   table with RLS off became invisible to the detector we did have.
--
-- THE OTHER HALF OF THIS FILE (DD-149): it is the first migration applied over
-- matrx-frontend's new DIRECT Postgres connection, so it asserts, on that path,
-- the guard that DD-151 proved was dead on the PostgREST door it replaced.
--
-- Register: DD-153 (this), DD-149 (the apply path), DD-151 (why the assertions).
-- Idempotent. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Close the door.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on public._schema_migration_slot_grandfather from anon, authenticated;
alter table public._schema_migration_slot_grandfather enable row level security;

comment on table public._schema_migration_slot_grandfather is
  'Numeric slots that already held two or more ledgered migrations when '
  'migration_slot_guard.sql was installed. The guard exempts the LISTED FILENAMES '
  '(so --rerun of a historical migration still works), never the slot itself -- a '
  'new file claiming one of these slots is still refused. Nothing writes here '
  'after install. Since dd153 (2026-09-12) it carries NO anon/authenticated grants '
  'and RLS is ENABLED with no policy: this is guard machinery, reached only by the '
  'migration runner and by the SECURITY DEFINER trigger that owns it. Until then '
  'any holder of the publishable key could have emptied it and silently disarmed '
  'the migration slot guard (DD-153).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Assertion: the door is shut, for both client roles, both ways.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_grants text;
  v_rls    boolean;
  v_anon   text;
begin
  select string_agg(g.grantee || ':' || g.privilege_type, ', ' order by g.grantee, g.privilege_type)
    into v_grants
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.table_name = '_schema_migration_slot_grandfather'
     and g.grantee in ('anon', 'authenticated');
  if v_grants is not null then
    raise exception 'dd153: client grants survive on the slot grandfather table: %', v_grants;
  end if;

  select c.relrowsecurity into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = '_schema_migration_slot_grandfather';
  if not coalesce(v_rls, false) then
    raise exception 'dd153: row-level security is still off on the slot grandfather table';
  end if;

  -- The forcing half: BE anon, in this transaction, and try the write that used
  -- to succeed. `set local role` dies with this transaction.
  begin
    set local role anon;
    insert into public._schema_migration_slot_grandfather (source, slot, filenames)
    values ('matrx-frontend', 'dd153 #9999', array['dd153_probe.sql']);
    reset role;
    raise exception
      'dd153: role anon STILL inserted into the slot grandfather table — the guard can be disarmed by a stranger';
  exception
    when insufficient_privilege then
      v_anon := sqlerrm;
    when raise_exception then
      reset role;
      raise;
  end;
  reset role;
  raise notice 'dd153: anon INSERT refused as it must be — %', v_anon;

  if current_user <> session_user then
    raise exception 'dd153: role was not reset after the anon probe (now %)', current_user;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DD-149 assertion: the §6d-4 door guard fires on THIS apply path.
-- ─────────────────────────────────────────────────────────────────────────────
-- This is the first migration matrx-frontend applies over a direct Postgres
-- connection instead of `public.execute_admin_query` over PostgREST. DD-151
-- proved that on the PostgREST path a SECURITY DEFINER event-trigger function
-- never fired at all (session_user = `authenticator`), so the §6d-4 guard, both
-- registry sentinels and their warnings were silently absent from every frontend
-- migration for fifteen days. V-36 then measured that under a plain
-- `SET ROLE service_role`/`authenticated` NO event trigger fires either, invoker
-- included — which is why scripts/apply-migration.ts refuses to run as any role
-- but the ledger's owner.
--
-- The same probe B-39 used, so the two are comparable: create an UNDECLARED
-- SECURITY DEFINER function, grant EXECUTE on it to `authenticated`, and require
-- that the guard took the grant back AND wrote a `platform.ddl_guard_log` row. If
-- the guard is dead on this path, this file cannot be applied — it fails here and
-- the whole transaction, ledger row included, rolls back.
do $$
declare
  v_auth  boolean;
  v_rows  int;
begin
  execute 'create function public._dd153_apply_path_probe() returns int language sql security definer as ''select 1''';
  execute 'grant execute on function public._dd153_apply_path_probe() to authenticated';

  v_auth := has_function_privilege('authenticated', 'public._dd153_apply_path_probe()', 'EXECUTE');
  select count(*) into v_rows
    from platform.ddl_guard_log
   where rule = 'definer_client_grant_revoked'
     and object_ref like '%_dd153_apply_path_probe%';

  execute 'drop function public._dd153_apply_path_probe()';

  if v_auth then
    raise exception
      'dd153/DD-149: the §6d-4 door guard did NOT take back a client EXECUTE granted on this apply '
      'path — an undeclared SECURITY DEFINER function is still executable by `authenticated`. '
      'The guard is dead on this transport, exactly as it was on the PostgREST door (DD-151). '
      'Do not apply migrations through it until `pnpm check:db-guards` is green.';
  end if;
  if v_rows = 0 then
    raise exception
      'dd153/DD-149: the §6d-4 guard revoked the grant but wrote NO platform.ddl_guard_log row on '
      'this apply path. An automatic intervention that does not announce itself is the defect '
      '(db-rules FEATURE.md §6d-4).';
  end if;

  raise notice 'dd153/DD-149: the §6d-4 door guard fired on the direct-connection apply path (% log row(s))', v_rows;
end $$;
