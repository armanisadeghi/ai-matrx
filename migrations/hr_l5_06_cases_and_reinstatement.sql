-- HR domain L5 — migration 6 (register item HRB-017, lane L5 Leave & PTO).
--
-- LEAVE-OF-ABSENCE CASES (§9), REHIRE REINSTATEMENT (§8), and the day-hours honesty refusal that
-- the first real run of this lane made necessary.
--
-- Authority: SPEC-LEAVE §4.1, §8, §9.1–§9.8, §13, §16; SPEC-ACCESS §3.1 (the Restricted tier);
--            SPEC-DATA-MODEL §9.5, §10.3; AR 1.1, AR 1.6. R-L5 (a) C16, D1–D8, U2.
-- Applied live as `hr_l5_06_cases_and_reinstatement`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 A LEAVE DAY OF ZERO HOURS IS REFUSED, NOT BOOKED. §4.1's basis is: a published shift,
--    else the FTE standard day, else zero. That third rung is correct for a weekend — and
--    catastrophic for an employment whose `standard_hours_per_week` was never set, because the
--    whole request then costs NOTHING and books a person out for a week against a balance that
--    never moves. **Every position assignment in the first org this lane ran against had it
--    NULL.** So a span that yields zero hours with no day excluded for a weekend or a holiday is
--    a HARD refusal naming the remedy, not a silent free week. Reported to L1 as a hire-flow gap;
--    refused here so it cannot pass quietly in the meantime.
--
-- 2. §18 AR-1 IS STALE AND THE BUILD FOLLOWS THE FROZEN MODEL, NOT THE AMENDMENT REQUEST.
--    SPEC-LEAVE §18 AR-1 asks for `check (certification_file_id is null)` on `hr.leave_case`, and
--    §17 test 21 asserts that column is NULL on every row. **The column does not exist** — the
--    coordinator removed it on 2026-08-25 and the live catalog confirms it. There is nothing to
--    check and nothing to write. The test is restated as the thing that is actually worth
--    asserting: *no leave table outside `hr.restricted_note` carries a medical file id, narrative,
--    or extracted value*, and §7 of this file asserts it against `information_schema`.
--
-- 3. 🚨 `entitlement_used_hours` IS A CACHE AND `hr.leave_case_entitlement` IS THE AUTHORITY.
--    §9.4: `rolling_backward` makes "used" a function of the date you ask about — the 12 months
--    preceding THIS request — so a stored counter is wrong by construction the moment the window
--    rolls. The reader recomputes from approved case-linked requests, per measure, per date, and
--    returns hours AND workweek equivalents, because entitlements are written in weeks and
--    consumed in hours and an administrator doing that division by hand will get it wrong.
--
-- 4. THE MANAGER'S CHANNEL FOR A CASE IS ONE SENTENCE OF PROSE AND NOTHING ELSE. §9.6: no
--    category, no certification state, no entitlement, no case door. The case doors here refuse a
--    manager outright rather than returning a redacted row — a masked field is still a field, and
--    the ladder that renders it can be got round. The calendar's existence statement (hr_l5_05)
--    is the entire manager-facing surface of a protected absence.
--
-- 5. REINSTATEMENT READS THE PRIOR SPELL'S FINAL BALANCE FROM THE LEDGER, NEVER THE CACHE, AND
--    THE PRIOR LEDGER IS NEVER TOUCHED (§8). Two spells, two ledgers, one linked `reinstatement`
--    entry on the NEW enrollment — which is exactly what makes the history defensible. If a
--    `payout` exists on that policy for the prior spell, it reinstates ZERO: the time was paid.
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- 1. Decision 1: the zero-hours refusal, at the two places an employee meets it
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_span_is_costless(p_span jsonb)
returns boolean
language sql
immutable
as $function$
  -- True when the span costs nothing AND nothing in it was excluded for an honest reason.
  -- A Saturday costs nothing and that is right; a working Tuesday costing nothing is a defect.
  select coalesce((p_span ->> 'total_hours')::numeric, 0) = 0
     and exists (select 1 from jsonb_array_elements(p_span -> 'days') d
                  where d ->> 'basis' in ('no_standard_day', 'unknown_employment'));
