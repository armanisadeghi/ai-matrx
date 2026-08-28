-- HR domain L5 — migration 7 (register item HRB-017, lane L5 Leave & PTO).
--
-- THE FREE WEEK, CLOSED. `hr_l5_06` introduced `hr._leave_span_is_costless`; this file wires it
-- into the two places an employee meets it, so a request that would cost nothing is refused with
-- the remedy instead of quietly booking a person out against a balance that never moves.
--
-- Authority: SPEC-LEAVE §4.1 (the day-hours basis), §4.2 (hard findings carry the number and the
--            action that fixes them). Applied live as `hr_l5_07_zero_hours_refusal`. Idempotent.
--
-- ===================================================================================
-- WHY THIS EXISTS, IN ONE PARAGRAPH
--
-- §4.1's basis is: a published shift, else the FTE standard day, else zero. That third rung is
-- correct for a Saturday and catastrophic for an employment whose `standard_hours_per_week` was
-- never set — the whole span then costs NOTHING, the request sails through validation, the
-- employee is marked out for a week, and the balance never moves. It is not hypothetical:
-- **every position assignment in the first organization this lane ran against had
-- `standard_hours_per_week` NULL**, because the hire flow does not require it. That is L1's row to
-- fix and it is reported there. What this lane owes is that the gap cannot pass QUIETLY in the
-- meantime — so the refusal names the missing fact and the person who can supply it, rather than
-- printing a zero that reads like an answer.
-- ===================================================================================

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

  -- 🚨 THE FREE WEEK. Refused here, not booked, and the sentence names the missing fact.
  if hr._leave_span_is_costless(v_span) then
    return jsonb_build_object('granted', false, 'reason','no_working_hours_on_these_days',
      'detail','We cannot work out how long your working day is, so this request would cost no '
            || 'time at all. There is no shift scheduled on these days and no standard weekly '
            || 'hours on your position. Ask HR to set your standard hours, or pick days you are '
            || 'scheduled to work.',
      'span', v_span);
  end if;

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
       and (p_ends_on - p_starts_on) + 1 > v_pol.documentation_required_after_days),
    -- the form learns about the free week BEFORE the employee presses submit, and learns it in
    -- the same words the submit door will use if they press it anyway
    'submittable', not hr._leave_span_is_costless(v_span),
    'blocker', case when hr._leave_span_is_costless(v_span) then
      'We cannot work out how long your working day is, so this request would cost no time at '
      || 'all. There is no shift scheduled on these days and no standard weekly hours on your '
      || 'position. Ask HR to set your standard hours, or pick days you are scheduled to work.'
      end);
end
$function$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_submit';
  if v_def not like '%_leave_span_is_costless%' then
    raise exception 'hr_l5_07: the submit door does not refuse a costless span';
  end if;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_preview';
  if v_def not like '%submittable%' then
    raise exception 'hr_l5_07: the preview does not tell the form the request is unsubmittable';
  end if;
end $$;
