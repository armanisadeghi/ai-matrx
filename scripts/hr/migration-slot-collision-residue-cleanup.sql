-- migration-slot-collision-residue-cleanup.sql
--
-- OPERATOR SCRIPT, NOT A MIGRATION: the canonical migration runner exclusively
-- owns public._schema_migrations and rejects migration files that mutate its
-- ledger. Run this cleanup explicitly with privileged SQL tooling after review;
-- never place it under migrations/ or bypass the runner's ledger guard.
--
-- WHY THIS EXISTS: on 2026-08-29 two agents working this shared checkout each
-- claimed migration number `hr_l1_63`, and the fallout cascaded one slot further:
--
--   05:48  hr_l1_63_the_derivation_reads_dates_not_a_stale_enum.sql   applied  (D4A/D4B)
--   05:56  hr_l1_63_the_write_gate_asks_the_population_...sql         applied  ← COLLIDED
--   06:04  hr_l1_64_the_directory_narrows_to_the_viewer.sql           applied
--   06:05  hr_l1_64_the_write_gate_asks_the_population_...sql         applied  ← the renumber,
--                                                                       which collided AGAIN
--   06:21  hr_l1_65_the_directory_narrows_to_the_viewer.sql           applied  ← re-renumber
--
-- The FILES were renumbered correctly and the function bodies were restamped
-- (commits 55feb43085, ad387cc67d, 96013587b1). hr.function_contract.home_migration
-- is already clean -- all six hr_l1_6x contract groups name a file that exists, and
-- hr.function_contracts_broken() returns zero rows.
--
-- WHAT WAS LEFT BEHIND: public._schema_migrations is keyed on (source, FILENAME),
-- so each rename ORPHANED the row ledgered under the old name. Two orphans remain:
--
--   hr_l1_63_the_write_gate_asks_the_population_it_refused_the_read_for.sql
--   hr_l1_64_the_directory_narrows_to_the_viewer.sql
--
-- Neither file exists on disk or in git HEAD. Nothing can ever apply them again;
-- they are pure bookkeeping residue, and they make the ledger claim eight
-- migrations where six shipped.
--
-- 🚨 WHY THE RESIDUE IS NOT COSMETIC: migration_slot_guard.sql seeded
-- public._schema_migration_slot_grandfather BY COMPUTATION FROM THE LEDGER, so it
-- read these orphans as evidence that slots [hr_l1 #0063] and [hr_l1 #0064] were
-- historically shared -- and wrote the ORPHAN FILENAMES into the exemption list.
-- The guard allows any filename listed there. So the two names that caused the
-- collision are the two names the collision guard would wave through. The guard's
-- own header warns about exactly this ("the seed is computed from the LEDGER, and
-- the ledger carries 916 rows whose files no longer exist -- including round-3
-- residue"); it defended against a SLOT-wide exemption, but the FILENAME-narrow
-- exemption still carries the residue. Neither slot is actually shared on disk.
--
-- WHAT THIS DOES: deletes the two orphan ledger rows, then drops the two
-- grandfather rows that exist only because of them -- but only after PROVING, in
-- SQL, that each surviving sibling is still ledgered and that the slot is left
-- holding exactly one file. It refuses loudly rather than deleting on faith.
--
-- Deletes no migration that shipped, re-applies nothing, reverts nothing.
-- Idempotent. Safe to re-run.

begin;

do $$
declare
  -- residue filename  →  the file it was renamed TO (which must still be ledgered)
  v_pairs constant text[][] := array[
    ['hr_l1_63_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
     'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql'],
    ['hr_l1_64_the_directory_narrows_to_the_viewer.sql',
     'hr_l1_65_the_directory_narrows_to_the_viewer.sql']
  ];
  v_orphan   text;
  v_survivor text;
  v_slot     text;
  v_left     int;
  v_deleted  int := 0;
  v_gf       int := 0;
  i          int;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    v_orphan   := v_pairs[i][1];
    v_survivor := v_pairs[i][2];

    -- Already cleaned by a previous run of this file.
    if not exists (
      select 1 from public._schema_migrations
       where source = 'matrx-frontend' and filename = v_orphan
    ) then
      raise notice 'residue cleanup: % already absent from the ledger', v_orphan;
      continue;
    end if;

    -- 🚨 THE SURVIVOR MUST BE PROVABLY LEDGERED BEFORE THE ORPHAN GOES. If the
    -- renamed file were somehow NOT recorded, deleting the orphan would erase the
    -- only evidence that this migration was ever applied -- and the next batch run
    -- would re-apply live, already-applied DDL.
    if not exists (
      select 1 from public._schema_migrations
       where source = 'matrx-frontend' and filename = v_survivor
    ) then
      raise exception
        'residue cleanup REFUSED: orphan % would be deleted, but its renamed '
        'survivor % is NOT in the ledger. Deleting would lose the only record '
        'that this migration was applied. Ledger the survivor first.',
        v_orphan, v_survivor;
    end if;

    delete from public._schema_migrations
     where source = 'matrx-frontend' and filename = v_orphan;
    v_deleted := v_deleted + 1;
    raise notice 'residue cleanup: deleted orphan ledger row % (survivor % retained)',
      v_orphan, v_survivor;
  end loop;

  -- ── The grandfather rows the orphans manufactured ───────────────────────────
  -- Drop a row ONLY when the slot is now down to a single ledgered file: a slot
  -- with one occupant was never shared, so an exemption for it is pure residue.
  -- A slot that really does hold two files keeps its row untouched.
  for v_slot in
    select unnest(array['hr_l1 #0063', 'hr_l1 #0064'])
  loop
    select count(*) into v_left
      from public._schema_migrations m
     where m.source = 'matrx-frontend'
       and public.migration_slot(m.filename) = v_slot;

    if v_left > 1 then
      raise exception
        'residue cleanup REFUSED: slot [%] still holds % ledgered files, so it is '
        'genuinely shared and its grandfather exemption must stay.', v_slot, v_left;
    end if;

    delete from public._schema_migration_slot_grandfather
     where source = 'matrx-frontend' and slot = v_slot;
    if found then
      v_gf := v_gf + 1;
      raise notice 'residue cleanup: dropped phantom grandfather row for slot [%] '
        '(now held by % file)', v_slot, v_left;
    end if;
  end loop;

  raise notice 'residue cleanup: % orphan ledger row(s), % phantom grandfather row(s)',
    v_deleted, v_gf;
end $$;

-- ── Falsification: the ledger must now agree with the six files on disk ───────
do $$
declare
  v_rows int;
begin
  select count(*) into v_rows
    from public._schema_migrations
   where source = 'matrx-frontend'
     and filename like 'hr_l1_6%';

  if v_rows <> 6 then
    raise exception
      'residue cleanup: expected exactly 6 ledgered hr_l1_6x migrations (60..65, '
      'one row per file on disk), found %.', v_rows;
  end if;

  if exists (
    select 1
      from public._schema_migrations m
     where m.source = 'matrx-frontend'
       and public.migration_slot(m.filename) in ('hr_l1 #0063', 'hr_l1 #0064')
     group by public.migration_slot(m.filename)
    having count(*) > 1
  ) then
    raise exception 'residue cleanup: a hr_l1 63/64 slot still holds two ledgered files.';
  end if;

  raise notice 'residue cleanup verified: 6 hr_l1_6x rows, one per slot';
end $$;

commit;
