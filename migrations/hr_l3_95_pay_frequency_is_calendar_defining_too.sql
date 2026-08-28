-- hr_l3_95 — `pay_frequency` is locked once the calendar has been cut, exactly as the anchor is.
--
-- PURPOSE
--   hr_l3_94 closed `first_period_start_on` being silently DROPPED on update. `pay_frequency` is the
--   opposite failure shape and was left for its own ruling: it is APPLIED on update, with no guard at
--   all. SPEC-TIME §1.3 lays the period sequence down from the anchor AT THE GROUP'S FREQUENCY, so
--   the two fields define the calendar together, and "re-running never duplicates or RE-CUTS an
--   existing period" covers both equally. Re-declaring a weekly group monthly after its periods exist
--   leaves a stored calendar that no longer derives from its own settings, and the next generate lays
--   a second, differently-shaped sequence beside the first.
--
--   Verified rather than assumed: `hr.pay_period_generate` does reference `pay_frequency`.
--
-- THE SWEEP THE RULING ASKED FOR — WHICH OTHER APPLIED FIELDS ARE DANGEROUS APPLIES?
--   The UPDATE branch applies: name, pay_frequency, pay_date_rule, workweek_start_dow,
--   workweek_start_time, workweek_effective_from, holiday_calendar_id, default_earning_code_id,
--   timesheet_required, is_active (plus first_period_start_on, guarded by hr_l3_94). Each was tested
--   by asking what actually CONSUMES it, not by how calendar-ish its name sounds:
--
--   · `pay_frequency`        — consumed by `hr.pay_period_generate`. Calendar-defining. FIXED HERE.
--   · `workweek_start_dow`   — consumed by `hr._recompute_workweek_start`, `hr.recompute_apply` and
--                              `hr._week_start_is_provisional`. Calendar-defining, and ALREADY
--                              guarded directly above by §2.4 route 70. No action.
--   · `workweek_start_time`  — consumed by NOTHING that cuts a week. The only readers in the whole
--     and                      database are `public.hr_structure_list` (a read) and this door itself.
--   · `workweek_effective_from` `hr.recompute_apply` writes `hr.workweek.week_start_time` without
--                              ever reading the pay group's column, and no function reads
--                              `workweek_effective_from` except this door's own guard. Changing
--                              either one today therefore re-cuts nothing, because nothing consumes
--                              them. They are NOT dangerous applies — they are settings that
--                              configure nothing, and one of them is defended by a guard protecting a
--                              field no engine reads. That is a real finding and a DIFFERENT defect
--                              class, so it is reported, not fixed here: bolting it onto a behaviour
--                              fix is the same rider this migration was told not to carry.
--   · `pay_date_rule`        — pay DATES, not period boundaries; generated periods keep the pay_date
--                              already stamped on them, so a change is forward-looking by
--                              construction. Not calendar-defining.
--   · name, holiday_calendar_id, default_earning_code_id, timesheet_required, is_active — labels and
--                              policy pointers; they cut nothing.
--
--   So exactly ONE field needed this treatment, and the answer is evidence from pg_proc, not a guess.
--
-- Applied live as `hr_l3_95_pay_frequency_is_calendar_defining_too`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · THE UPDATE ALREADY APPLIES `pay_frequency`, SO ONLY A GUARD IS ADDED. Unlike hr_l3_94 there is
--     no missing column to restore — the SET list is correct and the refusal is what was missing.
--   · ONLY AN ACTUAL CHANGE IS REFUSED (`is distinct from`), for the reason hr_l3_94 proved: every
--     idempotent caller re-sends its whole payload, and refusing on equality converts a fix into an
--     outage. `scripts/hr/hrb015_no_reach_wording_fixture.py` re-sends `pay_frequency` on every run.
--   · THE ANCHOR IS CHECKED FIRST. When a caller changes both at once the anchor is the more
--     fundamental field, so its refusal is the more useful one to return.
--   · THE DENIAL NAMES THE SAME WAY OUT as hr_l3_94 — a new pay group plus
--     `hr_employment_set_pay_group` — because it is the same escape hatch for the same reason.
--   · SURGICAL `replace()` WITH `position()` GUARDS, NOT A BODY RE-EMIT. Shared settings door under
--     concurrent edit; same reasoning as hr_l3_94.
--   · THE DOOR IS NOT RESTRUCTURED ONTO AN `hr.` INNER BODY. `public.hr_pay_group_upsert` holds its
--     logic directly, against TD-1. That is recorded debt for a dedicated pass and is deliberately
--     NOT touched here.