$function$;

comment on function hr._leave_span_is_costless(jsonb) is
  'SPEC-LEAVE §4.1 rung 3 says a day with no shift and no standard day is zero hours. That is '
  'right for a weekend and catastrophic for an employment whose standard_hours_per_week was never '
  'set — the whole request costs nothing and books a free week. This predicate separates the two.';

-- -----------------------------------------------------------------------------------
-- 2. Rehire reinstatement (§8)
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_reinstate_on_rehire(p_new_employment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_emp     uuid;
  v_org     uuid;
  v_hire    date;
  v_prior   record;
  v_pol     hr.leave_policy%rowtype;
  v_bal     numeric;
  v_paid    boolean;
  v_days    integer;
  v_out     jsonb := '[]'::jsonb;
  v_post    jsonb;
  v_enr     uuid;
begin
  select em.employee_id, em.organization_id, em.hire_date into v_emp, v_org, v_hire
    from hr.employment em where em.id = p_new_employment_id and em.deleted_at is null;
  if v_emp is null then
    return jsonb_build_object('granted', false, 'reason','not_found');
  end if;

  for v_prior in
    select em.id as employment_id, em.last_day_worked, l.leave_policy_id
      from hr.employment em
      join hr.leave_ledger l on l.employment_id = em.id
     where em.employee_id = v_emp and em.id <> p_new_employment_id and em.deleted_at is null
     group by em.id, em.last_day_worked, l.leave_policy_id
     order by em.last_day_worked desc nulls last
  loop
    v_pol := hr._leave_policy_at(v_prior.leave_policy_id);
    if v_pol.id is null or v_pol.reinstate_on_rehire_within_days is null then
      continue;   -- the policy does not reinstate; nothing to say and nothing to write
    end if;

    -- decision 5: the LEDGER, never the enrollment cache
    select l.balance_after into v_bal
      from hr.leave_ledger l
     where l.employment_id = v_prior.employment_id and l.leave_policy_id = v_prior.leave_policy_id
     order by l.occurred_on desc, l.created_at desc limit 1;

    v_days := v_hire - coalesce(v_prior.last_day_worked, v_hire);
    v_paid := exists (select 1 from hr.leave_ledger l
                       where l.employment_id = v_prior.employment_id
                         and l.leave_policy_id = v_prior.leave_policy_id
                         and l.entry_kind = 'payout');

    if v_days > v_pol.reinstate_on_rehire_within_days then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'leave_policy_id', v_pol.id, 'policy_name', v_pol.name, 'reinstated_hours', 0,
        'statement', format('Prior balance not reinstated — rehired after the %s-day window.',
                            v_pol.reinstate_on_rehire_within_days)));
      continue;
    end if;
    if v_paid then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'leave_policy_id', v_pol.id, 'policy_name', v_pol.name, 'reinstated_hours', 0,
        'statement', 'Nothing reinstated — this balance was paid out when the earlier employment ended.'));
      continue;
    end if;
    if coalesce(v_bal, 0) <= 0 then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'leave_policy_id', v_pol.id, 'policy_name', v_pol.name, 'reinstated_hours', 0,
        'statement', 'Nothing to reinstate — the balance was zero when the earlier employment ended.'));
      continue;
    end if;

    -- the new enrollment has to exist before its ledger can
    select e.id into v_enr from hr.leave_enrollment e
     where e.employment_id = p_new_employment_id and e.leave_policy_id = v_pol.id
       and e.deleted_at is null limit 1;
    if v_enr is null then
      perform hr.arm_write();
      insert into hr.leave_enrollment
        (employment_id, leave_policy_id, effective_from, policy_year_start_on, organization_id)
      values (p_new_employment_id, v_pol.id, v_hire, date_trunc('year', v_hire)::date, v_org)
      returning id into v_enr;
    end if;

    v_post := hr.leave_ledger_post(
      p_employment_id     => p_new_employment_id,
      p_leave_policy_id   => v_pol.id,
      p_entry_kind        => 'reinstatement',
      p_hours_delta       => v_bal,
      p_occurred_on       => v_hire,
      p_note              => format('Reinstated from employment ending %s', v_prior.last_day_worked),
      p_engine_key        => 'reinstatement_engine',
      p_actor_type        => 'automation',
      p_period_key        => 'rehire:' || p_new_employment_id::text,
      p_snapshot_inputs   => jsonb_build_object(
        'prior_employment_id', v_prior.employment_id,
        'prior_final_balance', v_bal,
        'days_since_separation', v_days,
        'window_days', v_pol.reinstate_on_rehire_within_days));

    if coalesce((v_post ->> 'ok')::boolean, false) then
      perform hr.arm_write();
      update hr.leave_enrollment
         set reinstated_from_employment_id = v_prior.employment_id, reinstated_hours = v_bal
       where id = v_enr;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'leave_policy_id', v_pol.id, 'policy_name', v_pol.name, 'reinstated_hours', v_bal,
        'prior_employment_id', v_prior.employment_id,
        'statement', case when v_pol.usable_after_days > 0
          then format('%s hours reinstated, and you do not serve the %s-day wait again — your '
                   || 'earlier service already satisfied it.',
                      trim(to_char(v_bal,'FM999999.99')), v_pol.usable_after_days)
          else format('%s hours reinstated from your earlier employment.',
                      trim(to_char(v_bal,'FM999999.99'))) end,
        'notify', 'hr.leave.reinstatement_applied'));
    end if;
  end loop;

  -- decision 5: THE PRIOR LEDGER IS NEVER TOUCHED. Nothing above updates, deletes, or migrates a
  -- prior-spell row; the only write is the reinstatement entry on the NEW enrollment.
  return jsonb_build_object('granted', true, 'employment_id', p_new_employment_id,
                            'policies', v_out);
