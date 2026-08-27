-- HR domain L3 — migration 32 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 PAYROLL-CORRECTNESS: THE FINAL WORKWEEK OF EVERY ALIGNED PAY PERIOD WAS SILENTLY DROPPED FROM
-- ITS EXPORT.
--
-- `hr.recompute_apply` resolved ONE pay period for the whole week from
-- `(v_wk_end at time zone tz)::date` - but `week_end_at` is the EXCLUSIVE end instant, so that
-- expression names the day AFTER the week ends. Confirmed live on the real rows:
--   * Priya (ca9e12da) week 08-20 -> week_end_at 2026-08-27T07:00Z = 2026-08-27 local; her period
--     27da579d runs 08-13…08-26. The lookup asked for 08-27, matched nothing, and all THREE of her
--     current intervals on 08-26 carry `pay_period_id = NULL`.
--   * Armani (9c0b1d0c) week ends 08-30, inside his 08-26…09-08 period, so his resolved and the
--     bug stayed invisible.
-- `hr.export_line_source` filters on `pay_period_id`, so those hours leave the export with no error
-- anywhere. Hours worked, recorded, computed - and absent from pay.
--
-- 🚨 FIXED AT THE GRAIN, NOT BY NUDGING THE OFF-BY-ONE. Subtracting a second would have made
-- Priya's week resolve, and would still have been wrong: a workweek can STRADDLE two periods, which
-- is the whole reason `hr.pay_period.boundary_workweek_ids` exists. One period id per week cannot
-- be right for a week whose Monday and Sunday fall in different periods. The period is now resolved
-- and stamped PER INTERVAL from that interval's own `local_work_date`, which is also what
-- SPEC-DATA-MODEL §7.9's export grain assumes - a line carries `workweek_id` AND a period that came
-- from its day.
--
-- ONE OF THE OPEN QUESTIONS IS ALREADY SETTLED BY THE SCHEMA: `hr.workweek` HAS NO `pay_period_id`
-- COLUMN (verified against information_schema - zero rows). So there is no week-level period ref to
-- rule on, majority-period or otherwise. Nothing to decide and nothing to change there.
--
-- ALSO FIXED, SAME ROOT CAUSE, DIFFERENT SYMPTOM:
--   * The whole-call period LOCK check inherited the same off-by-one, so it asked whether the day
--     AFTER the week was locked. It now uses the week's inclusive last day.
--   * And because a week can straddle, a per-DAY lock check runs over the submitted intervals: only
--     one of the two periods may be locked, and the refusal now names the DAY rather than the week.
--   * `boundary_workweek_ids` is maintained: a week whose interval-days land in more than one period
--     IS a boundary week, and is added to each period it touches. That closes the loop with
--     hr_l3_20 - `hr._exception_in_pay_period` reads exactly that array to include boundary days.
--
-- No backfill door is needed: re-running recompute over the existing punches re-derives and
-- re-stamps, and the hr_l3_27 enqueue path already fires on every correction.
--
-- Applied live as `hr_l3_32_period_is_per_interval_day`. Idempotent.

-- the period that actually contains a given work day, for that employment's pay group
create or replace function hr._period_for_day(p_employment_id uuid, p_local_work_date date)
returns uuid
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$
  select pp.id
    from hr.pay_period pp
    join hr.employment em on em.pay_group_id = pp.pay_group_id
   where em.id = p_employment_id
     and p_local_work_date between pp.period_start_on and pp.period_end_on
   order by pp.sequence_number desc
   limit 1;
$$;

comment on function hr._period_for_day(uuid, date) is
  'The pay period containing one work DAY for an employment. The period is a property of the day, not of the week - a workweek can straddle two periods, which is what boundary_workweek_ids exists for.';

