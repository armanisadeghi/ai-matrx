-- migration_checksum_honesty_guard.sql
--
-- WHY THIS EXISTS: the migration ledger's whole job is to answer one question —
-- "what bytes actually ran against this database?" — so that an edit to an
-- applied file is DETECTABLE. `public._schema_migrations.checksum` is that
-- answer, and it is only an answer if it is the SHA-256 of the SQL that ran.
--
-- It has not always been. Measured live on 2026-08-29, 43 ledger rows carry a
-- checksum that is not a SHA-256 at all:
--
--   27  matrx-frontend  hr_l1_21 .. hr_l1_53   md5(<filename stem>)
--    7  sweep_task_…    32-hex                 md5 of something
--    3  aidream                                md5-shaped
--    3  hrb002_p2_sms                          md5-shaped
--    1  matrx-frontend  hr_p3_privacy_wall_…   'applied-via-mcp-apply_migration'
--    1  matrx-frontend                         'n/a-applied-live'
--    1  aidream                                'applied-live-2026-07-09-offering-f18d8ee7'
--
-- The 27 came from migrations that ledgered THEMSELVES, in their own body:
--
--     insert into public._schema_migrations (source, filename, checksum, ...)
--     values ('matrx-frontend', 'hr_l1_37_….sql',
--             md5('hr_l1_37_the_decider_can_see_the_change'), now(), 0)
--
-- A checksum derived from the FILENAME is a constant. It cannot change when the
-- file changes, so it can never detect an edit — and because it also never
-- equals the file's real SHA-256, every one of those files reports DRIFTED
-- forever, whether or not anyone touched it. That is the worst of both: the
-- signal is dead AND the alarm is stuck on. 27 of the 88 drift findings in
-- `pnpm check:migrations:strict` on 2026-08-29 were this and nothing else. One
-- of the files is literally named `hr_l1_39_a_checksum_is_not_a_description.sql`.
--
-- aidream/db/apply_migrations.py already names the failure in its own header —
-- "a self-written placeholder checksum guarantees a false drift report next
-- run" — but naming it in a docstring stopped nobody, which is the
-- discipline-instead-of-a-guard failure this program keeps paying for.
--
-- WHY THE GUARD LIVES HERE, IN THE DATABASE: exactly the reasoning
-- migration_slot_guard.sql sets out. There are four apply paths —
--   1. aidream/db/apply_migrations.py        (the batch applier)
--   2. aidream/db/detect_applied.py          (auto-ledgers already-live objects)
--   3. Supabase MCP apply_migration + a hand-written ledger row (the agent path)
--   4. matrx-frontend/scripts/hr/apply_esign_migration.py
-- — plus, as the 27 rows prove, a fifth nobody designed: a migration writing its
-- own row. matrx-frontend/scripts/run-release-gates.sh is ADVISORY BY DESIGN
-- and CI does not run it, so a repo-side check is a scream, not a guard. All
-- paths converge on one statement: a write to public._schema_migrations. The
-- guard sits there, next to the slot guard, on the same choke point.
--
-- ALL FOUR SANCTIONED WRITERS ALREADY COMPLY — verified 2026-08-29 by reading
-- each one: every single one computes `hashlib.sha256(sql).hexdigest()`. This
-- guard therefore refuses nothing that anyone legitimately does today; it closes
-- the door the 27 rows walked through.
--
-- WHAT THIS DOES NOT DO: it does not touch, repair, or re-stamp the 43 existing
-- rows. Their real checksums are UNRECOVERABLE — the bytes that ran were never
-- recorded — and writing today's file hash over them would be a lie that reads
-- as truth: it would silence the alarm while destroying the last evidence that
-- we do not know what ran. They stay exactly as they are, and
-- scripts/check-migrations.ts now reports them as their own class
-- (UNVERIFIABLE) instead of burying them in the drift count.
--
-- Idempotent. Safe to re-run.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The guard.
-- ─────────────────────────────────────────────────────────────────────────────
-- A SHA-256 hex digest is exactly 64 lowercase hex characters. Anything else is
-- not a checksum of anything; it is a placeholder wearing a checksum's clothes.
--
-- BEFORE INSERT **OR UPDATE**: the update half matters as much as the insert
-- half, because every sanctioned writer uses
-- `on conflict (source, filename) do update set checksum = excluded.checksum`,
-- so a re-record reaches the row through UPDATE, not INSERT. A guard on INSERT
-- alone would wave through exactly the re-ledgering path an agent reaches for
-- when a checksum "looks wrong".
--
-- DELETE is deliberately untouched: `--rerun` and the explicit operator script
-- scripts/hr/migration-slot-collision-residue-cleanup.sql both delete rows, and
-- deleting a row claims nothing about what ran.
--
-- It announces itself the way every automatic intervention in this program must
-- (systems/platform/db-rules/FEATURE.md §6d-4): the message names the file and
-- the offending value, and the hint says exactly what to write instead.
create or replace function public._schema_migrations_checksum_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.checksum ~ '^[0-9a-f]{64}$' then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = format(
      'MIGRATION CHECKSUM IS NOT A CHECKSUM -- refused. %s/%s tried to ledger '
      'checksum %L, which is not a SHA-256 hex digest (64 lowercase hex chars; '
      'this one is %s char(s)).',
      new.source, new.filename, new.checksum, length(new.checksum)
    ),
    detail =
      'The ledger exists to answer ONE question: what bytes actually ran? A '
      'value derived from the filename, or a note like ''applied-via-mcp'', is a '
      'constant -- it cannot change when the file changes, so it can never '
      'detect an edit to an applied migration, and it never equals the file''s '
      'real hash, so the file reports DRIFTED forever. 43 rows written this way '
      'before 2026-08-29 are permanently unverifiable: what ran is unknowable.',
    hint =
      'Record the SHA-256 of the EXACT SQL you applied: '
      'shasum -a 256 migrations/<file>.sql  (or in Python: '
      'hashlib.sha256(sql.encode("utf-8")).hexdigest()). If you applied via the '
      'Supabase MCP, hash the file you applied. Do NOT invent a value to get '
      'past this, and do NOT ledger a migration you did not actually run. If a '
      'migration is not meant to apply, mark it with `-- migrate: skip: <reason>` '
      'in its first 25 lines instead of ledgering it.';