end
$function$;

comment on function hr.leave_reinstate_on_rehire(uuid) is
  'SPEC-LEAVE §8. Reads the prior spell''s FINAL BALANCE FROM THE LEDGER (never the enrollment '
  'cache), checks the window, reinstates ZERO where a payout already exists, and writes one '
  'reinstatement entry on the NEW enrollment. Two spells, two ledgers, one linked entry — which '
  'is what makes the history defensible. The prior ledger is never touched.';

-- -----------------------------------------------------------------------------------
-- 3. Leave cases (§9) — who may see one at all
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_case_rung(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_org uuid; v_emp uuid; v_rung text; v_self boolean;
begin
  if v_uid is null then return jsonb_build_object('rung','none','reason','no_authenticated_caller'); end if;
  select c.organization_id, c.employment_id into v_org, v_emp
    from hr.leave_case c where c.id = p_case_id and c.deleted_at is null;
  if v_org is null then return jsonb_build_object('rung','none','reason','not_reachable'); end if;

  select (e.login_user_id = v_uid) into v_self
    from hr.employment em join hr.employee e on e.id = em.employee_id where em.id = v_emp;
  v_rung := hr._leave_admin_rung(v_org);

  -- decision 4: a manager is refused OUTRIGHT. There is no redacted case row, because a masked
  -- field is still a field. The calendar's worded existence statement is their whole channel.
  if v_rung in ('leave_administrator','hr_owner','hr_admin') then
    return jsonb_build_object('rung','administrator','organization_id',v_org,'employment_id',v_emp);
  end if;
  if coalesce(v_self, false) then
    return jsonb_build_object('rung','subject','organization_id',v_org,'employment_id',v_emp);
  end if;
  return jsonb_build_object('rung','none','reason','no_case_access','organization_id',v_org);
end
$function$;

-- -----------------------------------------------------------------------------------
-- 4. Decision 3: entitlement remaining, recomputed per request date, all four measures
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_case_entitlement(p_case_id uuid, p_as_of date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  c hr.leave_case%rowtype; v_used numeric := 0; v_from date; v_to date; v_weekly numeric;
  v_rung jsonb;
begin
  -- §9.6 / §16: a protected absence is reachable by the person and by HR, and by nobody else.
  -- 🚨 THIS CHECK LIVES HERE, IN THE FILE THAT CREATES THE FUNCTION. It was added later in
  -- hr_l5_11, and replaying THIS file then silently restored the check-free body and re-opened a
  -- Confidential-tier medical-leave read to every signed-in user. A fix that only exists in a
  -- later migration is a fix that any replay can undo.
  v_rung := hr._leave_case_rung(p_case_id);
  if (v_rung ->> 'rung') = 'none' then
    return jsonb_build_object('ok', false, 'granted', false, 'reason', v_rung ->> 'reason',
      'detail','A protected absence is held by HR.');
  end if;

  select * into c from hr.leave_case where id = p_case_id and deleted_at is null;
  if c.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;

  -- the window the measure implies, resolved for THIS date
  case coalesce(c.entitlement_measure, 'calendar_year')
    when 'calendar_year'    then v_from := date_trunc('year', p_as_of)::date;
                                 v_to   := (date_trunc('year', p_as_of) + interval '1 year - 1 day')::date;
    when 'fixed_period'     then v_from := c.entitlement_period_start_on;
                                 v_to   := c.entitlement_period_end_on;
    when 'rolling_forward'  then v_from := c.starts_on;
                                 v_to   := c.starts_on + 364;
    when 'rolling_backward' then v_from := p_as_of - 364;
                                 v_to   := p_as_of;
    else                         v_from := date_trunc('year', p_as_of)::date;
                                 v_to   := (date_trunc('year', p_as_of) + interval '1 year - 1 day')::date;
  end case;

  -- THE AUTHORITY: the sum of approved case-linked requests inside the window, never the counter
  select coalesce(sum(r.approved_hours), 0) into v_used
    from hr.leave_request r
   where r.leave_case_id = p_case_id and r.deleted_at is null
     and r.state in ('approved','taken','partially_taken')
     and r.starts_on between coalesce(v_from, r.starts_on) and coalesce(v_to, r.starts_on);

  select pa.standard_hours_per_week into v_weekly
    from hr.position_assignment pa
   where pa.employment_id = c.employment_id and pa.is_primary and pa.deleted_at is null
   order by pa.effective_from desc limit 1;

  return jsonb_build_object(
    'ok', true, 'granted', true, 'case_id', p_case_id, 'as_of', p_as_of,
    'measure', coalesce(c.entitlement_measure, 'calendar_year'),
    'window_from', v_from, 'window_to', v_to,
    'entitlement_hours', c.entitlement_hours,
    'used_hours', round(v_used, 4),
    'remaining_hours', case when c.entitlement_hours is null then null
                            else round(c.entitlement_hours - v_used, 4) end,
    -- §9.4: entitlements are WRITTEN IN WEEKS and CONSUMED IN HOURS
    'remaining_workweeks', case when c.entitlement_hours is null or coalesce(v_weekly,0) = 0 then null
                                else round((c.entitlement_hours - v_used) / v_weekly, 2) end,
    'weekly_hours_basis', v_weekly,
    'cached_counter', c.entitlement_used_hours,
    'counter_is_stale', case when c.entitlement_hours is null then null
                             else round(c.entitlement_used_hours, 4) <> round(v_used, 4) end,
    'low', case when c.entitlement_hours is null or c.entitlement_hours = 0 then null
                else (c.entitlement_hours - v_used) <= c.entitlement_hours * 0.2 end,
    'exhausted', case when c.entitlement_hours is null then null
                      else (c.entitlement_hours - v_used) <= 0 end);
end
$function$;

comment on function hr.leave_case_entitlement(uuid, date) is
  'SPEC-LEAVE §9.4. hr.leave_case.entitlement_used_hours is a CACHE; this is the authority. '
  'rolling_backward makes "used" a function of the date you ask about, so a stored counter is '
  'wrong by construction the moment the window rolls — `counter_is_stale` says so out loud rather '
  'than letting the cache quietly answer.';

-- -----------------------------------------------------------------------------------
-- 5. Case doors
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_case_open(
  p_employment_id uuid, p_case_kind text, p_continuity text, p_starts_on date,
  p_entitlement_hours numeric default null, p_entitlement_measure text default 'rolling_backward',
  p_expected_return_on date default null, p_runs_concurrent_with_pto boolean default true,
  p_concurrent_policy_ids uuid[] default '{}'::uuid[], p_leave_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_org uuid; v_rung text; v_case uuid; v_elig jsonb; v_months numeric; v_hours numeric;
  v_due integer;
begin
  select em.organization_id into v_org from hr.employment em
   where em.id = p_employment_id and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('granted', false, 'reason','not_found'); end if;
  v_rung := hr._leave_admin_rung(v_org);
  if v_rung not in ('leave_administrator','hr_owner','hr_admin') then
    return jsonb_build_object('granted', false, 'reason','not_a_leave_administrator',
      'detail','A protected absence is opened and managed by HR.');
  end if;

  -- §9.8 / AR 1.6: 12 months of service AND 1,250 HOURS WORKED — hours_worked, never
  -- hours_of_service — computed from the workweek rows, and FROZEN with the ids that produced it.
  select extract(epoch from age(p_starts_on, em.hire_date)) / (30.44 * 86400) into v_months
    from hr.employment em where em.id = p_employment_id;
  select coalesce(sum(wi.hours), 0) into v_hours
    from hr.work_interval wi
    join hr.workweek w on w.id = wi.workweek_id
   where wi.employment_id = p_employment_id and wi.hours_category = 'worked'
     and w.starts_on >= p_starts_on - 365 and w.starts_on < p_starts_on;

  v_elig := jsonb_build_object(
    'evaluated_at', now(),
    'months_of_service', round(coalesce(v_months, 0), 2),
    'hours_worked_prior_12_months', round(coalesce(v_hours, 0), 2),
    'basis', 'hours_worked (AR 1.6) — never hours_of_service',
    'workweek_ids', coalesce((select jsonb_agg(distinct w.id)
                                from hr.work_interval wi join hr.workweek w on w.id = wi.workweek_id
                               where wi.employment_id = p_employment_id
                                 and wi.hours_category = 'worked'
                                 and w.starts_on >= p_starts_on - 365
                                 and w.starts_on < p_starts_on), '[]'::jsonb),
    'eligible', (coalesce(v_months, 0) >= 12 and coalesce(v_hours, 0) >= 1250),
    'test', '12 months of service and 1,250 hours worked in the preceding 12 months');

  v_due := (hr._hr_knob('hr.leave','case_certification_due_days', v_org, '15'::jsonb) #>> '{}')::integer;

  perform hr.arm_write();
  insert into hr.leave_case
    (employment_id, case_kind, continuity, starts_on, expected_return_on, entitlement_hours,
     entitlement_measure, runs_concurrent_with_pto, concurrent_policy_ids, state,
     eligibility_result, eligibility_evaluated_at, certification_due_on,
     schedule_impact, benefits_continuation, rule_version_ids, engine_key, engine_version, calc,
     record_class_key, organization_id)
  values
    (p_employment_id, p_case_kind, p_continuity, p_starts_on, p_expected_return_on,
     p_entitlement_hours, p_entitlement_measure, p_runs_concurrent_with_pto,
     coalesce(p_concurrent_policy_ids, '{}'::uuid[]),
     case when (v_elig ->> 'eligible')::boolean then 'open' else 'denied' end,
     v_elig, now(), p_starts_on + v_due,
     jsonb_build_object('mode', case p_continuity when 'continuous' then 'remove_from_schedule'
                                                  when 'reduced_schedule' then 'reduced_schedule'
                                                  else 'intermittent_ad_hoc' end,
                        'effective_from', p_starts_on, 'scheduler_summary', null),
     '{}'::jsonb, '{}'::uuid[], 'leave_case_engine', '1', '{}'::jsonb,
     'medical', v_org)
  returning id into v_case;

  if p_leave_request_id is not null then
    perform hr.arm_write();
    update hr.leave_request set leave_case_id = v_case where id = p_leave_request_id;
  end if;

  return jsonb_build_object(
    'granted', true, 'case_id', v_case,
    'state', case when (v_elig ->> 'eligible')::boolean then 'open' else 'denied' end,
    'eligibility', v_elig,
    'certification_due_on', p_starts_on + v_due,
    -- §9.3: this is a PRODUCT DEFAULT, not a verified statutory deadline, and the control says so.
    'certification_due_basis', format('A product default of %s days. We seed no verified FMLA '
                                   || 'certification deadline, so this is our setting, not the law.',
                                      v_due),
    'notify', 'hr.leave.case_opened',
    'denied_statement', case when not (v_elig ->> 'eligible')::boolean
      then 'This absence is not eligible as protected leave under the test above. It may still be '
        || 'taken as ordinary leave.' end);
end
$function$;

create or replace function hr.leave_case_get(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_r jsonb; c hr.leave_case%rowtype; v_usage jsonb; v_cert jsonb;
begin
  v_r := hr._leave_case_rung(p_case_id);
  if (v_r ->> 'rung') = 'none' then
    return jsonb_build_object('granted', false, 'reason', v_r ->> 'reason',
      'detail','A protected absence is held by HR.');
  end if;
  select * into c from hr.leave_case where id = p_case_id and deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'starts_on', r.starts_on, 'ends_on', r.ends_on,
           'approved_hours', r.approved_hours, 'state', r.state,
           'policy_name', p.name, 'paid', (p.leave_kind <> 'unpaid'))
           order by r.starts_on), '[]'::jsonb)
    into v_usage
    from hr.leave_request r join hr.leave_policy p on p.id = r.leave_policy_id
   where r.leave_case_id = p_case_id and r.deleted_at is null;

  -- §9.3: the case row records only WHETHER and WHEN. The narrative and the file live on
  -- hr.restricted_note, whose std_select is owner-or-super-admin — the one lane on this platform
  -- an org admin cannot walk. This door never reads that text.
  select jsonb_build_object(
           'due_on', c.certification_due_on, 'received_on', c.certification_received_on,
           'note_count', count(n.id))
    into v_cert
    from hr.restricted_note n
   where n.subject_token = 'hr_leave_case' and n.subject_id = p_case_id
     and n.note_kind = 'medical_certification';

  return jsonb_build_object(
    'granted', true, 'rung', v_r ->> 'rung',
    'case', jsonb_build_object(
      'id', c.id, 'employment_id', c.employment_id,
      'employee_name', hr._subject_display_name(c.employment_id, auth.uid()),
      'case_kind', c.case_kind, 'continuity', c.continuity, 'state', c.state,
      'starts_on', c.starts_on, 'expected_return_on', c.expected_return_on,
      'actual_return_on', c.actual_return_on,
      'runs_concurrent_with_pto', c.runs_concurrent_with_pto,
      'concurrent_policy_ids', c.concurrent_policy_ids,
      'schedule_impact', c.schedule_impact,
      'benefits_continuation', c.benefits_continuation,
      'eligibility_result', c.eligibility_result,
      'eligibility_evaluated_at', c.eligibility_evaluated_at),
    'entitlement', hr.leave_case_entitlement(p_case_id, current_date),
    'usage', v_usage,
    'certification', v_cert,
    'certification_lane', 'hr.restricted_note (note_kind=medical_certification) — owner or '
                       || 'platform super-admin only. The narrative never lands on this row.');
end
$function$;

create or replace function hr.leave_case_list(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_rung text; v_rows jsonb;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  -- §9.1: the list is ABSENT from the nav for everyone else. No empty tab, no permission panel.
  if v_rung not in ('leave_administrator','hr_owner','hr_admin') then
    return jsonb_build_object('granted', false, 'reason','not_a_leave_administrator');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'employment_id', c.employment_id,
           'employee_name', hr._subject_display_name(c.employment_id, auth.uid()),
           'case_kind', c.case_kind, 'continuity', c.continuity, 'state', c.state,
           'starts_on', c.starts_on, 'expected_return_on', c.expected_return_on,
           'certification_due_on', c.certification_due_on,
           'certification_received_on', c.certification_received_on,
           'entitlement', hr.leave_case_entitlement(c.id, current_date))
           order by c.starts_on desc), '[]'::jsonb)
    into v_rows
    from hr.leave_case c
   where c.organization_id = p_organization_id and c.deleted_at is null;
  return jsonb_build_object('granted', true, 'rung', v_rung, 'cases', v_rows);
