-- HR domain, C5 / register item HRB-009, file 04a -- THREE DEFECTS THE FIXTURE SUITE CAUGHT.
--
-- The suite ran red on its first execution, 6 of 64, and every one of the three underlying causes
-- was a real defect rather than a wrong expectation. That is the gate doing its job, so the
-- failures are recorded here rather than quietly repaired.
--
-- DEFECT 1 (MIN-01) -- 🚨 A SILENT PASS ON THE ONE CLASS WHERE THE DOWNSIDE IS A CHILD-LABOR
-- VIOLATION. hr.jurisdiction_evaluate tested `jsonb_typeof(...) <> 'array'` to decide whether any
-- minors rule resolved. When NO rule resolves the path yields SQL NULL, jsonb_typeof(NULL) is
-- NULL, and `NULL <> 'array'` is NULL -- which an IF treats as false. So the function took the
-- else branch and returned `blocking_warning: false, rules_present: true` for a 16-year-old in a
-- jurisdiction with no seeded minors rule. Section 2.7 requires the opposite in the strongest
-- terms: "INCOMPLETE, not unrestricted". Fixed with coalesce. Same three-valued-logic class of
-- defect core-tranche-3 found in SPEC-DATA-MODEL 12.4's access-shutoff CHECK.
--
-- DEFECT 2 (SL-CA-01..04) -- `hr.leave.accrual_precision_decimals` is in SPEC-JURISDICTION 8's
-- configuration register and was never seeded, so every sick-leave accrual raised
-- "knob is not seeded". That raise is CORRECT behaviour (D13: a missing knob raises rather than
-- falling back to a hard-coded value) and the missing row is the defect. Seeded here, with the
-- section 8 default and basis. Note the grammar is R-CORE B1's snake_case `hr.leave`, not
-- section 8's hyphenated form.
--
-- DEFECT 3 (SNAP-01) -- the probe named a placeholder uuid as the corrected rule and
-- hr.recalculation_batch.triggering_rule_id's FK refused it. The FK is right: a correction batch
-- that cannot name the rule it corrects is not evidence of anything. The probe now corrects a
-- real rule row.
--
-- Idempotent. Applied live as migration `hr_c5_04a_fixture_defects`.

set local lock_timeout = '20s';

-- ============================================================================
-- DEFECT 2: the missing section 8 knob.
-- ============================================================================
insert into platform.feature_knob (feature, key, label, description, value_type, value, default_value,
                                   min_value, max_value, unit, set_by, basis, review_due)
select 'hr.leave','accrual_precision_decimals','Accrued balance precision',
       'How many decimal places an accrued leave balance is STORED at. Rounding happens at display and at use, never at accrual.',
       'integer','4'::jsonb,'4'::jsonb, 0, 8, 'decimal places','agent',
       'SPEC-JURISDICTION 8 and fixture SL-CA-01: 173 hours worked at 1 hour per 30 accrues 5.7666... hours. Rounding that at accrual time loses a fraction of an hour every month, permanently, in the employer''s favour. Store the full value and round only when it is shown or spent.',
       date '2027-02-26'
where not exists (select 1 from platform.feature_knob
                   where feature = 'hr.leave' and key = 'accrual_precision_decimals');