end;
$$;

-- Trigger functions need no client EXECUTE (permission is checked at CREATE
-- TRIGGER time, not at fire time), and a SECURITY DEFINER function carries an
-- implicit PUBLIC grant. Take it back explicitly.
revoke all on function public._schema_migrations_checksum_guard() from public;

drop trigger if exists schema_migrations_checksum_guard on public._schema_migrations;
create trigger schema_migrations_checksum_guard
  before insert or update on public._schema_migrations
  for each row execute function public._schema_migrations_checksum_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The standing scream over what is already there.
-- ─────────────────────────────────────────────────────────────────────────────
-- Loud patches law: a stand-in ships with a constant, counted, visible scream.
-- These rows are not repairable, so the honest thing is to keep counting them
-- out loud rather than to let them disappear into a drift total.
do $$
declare
  v_bad int;
  v_src text;
begin
  select count(*) into v_bad
    from public._schema_migrations where checksum !~ '^[0-9a-f]{64}$';

  if v_bad = 0 then
    raise notice 'checksum guard: every ledger row carries a real SHA-256. Clean.';
    return;
  end if;

  raise warning
    'checksum guard installed, and % pre-existing ledger row(s) carry a checksum '
    'that is NOT a SHA-256. What those migrations actually applied is '
    'UNRECOVERABLE. They are not repaired here -- overwriting them with today''s '
    'file hash would silence the alarm by destroying the evidence. They are '
    'reported as their own class by `pnpm check:migrations`.', v_bad;

  for v_src in
    select source || ': ' || count(*) || ' row(s)'
      from public._schema_migrations
     where checksum !~ '^[0-9a-f]{64}$'
     group by source order by count(*) desc
  loop
    raise warning '  unverifiable -- %', v_src;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Installation verification.
-- ─────────────────────────────────────────────────────────────────────────────
-- The canonical migration runner owns every write to public._schema_migrations
-- and deliberately rejects migration files containing a ledger write, including
-- rollback-only probes. Verify the live trigger binding here; the runner's own
-- post-commit SHA-256 ledger insert then exercises the installed trigger on the
-- sanctioned path without letting this migration counterfeit its own history.
do $$
declare
  v_trigger_def text;
begin
  select pg_get_triggerdef(t.oid) into v_trigger_def
    from pg_trigger t
   where t.tgrelid = 'public._schema_migrations'::regclass
     and t.tgname = 'schema_migrations_checksum_guard'
     and not t.tgisinternal
     and t.tgenabled <> 'D';

  if v_trigger_def is null
     or position('BEFORE INSERT OR UPDATE' in v_trigger_def) = 0
     or position('_schema_migrations_checksum_guard()' in v_trigger_def) = 0 then
    raise exception 'checksum guard INSTALLATION FAILED: the enabled BEFORE '
      'INSERT OR UPDATE trigger is not bound to public._schema_migrations.';
  end if;

  raise notice 'checksum guard verified: enabled on INSERT and UPDATE; the '
    'canonical runner will now ledger this migration through it with SHA-256.';
end $$;

commit;