end
$function$;

-- -----------------------------------------------------------------------------------
-- 6. Public wrappers
-- -----------------------------------------------------------------------------------

create or replace function public.hr_leave_case_open(
  p_employment_id uuid, p_case_kind text, p_continuity text, p_starts_on date,
  p_entitlement_hours numeric default null, p_entitlement_measure text default 'rolling_backward',
  p_expected_return_on date default null, p_runs_concurrent_with_pto boolean default true,
  p_concurrent_policy_ids uuid[] default '{}'::uuid[], p_leave_request_id uuid default null)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_case_open(p_employment_id, p_case_kind, p_continuity, p_starts_on,
    p_entitlement_hours, p_entitlement_measure, p_expected_return_on, p_runs_concurrent_with_pto,
    p_concurrent_policy_ids, p_leave_request_id); $function$;

create or replace function public.hr_leave_case_get(p_case_id uuid)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_case_get(p_case_id); $function$;

create or replace function public.hr_leave_case_list(p_organization_id uuid)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_case_list(p_organization_id); $function$;

create or replace function public.hr_leave_case_entitlement(p_case_id uuid, p_as_of date default current_date)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_case_entitlement(p_case_id, p_as_of); $function$;

-- 🚨 The caller check lives in the WRAPPER, and it lives in THIS file. It was added in hr_l5_11;
-- replaying this file restored the check-free version and re-granted it, so a ledger-writing door
-- became callable by any signed-in user against any employment. Same lesson as the entitlement
-- read above: fix at the source, or a replay undoes it.
create or replace function public.hr_leave_reinstate_on_rehire(p_new_employment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','hr'
as $function$
declare v_org uuid; v_rung text;
begin
  select em.organization_id into v_org
    from hr.employment em where em.id = p_new_employment_id and em.deleted_at is null;
  if v_org is null then
    return jsonb_build_object('granted', false, 'reason','not_found');
  end if;
  v_rung := hr._leave_admin_rung(v_org);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin',
      'detail','Reinstating a prior balance is an HR action — it writes to a leave ledger.');
  end if;
  return hr.leave_reinstate_on_rehire(p_new_employment_id);