do $mig$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_pay_group_upsert';
  if v_src is null then
    raise exception 'hr_l3_95: public.hr_pay_group_upsert(jsonb) not found';
  end if;
  if position('pay_group_calendar_anchor_locked' in v_src) = 0 then
    -- NOTE: RAISE takes a literal format string, never a concatenated expression.
    raise exception 'hr_l3_95: hr_l3_94 is not applied — the anchor guard is missing, so this migration would be building on a body it does not recognise';
  end if;
  v_new := v_src;

  ---------------------------------------------------------------- 1. declarations
  if position('v_freq text' in v_new) = 0 then
    v_new := replace(v_new,
      $q$  v_anchor date; v_cur_anchor date; v_periods integer;$q$,
      $q$  v_anchor date; v_cur_anchor date; v_periods integer;
  v_freq text; v_cur_freq text;$q$);
  end if;

  ---------------------------------------------------------------- 2. the guard, before any write
  if position('pay_group_calendar_frequency_locked' in v_new) = 0 then
    v_new := replace(v_new,
      $q$  perform hr.arm_write();$q$,
      $q$  -- 🚨 hr_l3_95: FREQUENCY IS CALENDAR-DEFINING EXACTLY AS THE ANCHOR IS.
  -- SPEC-TIME §1.3 cuts the period sequence from the anchor AT THIS FREQUENCY, and never re-cuts an
  -- existing period. So a weekly group re-declared monthly after its periods exist keeps a calendar
  -- that no longer derives from its own settings, and the next generate lays a second, differently
  -- shaped sequence beside the first. Unlike the anchor this field was always APPLIED — the SET list
  -- was right and the refusal was what was missing.
  v_freq := nullif(p_payload ->> 'pay_frequency','');
  if v_id is not null and v_freq is not null then
    select pg.pay_frequency into v_cur_freq from hr.pay_group pg where pg.id = v_id;
    -- Only an actual CHANGE is refused; re-sending the same frequency is what idempotent callers do.
    if v_freq is distinct from v_cur_freq then
      select count(*) into v_periods from hr.pay_period pp where pp.pay_group_id = v_id;
      if v_periods > 0 then
        return jsonb_build_object('ok', false,
          'reason', 'pay_group_calendar_frequency_locked',
          'field', 'pay_frequency',
          'current_pay_frequency', v_cur_freq,
          'requested_pay_frequency', v_freq,
          'periods_generated', v_periods,
          'detail', 'This pay group already has ' || v_periods::text || ' pay period(s) cut as '
                 || v_cur_freq || '. Periods are never re-cut, so the frequency '
                 || 'they were cut at cannot change — the stored calendar would stop matching its '
                 || 'own settings. To run a different calendar, create a new pay group on the '
                 || 'frequency you want and move the employments onto it with '
                 || 'hr_employment_set_pay_group.');
      end if;
    end if;
  end if;

  perform hr.arm_write();$q$);
  end if;

  execute v_new;
end
$mig$;

-- ── STRUCTURAL SELF-CHECK: the guard landed, and the door still resolves to one signature. ───────
do $chk$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_pay_group_upsert';
  if position('v_freq text' in v_src) = 0 then
    raise exception 'hr_l3_95: the declaration did not land';
  end if;
  if position('pay_group_calendar_frequency_locked' in v_src) = 0 then
    raise exception 'hr_l3_95: the frequency refusal did not land';
  end if;
  -- hr_l3_94's guard must still be there: this migration re-emits the whole body, so losing the
  -- anchor guard here would be the exact silent-discard failure the contract row exists to catch.
  if position('pay_group_calendar_anchor_locked' in v_src) = 0 then
    raise exception 'hr_l3_95: the anchor guard was LOST in the re-emit';
  end if;
  if position('first_period_start_on = coalesce(v_anchor' in v_src) = 0 then
    raise exception 'hr_l3_95: the anchor SET-list column was LOST in the re-emit';
  end if;
  -- A CREATE OR REPLACE with a changed arity OVERLOADS rather than replaces, and PostgREST then
  -- answers PGRST203 to an ambiguous door — a silent outage.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_pay_group_upsert') <> 1 then
    raise exception 'hr_l3_95: hr_pay_group_upsert no longer resolves to one signature';
  end if;
end
$chk$;

-- ── THE CONTRACT ROW, EXTENDED (not duplicated). ─────────────────────────────────────────────────
-- 🚨 ONE CONTRACT PER FUNCTION. `hr.function_contract` is unique on
-- (schema_name, function_name, home_migration), so inserting under a new home_migration would leave
-- TWO live contracts for one function — each asserting half of what the body must contain, and
-- neither telling a later reader that the other exists. The existing row is widened instead.
update hr.function_contract
   set must_contain = array['pay_group_calendar_anchor_locked',
                            'first_period_start_on = coalesce(v_anchor',
                            'pay_group_calendar_frequency_locked'],
       reason = 'A pay group''s calendar is cut from first_period_start_on AT its pay_frequency '
             || '(SPEC-TIME §1.3) and existing periods are never re-cut, so both fields are locked '
             || 'once any period exists and both refuse BY NAME. The anchor additionally had to be '
             || 'restored to the UPDATE SET list, where its absence made edits return ok and change '
             || 'nothing. A re-emit of this function that drops any of the three restores either a '
             || 'silent data-loss door or an unguarded calendar rewrite.'
 where schema_name = 'public'
   and function_name = 'hr_pay_group_upsert'
   and is_active;
