-- migration_slot_guard.sql
--
-- WHY THIS EXISTS: migration NUMBER collisions bit this program three times in
-- two days (2026-08-27 → 2026-08-28). Multiple agents work
-- matrx-frontend/migrations/ concurrently and independently claim the same
-- sequence number (hr_l1_60, hr_c4_55, hr_l1_63, hr_l1_64...).
--
--   round 1  collision found pre-apply; renumbered 60 → 61 by hand. Lucky.
--   round 2  two hr_c4_55_*.sql applied nine minutes apart; recorded in a file
--            header instead of renumbered, because renaming would have orphaned
--            a later migration's citation of "the first hr_c4_55 bytes".
--   round 3  THE DAMAGING ONE. A concurrent run of aidream/db/apply_migrations.py
--            applied an agent's file under its original colliding number before
--            the agent noticed. The agent's renumbered re-apply then hit its own
--            idempotence guard and SKIPPED EVERY SWAP — twelve function bodies
--            left stamped with an unrelated migration's number, plus a duplicate
--            14-row hr.function_contract set naming a file that did not exist.
--            Cleaned up by hand.
--
-- WHY THE LEDGER COULD NOT STOP IT: public._schema_migrations is keyed on
-- (source, FILENAME). Two files sharing a NUMBER have different filenames, so
-- both insert cleanly and nothing anywhere notices.
--
-- WHY THE GUARD LIVES HERE AND NOT IN A REPO CHECK: there are four apply paths
-- and no blocking CI gate over any of them --
--   1. aidream/db/apply_migrations.py       (the batch applier; the round-3 culprit)
--   2. aidream/db/detect_applied.py         (auto-ledgers already-live objects)
--   3. Supabase MCP apply_migration + a hand-written ledger row (the agent path,
--      per matrx-frontend/.claude/skills/db-change/SKILL.md)
--   4. matrx-frontend/scripts/hr/apply_esign_migration.py
-- matrx-frontend/scripts/run-release-gates.sh is ADVISORY BY DESIGN ("exit 0
-- always"), and .github/workflows/ci.yml does not run it at all -- so a repo-side
-- check is a scream, not a guard. All four paths converge on exactly one
-- statement: an INSERT into public._schema_migrations. That is the only real
-- choke point, so the guard sits on it.
--
-- Idempotent. Safe to re-run.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The slot rule, as one function so nothing can reimplement it differently.
-- ─────────────────────────────────────────────────────────────────────────────
-- A migration filename claims a NUMERIC SLOT when it looks like
--     <series>_<digits><optional single letter>[_<letter-initial slug>].sql
-- e.g. hr_l3_20_registry_preconditions.sql  → slot hr_l3 #0020
--      hr_l3_13a_recompute_pay_group.sql    → slot hr_l3 #0013a
--      hr_l10_05_requires_reason.sql        → slot hr_l10 #0005
--
-- Two deliberate properties:
--
--  * The slug must start with a LETTER. This is what keeps date-stamped names
--    out of the slot space: workbench_product_capture_2026_08_28.sql would
--    otherwise read as series `workbench_product_capture` slot #2026 and collide
--    with every other 2026 file in its series. It claims no slot instead.
--
--  * A sub-step letter is GLUED TO THE DIGITS (hr_l3_13a), never a separate part
--    (hr_l3_13_a). This is already the house convention -- ext_06a, hr_l3_02c,
--    hr_c5_04a, hr_l3_13a/b/c/d/e all ship today -- and it is the escape hatch:
--    a deliberate second file in an existing slot is `<n><letter>`, which the
--    guard reads as a DIFFERENT slot and allows. The separated form cannot be
--    used for this, because `hr_c4_55_a_delivery_failure_...` proves `_a_` is
--    just as often the English article.
--
-- Returns NULL for a filename that claims no slot (the majority -- 1448 of the
-- 1880 files in matrx-frontend/migrations today). NULL is never guarded.
create or replace function public.migration_slot(p_filename text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when m is null then null
    else m[1] || ' #' || lpad(m[2], 4, '0') || m[3]
  end
  from (
    select regexp_match(
      p_filename,
      -- non-greedy series, so the LEFTMOST digit run is the slot number:
      -- hr_l3_107_check_35_cross_schema.sql must be hr_l3 #0107, never #0035.
      '^(.*?)_([0-9]{1,4})([a-z]?)(?:_[a-z].*)?\.sql$'
    ) as m
  ) s;
$$;

comment on function public.migration_slot(text) is
  'Canonical numeric-slot key for a migration filename, or NULL when it claims no '
  'slot. The one definition -- public._schema_migrations_slot_guard() and '
  'matrx-frontend/scripts/check-migrations.ts both defer to this rule. See '
  'migrations/migration_slot_guard.sql.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The historical baseline.
-- ─────────────────────────────────────────────────────────────────────────────
-- 31 slots in matrx-frontend already hold two files each, every one of them
-- applied long ago. Those are a fait accompli: renaming an applied migration
-- orphans the citations that name its bytes (that is precisely why round 2 was
-- recorded in a file header instead of renumbered). The guard must never fire on
-- them, or a --rerun / --accept-drift / re-record of any historical file becomes
-- impossible and the guard halts the fleet instead of the collisions.
--
-- Seeded BY COMPUTATION from the live ledger, never hand-typed, and only ever
-- shrinks: nothing adds a row after install.
create table if not exists public._schema_migration_slot_grandfather (
  source      text        not null,
  slot        text        not null,
  filenames   text[]      not null,
  noted_at    timestamptz not null default now(),
  primary key (source, slot)
);

comment on table public._schema_migration_slot_grandfather is
  'Numeric slots that already held two or more ledgered migrations when '
  'migration_slot_guard.sql was installed. The guard exempts the LISTED FILENAMES '
  '(so --rerun of a historical migration still works), never the slot itself -- a '
  'new file claiming one of these slots is still refused. Nothing writes here '
  'after install.';

insert into public._schema_migration_slot_grandfather (source, slot, filenames)
select m.source,
       public.migration_slot(m.filename) as slot,
       array_agg(m.filename order by m.filename)
  from public._schema_migrations m
 where public.migration_slot(m.filename) is not null
 group by m.source, public.migration_slot(m.filename)
having count(*) > 1
on conflict (source, slot) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The guard.
-- ─────────────────────────────────────────────────────────────────────────────
-- Refuses, loudly and with the remedy, an INSERT that claims a numeric slot
-- already held by a DIFFERENT filename in the same source.
--
-- It announces itself the way every automatic intervention in this program must
-- (systems/platform/db-rules/FEATURE.md §6d-4): the message names BOTH files,
-- says what to do, and hands over the next free number so renumbering is one
-- edit. Nothing here is silent and nothing here is a no-op.
create or replace function public._schema_migrations_slot_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_slot     text;
  v_series   text;
  v_holder   text;
  v_next     int;
begin
  v_slot := public.migration_slot(new.filename);

  -- Claims no numeric slot (most files) -- nothing to collide with.
  if v_slot is null then
    return new;
  end if;

  -- Already ledgered under this exact filename: a re-record, a --mark-applied
  -- sweep, or an ON CONFLICT DO UPDATE. It is not claiming anything new.
  if exists (
    select 1 from public._schema_migrations m
     where m.source = new.source and m.filename = new.filename
  ) then
    return new;
  end if;

  -- One of the specific files that already shared this slot before the guard
  -- existed, being re-recorded after --rerun deleted its row. Allowed, because
  -- refusing it would make re-applying a historical migration impossible.
  --
  -- NARROW ON PURPOSE: the exemption is for these FILENAMES, never for the slot.
  -- A brand-new file claiming a grandfathered slot is still refused. Two reasons.
  -- First, a third file in an already-ambiguous slot is the worst case, not an
  -- acceptable one. Second, the seed is computed from the LEDGER, and the ledger
  -- carries 916 rows whose files no longer exist -- including round-3 residue
  -- (`hr_l1_63_the_write_gate_...sql`, ledgered under the colliding number before
  -- that file was renumbered to 64). A slot-wide exemption would let those orphan
  -- rows silently switch the guard OFF for slots that are not actually shared.
  if exists (
    select 1 from public._schema_migration_slot_grandfather g
     where g.source = new.source
       and g.slot = v_slot
       and new.filename = any (g.filenames)
  ) then
    raise notice
      'migration slot guard: re-recording %, one of the files that already shared '
      'slot [%] before this guard was installed. Allowed.',
      new.filename, v_slot;
    return new;
  end if;

  select m.filename
    into v_holder
    from public._schema_migrations m
   where m.source = new.source
     and m.filename <> new.filename
     and public.migration_slot(m.filename) = v_slot
   order by m.applied_at
   limit 1;

  if v_holder is null then
    return new;
  end if;

  -- Occupied. Compute the next free number in this series so the fix is trivial.
  v_series := split_part(v_slot, ' #', 1);
  select coalesce(max(substring(public.migration_slot(m.filename) from ' #([0-9]{4})')::int), 0) + 1
    into v_next
    from public._schema_migrations m
   where m.source = new.source
     and split_part(public.migration_slot(m.filename), ' #', 1) = v_series;

  raise exception using
    errcode = '23505',
    message = format(
      'MIGRATION SLOT COLLISION -- refused. %s/%s claims number slot [%s], which is '
      'already held by a DIFFERENT applied migration: %s',
      new.source, new.filename, v_slot, v_holder
    ),
    detail = format(
      'The ledger is keyed on (source, filename), so two files sharing a NUMBER '
      'both insert cleanly and nothing notices -- which is how twelve function '
      'bodies ended up stamped with an unrelated migration''s number on '
      '2026-08-28. Occupant: %s. Yours: %s.',
      v_holder, new.filename
    ),
    hint = format(
      'Renumber your file to %s_%s_<slug>.sql (next free number in this series), '
      'or -- if you genuinely mean a sub-step of %s -- glue a letter to the '
      'digits: %s%sa_<slug>.sql. Re-point any hr.function_contract.home_migration '
      'rows and in-body number stamps in the same edit. Do NOT rename %s: it is '
      'already applied, and other migrations may cite its bytes.',
      v_series, lpad(v_next::text, 2, '0'), v_slot,
      v_series || '_', lpad(substring(v_slot from ' #0*([0-9]+)'), 2, '0'),
      v_holder
    );
end;
$$;

-- Trigger functions need no client EXECUTE (permission is checked at CREATE
-- TRIGGER time, not at fire time), and a SECURITY DEFINER function carries an
-- implicit PUBLIC grant. Take it back explicitly.
revoke all on function public._schema_migrations_slot_guard() from public;

drop trigger if exists schema_migrations_slot_guard on public._schema_migrations;
create trigger schema_migrations_slot_guard
  before insert on public._schema_migrations
  for each row execute function public._schema_migrations_slot_guard();

commit;