end
$function$;

grant execute on function public.hr_leave_case_open(uuid,text,text,date,numeric,text,date,boolean,uuid[],uuid) to authenticated;
grant execute on function public.hr_leave_case_get(uuid) to authenticated;
grant execute on function public.hr_leave_case_list(uuid) to authenticated;
grant execute on function public.hr_leave_case_entitlement(uuid,date) to authenticated;
grant execute on function public.hr_leave_reinstate_on_rehire(uuid) to authenticated;

-- 🚨 THE DOOR SEAL (hr_l5_04). `grant ... to authenticated` does NOT remove the anon EXECUTE that
-- Supabase's default privileges hand every new public function, and `revoke from public` does not
-- either — anon holds its own explicit grant. Both revokes must be explicit and name anon. This
-- lane shipped five SECURITY DEFINER doors, one a WRITE, executable by anon. Replaying this file
-- re-seals rather than regressing.

select hr.leave_seal_door('hr_leave_case_open');
select hr.leave_seal_door('hr_leave_case_get');
select hr.leave_seal_door('hr_leave_case_list');
select hr.leave_seal_door('hr_leave_case_entitlement');
select hr.leave_seal_door('hr_leave_reinstate_on_rehire');

do $$
declare v_anon text;
begin
  select string_agg(p.proname, ', ') into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_leave_case_open', 'hr_leave_case_get', 'hr_leave_case_list', 'hr_leave_case_entitlement')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_anon is not null then
    raise exception 'hr_l5_06: these doors are executable by anon: %', v_anon;
  end if;
