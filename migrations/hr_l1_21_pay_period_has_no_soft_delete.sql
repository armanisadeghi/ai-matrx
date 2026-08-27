-- HR domain L1 — migration 21 (register item HRB-013, lane l1-employees).
--
-- 🚨 NO COMPENSATION COULD BE RECORDED AT ALL. `hr_compensation_upsert` died with
-- `42703: column pp.deleted_at does not exist` before it wrote anything.
--
-- Applied live as `hr_l1_21_pay_period_has_no_soft_delete`. Idempotent.
-- Authority: SPEC-EMPLOYEES §4.4 C2 (an effective date inside a CLOSED pay period is
-- refused with the period NAMED and a door to it).
--
-- ===================================================================================
-- HOW A GUARD WRITTEN TO BE SAFE BECAME THE FAILURE.
--
-- The §4.4 C2 check has to read L3's `hr.pay_period`, which did not exist when this
-- lane shipped. So it was written defensively — wrapped in `to_regclass(...) is not
-- null` and executed as dynamic SQL, precisely so this lane would not hard-depend on
-- another lane's table:
--
--     if to_regclass('hr.pay_period') is not null then
--       execute $q$ select … from hr.pay_period pp
--                    where pp.organization_id = $1 and pp.deleted_at is null … $q$
--
-- 🚨 THE GUARD PROVED THE TABLE EXISTS. IT COULD NOT PROVE ITS SHAPE. And dynamic SQL
-- is not parsed until it runs, so nothing failed at deploy time either — the column
-- reference sat dormant until the first real compensation write. `hr.pay_period`
-- shipped with 27 columns and **no `deleted_at`**: it is not a soft-delete table, and
-- its lifecycle lives in `state` (open/closed/locked/exported) plus the timestamp
-- columns. The predicate was guarding against a concept the table does not have.
--
-- Removing it is the whole fix, and it does not widen the check: `state in
-- ('closed','locked','exported')` was always what decided the refusal.
--
-- Found by calling the door with a real payload while proving `hr_my_compensation`,
-- which is the only reason it surfaced before a customer did.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_compensation_upsert(jsonb)'::regprocedure);
  if position('pp.deleted_at' in v_def) = 0 then
    raise notice 'hr_l1_21: already applied';
    return;
  end if;
  v_new := replace(v_def,
    'where pp.organization_id = $1 and pp.deleted_at is null',
    'where pp.organization_id = $1');
  if v_new = v_def then
    raise exception 'hr_l1_21: the pay-period predicate was not found';
  end if;
  execute v_new;
end $$;

-- ============================================================ assertions

do $$
declare v_bad int;
begin
  -- 🚨 STANDING GUARD, BY PATTERN not by name: `hr.pay_period` has no soft delete, so
  -- ANY function reaching for `pp.deleted_at` is this bug returning. Dynamic SQL will
  -- not fail at deploy time, so it has to be caught here.
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('hr','public') and p.prosrc like '%pp.deleted\_at%';
  if v_bad > 0 then
    raise exception 'hr_l1_21: % function(s) still reference pp.deleted_at', v_bad;
  end if;

  -- the C2 refusal itself must survive the edit
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_compensation_upsert')
     !~ 'closed_pay_period' then
    raise exception 'hr_l1_21: the closed-pay-period refusal has gone missing';
  end if;

  if (select count(*) from hr.stable_doors_that_write()) > 0 then
    raise exception 'hr_l1_21: a non-volatile door can reach a writer';
  end if;
end $$;
