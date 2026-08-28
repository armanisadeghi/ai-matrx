-- HR domain L5 — migration 4 (register item HRB-017, lane L5 Leave & PTO).
--
-- THE EMPLOYEE'S DOORS. `hr` is not exposed to PostgREST (FREEZE delta D-10), so every client read
-- and write in this lane goes through a thin `public.hr_leave_*` wrapper over a body in `hr`.
-- This file ships the self lane and the ledger audit view; hr_l5_05 ships the manager/HR lane.
--
-- Authority: SPEC-LEAVE §4.1, §4.6, §5, §12, §16; SPEC-ACCESS §4.1 THE VIEW LAW; FREEZE D-10.
-- Applied live as `hr_l5_04_employee_doors`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 EVERY FIGURE IS A DOOR, SO EVERY DOOR RETURNS THE IDS BEHIND IT. §5: "a screen that shows a
--    number with no path to its entries is a defect." `hr.my_time_off` returns the five figures AND
--    the policy id and employment id that address the ledger view, so the client never has to
--    reconstruct a query to open what it just rendered.
--
-- 2. THE SENTENCE IS GENERATED FROM THE POLICY, NEVER WRITTEN PER SCREEN (§5). Seven variants ship
--    here: normal, at the cap, per-hours-worked, unlimited, not-yet-usable, negative, and
--    carryover-expiring. A screen that composes its own sentence will disagree with another screen
--    the first time a policy changes.
--
-- 3. 🚨 THE RUNNING-BALANCE VERIFICATION IS COMPUTED SERVER-SIDE AND RETURNED, NOT TRUSTED.
--    §12 requires the ledger view to recompute Σ hours_delta and assert it equals the last
--    `balance_after`, rendering a blocking banner naming the first divergent row. Computing that in
--    React would make it a claim about what the client fetched; computing it here makes it a claim
--    about the ledger. `divergence_at_entry_id` names the first row where the sum and the stored
--    balance part company, and it is null when they never do.
--
-- 4. `amount` AND `rate` ARE NEVER SELECTED BY THIS FILE. §12 and §18 AR-5: those two columns are
--    compensation-derived, they are declared in `client_excluded_columns` for `hr_leave_ledger`, and
--    a manager's derived grant reaches every other column of a report's ledger. The ledger view
--    projects an explicit column list that does not contain them — an exclusion by CONSTRUCTION,
--    not by a filter someone can forget. The payout figure renders only in the offboarding panel,
--    which reads through the audited lane.
--
-- 5. A REFUSAL IS DATA, AND IT STATES WHAT WAS ACTUALLY CHECKED. Every door returns
--    `{granted:false, reason, detail}` in the shape `hr.my_compensation` established, with a
--    sentence a person can act on. No door raises for an ordinary "not yours".
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- 1. Who may see whose leave (SPEC-LEAVE §16)
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_viewer(p_employment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_self boolean;
begin
  if v_uid is null then
    return jsonb_build_object('rung', 'none', 'reason', 'no_authenticated_caller');
  end if;
  select em.organization_id, (e.login_user_id = v_uid)
    into v_org, v_self
    from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id and em.deleted_at is null and e.deleted_at is null;
  if v_org is null then
    return jsonb_build_object('rung', 'none', 'reason', 'not_reachable');
  end if;
  if coalesce(v_self, false) then
    return jsonb_build_object('rung', 'self', 'organization_id', v_org);
  end if;
  -- A manager or an HR admin reaches a report's WORKING RECORD, of which leave is a component.
  -- A PEER holds no path at all, which is why there is no third branch here (§17 test 22).
  if hr.capability(v_uid, 'working_record.read', p_employment_id, current_date, v_org) then
    return jsonb_build_object('rung', 'delegated', 'organization_id', v_org);
  end if;
  return jsonb_build_object('rung', 'none', 'reason', 'no_working_record_grant',
                            'organization_id', v_org);
end
$function$;

comment on function hr._leave_viewer(uuid) is
  'The one access decision for every leave read: self, delegated (manager/HR through '
  'working_record.read on hr_employment), or none. A peer falls to none by construction — there is '
  'no branch that could grant them (SPEC-LEAVE §5 role variation, §17 test 22).';

-- -----------------------------------------------------------------------------------
-- 2. The sentence (SPEC-LEAVE §5) — generated from the policy, one implementation
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_sentence(p_fig jsonb)
returns text
language plpgsql
immutable
as $function$
declare
  v_method text := p_fig ->> 'accrual_method';
  v_bal    numeric := coalesce((p_fig ->> 'ledger_balance')::numeric, 0);
  v_up     numeric := coalesce((p_fig ->> 'approved_upcoming')::numeric, 0);
  v_cap    numeric := nullif(p_fig ->> 'balance_cap','')::numeric;
  v_usable date    := nullif(p_fig ->> 'usable_on','')::date;
  v_floor  numeric := nullif(p_fig ->> 'negative_balance_floor','')::numeric;
begin
  if coalesce((p_fig ->> 'unlimited')::boolean, false) then
    return 'Unlimited — requests still need approval.';
  end if;
  if v_usable is not null and v_usable > current_date then
    return format('You''ve earned %s hours. You can start using this time on %s.',
                  trim(to_char(coalesce((p_fig ->> 'accrued_to_date')::numeric,0),'FM999999.99')),
                  to_char(v_usable, 'FMMon FMDD'));
  end if;
  if v_bal < 0 then
    return case when v_floor is not null
      then format('Your balance is %s hours. Your organization allows down to %s.',
                  trim(to_char(v_bal,'FM999999.99')), trim(to_char(v_floor,'FM999999.99')))
      else format('Your balance is %s hours.', trim(to_char(v_bal,'FM999999.99'))) end;
  end if;
  if v_cap is not null and v_bal >= v_cap then
    return format('You''ve reached this policy''s %s-hour cap. You''ll start earning again as soon '
               || 'as you use some time. Nothing expires.', trim(to_char(v_cap,'FM999999.99')));
  end if;
  if v_method = 'per_hours_worked' then
    return format('You earn %s hour(s) for every %s you work.',
                  trim(to_char(coalesce((p_fig ->> 'accrual_rate')::numeric,0),'FM999999.99')),
                  trim(to_char(coalesce((p_fig ->> 'accrual_per_units')::numeric,0),'FM999999.99')));
  end if;
  if v_up > 0 then
    return format('Available already excludes the %s hours you have approved and not yet taken.',
                  trim(to_char(v_up,'FM999999.99')));
  end if;
  return case v_method
    when 'per_pay_period'    then format('You earn %s hours each pay period.',
                                    trim(to_char(coalesce((p_fig ->> 'accrual_rate')::numeric,0),'FM999999.99')))
    when 'per_month'         then format('You earn %s hours each month.',
                                    trim(to_char(coalesce((p_fig ->> 'accrual_rate')::numeric,0),'FM999999.99')))
    when 'annual_lump'       then 'Your whole allowance is granted at the start of each policy year.'
    when 'anniversary_lump'  then 'Your whole allowance is granted on your work anniversary.'
    when 'none'              then 'This balance changes only when your organization grants time.'
    else 'Available is what you can book right now.' end;
end
$function$;

-- -----------------------------------------------------------------------------------
-- 3. /hr/me/time-off — the employee's whole relationship with leave, in one call
-- -----------------------------------------------------------------------------------

create or replace function hr.my_time_off(p_employment_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_emp  uuid := p_employment_id;
  v_view jsonb;
  v_pols jsonb := '[]'::jsonb;
  v_reqs jsonb;
  v_r    record;
  v_fig  jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason','no_authenticated_caller',
      'detail','Sign in to see your time off.');
  end if;
  if v_emp is null then
    select em.id into v_emp
      from hr.employment em join hr.employee e on e.id = em.employee_id
     where e.login_user_id = v_uid and em.status = 'active' and em.deleted_at is null
     order by em.hire_date desc limit 1;
  end if;
  if v_emp is null then
    return jsonb_build_object('granted', false, 'reason','no_employment',
      'detail','There is no active employment record for you here.');
  end if;

  v_view := hr._leave_viewer(v_emp);
  if (v_view ->> 'rung') = 'none' then
    return jsonb_build_object('granted', false, 'reason', v_view ->> 'reason',
      'detail','This page only ever shows a record you are entitled to see.');
  end if;

  for v_r in
    select e.id as enrollment_id, e.leave_policy_id, e.policy_year_start_on,
           e.reinstated_hours, e.reinstated_from_employment_id,
           p.name, p.leave_kind, p.blackout_rules, p.mandated_uses, p.increment_minutes,
           p.documentation_required_after_days, p.statutory_basis_rule_class
      from hr.leave_enrollment e
      join hr.leave_policy p on p.id = e.leave_policy_id and p.deleted_at is null
     where e.employment_id = v_emp and e.deleted_at is null and p.is_active
       and (e.effective_to is null or e.effective_to >= current_date)
       and e.effective_from <= current_date
     order by p.leave_kind, p.name
  loop
    v_fig := hr.leave_figures(v_emp, v_r.leave_policy_id, current_date);
    v_pols := v_pols || jsonb_build_array(
      v_fig || jsonb_build_object(
        'enrollment_id', v_r.enrollment_id,
        'employment_id', v_emp,
        'sentence', hr._leave_sentence(v_fig),
        'policy_year_start_on', v_r.policy_year_start_on,
        'reinstated_hours', v_r.reinstated_hours,
        'reinstated_from_employment_id', v_r.reinstated_from_employment_id,
        'blackout_rules', v_r.blackout_rules,
        'mandated_uses', v_r.mandated_uses,
        'documentation_required_after_days', v_r.documentation_required_after_days,
        -- decision 1: the ledger address, returned with the figures it explains
        'ledger_href', format('/hr/me/time-off/%s', v_r.leave_policy_id)));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'leave_policy_id', r.leave_policy_id, 'policy_name', p.name,
           'leave_kind', p.leave_kind, 'starts_on', r.starts_on, 'ends_on', r.ends_on,
           'requested_hours', r.requested_hours, 'approved_hours', r.approved_hours,
           'state', r.state, 'decided_at', r.decided_at, 'denial_reason', r.denial_reason,
           'is_partial_day', r.is_partial_day, 'day_parts', r.day_parts,
           'leave_case_linked', (r.leave_case_id is not null),
           'workflow_instance_id', r.workflow_instance_id,
           'conflict_check', r.conflict_check)
           order by r.starts_on desc), '[]'::jsonb)
    into v_reqs
    from hr.leave_request r
    join hr.leave_policy p on p.id = r.leave_policy_id
   where r.employment_id = v_emp and r.deleted_at is null;

  return jsonb_build_object(
    'granted', true, 'employment_id', v_emp, 'viewer_rung', v_view ->> 'rung',
    'as_of', current_date, 'policies', v_pols, 'requests', v_reqs,
    'can_request', (v_view ->> 'rung') = 'self');
