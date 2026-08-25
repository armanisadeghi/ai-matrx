-- retire_iam_canonical_sweep_dead_worklist.sql
-- ---------------------------------------------------------------------------
-- Retire iam.canonical_sweep + its three functions: a parallel canonicalization
-- worklist that duplicates audit.summary, was never once used, and manufactures
-- phantom backlog.
--
-- WHY (all measured live 2026-08-25):
--   * Seeded 2026-06-26 from `entity_types WHERE is_active` (63 rows) by
--     migrations/iam_canonical_sweep_ledger.sql, as a claim board so parallel
--     agents could each grab a table atomically.
--   * NEVER USED, not once: 0 rows ever claimed (claimed_by IS NULL on all 63),
--     and all 63 rows still share ONE identical updated_at (2026-06-26
--     23:58:43) — the seed. No claim, no record, no refresh in two months.
--   * COVERAGE IS 15%: 63 of 432 active tokens. audit.summary covers 432/432
--     and is rebuilt automatically by audit.refresh(). db-rules §11 makes
--     audit.summary THE hit list; §1 forbids a parallel list of entity kinds.
--   * IT MANUFACTURES FALSE WORK: 37 of the 63 rows point at relations that no
--     longer exist, 16 of those still read status='todo'. Worse, the board is
--     ACTIVELY WRONG rather than merely stale — iam.verify_canonical returns
--     `table_exists FAIL` for a dropped table, so running iam.sweep_refresh()
--     would flip the 21 dropped-but-'done' rows to 'todo' and inflate the
--     phantom backlog from 16 to 37. The one function meant to heal the board
--     is the one that would corrupt it further.
--   * sweep_refresh() iterates existing rows only — it can neither add the 386
--     missing tokens nor remove the 37 dead ones. The design cannot self-heal.
--
-- Retirement, not deletion (§0.7 / §9): the table keeps its 63 rows in the
-- graveyard so the June sweep's history stays recoverable. Verified safe:
-- audit.relation_usage('iam','canonical_sweep') returns ONLY its own three
-- functions, and the table has 0 outbound FKs (so graveyard_outbound_fk_guard
-- cannot fire). It is not registered in platform.entity_types.
-- ---------------------------------------------------------------------------

begin;

-- 1) preconditions — abort if reality moved since this was written
do $$
declare v_rows int; v_claimed int; v_fks int; v_reg int;
begin
  if to_regclass('iam.canonical_sweep') is null then
    raise exception 'precondition: iam.canonical_sweep already gone';
  end if;
  select count(*), count(*) filter (where claimed_by is not null)
    into v_rows, v_claimed from iam.canonical_sweep;
  if v_claimed <> 0 then
    raise exception 'precondition: % rows now claimed — the board is IN USE, do not retire', v_claimed;
  end if;
  select count(*) into v_fks
    from pg_constraint where contype='f' and conrelid='iam.canonical_sweep'::regclass;
  if v_fks <> 0 then
    raise exception 'precondition: % outbound FK(s) appeared — graveyard guard would fire', v_fks;
  end if;
  select count(*) into v_reg from platform.entity_types
   where schema_name='iam' and table_name='canonical_sweep';
  if v_reg <> 0 then
    raise exception 'precondition: canonical_sweep is now registered — deactivate first (§1 G2 guard)';
  end if;
  raise notice 'preconditions ok: % rows, 0 claimed, 0 fks, unregistered', v_rows;
end $$;

-- 2) retire the table (rename into graveyard, rows intact)
create schema if not exists graveyard;
alter table iam.canonical_sweep set schema graveyard;
alter table graveyard.canonical_sweep rename to iam_canonical_sweep;

-- 3) drop the three functions — they exist only to drive the retired board
drop function if exists iam.sweep_claim(text, text, text);
drop function if exists iam.sweep_record(text, text);
drop function if exists iam.sweep_refresh();

-- 4) ledger all four (§0.7 / §9)
insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason, deprecated_at)
values
  ('iam.canonical_sweep', 'audit.summary', 'graveyard.iam_canonical_sweep',
   'Parallel canonicalization worklist, retired 2026-08-25. Seeded 2026-06-26 and never used (0 claims, all 63 rows share the seed timestamp); covered 63 of 432 active tokens while audit.summary covers all 432 and self-rebuilds via audit.refresh(). 37 of 63 rows pointed at dropped relations. db-rules §11 makes audit.summary the hit list; §1 forbids a parallel entity list. Rows preserved in graveyard.',
   now()),
  ('iam.sweep_claim(text,text,text)', 'audit.summary', null,
   'Claim half of the retired canonical_sweep board (never invoked; 0 rows ever claimed). Parallel-agent claiming now lives in the STATUS-BOARD flow, not the DB.',
   now()),
  ('iam.sweep_record(text,text)', 'iam.verify_canonical', null,
   'Per-row recorder for the retired canonical_sweep board. iam.verify_canonical is the gate it wrapped; call it directly.',
   now()),
  ('iam.sweep_refresh()', 'audit.refresh', null,
   'Board-wide refresher for the retired canonical_sweep board. It could not add or remove rows and would have flipped 21 dropped-but-done rows to todo. audit.refresh() rebuilds audit.summary for all 432 tokens instead.',
   now())
on conflict do nothing;

-- 5) in-transaction verification — any deviation rolls the whole thing back
do $$
declare v_bad int;
begin
  if to_regclass('iam.canonical_sweep') is not null then
    raise exception 'verify: iam.canonical_sweep still live';
  end if;
  if to_regclass('graveyard.iam_canonical_sweep') is null then
    raise exception 'verify: graveyard.iam_canonical_sweep missing';
  end if;
  if (select count(*) from graveyard.iam_canonical_sweep) <> 63 then
    raise exception 'verify: expected 63 preserved rows, got %',
      (select count(*) from graveyard.iam_canonical_sweep);
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='iam' and p.proname in ('sweep_claim','sweep_record','sweep_refresh');
  if v_bad <> 0 then raise exception 'verify: % sweep function(s) survived', v_bad; end if;
  select count(*) into v_bad from platform.deprecated_relations
   where old_ref in ('iam.canonical_sweep','iam.sweep_claim(text,text,text)',
                     'iam.sweep_record(text,text)','iam.sweep_refresh()');
  if v_bad <> 4 then raise exception 'verify: expected 4 ledger rows, got %', v_bad; end if;
  -- the retired table must not re-enter the graveyard FK trap
  select count(*) into v_bad from pg_constraint
   where contype='f' and conrelid='graveyard.iam_canonical_sweep'::regclass;
  if v_bad <> 0 then raise exception 'verify: graveyard table has % outbound FK(s)', v_bad; end if;
  raise notice 'verify ok: table retired with 63 rows, 3 functions dropped, 4 ledger rows';
end $$;

commit;