do $outer$
declare v_def text; v_from text; v_to text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure;

  if position('_period_for_day' in v_def) > 0 then
    raise notice 'hr_l3_32: already applied'; return;
  end if;

  -- 1. the whole-call lock: the week's INCLUSIVE last day, not the day after it
  v_from := 'v_lock := hr._punch_period_lock(p_employment_id, (v_wk_end at time zone' || chr(10) ||
            '              coalesce(p_workweek ->> ''tz'', ''UTC''))::date);';
  v_to   := '-- hr_l3_32: week_end_at is the EXCLUSIVE end instant, so the old expression asked about' || chr(10) ||
            '  -- the day AFTER the week ended. Use the last day actually inside the week.' || chr(10) ||
            '  v_lock := hr._punch_period_lock(p_employment_id,' || chr(10) ||
            '              ((v_wk_end - interval ''1 second'') at time zone' || chr(10) ||
            '               coalesce(p_workweek ->> ''tz'', ''UTC''))::date);';
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_32: the whole-call lock expression was not found';
  end if;
  v_def := replace(v_def, v_from, v_to);

  -- 2. a per-DAY lock check, because only one of a straddled week's periods may be locked
  v_from := '  ---------------------------------------------------------------- 3b. VALIDATE EVERYTHING, WRITE NOTHING';
  v_to   := '  ---------------------------------------------------------------- 3a2. per-DAY lock (hr_l3_32)' || chr(10) ||
            '  for v_iv in select * from jsonb_array_elements(p_intervals) loop' || chr(10) ||
            '    if (v_iv ->> ''local_work_date'') is not null then' || chr(10) ||
            '      v_lock := hr._punch_period_lock(p_employment_id, (v_iv ->> ''local_work_date'')::date);' || chr(10) ||
            '      if coalesce((v_lock ->> ''locked'')::boolean, false) then' || chr(10) ||
            '        return hr._punch_refusal(''hr_period_locked'',' || chr(10) ||
            '          ''The pay period covering '' || (v_iv ->> ''local_work_date'') || '' is ''' || chr(10) ||
            '          || (v_lock ->> ''state'') || '', so that day''''s computed hours can no longer be ''' || chr(10) ||
            '          || ''replaced. A correction after lock rides the next export as a time adjustment.'',' || chr(10) ||
            '          v_lock || jsonb_build_object(''local_work_date'', (v_iv ->> ''local_work_date'')::date,' || chr(10) ||
            '                                      ''door'', ''hr.time_adjustment_create'',' || chr(10) ||
            '                                      ''http_semantics'', 423));' || chr(10) ||
            '      end if;' || chr(10) ||
            '    end if;' || chr(10) ||
            '  end loop;' || chr(10) || chr(10) ||
            v_from;
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_32: the 3b pre-pass anchor was not found';
  end if;
  v_def := replace(v_def, v_from, v_to);

  -- 3. THE FIX: stamp the period from the INTERVAL'S OWN DAY
  v_from := 'coalesce((v_iv ->> ''pay_period_id'')::uuid, v_period),';
  v_to   := 'coalesce((v_iv ->> ''pay_period_id'')::uuid,' || chr(10) ||
            '               -- hr_l3_32: the period belongs to the DAY, never to the week' || chr(10) ||
            '               hr._period_for_day(p_employment_id, (v_iv ->> ''local_work_date'')::date),' || chr(10) ||
            '               v_period),';
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_32: the interval pay_period_id expression was not found';
  end if;
  v_def := replace(v_def, v_from, v_to);

  -- 4. premium lines resolve from their own exception day too
  v_from := '      v_org, p_employment_id, v_ww_id, v_period,' || chr(10) ||
            '      ''premium_only'', ''premium'', v_ec,';
  v_to   := '      v_org, p_employment_id, v_ww_id,' || chr(10) ||
            '      coalesce(hr._period_for_day(p_employment_id, r.local_work_date), v_period),' || chr(10) ||
            '      ''premium_only'', ''premium'', v_ec,';
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_32: the premium insert values were not found';
  end if;
  v_def := replace(v_def, v_from, v_to);

  -- 5. maintain boundary_workweek_ids for a week that really straddles
  v_from := 'select coalesce(array_agg(id), ''{}''::uuid[]) into v_sup from stale;';
  v_to   := v_from || chr(10) || chr(10) ||
            '  -- hr_l3_32: a week whose interval-days land in MORE THAN ONE period is a boundary' || chr(10) ||
            '  -- week. hr._exception_in_pay_period reads exactly this array to include those days.' || chr(10) ||
            '  if (select count(distinct w.pay_period_id) from hr.work_interval w' || chr(10) ||
            '       where w.workweek_id = v_ww_id and w.is_current and w.pay_period_id is not null) > 1 then' || chr(10) ||
            '    perform hr.arm_write();' || chr(10) ||
            '    update hr.pay_period pp' || chr(10) ||
            '       set boundary_workweek_ids = pp.boundary_workweek_ids || v_ww_id' || chr(10) ||
            '     where pp.id in (select distinct w.pay_period_id from hr.work_interval w' || chr(10) ||
            '                      where w.workweek_id = v_ww_id and w.is_current' || chr(10) ||
            '                        and w.pay_period_id is not null)' || chr(10) ||
            '       and not (v_ww_id = any(coalesce(pp.boundary_workweek_ids, ''{}''::uuid[])));' || chr(10) ||
            '  end if;';
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_32: the supersede tail was not found';
  end if;
  v_def := replace(v_def, v_from, v_to);

  execute v_def;
end $outer$;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure);
  if v_def not like '%hr._period_for_day(p_employment_id, (v_iv ->> ''local_work_date'')::date)%' then
    raise exception 'hr_l3_32: intervals do not resolve the period from their own day';
  end if;
  if v_def like '%(v_wk_end at time zone%' then
    raise exception 'hr_l3_32: the exclusive-end off-by-one remains';
  end if;
  if v_def not like '%boundary_workweek_ids || v_ww_id%' then
    raise exception 'hr_l3_32: boundary_workweek_ids is not maintained';
  end if;
  if (select count(*) from hr.stable_doors_that_write()) > 0 then
    raise exception 'hr_l3_32: the F1 class gate went RED';
  end if;
end $$;