end $$;

-- -----------------------------------------------------------------------------------
-- 7. Self-proof — including decision 2's restated §17 test 21
-- -----------------------------------------------------------------------------------

do $$
declare v_missing text; v_leak text;
begin
  select string_agg(f, ', ') into v_missing from unnest(array[
    'hr._leave_span_is_costless','hr.leave_reinstate_on_rehire','hr._leave_case_rung',
    'hr.leave_case_entitlement','hr.leave_case_open','hr.leave_case_get','hr.leave_case_list',
    'public.hr_leave_case_open','public.hr_leave_case_get','public.hr_leave_case_list',
    'public.hr_leave_case_entitlement','public.hr_leave_reinstate_on_rehire']) f
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = split_part(f,'.',1) and p.proname = split_part(f,'.',2));
  if v_missing is not null then
    raise exception 'hr_l5_06: these objects did not land: %', v_missing;
  end if;

  -- decision 2: §17 test 21 restated as the thing worth asserting. NO leave table outside
  -- hr.restricted_note may carry a medical file id, narrative, or extracted value. Asserted
  -- against the live catalog, not against a column the model no longer has.
  select string_agg(table_name || '.' || column_name, ', ') into v_leak
    from information_schema.columns
   where table_schema = 'hr' and table_name like 'leave%'
     and (column_name like '%certification_file%' or column_name like '%diagnosis%'
          or column_name like '%medical_file%' or column_name like '%provider_note%');
  if v_leak is not null then
    raise exception 'hr_l5_06: a medical artifact reaches a leave table outside hr.restricted_note: %',
      v_leak;
  end if;

  -- the costless-span predicate must separate a weekend from a missing standard day
  if hr._leave_span_is_costless(
       '{"total_hours":0,"days":[{"basis":"non_working","hours":0}]}'::jsonb) then
    raise exception 'hr_l5_06: a weekend is being treated as a costless-span defect';
  end if;
  if not hr._leave_span_is_costless(
       '{"total_hours":0,"days":[{"basis":"no_standard_day","hours":0}]}'::jsonb) then
    raise exception 'hr_l5_06: a working day with no standard hours is not being caught';
  end if;

  -- Replaying this file must never leave a door in the lane worse than it found it.
  if (select count(*) from hr.leave_door_grant_audit() where verdict like 'DEFECT%') > 0 then
    raise exception 'hr_l5_06: replaying this file left a defective door: %',
      (select string_agg(door || ' [' || verdict || ']', '; ')
         from hr.leave_door_grant_audit() where verdict like 'DEFECT%');
  end if;
end $$;