-- ============================================================================
-- DEFECT 1: hr.jurisdiction_evaluate, corrected.
-- ============================================================================
create or replace function hr.jurisdiction_evaluate(
  p_kind text, p_jurisdiction_key text, p_as_of date, p_facts jsonb, p_input jsonb,
  p_organization_id uuid, p_subject_type text default null, p_subject_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_classes text[]; v_res jsonb; v_flags jsonb := '[]'::jsonb; v_result jsonb := '{}'::jsonb;
  v_rules jsonb := '[]'::jsonb; v_money_blocked boolean := false; v_block_knob boolean;
  v_r jsonb; v_p jsonb; v_cls text; v_u text;
  -- overtime
  v_day jsonb; v_h numeric; v_reg numeric := 0; v_ot numeric := 0; v_dt numeric := 0;
  v_dth numeric; v_dmul numeric; v_dtth numeric; v_wth numeric; v_seventh jsonb;
  v_rate numeric; v_tot_hours numeric := 0; v_weekly_ot numeric;
  -- generic
  v_amount numeric; v_due date; v_next date; v_prem jsonb := '[]'::jsonb; v_n numeric;
  v_assign jsonb := '[]'::jsonb; v_exc jsonb := '[]'::jsonb; v_dec integer;
  v_start timestamptz; v_end timestamptz; v_tz text;
  v_i integer; v_acc numeric; v_sum_actual numeric := 0; v_sum_round numeric := 0; v_x numeric;
begin
  v_classes := case p_kind
    when 'overtime'                    then array['overtime','double-time']
    when 'break-premium'               then array['meal-break','rest-break','break-premium']
    when 'rounding'                    then array['rounding-bounds']
    when 'sick-leave-accrual'          then array['sick-leave-floor']
    when 'pto-carryover'               then array['pto-carryover-legality']
    when 'termination-payout'          then array['pto-payout-at-termination']
    when 'final-pay-deadline'          then array['final-pay-deadline']
    when 'predictability-pay'          then array['fair-workweek']
    when 'training-mandate-generation' then array['training-mandate']
    when 'retention-due'               then array['retention-period']
    when 'new-hire-report-due'         then array['new-hire-report-deadline']
    when 'i9-section2-due'             then array['i9-section2-deadline']
    when 'minors-restriction-check'    then array['minors-hours']
    else null end;
  if v_classes is null then
    raise exception 'unknown_calculation_kind: %', p_kind using errcode = 'P0001',
      hint = 'SPEC-JURISDICTION 4.2 lists the consequential-result kinds.';
  end if;

  v_res := hr.resolve_rules(p_subject_type, p_subject_id, p_as_of, v_classes, p_facts,
                            p_organization_id, p_jurisdiction_key);

  -- ------------------------------------------------------------------ rules_applied + flags
  for v_cls in select unnest(v_classes) loop
    for v_r in select jsonb_array_elements(coalesce(v_res#>array['resolved',v_cls,'rules'],'[]'::jsonb)) loop
      v_rules := v_rules || jsonb_build_array(jsonb_build_object(
        'class', v_cls, 'rule_id', v_r->>'rule_id', 'rule_version', v_r->>'rule_version',
        'jurisdiction_key', v_r->>'jurisdiction_key', 'status', v_r->>'status'));

      -- section 1.4: ANY consumer reading a key listed in _unverified treats that key as
      -- advisory. The flag is per KEY, so a part-verified row still gives its verified answer.
      if jsonb_typeof(v_r#>'{parameters,_unverified}') = 'array' then
        for v_u in select jsonb_array_elements_text(v_r#>'{parameters,_unverified}') loop
          v_flags := v_flags || jsonb_build_array(jsonb_build_object(
            'code','unverified_parameter','class',v_cls,'key',v_u,
            'rule_id', v_r->>'rule_id', 'jurisdiction_key', v_r->>'jurisdiction_key',
            'message', format('We have not verified "%s" for %s. It is shown for information and is not relied on.',
                              v_u, v_r->>'jurisdiction_key')));
        end loop;
      end if;
    end loop;
  end loop;

  -- 🚨 THE ADVISORY-NEVER-MONEY GATE, COMPUTED ONCE.
  v_block_knob := (hr._knob('hr.jurisdiction_rules','advisory_rules_block_money'))::text = 'true';
  if v_block_knob then
    for v_cls in select unnest(v_classes) loop
      if exists (select 1 from hr.jurisdiction_rule_class rc
                  where rc.slug = v_cls and rc.produces_money)
         and exists (select 1 from jsonb_array_elements(
                       coalesce(v_res#>array['resolved',v_cls,'rules'],'[]'::jsonb)) x
                      where x->>'status' = 'advisory') then
        v_money_blocked := true;
        v_flags := v_flags || jsonb_build_array(jsonb_build_object(
          'code','advisory_rule','class',v_cls,
          'rule_id', (select x->>'rule_id' from jsonb_array_elements(
                        v_res#>array['resolved',v_cls,'rules']) x
                       where x->>'status'='advisory' limit 1),
          'jurisdiction_key', p_jurisdiction_key,
          'message', format('The %s rule for this jurisdiction is not yet verified, so we will not '
                         || 'calculate an amount from it. The situation is flagged for review.', v_cls)));
      end if;
    end loop;
  end if;

  -- ==================================================================== OVERTIME
  if p_kind = 'overtime' then
    v_rate := (p_input->>'regular_rate')::numeric;
    -- AR 1.6: two concurrent positions at different rates -> the WEIGHTED-AVERAGE regular rate
    -- of all rates worked that week, never one position's rate.
    if jsonb_typeof(p_input->'positions') = 'array' then
      select sum((x->>'hours')::numeric * (x->>'rate')::numeric) / nullif(sum((x->>'hours')::numeric),0)
        into v_rate from jsonb_array_elements(p_input->'positions') x;
      v_rate := round(v_rate, 4);
    end if;

    -- daily legs first, from whichever rule carries them
    select max((x#>>'{parameters,daily_threshold_hours}')::numeric)
      into v_dth from jsonb_array_elements(coalesce(v_res#>'{resolved,overtime,rules}','[]'::jsonb)) x
     where (x#>>'{parameters,daily_threshold_hours}') is not null;
    select max(coalesce((x#>>'{parameters,daily_multiplier}')::numeric,
                        (x#>>'{parameters,multiplier}')::numeric))
      into v_dmul from jsonb_array_elements(coalesce(v_res#>'{resolved,overtime,rules}','[]'::jsonb)) x
     where (x#>>'{parameters,daily_threshold_hours}') is not null;
    select max((x#>>'{parameters,daily_threshold_hours}')::numeric)
      into v_dtth from jsonb_array_elements(coalesce(v_res#>'{resolved,double-time,rules}','[]'::jsonb)) x;
    select max(coalesce((x#>>'{parameters,weekly_threshold_hours}')::numeric,
                        (x#>>'{parameters,threshold_hours}')::numeric))
      into v_wth from jsonb_array_elements(coalesce(v_res#>'{resolved,overtime,rules}','[]'::jsonb)) x;
    select x->'parameters'->'seventh_consecutive_day'
      into v_seventh from jsonb_array_elements(coalesce(v_res#>'{resolved,overtime,rules}','[]'::jsonb)) x
     where jsonb_typeof(x#>'{parameters,seventh_consecutive_day}') = 'object' limit 1;

    for v_day in select jsonb_array_elements(coalesce(p_input->'workdays','[]'::jsonb)) loop
      v_h := (v_day->>'hours')::numeric;
      v_tot_hours := v_tot_hours + v_h;

      if v_seventh is not null and coalesce((v_day->>'consecutive_day_index')::integer, 0) = 7 then
        -- the 7th-consecutive-day regime replaces the ordinary daily legs for that day
        v_ot := v_ot + least(v_h, (v_seventh->>'first_hours')::numeric);
        v_dt := v_dt + greatest(v_h - (v_seventh->>'first_hours')::numeric, 0);
      else
        if v_dtth is not null and v_h > v_dtth then
          v_dt := v_dt + (v_h - v_dtth);
          v_h := v_dtth;
        end if;
        if v_dth is not null and v_h > v_dth then
          v_ot := v_ot + (v_h - v_dth);
          v_h := v_dth;
        end if;
        v_reg := v_reg + v_h;
      end if;
    end loop;

    -- 🚨 NO PYRAMIDING (section 2.5): only hours NOT ALREADY CARRYING A PREMIUM count toward the
    -- weekly threshold. A four-day week of 10-hour days in California yields 8 daily-OT hours and
    -- ZERO additional weekly-OT hours, because those 8 already carry a premium and the remaining
    -- 32 do not reach 40. The engine computes each rule's schedule over the same hours and takes
    -- the greatest premium PER HOUR -- never the sum.
    if v_wth is not null and v_reg > v_wth then
      v_weekly_ot := v_reg - v_wth;
      v_ot := v_ot + v_weekly_ot;
      v_reg := v_wth;
    end if;

    v_result := jsonb_build_object(
      'hours', jsonb_build_object('regular', v_reg, 'ot_1_5', v_ot, 'dt_2_0', v_dt),
      'total_hours', v_tot_hours);
    if v_rate is not null then
      v_result := v_result || jsonb_build_object('regular_rate', round(v_rate,4));
      if not v_money_blocked then
        v_result := v_result || jsonb_build_object(
          'premium_amount', round(v_ot * v_rate * 0.5 + v_dt * v_rate * 1.0, 2));
      end if;
    end if;
    -- AR 1.5: overtime is computed on the WHOLE WORKWEEK and attributed to the pay period that
    -- contains the workweek's END date, never to either period's subtotal.
    if (p_input->>'workweek_end_date') is not null and jsonb_typeof(p_input->'pay_periods') = 'array' then
      v_result := v_result || jsonb_build_object('attributed_pay_period_key', (
        select x->>'key' from jsonb_array_elements(p_input->'pay_periods') x
         where (p_input->>'workweek_end_date')::date between (x->>'from')::date and (x->>'to')::date
         limit 1));
    end if;

  -- ==================================================================== BREAK PREMIUM
  elsif p_kind = 'break-premium' then
    v_rate := (p_input->>'regular_rate')::numeric;
    v_h := (p_input->>'shift_hours')::numeric;
    v_p := (select x->'parameters' from jsonb_array_elements(
              coalesce(v_res#>'{resolved,break-premium,rules}','[]'::jsonb)) x limit 1);

    -- meal leg
    if jsonb_typeof(v_res#>'{resolved,meal-break,rules}') = 'array' and v_p is not null then
      v_n := (select max((x#>>'{parameters,first_meal,required_before_end_of_hour}')::numeric)
                from jsonb_array_elements(v_res#>'{resolved,meal-break,rules}') x);
      if v_n is not null and v_h > v_n - 1 then
        if coalesce((p_input->>'meal_taken')::boolean, false) = false
           or coalesce((p_input->>'worked_through_meal')::boolean, false) then
          v_prem := v_prem || jsonb_build_array(jsonb_build_object(
            'code','meal_premium','hours', (v_p#>>'{meal,hours_of_pay}')::numeric,
            'rate_basis', v_p#>>'{meal,rate}'));
        elsif (p_input->>'meal_start_hour') is not null
              and (p_input->>'meal_start_hour')::numeric > v_n - 1 then
          v_prem := v_prem || jsonb_build_array(jsonb_build_object(
            'code','meal_premium','hours', (v_p#>>'{meal,hours_of_pay}')::numeric,
            'rate_basis', v_p#>>'{meal,rate}'));
        end if;
      end if;
    end if;

    -- rest leg -- capped PER RULE, and independent of the meal leg (AR 1.9)
    if jsonb_typeof(v_res#>'{resolved,rest-break,rules}') = 'array' and v_p is not null
       and coalesce((p_input->>'rest_breaks_missed')::numeric, 0) > 0 then
      v_prem := v_prem || jsonb_build_array(jsonb_build_object(
        'code','rest_premium',
        'hours', least(coalesce((p_input->>'rest_breaks_missed')::numeric,0),
                       (v_p#>>'{rest,max_per_day}')::numeric) * (v_p#>>'{rest,hours_of_pay}')::numeric,
        'rate_basis', v_p#>>'{rest,rate}'));
    end if;

    if v_rate is not null and not v_money_blocked then
      select jsonb_agg(x || jsonb_build_object('amount', round((x->>'hours')::numeric * v_rate, 2)))
        into v_prem from jsonb_array_elements(v_prem) x;
    end if;

    v_result := jsonb_build_object('premiums', coalesce(v_prem,'[]'::jsonb),
                                   'premium_count', jsonb_array_length(coalesce(v_prem,'[]'::jsonb)));
    -- CAPABILITY-SCOPE 3: time worked THROUGH a meal break counts toward hours worked AND toward
    -- overtime, in addition to the premium. The premium does not buy the hours.
    if coalesce((p_input->>'worked_through_meal')::boolean, false) then
      v_result := v_result || jsonb_build_object(
        'hours_worked', v_h, 'meal_minutes_count_as_worked', true);
    end if;

  -- ==================================================================== ROUNDING (property)
  elsif p_kind = 'rounding' then
    v_n := coalesce((p_input->>'n')::numeric, 1000);
    v_dec := coalesce((p_input->>'increment_minutes')::integer, 15);
    -- a deterministic generator, so the property assertion is reproducible rather than flaky
    for v_i in 1 .. v_n::integer loop
      v_x := ((v_i * 37 + 11) % (v_dec * 4))::numeric + ((v_i * 13 + 7) % 60)::numeric / 60.0;
      v_sum_actual := v_sum_actual + v_x;
      v_sum_round := v_sum_round + round(v_x / v_dec) * v_dec;
    end loop;
    v_result := jsonb_build_object(
      'n', v_n, 'increment_minutes', v_dec,
      'signed_bias_minutes', round(v_sum_round - v_sum_actual, 4),
      'abs_diff_minutes', round(abs(v_sum_round - v_sum_actual), 4),
      'mean_abs_bias_per_interval', round(abs(v_sum_round - v_sum_actual) / v_n, 6),
      'within_tolerance', abs(v_sum_round - v_sum_actual) / v_n <= v_dec / 2.0,
      'biased_negative', (v_sum_round - v_sum_actual) < -(v_dec::numeric * v_n / 100.0));

  -- ==================================================================== SICK LEAVE
  elsif p_kind = 'sick-leave-accrual' then
    v_dec := (hr._knob('hr.leave','accrual_precision_decimals'))::text::integer;
    v_p := (select x->'parameters' from jsonb_array_elements(
              coalesce(v_res#>'{resolved,sick-leave-floor,rules}','[]'::jsonb)) x
             where jsonb_typeof(x#>'{parameters,accrual}') = 'object' limit 1);
    if v_p is null then
      -- section 2.7: no statutory floor -- the org's own policy governs UNCLAMPED.
      v_result := jsonb_build_object('statutory_floor', false, 'basis', 'org policy governs unclamped');
    else
      if (p_input->>'hours_worked') is not null then
        v_acc := (p_input->>'hours_worked')::numeric * (v_p#>>'{accrual,hours_earned}')::numeric
                 / (v_p#>>'{accrual,per_hours_worked}')::numeric;
        -- SL-CA-01: stored at full precision, rounded only at display and at use.
        v_result := v_result || jsonb_build_object('accrued_hours', round(v_acc, v_dec));
      end if;
      if (p_input->>'days_since_hire') is not null then
        v_result := v_result || jsonb_build_object(
          'use_permitted', (p_input->>'days_since_hire')::numeric
                           >= (v_p->>'use_permitted_after_days')::numeric,
          'use_permitted_after_days', (v_p->>'use_permitted_after_days')::numeric,
          'accrual_began', v_p->>'accrual_begins');
        if (p_input->>'days_since_hire')::numeric < (v_p->>'use_permitted_after_days')::numeric then
          v_result := v_result || jsonb_build_object('refusal_reason','use_permitted_after_days');
        end if;
      end if;
      -- AR 1.8 / AR 1.1: reinstatement is onto the SECOND EMPLOYMENT SPELL, never the person.
      if (p_input->>'months_since_termination') is not null then
        v_result := v_result || jsonb_build_object(
          'reinstated', (p_input->>'months_since_termination')::numeric
                        <= (v_p->>'rehire_reinstatement_within_months')::numeric,
          'reinstatement_window_months', (v_p->>'rehire_reinstatement_within_months')::numeric,
          'balance', case when (p_input->>'months_since_termination')::numeric
                               <= (v_p->>'rehire_reinstatement_within_months')::numeric
                          then (p_input->>'unused_balance')::numeric else 0 end,
          'reinstated_onto', 'second_employment_spell');
      end if;
      v_result := v_result || jsonb_build_object('statutory_floor', true);
    end if;

  -- ==================================================================== TERMINATION PAYOUT
  elsif p_kind = 'termination-payout' then
    v_p := (select x->'parameters' from jsonb_array_elements(
              coalesce(v_res#>'{resolved,pto-payout-at-termination,rules}','[]'::jsonb)) x
             order by case x->>'level' when 'city' then 0 when 'county' then 1
                                       when 'state' then 2 else 3 end limit 1);
    v_result := jsonb_build_object(
      'statutory_required', coalesce((v_p->>'required')::boolean, false));
    if coalesce((v_p->>'required')::boolean, false) then
      if v_money_blocked then
        v_result := v_result || jsonb_build_object('payout_amount', null,
          'basis','a payout is owed here, but the rule that says so is not yet verified, so the amount is not computed');
      else
        v_result := v_result || jsonb_build_object(
          'payout_amount', round((p_input->>'accrued_hours')::numeric
                                 * (p_input->>'final_rate')::numeric, 2),
          'rate_basis', v_p->>'rate', 'scope', v_p->>'scope');
      end if;
    else
      -- section 2.7: "no statutory payout obligation; the org's own policy governs." A $0 payout
      -- STILL writes a snapshot -- "we checked and nothing was owed" is the evidence a customer
      -- will need (section 4.2).
      v_result := v_result || jsonb_build_object('payout_amount', 0,
        'basis','no statutory payout obligation; org policy governs');
    end if;

  -- ==================================================================== FINAL PAY DEADLINE
  elsif p_kind = 'final-pay-deadline' then
    v_r := (select x from jsonb_array_elements(
              coalesce(v_res#>'{resolved,final-pay-deadline,rules}','[]'::jsonb)) x
             order by case x->>'level' when 'city' then 0 when 'county' then 1
                                       when 'state' then 2 else 3 end limit 1);
    v_p := v_r->'parameters';
    v_start := (p_input->>'termination_at')::timestamptz;
    if v_r->>'status' = 'advisory' then
      -- section 5.4: until a state's row is active the flow shows the advisory federal fallback
      -- AND AN EXPLICIT BANNER naming the state as unverified. It does not present a confident
      -- wrong date.
      v_result := jsonb_build_object(
        'deadline_at', null, 'confident', false, 'banner', 'unverified_jurisdiction',
        'fallback_deadline', coalesce(v_p->>'deadline', v_p#>>'{involuntary,deadline}'),
        'message', format('We have not yet verified the final-pay deadline for %s. The customary '
                       || 'fallback is the next regular payday, but treat that as guidance and check '
                       || 'your state''s rule.', p_jurisdiction_key));
    else
      case p_input->>'termination_type'
        when 'involuntary' then
          v_result := jsonb_build_object('deadline_at', v_start, 'confident', true,
            'deadline_basis', v_p#>>'{involuntary,deadline}');
        when 'voluntary_no_notice' then
          v_result := jsonb_build_object(
            'deadline_at', v_start + make_interval(hours => (v_p#>>'{voluntary_without_notice,hours}')::integer),
            'confident', true, 'deadline_basis',
            format('%s hours', v_p#>>'{voluntary_without_notice,hours}'));
        when 'voluntary_with_notice' then
          v_result := jsonb_build_object('deadline_at', v_start, 'confident', true,
            'deadline_basis', v_p#>>'{voluntary_with_notice_hours_gte,deadline}');
        else
          v_result := jsonb_build_object('deadline_at', null, 'confident', false,
            'message','unknown termination type');
      end case;
      if jsonb_typeof(v_p->'penalty') = 'object' then
        v_result := v_result || jsonb_build_object('penalty', v_p->'penalty');
      end if;
      if (v_result->>'deadline_at') is not null then
        v_result := v_result || jsonb_build_object('deadline_offset_hours',
          round(extract(epoch from ((v_result->>'deadline_at')::timestamptz - v_start)) / 3600.0, 4));
      end if;
    end if;

  -- ==================================================================== PREDICTABILITY PAY
  elsif p_kind = 'predictability-pay' then
    v_r := (select x from jsonb_array_elements(
              coalesce(v_res#>'{resolved,fair-workweek,rules}','[]'::jsonb)) x limit 1);
    if v_r is null then
      v_result := jsonb_build_object('covered', false,
        'basis','the establishment is not covered by a predictive-scheduling ordinance');
    else
      v_result := jsonb_build_object('covered', true,
        'ordinance_jurisdiction', v_r->>'jurisdiction_key',
        'advance_notice_days', v_r#>'{parameters,advance_notice_days}',
        'days_notice_given', (p_input->>'days_notice')::numeric);
      if v_money_blocked then
        -- section 5.5, verbatim intent: the scheduler says the change may owe predictability pay
        -- and that the amount is not yet configured. A fabricated dollar figure would be worse
        -- than this sentence in every direction.
        v_result := v_result || jsonb_build_object(
          'predictability_pay_amount', null, 'change_flagged', true,
          'message', format('This change is within the notice window for %s — predictability pay may '
                         || 'be owed; the amount is not yet configured for this jurisdiction.',
                            v_r->>'jurisdiction_key'));
      else
        v_result := v_result || jsonb_build_object('change_flagged', true,
          'predictability_pay_schedule', v_r#>'{parameters,predictability_pay,schedule}');
      end if;
    end if;

  -- ==================================================================== TRAINING MANDATES
  elsif p_kind = 'training-mandate-generation' then
    -- ADDITIVE (section 2.5): every surviving candidate is an INDEPENDENT obligation. They do
    -- not merge, and the most protective one does not swallow the others.
    for v_r in select jsonb_array_elements(
                 coalesce(v_res#>'{resolved,training-mandate,rules}','[]'::jsonb)) loop
      v_p := v_r->'parameters';
      if (v_p->>'cadence_months') is null then
        -- section 5.7: a null cadence generates NO assignment and raises ONE compliance exception
        -- per jurisdiction telling the org that a mandate exists and is not yet configured.
        v_exc := v_exc || jsonb_build_array(jsonb_build_object(
          'code','training_mandate_unconfigured',
          'jurisdiction_key', v_r->>'jurisdiction_key', 'rule_id', v_r->>'rule_id',
          'message', format('%s requires %s training, but we do not yet know how often it must be '
                         || 'repeated. No assignment was created. Check your state''s requirement.',
                            v_r->>'jurisdiction_key', v_p->>'program')));
      else
        v_due := (coalesce((p_input->>'event_date')::date, p_as_of)
                  + make_interval(months => coalesce((v_p->>'initial_due_within_months')::integer,
                                                     (v_p->>'cadence_months')::integer)))::date;
        v_next := (v_due + make_interval(months => (v_p->>'cadence_months')::integer))::date;
        v_assign := v_assign || jsonb_build_array(jsonb_build_object(
          'jurisdiction_key', v_r->>'jurisdiction_key', 'rule_id', v_r->>'rule_id',
          'program', v_p->>'program',
          'hours', case when coalesce((p_facts->>'is_supervisor')::boolean, false)
                        then v_p->'supervisor_hours' else v_p->'non_supervisor_hours' end,
          'hours_unverified', (v_r#>'{parameters,_unverified}') @> (
             case when coalesce((p_facts->>'is_supervisor')::boolean,false)
                  then '["supervisor_hours"]'::jsonb else '["non_supervisor_hours"]'::jsonb end),
          'due_date', v_due, 'next_due_date', v_next,
          'cadence_months', (v_p->>'cadence_months')::integer,
          'trigger', p_input->>'event'));
      end if;
    end loop;
    v_result := jsonb_build_object('assignments', v_assign, 'compliance_exceptions', v_exc,
                                   'assignment_count', jsonb_array_length(v_assign),
                                   'exception_count', jsonb_array_length(v_exc));

  -- ==================================================================== RETENTION
  elsif p_kind = 'retention-due' then
    v_p := (select x->'parameters' from jsonb_array_elements(
              coalesce(v_res#>'{resolved,retention-period,rules}','[]'::jsonb)) x
             where x#>>'{parameters,record_class}' = (p_input->>'record_class') limit 1);
    if v_p is null then
      v_result := jsonb_build_object('due_date', null,
        'basis','no retention rule for this record class; ABSENCE NEVER AUTHORIZES DESTRUCTION');
    elsif (v_p->>'rule') = 'later_of' then
      select max((case x->>'trigger'
                    when 'hire_date' then (p_input->>'hire_date')::date
                    when 'termination_date' then (p_input->>'termination_date')::date
                    else null end + make_interval(years => (x->>'years')::integer))::date)
        into v_due from jsonb_array_elements(v_p->'terms') x;
      v_result := jsonb_build_object('due_date', v_due, 'rule','later_of',
                                     'storage', v_p->>'storage');
    else
      v_due := ((case v_p->>'trigger'
                   when 'hire_date' then (p_input->>'hire_date')::date
                   when 'termination_date' then (p_input->>'termination_date')::date
                   else coalesce((p_input->>'record_created')::date, p_as_of) end)
                + make_interval(years => (v_p->>'years')::integer))::date;
      v_result := jsonb_build_object('due_date', v_due, 'rule','single_term');
    end if;

    -- section 4.6: the RATCHET. A shortened rule never authorizes destroying records already
    -- under a longer clock, and a legal hold blocks disposition outright.
    if coalesce((p_input->>'legal_hold')::boolean, false) then
      v_result := v_result || jsonb_build_object(
        'disposition_permitted', false, 'refusal_reason','legal_hold',
        'legal_hold_ref', p_input->>'legal_hold_ref',
        'message','This record is under a legal hold and cannot be destroyed, even though its retention clock has expired.');
    elsif (p_input->>'existing_due') is not null
          and v_due is not null and (p_input->>'existing_due')::date > v_due then
      v_result := v_result || jsonb_build_object(
        'disposition_permitted', false, 'refusal_reason','retention_ratchet',
        'effective_due_date', (p_input->>'existing_due')::date,
        'message','A retention clock may only be extended, never shortened. The longer existing clock stands.');
    else
      v_result := v_result || jsonb_build_object('disposition_permitted', true);
    end if;

  -- ==================================================================== NEW HIRE REPORT
  elsif p_kind = 'new-hire-report-due' then
    v_r := (select x from jsonb_array_elements(
              coalesce(v_res#>'{resolved,new-hire-report-deadline,rules}','[]'::jsonb)) x
             where (x#>>'{parameters,days}') is not null
             order by (x#>>'{parameters,days}')::numeric limit 1);
    if v_r is null then
      v_result := jsonb_build_object('due_date', null, 'confident', false);
    else
      v_p := v_r->'parameters';
      v_due := (p_input->>'hire_date')::date + ((v_p->>'days')::integer);
      v_result := jsonb_build_object('due_date', v_due, 'day_type', v_p->>'day_type',
        'confident', (v_r->>'status') = 'active', 'requires', v_p->'requires',
        'rule_jurisdiction', v_r->>'jurisdiction_key');
    end if;

  -- ==================================================================== I-9
  elsif p_kind = 'i9-section2-due' then
    v_r := (select x from jsonb_array_elements(
              coalesce(v_res#>'{resolved,i9-section2-deadline,rules}','[]'::jsonb)) x limit 1);
    if v_r is null then
      -- I9-FED-04: a contractor engagement carries no I-9 obligation, the rule's applicability
      -- excludes them, and the TRACE says so (D8 gates employee-only machinery off).
      v_result := jsonb_build_object('applies', false,
        'basis','no I-9 obligation for this worker class');
    else
      v_p := v_r->'parameters';
      v_result := jsonb_build_object('applies', true,
        'section1_due_date', (p_input->>'hire_date')::date,
        'section1_basis', v_p#>>'{section1,deadline}',
        'section2_due_date', hr._add_business_days(
            (p_input->>'hire_date')::date, (v_p#>>'{section2,days}')::integer,
            coalesce((select array_agg(d::date) from jsonb_array_elements_text(
                        coalesce(p_input->'federal_holidays','[]'::jsonb)) d), '{}'::date[]),
            coalesce((v_p#>>'{section2,hire_date_counts_as_day_zero}')::boolean, false)),
        'section2_day_type', v_p#>>'{section2,day_type}',
        'business_day_calendar', 'federal',
        -- I9-FED-03: an EMPLOYER'S CLOSURE DOES NOT MOVE A FEDERAL DEADLINE. The org's own
        -- hr.holiday_calendar is deliberately not consulted, and that is stated in the output.
        'org_holiday_calendar_consulted', false);
      if coalesce((p_input->>'receipt_recorded')::boolean, false) then
        v_result := v_result || jsonb_build_object(
          'receipt_replacement_due_date', null, 'receipt_flagged', true,
          'message','A receipt was recorded. We have not verified how long the replacement window is, so no replacement deadline is calculated.');
      end if;
      if coalesce((p_input->>'rehire')::boolean, false) then
        v_result := v_result || jsonb_build_object(
          'rehire_reuse_eligible', null, 'rehire_flagged', true,
          'checked_against', 'second_employment_spell',
          'message','This person was employed before. Reusing the original I-9 with Supplement B may be an option; we have not verified the reuse window, so this is flagged rather than asserted.');
      end if;
    end if;

  -- ==================================================================== MINORS
  elsif p_kind = 'minors-restriction-check' then
    -- 🚨 coalesce IS THE FIX, and its absence was a REAL silent pass. jsonb_typeof(NULL) is
    -- NULL, and `NULL <> 'array'` is NULL, which an IF treats as false -- so a jurisdiction with
    -- NO minors rule fell through to the else branch and reported blocking_warning = false for a
    -- 16-year-old. That is precisely the silent pass section 2.7 exists to prevent, and it is the
    -- same three-valued-logic class of defect core-tranche-3 found in SPEC-DATA-MODEL 12.4.
    if coalesce(jsonb_typeof(v_res#>'{resolved,minors-hours,rules}'), 'absent') <> 'array'
       or jsonb_array_length(coalesce(v_res#>'{resolved,minors-hours,rules}', '[]'::jsonb)) = 0 then
      -- section 2.7: INCOMPLETE, not "unrestricted". The one class where the downside of a silent
      -- pass is a child-labor violation, so the scheduler gets a BLOCKING warning.
      v_result := jsonb_build_object(
        'blocking_warning', coalesce((p_facts->>'worker_age_years')::numeric, 99) < 18,
        'reason','no_minors_rule_seeded',
        'message','This worker is under 18 and we do not yet hold the hour rules for this jurisdiction. Have someone confirm the schedule is lawful before publishing it.');
    else
      v_result := jsonb_build_object('blocking_warning', false, 'rules_present', true);
    end if;
  end if;

  return jsonb_build_object(
    'kind', p_kind,
    'result', v_result,
    'rules_applied', v_rules,
    'flags', v_flags,
    'incomplete', v_res->'incomplete',
    'no_rule', v_res->'no_rule',
    'advisory', v_res->'advisory',
    'money_withheld', v_money_blocked,
    'resolution', v_res);
end
$fn$;
-- ============================================================================
-- DEFECT 3: hr._run_fixture_probe, corrected.
-- ============================================================================
create or replace function hr._run_fixture_probe(p_probe text, p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_obs jsonb := '{}'::jsonb;
  v_cls uuid; v_rule uuid; v_rule2 uuid; v_snap uuid; v_snap2 uuid; v_batch uuid; v_res jsonb;
  v_n integer; v_txt text; v_ver integer;
begin
  perform set_config('hr.privileged_write','on', true);
  begin
    if p_probe = 'jurisdiction_mismatch' then
      -- OT-JUR-01: a March workweek recomputed in October must resolve the STAMPED key.
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{}'::jsonb,'automation', null, null, '[]'::jsonb, true);
      begin
        perform hr.resolve_rules('hr_calculation_snapshot', v_snap, date '2026-03-16',
                 array['overtime'], '{"flsa_status":"non_exempt","worker_class":"employee"}'::jsonb,
                 v_org, 'US-TX');
        v_obs := v_obs || '{"refused": false}'::jsonb;
      exception when others then
        v_obs := v_obs || jsonb_build_object('refused', sqlerrm like 'jurisdiction_key_mismatch%',
                                             'error', split_part(sqlerrm, ':', 1));
      end;
      v_res := hr.resolve_rules('hr_calculation_snapshot', v_snap, date '2026-03-16',
                array['overtime'], '{"flsa_status":"non_exempt","worker_class":"employee"}'::jsonb,
                v_org, null);
      v_obs := v_obs || jsonb_build_object('stamped_key_used', v_res->>'jurisdiction_key');

    elsif p_probe = 'preemption' then
      -- FW-PRE-01: a hypothetical Michigan city ordinance is removed by the preemption pass.
      insert into hr.jurisdiction (organization_id, key, level, parent_key, name, visibility)
      values (v_sys,'US-MI-PROBE_CITY','city','US-MI','Probe City','public'::platform.visibility);
      select id into v_cls from hr.jurisdiction_rule_class where slug = 'fair-workweek';
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, parameters, status, basis, citation, source_scope)
      values (v_sys,'public'::platform.visibility, v_cls,'US-MI-PROBE_CITY', date '1900-01-01',
        '{"advance_notice_days":14}'::jsonb,'advisory',
        'Probe row: a hypothetical local ordinance in a preemption state, to prove the preemption pass removes it.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'statutory')
      returning id into v_rule;
      v_res := hr.resolve_rules(null, null, date '2026-03-16', array['fair-workweek'],
                 '{}'::jsonb, v_sys, 'US-MI-PROBE_CITY');
      select t->>'outcome' into v_txt
        from jsonb_array_elements(v_res->'trace') t where (t->>'rule_id')::uuid = v_rule;
      v_obs := jsonb_build_object(
        'city_outcome', v_txt,
        'preempted', v_txt = 'preempted',
        'reason_names_state_rule', (select t->>'reason' like '%US-MI%'
                                      from jsonb_array_elements(v_res->'trace') t
                                     where (t->>'rule_id')::uuid = v_rule),
        'covered', jsonb_typeof(v_res#>'{resolved,fair-workweek,rules}') = 'array');

    elsif p_probe in ('org_override_more_generous','org_override_clamped') then
      select id into v_cls from hr.jurisdiction_rule_class where slug = 'sick-leave-floor';
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, parameters, status, basis, citation, source_scope)
      values (v_org,'internal'::platform.visibility, v_cls,'US-CA', date '1900-01-01',
        case when p_probe = 'org_override_more_generous'
             then '{"accrual":{"method":"per_hours_worked","hours_earned":1,"per_hours_worked":20},"use_permitted_after_days":30,"carryover":{"required":true}}'::jsonb
             else '{"accrual":{"method":"per_hours_worked","hours_earned":1,"per_hours_worked":40},"use_permitted_after_days":120,"carryover":{"required":true}}'::jsonb end,
        'active',
        'Probe row: an organization policy row, to prove the override rung and the runtime clamp.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'org_policy')
      returning id into v_rule;
      v_res := hr.resolve_rules(null, null, date '2026-03-16', array['sick-leave-floor'],
                 '{}'::jsonb, v_org, 'US-CA');
      v_obs := jsonb_build_object(
        'org_rule_applied', exists (select 1 from jsonb_array_elements(v_res#>'{resolved,sick-leave-floor,rules}') x
                                     where (x->>'rule_id')::uuid = v_rule),
        'system_row_outcome', (select t->>'outcome' from jsonb_array_elements(v_res->'trace') t
                                where t->>'class' = 'sick-leave-floor'
                                  and (t->>'rule_id')::uuid <> v_rule limit 1),
        'clamp_count', jsonb_array_length(v_res->'clamps'),
        'applied_per_hours_worked', (select x#>'{parameters,accrual,per_hours_worked}'
                                       from jsonb_array_elements(v_res#>'{resolved,sick-leave-floor,rules}') x
                                      where (x->>'rule_id')::uuid = v_rule));
      if p_probe = 'org_override_clamped' then
        v_snap := hr.write_calculation_snapshot(v_org,'hr_leave_ledger', gen_random_uuid(),
          'sick-leave-accrual','US-CA', date '2026-03-16','accrual_engine','probe', v_res,
          '{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'automation');
        select clamps into v_res from hr.calculation_snapshot where id = v_snap;
        select count(*) into v_n from ops.system_error
         where kind = 'hr_compliance_exception_pending' and error_type = 'org_config_below_statutory_floor';
        v_obs := v_obs || jsonb_build_object(
          'snapshot_clamps_recorded', jsonb_array_length(v_res),
          'compliance_exception_raised', v_n > 0);
      end if;

    elsif p_probe = 'missing_fact' then
      -- RES-02: a rule whose applicability names a fact the caller omitted is never treated as unmet.
      select id into v_cls from hr.jurisdiction_rule_class where slug = 'training-mandate';
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, applicability, parameters, status, basis, citation, source_scope)
      values (v_org,'internal'::platform.visibility, v_cls,'US-CA', date '1900-01-01',
        '[{"fact":"employer_fte_avg_prior_year","op":"gte","value":50}]'::jsonb,
        '{"program":"probe_program","cadence_months":12}'::jsonb,'active',
        'Probe row: an applicability fact the caller will not supply, to prove the incomplete path.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'org_policy')
      returning id into v_rule;
      begin
        perform hr.resolve_rules(null, null, date '2026-03-16', array['training-mandate'],
                  '{}'::jsonb, v_org, 'US-CA');
        v_obs := v_obs || '{"raised_under_fail": false}'::jsonb;
      exception when others then
        v_obs := v_obs || jsonb_build_object('raised_under_fail', sqlerrm like 'missing_applicability_fact%',
                                             'named_fact', sqlerrm like '%employer_fte_avg_prior_year%');
      end;
      update platform.feature_knob set value = '"flag"'::jsonb
       where feature = 'hr.jurisdiction_rules' and key = 'missing_fact_behavior';
      v_res := hr.resolve_rules(null, null, date '2026-03-16', array['training-mandate'],
                 '{}'::jsonb, v_org, 'US-CA');
      v_obs := v_obs || jsonb_build_object(
        'incomplete_under_flag', v_res->'incomplete' @> jsonb_build_array(
          jsonb_build_object('class','training-mandate','fact','employer_fte_avg_prior_year','rule_id', v_rule)),
        'silently_unmet', false);

    elsif p_probe = 'amendment_as_of' then
      -- RES-05: a rule amended effective 2026-07-01; a 2026-06-15 work date resolves the OLD row.
      select id into v_cls from hr.jurisdiction_rule_class where slug = 'training-mandate';
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, effective_to, parameters, status, basis, citation, source_scope)
      values (v_org,'internal'::platform.visibility, v_cls,'US-NV', date '1900-01-01', date '2026-07-01',
        '{"program":"probe_program","cadence_months":12}'::jsonb,'active',
        'Probe row: the pre-amendment rule, retained so a past work date still resolves it byte-identically.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'org_policy')
      returning id into v_rule;
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, parameters, status, basis, citation, source_scope, supersedes_id)
      values (v_org,'internal'::platform.visibility, v_cls,'US-NV', date '2026-07-01',
        '{"program":"probe_program","cadence_months":24}'::jsonb,'active',
        'Probe row: the amendment. New effective_from, supersedes_id set, and it cannot reach backwards.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'org_policy', v_rule)
      returning id into v_rule2;
      v_obs := jsonb_build_object(
        'before_amendment_cadence', (hr.resolve_rules(null,null, date '2026-06-15',
           array['training-mandate'],'{}'::jsonb, v_org,'US-NV')#>'{resolved,training-mandate,rules,0,parameters,cadence_months}'),
        'after_amendment_cadence', (hr.resolve_rules(null,null, date '2026-08-15',
           array['training-mandate'],'{}'::jsonb, v_org,'US-NV')#>'{resolved,training-mandate,rules,0,parameters,cadence_months}'),
        'old_row_retained', exists (select 1 from hr.jurisdiction_rule where id = v_rule and deleted_at is null));

    elsif p_probe = 'snapshot_correction' then
      -- SNAP-01: a correction enumerates affected snapshots and opens a PROPOSED batch. It never
      -- supersedes a snapshot itself.
      -- the triggering rule must be a REAL row: recalculation_batch.triggering_rule_id carries an
      -- FK to hr.jurisdiction_rule, so a placeholder uuid is refused. Correct, and worth keeping:
      -- a correction batch that cannot name the rule it corrects is not evidence of anything.
      select r.id, r.version into v_rule, v_ver
        from hr.jurisdiction_rule r join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
       where rc.slug = 'overtime' and r.jurisdiction_key = 'US-CA' and r.deleted_at is null limit 1;
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe',
        jsonb_build_object('resolved', jsonb_build_object('overtime', jsonb_build_object('rules',
          jsonb_build_array(jsonb_build_object('rule_id', v_rule,'rule_version', v_ver))))),
        '{}'::jsonb,'{}'::jsonb,'{"hours":{"ot_1_5":4}}'::jsonb,'automation');
      -- the section 4.4 enumeration query, on the GIN jsonb_path_ops index over `resolution`
      select count(*) into v_n from hr.calculation_snapshot
       where resolution @> jsonb_build_object('resolved', jsonb_build_object('overtime',
               jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('rule_id', v_rule)))));
      insert into hr.recalculation_batch (organization_id, visibility, trigger, triggering_rule_id,
        triggering_rule_version, reason, scope, state)
      values (v_org,'personal'::platform.visibility,'rule_correction', v_rule, v_ver,
        'Probe: we had the rule wrong and the corrected value changes results already computed under it.',
        jsonb_build_object('date_range', jsonb_build_array('2026-03-01','2026-03-31'),
                           'calculation_kinds', jsonb_build_array('overtime')),'proposed')
      returning id into v_batch;
      v_obs := jsonb_build_object(
        'affected_snapshots_found', v_n,
        'batch_state', (select state from hr.recalculation_batch where id = v_batch),
        'nothing_superseded', (select superseded_by_id is null from hr.calculation_snapshot where id = v_snap),
        'original_outputs_untouched', (select outputs from hr.calculation_snapshot where id = v_snap)
                                      = '{"hours":{"ot_1_5":4}}'::jsonb);

    elsif p_probe = 'snapshot_supersede' then
      -- SNAP-02: recompute inside an open pay period -- new snapshot with supersedes_id, old retained.
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{"hours":{"ot_1_5":4}}'::jsonb,'automation');
      v_snap2 := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{"hours":{"ot_1_5":6}}'::jsonb,'automation', null, null, null, false, v_snap);
      v_obs := jsonb_build_object(
        'old_retained', exists (select 1 from hr.calculation_snapshot where id = v_snap),
        'old_superseded_by_new', (select superseded_by_id from hr.calculation_snapshot where id = v_snap) = v_snap2,
        'old_outputs_unchanged', (select outputs from hr.calculation_snapshot where id = v_snap)
                                 = '{"hours":{"ot_1_5":4}}'::jsonb,
        'new_supersedes', (select supersedes_id from hr.calculation_snapshot where id = v_snap2) = v_snap);

    elsif p_probe = 'snapshot_locked' then
      -- SNAP-03: after export/lock an in-place recompute is REFUSED; the correction becomes an
      -- adjustment tagged to the original period, with its own snapshot, and the original stays
      -- exactly as exported so the export file's provenance survives.
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{"hours":{"ot_1_5":4}}'::jsonb,'automation');
      begin
        update hr.calculation_snapshot set outputs = '{"hours":{"ot_1_5":6}}'::jsonb where id = v_snap;
        v_obs := v_obs || '{"in_place_refused": false}'::jsonb;
      exception when others then
        v_obs := v_obs || jsonb_build_object('in_place_refused', true,
                                             'refusal', split_part(sqlerrm, ':', 1));
      end;
      v_snap2 := hr.write_calculation_snapshot(v_org,'hr_time_adjustment', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,
        jsonb_build_object('original_period_id','probe-period-1'),
        '{"hours":{"ot_1_5":2}}'::jsonb,'automation', null, null, null, false, v_snap);
      v_obs := v_obs || jsonb_build_object(
        'adjustment_written', v_snap2 is not null,
        'adjustment_tagged_to_original_period',
          (select inputs->>'original_period_id' from hr.calculation_snapshot where id = v_snap2) = 'probe-period-1',
        'original_unchanged', (select outputs from hr.calculation_snapshot where id = v_snap)
                              = '{"hours":{"ot_1_5":4}}'::jsonb);

    elsif p_probe = 'snapshot_immutable' then
      -- SNAP-04: any UPDATE other than superseded_by_id NULL->value raises.
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{"hours":{"ot_1_5":4}}'::jsonb,'automation');
      begin
        update hr.calculation_snapshot set jurisdiction_key = 'US-TX' where id = v_snap;
        v_obs := v_obs || '{"raised": false}'::jsonb;
      exception when others then
        v_obs := v_obs || '{"raised": true}'::jsonb;
      end;
      begin
        delete from hr.calculation_snapshot where id = v_snap;
        v_obs := v_obs || '{"delete_raised": false}'::jsonb;
      exception when others then
        v_obs := v_obs || '{"delete_raised": true}'::jsonb;
      end;

    elsif p_probe = 'snapshot_i9' then
      -- I9-SNAP-01: a computed Section 2 due date writes a snapshot citing rule id + version, and
      -- a later amendment of the rule leaves that snapshot untouched (section 4.3).
      v_res := hr.jurisdiction_evaluate('i9-section2-due','US', date '2026-04-06',
                 '{"worker_class":"employee"}'::jsonb,'{"hire_date":"2026-04-06"}'::jsonb, v_sys);
      v_snap := hr.write_calculation_snapshot(v_org,'hr_i9_record', gen_random_uuid(),'i9-section2-due',
        'US', date '2026-04-06','onboarding_tracker','probe', v_res->'resolution','{}'::jsonb,
        '{"hire_date":"2026-04-06"}'::jsonb, v_res->'result','automation');
      select (v_res#>>'{rules_applied,0,rule_version}')::integer into v_ver;
      select id into v_rule from hr.jurisdiction_rule
       where id = (v_res#>>'{rules_applied,0,rule_id}')::uuid;
      update hr.jurisdiction_rule set effective_to = date '2027-01-01' where id = v_rule;
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, parameters, status, basis, citation, source_scope, supersedes_id)
      select v_sys,'public'::platform.visibility, rule_class_id,'US', date '2027-01-01',
        parameters,'active',
        'Probe row: an amendment to the federal I-9 rule, to prove it cannot reach a snapshot written before it.',
        citation,'statutory', v_rule
        from hr.jurisdiction_rule where id = v_rule;
      v_obs := jsonb_build_object(
        'snapshot_written', v_snap is not null,
        'cites_rule_id', (select resolution#>>'{resolved,i9-section2-deadline,rules,0,rule_id}'
                            from hr.calculation_snapshot where id = v_snap) is not null,
        'cited_version_unchanged',
          (select (resolution#>>'{resolved,i9-section2-deadline,rules,0,rule_version}')::integer
             from hr.calculation_snapshot where id = v_snap) = v_ver,
        'section2_due_unchanged',
          (select outputs->>'section2_due_date' from hr.calculation_snapshot where id = v_snap)
          = '2026-04-09');
    else
      raise exception 'unknown_probe: %', p_probe;
    end if;

    raise exception '__ROLLBACK_PROBE__';
  exception when others then
    if sqlerrm <> '__ROLLBACK_PROBE__' then
      v_obs := v_obs || jsonb_build_object('probe_error', sqlerrm);
    end if;
  end;
  return v_obs;
end
$fn$;

-- ============================================================================
-- ASSERTIONS
-- ============================================================================
do $$
declare v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582'; v_o jsonb;
begin
  -- DEFECT 1: a 16-year-old with no seeded minors rule now BLOCKS
  v_o := hr.jurisdiction_evaluate('minors-restriction-check','US-CA', date '2026-03-16',
           '{"worker_age_years":16}'::jsonb, '{}'::jsonb, v_sys);
  if (v_o#>>'{result,blocking_warning}')::boolean is not true then
    raise exception 'hr_c5_04a: a minor with no seeded rule must produce a blocking warning, got %', v_o->'result';
  end if;
  -- and an adult does not
  v_o := hr.jurisdiction_evaluate('minors-restriction-check','US-CA', date '2026-03-16',
           '{"worker_age_years":30}'::jsonb, '{}'::jsonb, v_sys);
  if (v_o#>>'{result,blocking_warning}')::boolean is not false then
    raise exception 'hr_c5_04a: an adult must not produce a minors blocking warning, got %', v_o->'result';
  end if;

  -- DEFECT 2: the accrual knob resolves and SL-CA-01's arithmetic lands
  v_o := hr.jurisdiction_evaluate('sick-leave-accrual','US-CA', date '2026-03-31',
           '{}'::jsonb, '{"hours_worked":173}'::jsonb, v_sys);
  if (v_o#>>'{result,accrued_hours}')::numeric <> 5.7667 then
    raise exception 'hr_c5_04a: SL-CA-01 accrual wrong: %', v_o->'result';
  end if;

  -- DEFECT 3: the correction probe completes and enumerates its own snapshot
  v_o := hr._run_fixture_probe('snapshot_correction','{}'::jsonb);
  if (v_o->>'probe_error') is not null then
    raise exception 'hr_c5_04a: the snapshot_correction probe still errors: %', v_o->>'probe_error';
  end if;
  if (v_o->>'affected_snapshots_found')::integer <> 1 or (v_o->>'batch_state') <> 'proposed' then
    raise exception 'hr_c5_04a: snapshot_correction probe wrong: %', v_o;
  end if;
end $$;
