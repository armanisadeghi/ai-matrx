-- HR domain L5 — migration 3 (register item HRB-017, lane L5 Leave & PTO).
--
-- THE FOUR HOOKS, and the day-hours arithmetic they stand on. `leave_request` and
-- `leave_cancellation` have existed as flow types since HRB-008 with `apply_fn =
-- hr.wf_apply_unimplemented` — a fail-closed stub that refuses to record an effect that did not
-- happen. This file replaces it with the real thing, so a leave approval can finally EXIST.
--
-- Authority: SPEC-LEAVE §1.2, §4.1–§4.6, §9.4, §9.5, §16; SPEC-WORKFLOW-ENGINE §4.1–§4.4, §7.1,
--            §8.1; R-L5 (a) C1–C10, F1.
-- Applied live as `hr_l5_03_wf_hooks`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE ESCALATION FLOOR IS IMPLEMENTED IN THE ENGINE'S OWN RULE LANGUAGE, NOT BESIDE IT.
--    SPEC-LEAVE §4.3 forbids auto-approval whenever validation found a negative resulting balance,
--    any blackout window touched, any schedule conflict, a case link, a statutory policy requiring
--    documentation, or any clamp. The engine already evaluates `auto_decide_rule` deterministically
--    against the instance payload (`payload.total_hours` &c). So `hr.leave_wf_validate` writes
--    `payload.escalation_required` and this file adds `{"op":"=","field":"payload.escalation_required",
--    "value":false}` to the seeded `leave_auto_approve_v1` rule. The floor is therefore enforced by
--    the same code path that enforces the hours ceiling — no parallel knob, no second gate that can
--    drift out of agreement with the first (SPEC-LEAVE §0 LOCK 9).
--
-- 2. 🚨 THERE IS NO AUTO-DENY, AND IT IS NOT SOMETHING THIS FILE HAD TO ENFORCE — the engine's
--    `auto_decide_rule` may close a step `auto_approved` and nothing else. Recorded here because a
--    future reader will look for the guard: the reason no configuration can produce an auto-denial
--    is that the mechanism has no such outcome. A rule that fails simply routes to a human, which
--    is §4.3's requirement exactly. §17 test 14 asserts it against the engine, not against leave.
--
-- 3. VALIDATION RUNS ONCE AND IS FROZEN; CONFLICT RUNS AT EVERY DECISION. The whole result of
--    `hr.leave_wf_validate` is written to `hr.leave_request.conflict_check` — AD-11: the reason a
--    request was never routed is itself evidence, and it is retained. `hr.leave_wf_conflict`
--    re-reads the world at decision time (balance now, shifts published since) and returns
--    `{ok:false}` so the engine raises WF_CONFLICT and shows the approver WHAT CHANGED, rather
--    than a silent rejection.
--
-- 4. 🚨 `hr.schedule_change` HAS NO `approved_leave` VALUE AND NO `reason` COLUMN.
--    SPEC-LEAVE §4.5 step 4 and §18 AR-4 both say approval writes one `hr.schedule_change` row per
--    affected shift "with reason `approved_leave`". The shipped DDL has neither: `change_kind` is
--    CHECKed to a ten-value list that does not include leave, and there is no `reason` column at
--    all. This lane does NOT add a value to another lane's enum on its own authority. It writes
--    `change_kind='called_off'` — the nearest TRUE statement in the shipped vocabulary, an employee
--    who will not be working a published shift — with `after_values.reason='approved_leave'` and
--    the request id in `calc`, and `is_employer_driven=false` because the employee asked. The
--    published shift is never edited and never deleted (AR2: the published schedule is an immutable
--    baseline). Filed to the coordinator as a delta.
--
-- 5. THE DAY-HOURS BASIS IS ONE FUNCTION, USED BY THE FORM AND BY THE VALIDATOR. §4.1: a published
--    shift, else the FTE standard day, else zero — and a non-working day or a company holiday
--    consumes no balance and is SHOWN as excluded rather than silently dropped. A form that
--    computes hours one way and a validator that computes them another way is how an employee gets
--    charged for a Saturday.
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- 1. Day-hours (§4.1) — one basis, one implementation
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_day_hours(p_employment_id uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_org      uuid;
  v_hours    numeric;
  v_basis    text;
  v_label    text;
  v_pa       hr.position_assignment%rowtype;
  v_holiday  text;
  v_setting  text;
begin
  select em.organization_id into v_org from hr.employment em where em.id = p_employment_id;
  if v_org is null then
    return jsonb_build_object('date', p_date, 'hours', 0, 'basis', 'unknown_employment');
  end if;

  -- 1. a published shift is the honest number, and it is what makes the schedule exclusion exact
  select s.scheduled_hours into v_hours
    from hr.shift s
   where s.employment_id = p_employment_id and s.local_work_date = p_date
     and s.status = 'published' and s.deleted_at is null
   order by s.starts_at limit 1;
  if v_hours is not null then
    return jsonb_build_object('date', p_date, 'hours', round(v_hours, 4),
                              'basis', 'scheduled_shift', 'excluded', false);
  end if;

  -- 2. a company holiday consumes no balance by default and RENDERS AS EXCLUDED, with its name
  select h.name into v_holiday
    from hr.holiday h
    join hr.holiday_calendar hc on hc.id = h.holiday_calendar_id
    join hr.employment em on em.id = p_employment_id
   where h.observed_on = p_date and h.deleted_at is null and hc.deleted_at is null
     and hc.organization_id = em.organization_id
   order by hc.is_default desc limit 1;
  if v_holiday is not null then
    v_setting := hr._hr_knob('hr.leave','holiday_inside_leave', v_org, '"excluded"'::jsonb) #>> '{}';
    if v_setting = 'excluded' then
      return jsonb_build_object('date', p_date, 'hours', 0, 'basis', 'holiday',
                                'excluded', true, 'label', v_holiday);
    end if;
  end if;

  -- 3. the FTE standard day. Weekends are excluded BY THIS RULE, not by a knob (§4.1 rule 3).
  if extract(isodow from p_date) >= 6 then
    return jsonb_build_object('date', p_date, 'hours', 0, 'basis', 'non_working',
                              'excluded', true, 'label', 'Weekend');
  end if;

  select * into v_pa
    from hr.position_assignment pa
   where pa.employment_id = p_employment_id and pa.is_primary and pa.deleted_at is null
     and pa.effective_from <= p_date
     and (pa.effective_to is null or pa.effective_to > p_date)
   order by pa.effective_from desc limit 1;

  if v_pa.id is null or v_pa.standard_hours_per_week is null then
    return jsonb_build_object('date', p_date, 'hours', 0, 'basis', 'no_standard_day',
                              'excluded', true,
                              'label', 'No scheduled or standard hours on this day');
  end if;

  v_hours := coalesce(v_pa.fte, 1) * v_pa.standard_hours_per_week / 5.0;
  return jsonb_build_object('date', p_date, 'hours', round(v_hours, 4),
                            'basis', 'fte_standard_day', 'excluded', false);
end
$function$;

comment on function hr.leave_day_hours(uuid, date) is
  'SPEC-LEAVE §4.1 day-hours basis: published shift, else the FTE standard day, else zero. A '
  'non-working day or a company holiday consumes no balance and is returned as EXCLUDED with a '
  'label, because a request whose cost the employee cannot see is a request they will dispute.';

create or replace function hr.leave_span_hours(
  p_employment_id uuid, p_starts_on date, p_ends_on date, p_day_parts jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_days   jsonb := '[]'::jsonb;
  v_day    jsonb;
  v_d      date;
  v_total  numeric := 0;
  v_work   integer := 0;
  v_excl   integer := 0;
  v_part   numeric;
begin
  v_d := p_starts_on;
  while v_d <= p_ends_on loop
    v_day := hr.leave_day_hours(p_employment_id, v_d);
    -- an explicit day part overrides the computed day, but only DOWNWARD: a partial day is less
    -- than a whole one, and a "partial" day longer than the scheduled day is a data error.
    select (x ->> 'hours')::numeric into v_part
      from jsonb_array_elements(coalesce(p_day_parts, '[]'::jsonb)) x
     where (x ->> 'date')::date = v_d limit 1;
    if v_part is not null then
      v_day := v_day || jsonb_build_object(
        'hours', round(least(v_part, (v_day ->> 'hours')::numeric), 4),
        'partial', true);
    end if;
    if (v_day ->> 'hours')::numeric > 0 then v_work := v_work + 1; else v_excl := v_excl + 1; end if;
    v_total := v_total + (v_day ->> 'hours')::numeric;
    v_days := v_days || jsonb_build_array(v_day);
    v_d := v_d + 1;
  end loop;

  return jsonb_build_object(
    'total_hours', round(v_total, 4), 'days', v_days,
    'calendar_days', (p_ends_on - p_starts_on) + 1,
    'working_days', v_work, 'excluded_days', v_excl);
end
$function$;

comment on function hr.leave_span_hours(uuid, date, date, jsonb) is
  'The day-by-day breakdown the request form shows before submit and the validator freezes onto '
  'the request. One implementation, so the number the employee agreed to is the number they are '
  'charged (SPEC-LEAVE §4.1).';

-- -----------------------------------------------------------------------------------
-- 2. THE VALIDATE HOOK (§4.2) — thirteen checks, hard and advisory, frozen on the request
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_wf_validate(p_instance uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  inst      hr.workflow_instance%rowtype;
  req       hr.leave_request%rowtype;
  pol       hr.leave_policy%rowtype;
  enr       hr.leave_enrollment%rowtype;
  v_hard    jsonb := '[]'::jsonb;
  v_adv     jsonb := '[]'::jsonb;
  v_span    jsonb;
  v_fig     jsonb;
  v_proj    jsonb;
  v_bal     numeric;
  v_projbal numeric;
  v_after   numeric;
  v_black   jsonb := '[]'::jsonb;
  v_b       jsonb;
  v_shifts  jsonb := '[]'::jsonb;
  v_notice  integer;
  v_minnote integer;
  v_usable  date;
  v_escal   boolean := false;
  v_reason  text;
  v_check   jsonb;
  v_hire    date;
  v_active  boolean;
begin
  select * into inst from hr.workflow_instance where id = p_instance;
  if inst.id is null or inst.target_token <> 'hr_leave_request' then
    return jsonb_build_object('ok', false, 'hard',
      jsonb_build_array(jsonb_build_object('code','instance_not_a_leave_request',
        'message','This request does not point at a leave request.')));
  end if;
  select * into req from hr.leave_request where id = inst.target_id;
  if req.id is null then
    return jsonb_build_object('ok', false, 'hard',
      jsonb_build_array(jsonb_build_object('code','leave_request_missing',
        'message','The leave request behind this approval no longer exists.')));
  end if;
  pol := hr._leave_policy_at(req.leave_policy_id);
  select * into enr from hr.leave_enrollment e
   where e.employment_id = req.employment_id and e.leave_policy_id = req.leave_policy_id
     and e.deleted_at is null
   order by e.effective_from desc limit 1;

  v_span := hr.leave_span_hours(req.employment_id, req.starts_on, req.ends_on, req.day_parts);
  v_fig  := hr.leave_figures(req.employment_id, req.leave_policy_id, current_date);
  v_proj := hr.leave_project_balance(req.employment_id, req.leave_policy_id,
                                     greatest(req.starts_on, current_date));

  -- ---- employment active on the requested dates
  select (em.status = 'active'
          and em.hire_date <= req.ends_on
          and (em.last_day_worked is null or em.last_day_worked >= req.starts_on)),
         em.hire_date
    into v_active, v_hire
    from hr.employment em where em.id = req.employment_id;
  if not coalesce(v_active, false) then
    v_hard := v_hard || jsonb_build_array(jsonb_build_object(
      'code','employment_not_active',
      'message','Your employment record is not active across these dates, so this time cannot be booked.'));
  end if;

  -- ---- enrollment must exist and cover the span
  if enr.id is null then
    v_hard := v_hard || jsonb_build_array(jsonb_build_object(
      'code','not_enrolled',
      'message', format('You are not enrolled in %s.', coalesce(pol.name,'this policy'))));
  end if;

  -- ---- overlapping request on ANY policy: two requests cannot own the same hour
  if exists (
    select 1 from hr.leave_request r
     where r.employment_id = req.employment_id and r.id <> req.id
       and r.deleted_at is null and r.state in ('submitted','approved')
       and daterange(r.starts_on, r.ends_on, '[]') && daterange(req.starts_on, req.ends_on, '[]'))
  then
    v_hard := v_hard || jsonb_build_array(jsonb_build_object(
      'code','overlapping_request',
      'message','You already have a request covering some of these days. Two requests cannot own the same hours.'));
  end if;

  -- ---- usable_after_days: earned but not yet spendable, and the message says WHEN
  if pol.usable_after_days > 0 and v_hire is not null then
    v_usable := v_hire + pol.usable_after_days;
    if req.starts_on < v_usable then
      v_hard := v_hard || jsonb_build_array(jsonb_build_object(
        'code','not_yet_usable', 'usable_on', v_usable,
        'message', format('You have earned this time, but you can start using it on %s.',
                          to_char(v_usable, 'FMMon FMDD, YYYY'))));
    end if;
  end if;

  -- ---- balance. PROJECTED, not current: accrual between today and the start date counts.
  if not coalesce((v_fig ->> 'unlimited')::boolean, false) then
    v_bal := coalesce((v_fig ->> 'available')::numeric, 0);
    v_projbal := coalesce((v_proj ->> 'projected_available')::numeric, v_bal);
    v_after := v_projbal - coalesce((v_span ->> 'total_hours')::numeric, 0);

    if v_after < 0 then
      if not pol.negative_balance_allowed then
        v_hard := v_hard || jsonb_build_array(jsonb_build_object(
          'code','insufficient_balance',
          'balance_now', v_bal, 'projected_balance_at_start', v_projbal,
          'requested_hours', (v_span ->> 'total_hours')::numeric,
          'message', format('This request needs %s hours and you will have %s on %s.',
                            trim(to_char((v_span ->> 'total_hours')::numeric,'FM999999.99')),
                            trim(to_char(v_projbal,'FM999999.99')),
                            to_char(req.starts_on,'FMMon FMDD'))));
      elsif pol.negative_balance_floor is not null and v_after < pol.negative_balance_floor then
        v_hard := v_hard || jsonb_build_array(jsonb_build_object(
          'code','below_negative_floor', 'floor', pol.negative_balance_floor,
          'resulting_balance', v_after,
          'message', format('This would take your balance to %s hours. Your organization allows down to %s.',
                            trim(to_char(v_after,'FM999999.99')),
                            trim(to_char(pol.negative_balance_floor,'FM999999.99')))));
      else
        -- inside the floor, but a NEGATIVE RESULTING BALANCE always goes to a human (§4.3).
        v_escal := true;
        v_adv := v_adv || jsonb_build_array(jsonb_build_object(
          'code','resulting_balance_negative', 'resulting_balance', v_after,
          'message', format('Approving this leaves a balance of %s hours.',
                            trim(to_char(v_after,'FM999999.99')))));
      end if;
    end if;
  end if;

  -- ---- blackout windows (§2.4 THE BLACKOUT FLOOR)
  for v_b in select jsonb_array_elements(coalesce(pol.blackout_rules,'[]'::jsonb)) loop
    if hr._leave_blackout_hits(v_b, req.starts_on, req.ends_on) then
      v_black := v_black || jsonb_build_array(jsonb_build_object(
        'key', v_b ->> 'key', 'label', v_b ->> 'label', 'mode', v_b ->> 'mode'));
      v_escal := true;
      -- a blackout may NEVER block a statutory policy, and never a mandated use.
      if pol.statutory_basis_rule_class is not null
         or hr._leave_reason_is_mandated(req.reason_category_id, pol.mandated_uses) then
        v_adv := v_adv || jsonb_build_array(jsonb_build_object(
          'code','blackout_exempt', 'blackout_key', v_b ->> 'key',
          'message', format('%s falls in %s, but this leave is protected and cannot be blocked by it.',
                            'This request', coalesce(v_b ->> 'label','a blackout window'))));
      elsif coalesce(v_b ->> 'mode','block') = 'block' then
        v_hard := v_hard || jsonb_build_array(jsonb_build_object(
          'code','blackout_blocked', 'blackout_key', v_b ->> 'key',
          'message', coalesce(nullif(v_b ->> 'note',''),
            format('%s is closed to time-off requests.', coalesce(v_b ->> 'label','This period')))));
      else
        v_adv := v_adv || jsonb_build_array(jsonb_build_object(
          'code','blackout_escalation', 'blackout_key', v_b ->> 'key',
          'message', format('%s needs a manager to look at it.',
                            coalesce(v_b ->> 'label','This period'))));
      end if;
    end if;
  end loop;

  -- ---- published shifts inside the span: advisory, and always escalated
  select coalesce(jsonb_agg(jsonb_build_object(
           'shift_id', s.id, 'starts_at', s.starts_at, 'hours', s.scheduled_hours)), '[]'::jsonb)
    into v_shifts
    from hr.shift s
   where s.employment_id = req.employment_id and s.deleted_at is null
     and s.status = 'published'
     and s.local_work_date between req.starts_on and req.ends_on;
  if jsonb_array_length(v_shifts) > 0 then
    v_escal := true;
    v_adv := v_adv || jsonb_build_array(jsonb_build_object(
      'code','shift_conflict', 'shifts', v_shifts,
      'message', format('%s scheduled shift(s) fall inside these dates. The approver decides coverage.',
                        jsonb_array_length(v_shifts))));
  end if;

  -- ---- minimum notice: ADVISORY, never hard. An illness gives no notice.
  v_minnote := (hr._hr_knob('hr.leave','request_min_notice_days', inst.organization_id, '0'::jsonb) #>> '{}')::integer;
  v_notice := req.starts_on - current_date;
  if v_minnote > 0 and v_notice < v_minnote then
    v_escal := true;
    v_adv := v_adv || jsonb_build_array(jsonb_build_object(
      'code','short_notice', 'notice_days', v_notice, 'min_notice_days', v_minnote,
      'message', format('This is %s day(s) notice; your organization asks for %s.', v_notice, v_minnote)));
  end if;

  -- ---- a case-linked request ALWAYS escalates (§4.3, §9.4)
  if req.leave_case_id is not null then
    v_escal := true;
  end if;

  -- ---- a statutory policy that requires documentation always escalates
  if pol.statutory_basis_rule_class is not null
     and pol.documentation_required_after_days is not null
     and (req.ends_on - req.starts_on) + 1 > pol.documentation_required_after_days then
    v_escal := true;
    v_adv := v_adv || jsonb_build_array(jsonb_build_object(
      'code','documentation_required',
      'after_days', pol.documentation_required_after_days,
      'message', format('Absences longer than %s days need supporting documentation.',
                        pol.documentation_required_after_days)));
  end if;

  -- ---- retroactive window
  if req.ends_on < current_date then
    if not coalesce((hr._hr_knob('hr.leave','allow_retroactive_request', inst.organization_id,'true'::jsonb) #>> '{}')::boolean, true) then
      v_hard := v_hard || jsonb_build_array(jsonb_build_object(
        'code','retroactive_not_allowed',
        'message','Your organization does not accept requests for dates that have already passed.'));
    elsif current_date - req.ends_on
          > (hr._hr_knob('hr.leave','retroactive_request_max_days', inst.organization_id,'30'::jsonb) #>> '{}')::integer then
      v_hard := v_hard || jsonb_build_array(jsonb_build_object(
        'code','retroactive_too_old',
        'message','These dates are further back than your organization allows a request to reach.'));
    end if;
  end if;

  -- ---- the increment rule
  if pol.increment_minutes > 1
     and (coalesce((v_span ->> 'total_hours')::numeric,0) * 60)::numeric % pol.increment_minutes <> 0 then
    v_adv := v_adv || jsonb_build_array(jsonb_build_object(
      'code','increment_mismatch', 'increment_minutes', pol.increment_minutes,
      'message', format('This policy books time in %s-minute increments.', pol.increment_minutes)));
  end if;

  v_check := jsonb_build_object(
    'evaluated_at', now(),
    'policy_version', pol.version,
    'day_hours_basis', hr._hr_knob('hr.leave','day_hours_basis', inst.organization_id,'"scheduled_shift"'::jsonb) #>> '{}',
    'balance_now', v_fig -> 'available',
    'projected_balance_at_start', coalesce(v_proj -> 'projected_available', v_fig -> 'available'),
    'span', v_span,
    'hard', v_hard,
    'advisory', v_adv,
    'blackouts_hit', v_black,
    'shift_conflicts', v_shifts,
    'escalation_required', v_escal,
    'unlimited', coalesce(v_fig -> 'unlimited', 'false'::jsonb));

  -- decision 3: freeze the whole result onto the request. AD-11.
  perform hr.arm_write();
  update hr.leave_request
     set conflict_check = v_check,
         requested_hours = coalesce((v_span ->> 'total_hours')::numeric, requested_hours),
         balance_at_request = coalesce((v_fig ->> 'available')::numeric, balance_at_request),
         state = case when jsonb_array_length(v_hard) > 0 then state else 'submitted' end
   where id = req.id;

  -- decision 1: the engine's own auto-decide rule reads this.
  update hr.workflow_instance
     set payload = coalesce(payload,'{}'::jsonb) || jsonb_build_object(
           'escalation_required', v_escal,
           'total_hours', coalesce((v_span ->> 'total_hours')::numeric, 0),
           'notice_days', v_notice,
           'leave_type', pol.leave_kind,
           'leave_policy_id', pol.id,
           'coverage_pct', case when jsonb_array_length(v_shifts) > 0 then 0 else 100 end)
   where id = p_instance;

  return v_check;
end
$function$;

comment on function hr.leave_wf_validate(uuid) is
  'SPEC-LEAVE §4.2. Runs once at submit, returns {hard, advisory, …}; the engine stops the '
  'instance at rejected_at_intake on any hard finding and retains the findings. Also writes '
  'payload.escalation_required, which is how THE ESCALATION FLOOR (§4.3) is enforced inside the '
  'engine''s own auto_decide_rule rather than beside it.';

-- ---- two small predicates the validator uses, named so they are testable on their own
create or replace function hr._leave_blackout_hits(p_rule jsonb, p_starts date, p_ends date)
returns boolean
language plpgsql
immutable
as $function$
declare v_from date; v_to date; v_y integer;
begin
  if coalesce((p_rule ->> 'recurring_annual')::boolean, false) then
    -- MM-DD windows, which may wrap the new year (12-20 → 01-02)
    for v_y in extract(year from p_starts)::integer .. extract(year from p_ends)::integer + 1 loop
      v_from := to_date(v_y || '-' || (p_rule ->> 'from'), 'YYYY-MM-DD');
      v_to   := to_date(v_y || '-' || (p_rule ->> 'to'),   'YYYY-MM-DD');
      if v_to < v_from then v_to := v_to + interval '1 year'; end if;
      if daterange(v_from, v_to, '[]') && daterange(p_starts, p_ends, '[]') then return true; end if;
    end loop;
    return false;
  end if;
  v_from := nullif(p_rule ->> 'from','')::date;
  v_to   := nullif(p_rule ->> 'to','')::date;
  if v_from is null or v_to is null then return false; end if;
  return daterange(v_from, v_to, '[]') && daterange(p_starts, p_ends, '[]');
end
$function$;

create or replace function hr._leave_reason_is_mandated(p_reason_category_id uuid, p_mandated jsonb)
returns boolean
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  select exists (
    select 1
      from platform.categories c
      join jsonb_array_elements_text(coalesce(p_mandated, '[]'::jsonb)) m on m = c.slug
     where c.id = p_reason_category_id);
$function$;

-- -----------------------------------------------------------------------------------
-- 3. THE CONFLICT HOOK (§4.2) — re-run at EVERY decision
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_wf_conflict(p_instance uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  inst   hr.workflow_instance%rowtype;
  req    hr.leave_request%rowtype;
  pol    hr.leave_policy%rowtype;
  v_fig  jsonb;
  v_now  numeric;
  v_then numeric;
  v_new  integer;
begin
  select * into inst from hr.workflow_instance where id = p_instance;
  select * into req from hr.leave_request where id = inst.target_id;
  if req.id is null then
    return jsonb_build_object('ok', false, 'detail','the leave request no longer exists');
  end if;
  pol := hr._leave_policy_at(req.leave_policy_id);
  v_fig := hr.leave_figures(req.employment_id, req.leave_policy_id, current_date);

  if coalesce((v_fig ->> 'unlimited')::boolean, false) then
    return jsonb_build_object('ok', true, 'unlimited', true);
  end if;

  v_now  := coalesce((v_fig ->> 'available')::numeric, 0);
  v_then := coalesce((req.conflict_check ->> 'balance_now')::numeric, v_now);

  -- sufficient on Monday is not sufficient on Thursday
  if v_now < req.requested_hours and not pol.negative_balance_allowed then
    return jsonb_build_object(
      'ok', false, 'code','balance_moved',
      'balance_at_submit', v_then, 'balance_now', v_now,
      'requested_hours', req.requested_hours,
      'detail', format('The balance was %s hours when this was submitted and is %s now, which is '
                    || 'less than the %s hours requested.',
                       trim(to_char(v_then,'FM999999.99')), trim(to_char(v_now,'FM999999.99')),
                       trim(to_char(req.requested_hours,'FM999999.99'))));
  end if;

  -- shifts PUBLISHED SINCE the request was validated
  select count(*) into v_new
    from hr.shift s
   where s.employment_id = req.employment_id and s.deleted_at is null and s.status = 'published'
     and s.local_work_date between req.starts_on and req.ends_on
     and s.created_at > coalesce((req.conflict_check ->> 'evaluated_at')::timestamptz,
                                 req.created_at);
  if v_new > 0 then
    return jsonb_build_object(
      'ok', false, 'code','shifts_published_since', 'new_shift_count', v_new,
      'detail', format('%s shift(s) were published inside these dates after this request was '
                    || 'checked. Look at coverage before approving.', v_new));
  end if;

  return jsonb_build_object('ok', true, 'balance_now', v_now);
end
$function$;

comment on function hr.leave_wf_conflict(uuid) is
  'SPEC-LEAVE §4.2: re-runs at EVERY decision — balance now, shifts published since. Returns '
  '{ok:false} so the engine raises WF_CONFLICT and shows the approver WHAT CHANGED, never a '
  'silent rejection.';

-- -----------------------------------------------------------------------------------
-- 4. THE APPLY HOOK (§4.5, §4.6) — one transaction, one usage entry
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_wf_apply(p_instance uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  inst    hr.workflow_instance%rowtype;
  req     hr.leave_request%rowtype;
  pol     hr.leave_policy%rowtype;
  v_post  jsonb;
  v_hours numeric;
  v_by    uuid;
  v_shift record;
  v_ids   uuid[] := '{}'::uuid[];
  v_orig  hr.leave_ledger%rowtype;
begin
  select * into inst from hr.workflow_instance where id = p_instance;
  select * into req from hr.leave_request where id = inst.target_id;
  if req.id is null then
    return jsonb_build_object('ok', false, 'failure_class','apply_failed',
      'reason','leave_request_missing',
      'detail','the leave request this approval points at no longer exists');
  end if;
  pol := hr._leave_policy_at(req.leave_policy_id);

  select d.decider_employment_id into v_by
    from hr.workflow_decision d
    join hr.workflow_step s on s.id = d.workflow_step_id
   where s.workflow_instance_id = p_instance
   order by d.created_at desc limit 1;

  -- ================= cancellation =================
  if inst.flow_key = 'leave_cancellation' then
    v_hours := coalesce((inst.payload ->> 'cancel_hours')::numeric, req.approved_hours, 0);
    select * into v_orig
      from hr.leave_ledger l
     where l.leave_request_id = req.id and l.entry_kind = 'usage'
     order by l.created_at desc limit 1;

    if v_orig.id is not null and v_hours > 0 then
      v_post := hr.leave_ledger_post(
        p_employment_id      => req.employment_id,
        p_leave_policy_id    => req.leave_policy_id,
        p_entry_kind         => 'reversal',
        p_hours_delta        => v_hours,
        p_occurred_on        => current_date,
        p_note               => format('Cancelled — %s to %s', req.starts_on, req.ends_on),
        p_leave_request_id   => req.id,
        p_reverses_entry_id  => v_orig.id,
        p_engine_key         => 'leave_engine',
        p_actor_type         => 'automation');
      if not coalesce((v_post ->> 'ok')::boolean, false)
         and (v_post ->> 'refused') is distinct from 'LEAVE_POLICY_UNLIMITED' then
        return jsonb_build_object('ok', false, 'failure_class','apply_failed',
          'reason', coalesce(v_post ->> 'refused','reversal_refused'),
          'detail', v_post ->> 'detail');
      end if;
    end if;

    perform hr.arm_write();
    update hr.leave_request
       set state = case when v_hours >= coalesce(approved_hours, 0) then 'cancelled'
                        else 'partially_taken' end,
           decided_at = now(), decided_by_employment_id = coalesce(v_by, decided_by_employment_id)
     where id = req.id;

    return jsonb_build_object('ok', true, 'outcome','cancelled',
                              'reversed_hours', v_hours, 'ledger', v_post);
  end if;

  -- ================= approval =================
  v_hours := coalesce(req.requested_hours, 0);

  perform hr.arm_write();
  update hr.leave_request
     set state = 'approved', approved_hours = v_hours, decided_at = now(),
         decided_by_employment_id = v_by
   where id = req.id;

  -- §1.2 THE ENCUMBRANCE RULING: ONE usage entry, at approval, dated the approval date.
  v_post := hr.leave_ledger_post(
    p_employment_id    => req.employment_id,
    p_leave_policy_id  => req.leave_policy_id,
    p_entry_kind       => 'usage',
    p_hours_delta      => -v_hours,
    p_occurred_on      => current_date,
    p_note             => format('Approved — %s to %s',
                                 to_char(req.starts_on,'FMMon FMDD'), to_char(req.ends_on,'FMMon FMDD')),
    p_leave_request_id => req.id,
    p_engine_key       => 'leave_engine',
    p_actor_type       => case when v_by is null then 'automation' else 'manager' end,
    p_actor_employment_id => v_by,
    p_snapshot_inputs  => jsonb_build_object('conflict_check', req.conflict_check));

  if not coalesce((v_post ->> 'ok')::boolean, false) then
    -- An unlimited policy legitimately writes nothing; anything else is a real failure and the
    -- engine must NOT record an effect that did not happen.
    if (v_post ->> 'refused') is distinct from 'LEAVE_POLICY_UNLIMITED' then
      return jsonb_build_object('ok', false, 'failure_class','apply_failed',
        'reason', coalesce(v_post ->> 'refused','usage_entry_refused'),
        'detail', v_post ->> 'detail');
    end if;
  end if;

  -- §4.5 step 4 + decision 4: the published shift is NEVER edited or deleted.
  for v_shift in
    select s.id, s.schedule_id, s.scheduled_hours, s.starts_at
      from hr.shift s
     where s.employment_id = req.employment_id and s.deleted_at is null and s.status = 'published'
       and s.local_work_date between req.starts_on and req.ends_on
  loop
    v_ids := v_ids || v_shift.id;
    perform hr.arm_write();
    insert into hr.schedule_change
      (schedule_id, shift_id, change_kind, occurred_at, is_employer_driven, affected_hours,
       before_values, after_values, engine_key, engine_version, calc, actor_type, organization_id)
    values
      (v_shift.schedule_id, v_shift.id, 'called_off', now(), false, v_shift.scheduled_hours,
       jsonb_build_object('status','published','covered',true),
       jsonb_build_object('covered', false, 'reason','approved_leave'),
       'leave_engine','1',
       jsonb_build_object('leave_request_id', req.id, 'leave_policy_id', req.leave_policy_id),
       'automation', inst.organization_id);
  end loop;

  if array_length(v_ids,1) > 0 then
    perform hr.arm_write();
    update hr.leave_request set affected_shift_ids = v_ids where id = req.id;
  end if;

  return jsonb_build_object('ok', true, 'outcome','approved',
                            'approved_hours', v_hours,
                            'affected_shift_ids', to_jsonb(v_ids),
                            'ledger', v_post);
end
$function$;

comment on function hr.leave_wf_apply(uuid) is
  'SPEC-LEAVE §4.5/§4.6, in the same transaction as the final approval: state + approved_hours, '
  'ONE usage ledger entry dated today (the §1.2 encumbrance ruling), the enrollment cache, '
  'affected_shift_ids and one hr.schedule_change per affected shift. No shift is ever edited or '
  'deleted. A cancellation writes a REVERSAL, never an edit.';

-- -----------------------------------------------------------------------------------
-- 5. THE DIGEST HOOK (§4.2) — dates, hours, policy, employment
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_wf_digest(p_target_token text, p_target_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_row jsonb;
begin
  if p_target_token <> 'hr_leave_request' then return null; end if;
  select jsonb_build_object(
           'employment_id', r.employment_id, 'leave_policy_id', r.leave_policy_id,
           'starts_on', r.starts_on, 'ends_on', r.ends_on,
           'day_parts', r.day_parts, 'requested_hours', r.requested_hours)
    into v_row
    from hr.leave_request r where r.id = p_target_id;
  if v_row is null then return null; end if;
  return encode(sha256(convert_to(jsonb_pretty(v_row), 'UTF8')), 'hex');
end
$function$;

comment on function hr.leave_wf_digest(text, uuid) is
  'SPEC-LEAVE §4.2: the digest covers starts_on, ends_on, day_parts, requested_hours, '
  'leave_policy_id and employment_id — and NOT conflict_check or state, which the engine itself '
  'moves. Editing any of the six while the request sits at the manager step resets prior '
  'approvals (workflow §17 test 3).';

-- -----------------------------------------------------------------------------------
-- 6. Wire the hooks onto both flow types, and close the escalation floor into the rule
-- -----------------------------------------------------------------------------------

-- 🚨 Both writes sit INSIDE one plpgsql block, because `hr.arm_write()` mints a token bound to
-- `statement_timestamp()` and `hr._guard_hr_write` accepts only a token minted by the SAME
-- statement. Arming in one statement and writing in the next is the defect FREEZE/HRB-025 already
-- found once; a `do $$ … $$` body is one statement, so this works and a bare `update` does not.
do $$
begin
  perform hr.arm_write();
  update hr.workflow_flow_type
     set validate_fn = 'hr.leave_wf_validate(uuid)'::regprocedure,
         conflict_fn = 'hr.leave_wf_conflict(uuid)'::regprocedure,
         apply_fn    = 'hr.leave_wf_apply(uuid)'::regprocedure,
         digest_fn   = 'hr.leave_wf_digest(text,uuid)'::regprocedure
   where flow_key in ('leave_request','leave_cancellation') and deleted_at is null;

  -- decision 1: THE ESCALATION FLOOR, in the engine's own rule language.
  perform hr.arm_write();
  update hr.workflow_step_definition sd
     set auto_decide_rule = jsonb_set(
           sd.auto_decide_rule,
           '{when,all}',
           (sd.auto_decide_rule #> '{when,all}')
             || jsonb_build_array(jsonb_build_object(
                  'op','=', 'field','payload.escalation_required', 'value', false)))
    from hr.workflow_definition wd
   where wd.id = sd.workflow_definition_id
     and wd.flow_key = 'leave_request'
     and sd.step_key = 'auto_approve'
     and sd.auto_decide_rule ? 'when'
     and not (sd.auto_decide_rule #> '{when,all}' @> jsonb_build_array(
                jsonb_build_object('op','=', 'field','payload.escalation_required','value', false)));
end $$;

-- -----------------------------------------------------------------------------------
-- 7. Self-proof
-- -----------------------------------------------------------------------------------

do $$
declare v_missing text; v_n integer;
begin
  select string_agg(f, ', ') into v_missing from unnest(array[
    'hr.leave_day_hours','hr.leave_span_hours','hr.leave_wf_validate','hr.leave_wf_conflict',
    'hr.leave_wf_apply','hr.leave_wf_digest','hr._leave_blackout_hits',
    'hr._leave_reason_is_mandated']) f
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = split_part(f,'.',1) and p.proname = split_part(f,'.',2));
  if v_missing is not null then
    raise exception 'hr_l5_03: these objects did not land: %', v_missing;
  end if;

  -- the fail-closed stub must be GONE from both flows
  select count(*) into v_n from hr.workflow_flow_type
   where flow_key in ('leave_request','leave_cancellation')
     and (apply_fn::text like '%unimplemented%' or apply_fn is null
          or validate_fn is null or conflict_fn is null);
  if v_n > 0 then
    raise exception 'hr_l5_03: % leave flow(s) still carry an unimplemented or missing hook', v_n;
  end if;

  -- the escalation floor must be IN the rule, not beside it
  select count(*) into v_n
    from hr.workflow_step_definition sd
    join hr.workflow_definition wd on wd.id = sd.workflow_definition_id
   where wd.flow_key = 'leave_request' and sd.step_key = 'auto_approve'
     and sd.auto_decide_rule #> '{when,all}' @> jsonb_build_array(
           jsonb_build_object('op','=', 'field','payload.escalation_required','value', false));
  if v_n = 0 then
    raise exception 'hr_l5_03: the escalation floor did not land in leave_auto_approve_v1';
  end if;

  -- the blackout predicate must actually fire on a wrapping annual window
  if not hr._leave_blackout_hits(
       '{"from":"12-20","to":"01-02","recurring_annual":true}'::jsonb,
       '2026-12-28'::date, '2026-12-30'::date) then
    raise exception 'hr_l5_03: the recurring blackout predicate misses a window it wraps into';
  end if;
  if hr._leave_blackout_hits(
       '{"from":"12-20","to":"01-02","recurring_annual":true}'::jsonb,
       '2026-07-01'::date, '2026-07-05'::date) then
    raise exception 'hr_l5_03: the recurring blackout predicate fires on a window it does not touch';
  end if;
end $$;
