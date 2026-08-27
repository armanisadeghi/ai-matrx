-- HR domain L3 — migration 28a (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 `enrolled_rows` REPORTED 0 WHILE 3 ROWS WERE WRITTEN. My own defect, found by execution.
--
-- hr_l3_28 left a redundant first statement in `hr.pay_period_generate`:
--     select hr._enroll_pay_period_rows(pp.id, null) into v_enrolled ... limit 1;   -- enrols ONE period
--     select coalesce(sum(hr._enroll_pay_period_rows(pp.id, null)), 0) into v_enrolled ...;  -- enrols the rest
-- The first call did the inserting; the second then found nothing left to insert (the writer is
-- idempotent, which is exactly why it returned 0) and overwrote the variable. So the door reported
-- `enrolled_rows: 0` on the very run that created the roster.
--
-- That is the failure this batch has been hunting all day wearing a different hat: a count that
-- says nothing happened when something did. An operator reads 0, concludes enrollment is still
-- broken, and either re-runs forever or goes looking for a bug that is not there. A number a
-- surface will show has to be the number that is true.
--
-- Applied live as `hr_l3_28a_enrolled_count_told_the_truth`. Idempotent.

do $outer$
declare v_def text; v_stray text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.pay_period_generate(uuid,date)'::regprocedure;

  v_stray := '  select hr._enroll_pay_period_rows(pp.id, null) into v_enrolled from hr.pay_period pp' || chr(10) ||
             '   where pp.pay_group_id = g.id limit 1;' || chr(10);

  if position(v_stray in v_def) = 0 then
    if v_def like '%coalesce(sum(hr._enroll_pay_period_rows%' then
      raise notice 'hr_l3_28a: already applied';
      return;
    end if;
    raise exception 'hr_l3_28a: the redundant enrollment statement was not found';
  end if;

  execute replace(v_def, v_stray, '');
end $outer$;

do $$
declare v_def text; v_n int;
begin
  v_def := pg_get_functiondef('hr.pay_period_generate(uuid,date)'::regprocedure);
  -- exactly ONE enrollment call may remain, and it must be the summing one
  v_n := (length(v_def) - length(replace(v_def, '_enroll_pay_period_rows(', '')))
         / length('_enroll_pay_period_rows(');
  if v_n <> 1 then
    raise exception 'hr_l3_28a: expected exactly 1 enrollment call, found %', v_n;
  end if;
  if v_def not like '%coalesce(sum(hr._enroll_pay_period_rows%' then
    raise exception 'hr_l3_28a: the summing enrollment call was lost';
  end if;
end $$;