end
$function$;

comment on function hr.my_time_off(uuid) is
  'SPEC-LEAVE §4.1: the employee''s whole relationship with leave in one page — what they have, '
  'what they can take, and what happened to what they asked for. Every policy block carries the §5 '
  'five figures, the generated sentence, and the address of the ledger rows behind them.';

-- -----------------------------------------------------------------------------------
-- 4. The pre-submit preview (§4.1) — the cost of the request, before it is a request
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_request_preview(
  p_employment_id uuid, p_leave_policy_id uuid, p_starts_on date, p_ends_on date,
  p_day_parts jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_view jsonb; v_span jsonb; v_fig jsonb; v_proj jsonb; v_pol hr.leave_policy%rowtype;
  v_words text; v_excl text;
begin
  v_view := hr._leave_viewer(p_employment_id);
  if (v_view ->> 'rung') = 'none' then
    return jsonb_build_object('granted', false, 'reason', v_view ->> 'reason');
  end if;
  if p_ends_on < p_starts_on then
    return jsonb_build_object('granted', false, 'reason','dates_reversed',
      'detail','The end date is before the start date.');
  end if;

  v_pol  := hr._leave_policy_at(p_leave_policy_id);
  v_span := hr.leave_span_hours(p_employment_id, p_starts_on, p_ends_on, p_day_parts);
  v_fig  := hr.leave_figures(p_employment_id, p_leave_policy_id, current_date);
  v_proj := hr.leave_project_balance(p_employment_id, p_leave_policy_id,
                                     greatest(p_starts_on, current_date));

  select string_agg(distinct coalesce(d ->> 'label', 'Non-working day'), ', ')
    into v_excl
    from jsonb_array_elements(v_span -> 'days') d
   where coalesce((d ->> 'excluded')::boolean, false);

  -- §4.1: "a request whose cost the employee cannot see is a request they will dispute"
  v_words := format('%s day%s selected · %s working day%s · %s hours',
                    (v_span ->> 'calendar_days'),
                    case when (v_span ->> 'calendar_days')::int = 1 then '' else 's' end,
                    (v_span ->> 'working_days'),
                    case when (v_span ->> 'working_days')::int = 1 then '' else 's' end,
                    trim(to_char((v_span ->> 'total_hours')::numeric, 'FM999999.99')));
  if v_excl is not null then
    v_words := v_words || ' · ' || v_excl || ' excluded';
  end if;

  return jsonb_build_object(
    'granted', true, 'span', v_span, 'breakdown_sentence', v_words,
    'figures', v_fig, 'projection', v_proj,
    'policy_name', v_pol.name, 'increment_minutes', v_pol.increment_minutes,
    'mandated_uses', v_pol.mandated_uses,
    'documentation_required_after_days', v_pol.documentation_required_after_days,
    'documentation_required',
      (v_pol.documentation_required_after_days is not null
       and (p_ends_on - p_starts_on) + 1 > v_pol.documentation_required_after_days));
end
$function$;

comment on function hr.leave_request_preview is
  'SPEC-LEAVE §4.1: the day-by-day breakdown the form shows BEFORE submit, from the same '
  'hr.leave_span_hours the validator uses. Read-only; writes nothing.';

-- -----------------------------------------------------------------------------------
-- 5. Submit — the request, then the engine. This lane opens no second queue.
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_request_submit(
  p_employment_id      uuid,
  p_leave_policy_id    uuid,
  p_starts_on          date,
  p_ends_on            date,
  p_day_parts          jsonb default '[]'::jsonb,
  p_reason_category_id uuid  default null,
  p_reason_note        text  default null,
  p_leave_case_id      uuid  default null,
  p_idempotency_key    text  default null
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_view jsonb; v_org uuid; v_span jsonb; v_req uuid; v_pol hr.leave_policy%rowtype;
  v_wf jsonb; v_inst uuid; v_sub jsonb; v_row hr.leave_request%rowtype;
begin
  v_view := hr._leave_viewer(p_employment_id);
  -- Only the person themselves files their own leave. An HR admin filing FOR somebody is a
  -- different action with a different audit story and it is not this door.
  if (v_view ->> 'rung') <> 'self' then
    return jsonb_build_object('granted', false, 'reason','not_self',
      'detail','You can only file your own time-off request from here.');
  end if;
  v_org := (v_view ->> 'organization_id')::uuid;

  v_pol := hr._leave_policy_at(p_leave_policy_id);
  if v_pol.id is null or not v_pol.is_active then
    return jsonb_build_object('granted', false, 'reason','policy_not_available',
      'detail','That leave type is not available on your record.');
  end if;
  if not exists (select 1 from hr.leave_enrollment e
                  where e.employment_id = p_employment_id and e.leave_policy_id = p_leave_policy_id
                    and e.deleted_at is null and e.effective_from <= p_ends_on
                    and (e.effective_to is null or e.effective_to >= p_starts_on)) then
    return jsonb_build_object('granted', false, 'reason','not_enrolled',
      'detail', format('You are not enrolled in %s.', v_pol.name));
  end if;
  if p_ends_on < p_starts_on then
    return jsonb_build_object('granted', false, 'reason','dates_reversed',
      'detail','The end date is before the start date.');
  end if;

  v_span := hr.leave_span_hours(p_employment_id, p_starts_on, p_ends_on, p_day_parts);

  perform hr.arm_write();
  insert into hr.leave_request
    (employment_id, leave_policy_id, leave_case_id, starts_on, ends_on, is_partial_day,
     day_parts, requested_hours, state, reason_category_id, reason_note,
     conflict_check, rule_version_ids, engine_key, engine_version, calc, organization_id)
  values
    (p_employment_id, p_leave_policy_id, p_leave_case_id, p_starts_on, p_ends_on,
     jsonb_array_length(coalesce(p_day_parts,'[]'::jsonb)) > 0,
     coalesce(p_day_parts,'[]'::jsonb), coalesce((v_span ->> 'total_hours')::numeric, 0),
     'draft', p_reason_category_id, p_reason_note,
     '{}'::jsonb, '{}'::uuid[], 'leave_engine', '1', jsonb_build_object('span', v_span), v_org)
  returning id into v_req;

  -- ONE workflow engine, ONE inbox. This lane declares a flow type; it never builds a queue.
  v_wf := hr.wf_request('leave_request', 'hr_leave_request', v_req, v_org,
                        jsonb_build_object(
                          'total_hours', coalesce((v_span ->> 'total_hours')::numeric, 0),
                          'notice_days', p_starts_on - current_date,
                          'leave_type', v_pol.leave_kind,
                          'leave_policy_id', v_pol.id,
                          'coverage_pct', 100,
                          -- until hr.leave_wf_validate has run, the honest value is "we do not
                          -- know yet", and the safe reading of not-knowing is DO NOT auto-approve.
                          'escalation_required', true),
                        p_employment_id, false, p_idempotency_key);
  v_inst := nullif(v_wf ->> 'instance_id','')::uuid;
  if v_inst is null then
    return jsonb_build_object('granted', false, 'reason', coalesce(v_wf ->> 'reason','wf_request_failed'),
      'detail', v_wf ->> 'detail', 'leave_request_id', v_req, 'workflow', v_wf);
  end if;

  perform hr.arm_write();
  update hr.leave_request set workflow_instance_id = v_inst where id = v_req;

  v_sub := hr.wf_submit(v_inst);
  select * into v_row from hr.leave_request where id = v_req;

  return jsonb_build_object(
    'granted', true, 'leave_request_id', v_req, 'workflow_instance_id', v_inst,
    'state', v_row.state, 'requested_hours', v_row.requested_hours,
    'conflict_check', v_row.conflict_check,
    'workflow', v_sub,
    'rejected_at_intake', coalesce(v_sub ->> 'state','') = 'rejected_at_intake');
end
$function$;

comment on function hr.leave_request_submit is
  'SPEC-LEAVE §4.1/§4.2: writes the request, then hands it to THE workflow engine. The payload '
  'seeds escalation_required=true so a request cannot be auto-approved in the window before '
  'hr.leave_wf_validate has had a chance to say otherwise — not-knowing reads as escalate.';

-- -----------------------------------------------------------------------------------
-- 6. Cancel / withdraw (§4.6)
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_request_cancel(
  p_request_id uuid, p_reason text default null, p_hours numeric default null
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  req hr.leave_request%rowtype; v_view jsonb; v_wf jsonb; v_inst uuid;
begin
  select * into req from hr.leave_request where id = p_request_id and deleted_at is null;
  if req.id is null then
    return jsonb_build_object('granted', false, 'reason','not_found');
  end if;
  v_view := hr._leave_viewer(req.employment_id);
  if (v_view ->> 'rung') = 'none' then
    return jsonb_build_object('granted', false, 'reason', v_view ->> 'reason');
  end if;

  if req.state = 'taken' then
    -- §4.6: cancellation is ABSENT once taken. The correction path is a balance adjustment,
    -- because the timesheet already says the person was out.
    return jsonb_build_object('granted', false, 'reason','already_taken',
      'detail','These days have already been taken. A correction is a balance adjustment, not a cancellation.');
  end if;

  if req.state = 'submitted' then
    -- no ledger entry ever existed; this is a withdrawal, not a reversal
    v_wf := hr.wf_withdraw(req.workflow_instance_id, coalesce(p_reason,'withdrawn by the employee'));
    perform hr.arm_write();
    update hr.leave_request set state = 'cancelled' where id = req.id;
    perform hr.leave_enrollment_refresh(req.employment_id, req.leave_policy_id);
    return jsonb_build_object('granted', true, 'outcome','withdrawn', 'workflow', v_wf);
  end if;

  if req.state <> 'approved' then
    return jsonb_build_object('granted', false, 'reason','not_cancellable',
      'detail', format('A %s request cannot be cancelled.', req.state));
  end if;

  v_wf := hr.wf_request('leave_cancellation', 'hr_leave_request', req.id, req.organization_id,
                        jsonb_build_object('cancel_hours', coalesce(p_hours, req.approved_hours),
                                           'reason', p_reason),
                        req.employment_id, false, null);
  v_inst := nullif(v_wf ->> 'instance_id','')::uuid;
  if v_inst is null then
    return jsonb_build_object('granted', false, 'reason','cancellation_not_opened', 'workflow', v_wf);
  end if;
  return jsonb_build_object('granted', true, 'outcome','cancellation_requested',
                            'workflow_instance_id', v_inst,
                            'workflow', hr.wf_submit(v_inst));
end
$function$;

comment on function hr.leave_request_cancel(uuid, text, numeric) is
  'SPEC-LEAVE §4.6. Before a decision: a withdrawal, and no ledger entry ever existed. After '
  'approval: the leave_cancellation flow, whose apply writes a REVERSAL — never an edit. Once '
  'taken: absent, because the timesheet already says the person was out.';

-- -----------------------------------------------------------------------------------
-- 7. THE LEDGER AUDIT VIEW (§12) — every entry traceable to its rule snapshot
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_ledger_view(
  p_employment_id uuid, p_leave_policy_id uuid, p_as_of date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_view jsonb; v_rows jsonb := '[]'::jsonb; v_r record;
  v_sum numeric := 0; v_diverge uuid; v_last numeric := 0; v_fig jsonb;
  v_sentence text; v_source jsonb; v_snap uuid; v_unexplained integer := 0;
begin
  v_view := hr._leave_viewer(p_employment_id);
  if (v_view ->> 'rung') = 'none' then
    return jsonb_build_object('granted', false, 'reason', v_view ->> 'reason',
      'detail','A leave ledger is only ever visible to the person and to those who hold their working record.');
  end if;

  -- decision 4: `amount` and `rate` are NOT in this column list, by construction.
  for v_r in
    select l.id, l.entry_kind, l.occurred_on, l.hours_delta, l.balance_after, l.note,
           l.leave_request_id, l.source_workweek_id, l.source_work_interval_id,
           l.reverses_entry_id, l.actor_type, l.actor_employment_id, l.engine_key,
           l.engine_version, l.calc, l.created_at,
           r.starts_on, r.ends_on, r.state as request_state
      from hr.leave_ledger l
      left join hr.leave_request r on r.id = l.leave_request_id
     where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
       and l.occurred_on <= p_as_of
     order by l.occurred_on asc, l.created_at asc
  loop
    v_sum := v_sum + v_r.hours_delta;
    if v_diverge is null and round(v_sum, 4) <> round(v_r.balance_after, 4) then
      v_diverge := v_r.id;
    end if;
    v_last := v_r.balance_after;

    select s.id into v_snap
      from hr.calculation_snapshot s
     where s.subject_type = 'hr_leave_ledger' and s.subject_id = v_r.id
     order by s.computed_at desc limit 1;
    if v_snap is null and v_r.entry_kind in
       ('accrual','carryover','forfeiture','carryover_expiry','payout') then
      v_unexplained := v_unexplained + 1;
    end if;

    -- §12 / LAW 3a: a human sentence, never the enum token.
    v_sentence := case v_r.entry_kind
      when 'accrual'          then case when v_r.source_workweek_id is not null
                                   then format('Earned from the week of %s',
                                        to_char(v_r.occurred_on,'FMMon FMDD'))
                                   else 'Earned' end
      when 'usage'            then format('Used — %s to %s',
                                   to_char(coalesce(v_r.starts_on, v_r.occurred_on),'FMMon FMDD'),
                                   to_char(coalesce(v_r.ends_on, v_r.occurred_on),'FMMon FMDD'))
      when 'reversal'         then 'Returned — a request was cancelled or shortened'
      when 'adjustment'       then case when v_r.hours_delta > 0 then 'Added by hand'
                                        else 'Removed by hand' end
      when 'carryover'        then format('Carried over into the %s policy year',
                                   to_char(v_r.occurred_on,'YYYY'))
      when 'carryover_expiry' then 'Carried-over time expired'
      when 'forfeiture'       then 'Forfeited at the policy-year boundary'
      when 'payout'           then 'Paid out at separation'
      when 'reinstatement'    then 'Reinstated from a prior period of employment'
      when 'opening_balance'  then 'Opening balance'
      else v_r.entry_kind end;
    if v_r.note is not null and v_r.note <> '' then
      v_sentence := v_sentence || ' — ' || v_r.note;
    end if;

    v_source := case
      when v_r.leave_request_id is not null
        then jsonb_build_object('kind','leave_request','id', v_r.leave_request_id)
      when v_r.source_workweek_id is not null
        then jsonb_build_object('kind','workweek','id', v_r.source_workweek_id)
      when v_r.reverses_entry_id is not null
        then jsonb_build_object('kind','leave_ledger','id', v_r.reverses_entry_id)
      else null end;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_r.id, 'occurred_on', v_r.occurred_on, 'entry_kind', v_r.entry_kind,
      'sentence', v_sentence, 'hours_delta', v_r.hours_delta, 'balance_after', v_r.balance_after,
      'running_sum', round(v_sum, 4),
      'source', v_source,
      'reverses_entry_id', v_r.reverses_entry_id,
      'snapshot_id', v_snap,
      'unexplained', (v_snap is null and v_r.entry_kind in
                      ('accrual','carryover','forfeiture','carryover_expiry','payout')),
      'engine_key', v_r.engine_key, 'engine_version', v_r.engine_version,
      'calc', v_r.calc,
      'actor_type', v_r.actor_type,
      'actor_name', case when v_r.actor_employment_id is not null
                         then hr._subject_display_name(v_r.actor_employment_id, auth.uid())
                         end));
  end loop;

  v_fig := hr.leave_figures(p_employment_id, p_leave_policy_id, p_as_of);

  return jsonb_build_object(
    'granted', true, 'viewer_rung', v_view ->> 'rung',
    'employment_id', p_employment_id, 'leave_policy_id', p_leave_policy_id, 'as_of', p_as_of,
    'entries', v_rows, 'figures', v_fig, 'sentence', hr._leave_sentence(v_fig),
    -- decision 3: the assertion, computed here, returned rather than trusted
    'running_balance_ok', (v_diverge is null),
    'divergence_at_entry_id', v_diverge,
    'unexplained_entry_count', v_unexplained,
    'entry_count', jsonb_array_length(v_rows));
end
$function$;

comment on function hr.leave_ledger_view(uuid, uuid, date) is
  'SPEC-LEAVE §12: one row per ledger entry with a human sentence (never the enum token), a source '
  'door, a rule door to its calculation snapshot, and the running-balance verification computed '
  'SERVER-SIDE — divergence_at_entry_id names the first row where Σ hours_delta and the stored '
  'balance part company. Never selects amount or rate (§18 AR-5).';

-- -----------------------------------------------------------------------------------
-- 8. The public wrappers — `hr` is not exposed to PostgREST (FREEZE D-10)
-- -----------------------------------------------------------------------------------

create or replace function public.hr_my_time_off(p_employment_id uuid default null)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.my_time_off(p_employment_id); $function$;

create or replace function public.hr_leave_request_preview(
  p_employment_id uuid, p_leave_policy_id uuid, p_starts_on date, p_ends_on date,
  p_day_parts jsonb default '[]'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_request_preview(p_employment_id, p_leave_policy_id, p_starts_on,
                                              p_ends_on, p_day_parts); $function$;

create or replace function public.hr_leave_request_submit(
  p_employment_id uuid, p_leave_policy_id uuid, p_starts_on date, p_ends_on date,
  p_day_parts jsonb default '[]'::jsonb, p_reason_category_id uuid default null,
  p_reason_note text default null, p_leave_case_id uuid default null,
  p_idempotency_key text default null)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_request_submit(p_employment_id, p_leave_policy_id, p_starts_on,
                                             p_ends_on, p_day_parts, p_reason_category_id,
                                             p_reason_note, p_leave_case_id, p_idempotency_key); $function$;

create or replace function public.hr_leave_request_cancel(
  p_request_id uuid, p_reason text default null, p_hours numeric default null)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_request_cancel(p_request_id, p_reason, p_hours); $function$;

create or replace function public.hr_leave_ledger_view(
  p_employment_id uuid, p_leave_policy_id uuid, p_as_of date default current_date)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_ledger_view(p_employment_id, p_leave_policy_id, p_as_of); $function$;

-- ===================================================================================
-- 🚨 THE DOOR SEAL — `grant ... to authenticated` IS NOT ENOUGH, AND IT LOOKS LIKE IT IS.
--
-- Supabase ships DEFAULT PRIVILEGES that hand `anon` EXECUTE on every newly created function in
-- `public`. So a door created here is reachable by an UNAUTHENTICATED caller the moment it exists,
-- and adding `grant execute ... to authenticated` does nothing about it — it grants a second role
-- and reports success. `revoke ... from public` does not fix it either: `anon` holds its own
-- explicit grant, and revoking PUBLIC leaves that grant standing while also reporting success.
-- **Both revokes have to be explicit, and they have to name `anon`.**
--
-- This lane shipped five SECURITY DEFINER doors — including a WRITE — executable by `anon`, and it
-- was the SECOND such exposure in one session. It is not something to remember per door. Every
-- door migration in this lane ends by calling this sealer, so a replay of any one of them
-- re-seals rather than regressing.
--
-- `hr.leave_door_grant_audit()` (hr_l5_11) is the standing check and now fails on any
-- anon-executable door.
-- ===================================================================================

create or replace function hr.leave_seal_door(p_proname text, p_mode text default 'client')
returns void
language plpgsql
as $function$
declare v_sig text; v_n integer := 0;
begin
  if p_mode not in ('client','engine') then
    raise exception 'hr.leave_seal_door: mode is client or engine, not %', p_mode;
  end if;
  for v_sig in
    select 'public.' || quote_ident(p.proname) || '(' ||
           pg_get_function_identity_arguments(p.oid) || ')'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = p_proname
  loop
    -- PUBLIC and anon are revoked SEPARATELY and both by name. Neither implies the other.
    execute format('revoke all on function %s from public', v_sig);
    execute format('revoke all on function %s from anon', v_sig);
    if p_mode = 'client' then
      execute format('grant execute on function %s to authenticated', v_sig);
    else
      -- an engine path is unreachable from any session, authenticated or not
      execute format('revoke all on function %s from authenticated', v_sig);
      execute format('grant execute on function %s to service_role', v_sig);
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'hr.leave_seal_door: no public function named % exists to seal', p_proname;
  end if;
end
$function$;

comment on function hr.leave_seal_door(text, text) is
  'Seals a leave door against the Supabase default-privileges trap: a newly created public '
  'function picks up anon EXECUTE, and neither `grant to authenticated` nor `revoke from public` '
  'removes it — both revokes must be explicit and name anon. Every door migration in this lane '
  'ends by calling this, so replaying any one of them re-seals instead of regressing.';

select hr.leave_seal_door('hr_my_time_off');
select hr.leave_seal_door('hr_leave_request_preview');
select hr.leave_seal_door('hr_leave_request_submit');
select hr.leave_seal_door('hr_leave_request_cancel');
select hr.leave_seal_door('hr_leave_ledger_view');

-- -----------------------------------------------------------------------------------
-- 9. Self-proof
-- -----------------------------------------------------------------------------------

do $$
declare v_missing text;
begin
  select string_agg(f, ', ') into v_missing from unnest(array[
    'hr._leave_viewer','hr._leave_sentence','hr.my_time_off','hr.leave_request_preview',
    'hr.leave_request_submit','hr.leave_request_cancel','hr.leave_ledger_view',
    'public.hr_my_time_off','public.hr_leave_request_preview','public.hr_leave_request_submit',
    'public.hr_leave_request_cancel','public.hr_leave_ledger_view']) f
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = split_part(f,'.',1) and p.proname = split_part(f,'.',2));
  if v_missing is not null then
    raise exception 'hr_l5_04: these objects did not land: %', v_missing;
  end if;

  -- decision 4, asserted rather than asserted-about: the ledger view's source text must not
  -- mention the two compensation-derived columns at all.
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'leave_ledger_view') ~ '\ml\.(amount|rate)\M' then
    raise exception 'hr_l5_04: the ledger view selects amount or rate — SPEC-LEAVE §18 AR-5';
  end if;

  -- the unlimited sentence is the WORD, never a zero
  if hr._leave_sentence('{"unlimited":true}'::jsonb) <> 'Unlimited — requests still need approval.' then
    raise exception 'hr_l5_04: the unlimited sentence is wrong';
  end if;

  -- and NO door this file created may be reachable by an unauthenticated caller
  select string_agg(p.proname, ', ') into v_missing
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_my_time_off','hr_leave_request_preview','hr_leave_request_submit',
                       'hr_leave_request_cancel','hr_leave_ledger_view')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_missing is not null then
    raise exception 'hr_l5_04: these doors are executable by anon: %', v_missing;
  end if;
end $$;
