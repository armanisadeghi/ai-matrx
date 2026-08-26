-- HR domain L3 — migration 6 of 8 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE POST-LOCK CORRECTION LANE (L3-25) AND THE EXCEPTION RESOLUTION LANE (L3-14).
-- `hr.time_adjustment_create` is the ONLY door into a locked period, and it never rewrites one.
-- `hr.attendance_exception_resolve` is the manager's one act on an exception, and it is the place
-- where "a statutory premium cannot be excused into nonexistence" stops being a sentence in a spec
-- and becomes a refusal.
--
-- Authority: SPEC-TIME §1.3, §2.6, §4.3, §4.6, §5.2, §7.1; SPEC-DATA-MODEL §7.3/§7.5;
-- R-L3 L3-14 / L3-25. Applied live as `hr_l3_25_adjustment_and_exception_resolve`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 `excused` IS REFUSED ON `severity = 'violation'`, AND THERE IS NO KNOB, NO OVERRIDE AND NO
--    BREAK-GLASS. §2.6: a meal- or rest-premium violation "cannot be excused into nonexistence and
--    an org cannot configure that away". The refusal is the contract; the control's absence on the
--    surface is only courtesy. `allowedResolutions` is computed by
--    `hr._time_exception_allowed_resolutions` and returned on EVERY response so the client renders
--    the server's own list rather than a hardcoded set — the two can then never disagree.
--
-- 2. 🚨 THE REST PREMIUM IS CAPPED AT ONE PER DAY; A MEAL PREMIUM AND A REST PREMIUM ON THE SAME DAY
--    ARE TWO LINES, NEVER MERGED. §4.3's ruling, implemented as it is written: the cap is a
--    per-(employment, date, REST code) existence check on live `premium_only` intervals, and the
--    meal and rest lines are separate rows because they are separate statutory obligations with
--    separate codes. Merging them would make one violation invisible in the export. The MEAL side
--    is de-duplicated per (employment, date, code, source exception) — that is idempotency on
--    re-resolution, NOT a cap, and the two are labelled apart in the response.
--
-- 3. 🚨 THE PREMIUM LINE CARRIES `hours = 1.0` AND **NO AMOUNT**. §5.2 / AR2 LOCK 6 / "money never
--    comes from an advisory rule": one hour of premium pay is one hour AT THE REGULAR RATE, and the
--    regular rate for that week is a computed figure this lane does not own (the recompute engine,
--    E-11, does). So `amount` is NULL with a typed `calc.amount_absent` naming `rate_at_time` as the
--    missing fact. A zero here would read as "no premium owed", which is the exact opposite of what
--    the row means, and would be a wage error with a database column behind it.
--
-- 4. THE PREMIUM'S RULE SNAPSHOT IS THE EXCEPTION'S OWN. The interval exists BECAUSE of the rule
--    that raised the exception, so `rule_version_ids`, `engine_key` and `engine_version` are copied
--    from `hr.attendance_exception`, not re-derived. Re-resolving the jurisdiction here would let the
--    premium cite a different rule version than the violation it pays for.
--
-- 5. JURISDICTION IS READ FROM THE STAMPED RECORD, NEVER RESOLVED AT `now()`. §0 law 3. The
--    premium's `jurisdiction_id`, `work_location_id` and `tz` come off the exception row, which was
--    stamped when the violation was detected. `hr.time_adjustment` takes the same three from the
--    live `hr.work_interval` for that work date, falling back to the `hr.punch` chain. When neither
--    exists the call REFUSES with `hr_no_jurisdiction_stamp` naming what was missing — it never
--    invents a stamp, because a fabricated jurisdiction is a fabricated legal basis.
--
-- 6. `linked-to-schedule-change` IS NOT A `resolution_state` VALUE AND CANNOT BE ONE TODAY.
--    `hr.attendance_exception.resolution_state`'s live CHECK is
--    `open · acknowledged · excused · corrected · escalated · closed`, and the table has NO
--    `schedule_change_id` column (verified live). §2.6 lists "linked-to-schedule-change" as a state
--    the SURFACE renders. Implemented as `corrected` plus `metadata.schedule_change_id`, with the
--    label left to the client.
--    **OWED, owner SPEC-DATA-MODEL §7.x:** `hr.attendance_exception` gains a
--    `schedule_change_id uuid` column (it already has `punch_id`, `shift_id`, `work_interval_id`
--    and `corrective_action_id` — this is the missing sibling), and §2.6's state list says which of
--    its seven entries are stored states and which are rendered labels.
--
-- 7. `escalated` SETS THE STATE AND DOES NOT CALL `hr.wf_escalate`, BECAUSE THERE IS NOTHING TO
--    ESCALATE. `hr.wf_escalate(p_step_id)` escalates a WORKFLOW STEP; an `hr.attendance_exception`
--    has no workflow instance and no binding (there is no `exception_review` flow type, and adding
--    one is not this item's scope). The state moves and the row surfaces to HR; the door §2.6 names
--    does not exist yet.
--    **OWED, owner SPEC-TIME §2.6 / the exceptions lane:** either declare an exception-review flow
--    so `hr.wf_escalate` has a step to move, or restate §2.6's escalate as a state change.
--
-- 8. THE POST-LOCK REFUSAL ROUTES. `hr.time_adjustment_create` refuses an original period that is
--    NOT `locked`/`closed` with `hr_period_not_locked` and NAMES `hr_punch_correct` as the door —
--    an open period is corrected by fixing the punch, and a surface that offered an adjustment there
--    would create two records of one fact. Symmetrically,
--    `hr.attendance_exception_resolve` refuses a locked period with `hr_period_locked` (the code
--    `rpc.ts`'s `isPeriodLocked` reads) and names `hr_time_adjustment_create`. The two lanes point at
--    each other and neither ever overlaps.
--
-- 9. `target_pay_period_id` MAY BE NULL, AND THAT IS A STATE, NOT A FAILURE. The next open period
--    for the pay group is often not created yet when a correction is filed. Refusing would block a
--    legitimate correction on payroll's calendar housekeeping. The row is written with a NULL target
--    and `calc.target_pending = true`, and the response says so — `PeriodTransitionResult`'s sibling
--    type already declares `targetPayPeriodId: string | null`.
--
-- 10. `amount_delta = 0` IS RECORDED AS "NOT YET PRICED", NOT AS "NOTHING OWED". The column is
--     NOT NULL and the client defaults it to 0. Where the caller supplies 0 alongside a non-zero
--     hours delta, `calc.amount_pending = true` and `calc.amount_source = 'not_supplied'` so no
--     export line can read a placeholder as a priced figure.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. the allowed-resolution list (RD 1)
create or replace function hr._time_exception_allowed_resolutions(p_severity text)
returns text[] language sql immutable as $fn$
  -- 🚨 `excused` is ABSENT on a violation. This function is the ONLY place the list is built, and
  -- both the refusal and the `allowedResolutions` the client renders read it, so they cannot drift.
  select case when p_severity = 'violation'
              then ARRAY['acknowledged','corrected','escalated','closed']
              else ARRAY['acknowledged','excused','corrected','escalated','closed'] end;
$fn$;

comment on function hr._time_exception_allowed_resolutions is
  'SPEC-TIME §2.6 — what hr.attendance_exception_resolve will accept for one severity. `excused` is absent on severity=violation: a statutory-premium exception cannot be excused into nonexistence and an org cannot configure that away. Returned to the client as allowedResolutions so no surface hardcodes the set.';

-- ============================================================ 2. the exception row, client-shaped
create or replace function hr._time_exception_json(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'hr','public' as $fn$
  select jsonb_build_object(
    'id', ae.id,
    'employmentId', ae.employment_id,
    'employeeDisplayName', (select e.display_name from hr.employment em
                             join hr.employee e on e.id = em.employee_id
                            where em.id = ae.employment_id),
    'exceptionKind', ae.exception_kind,
    'severity', ae.severity,
    'resolutionState', ae.resolution_state,
    'detectedAt', ae.detected_at,
    'localWorkDate', ae.local_work_date,
    'tz', ae.tz,
    'varianceMinutes', ae.variance_minutes,
    'scheduledStartAt', ae.scheduled_start_at,
    'scheduledEndAt', ae.scheduled_end_at,
    'actualStartAt', ae.actual_start_at,
    'actualEndAt', ae.actual_end_at,
    'punchId', ae.punch_id,
    'shiftId', ae.shift_id,
    'workIntervalId', ae.work_interval_id,
    -- RD 6: no column exists; the link lives in metadata until SPEC-DATA-MODEL adds one
    'scheduleChangeId', ae.metadata -> 'schedule_change_id',
    'correctiveActionId', ae.corrective_action_id,
    'resolutionNote', ae.resolution_note,
    'resolvedAt', ae.resolved_at,
    'resolvedByName', (select e.display_name from hr.employment em
                        join hr.employee e on e.id = em.employee_id
                       where em.id = ae.resolved_by_employment_id),
    'premiumEarningCodeId', ae.premium_earning_code_id,
    -- 🚨 RD 1: the server's own list, every time
    'allowedResolutions', to_jsonb(hr._time_exception_allowed_resolutions(ae.severity)),
    'message', coalesce(ae.calc ->> 'message',
                        format('%s on %s', replace(ae.exception_kind,'_',' '), ae.local_work_date)),
    'isEstimate', ae.exception_kind in ('auto_closed_estimate','orphan_punch'),
    'workedAfterDenial', case when ae.exception_kind = 'unapproved_overtime'
                              then coalesce(ae.calc -> 'worked_after_denial', 'null'::jsonb)
                              else 'null'::jsonb end,
    'calc', jsonb_build_object('rule_version_ids', to_jsonb(ae.rule_version_ids),
                               'engine_key', ae.engine_key, 'engine_version', ae.engine_version,
                               'calc', ae.calc, 'computed_at', ae.computed_at))
    from hr.attendance_exception ae where ae.id = p_id;
$fn$;

comment on function hr._time_exception_json is
  'One hr.attendance_exception shaped as features/hr/time/api/types.ts AttendanceExceptionRow, including the server-computed allowedResolutions the client renders instead of a hardcoded action list.';

-- ============================================================ 3. the interval shape (shared) — defined before its callers
create or replace function hr._time_interval_json(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'hr','public' as $fn$
  select jsonb_build_object(
    'id', wi.id,
    'employmentId', wi.employment_id,
    'positionAssignmentId', wi.position_assignment_id,
    'workweekId', wi.workweek_id,
    'payPeriodId', wi.pay_period_id,
    'intervalKind', wi.interval_kind,
    'hoursCategory', wi.hours_category,
    'earningCodeId', wi.earning_code_id,
    'earningCode', ec.code,
    'earningCodeName', ec.name,
    'startedAt', wi.started_at, 'endedAt', wi.ended_at,
    'localWorkDate', wi.local_work_date, 'tz', wi.tz,
    'hours', wi.hours, 'rate', wi.rate,
    -- money is returned exactly as stored, INCLUDING NULL, with the absence typed
    'amount', wi.amount,
    'amountAbsent', case when wi.amount is null
      then coalesce(wi.calc -> 'amount_absent', jsonb_build_object('absent', true))
      else jsonb_build_object('absent', false) end,
    'isOvertime', wi.is_overtime,
    'roundingAppliedMinutes', wi.rounding_applied_minutes,
    'sourcePunchIds', to_jsonb(wi.source_punch_ids),
    'attendanceExceptionId', wi.calc -> 'premium_from_exception_id',
    'isCurrent', wi.is_current, 'supersededById', wi.superseded_by_id,
    'calc', jsonb_build_object('rule_version_ids', to_jsonb(wi.rule_version_ids),
                               'engine_key', wi.engine_key, 'engine_version', wi.engine_version,
                               'calc', wi.calc, 'computed_at', wi.computed_at))
    from hr.work_interval wi join hr.earning_code ec on ec.id = wi.earning_code_id
   where wi.id = p_id;
$fn$;

comment on function hr._time_interval_json is
  'One hr.work_interval shaped as features/hr/time/api/types.ts WorkIntervalRow. `amount` is returned exactly as stored including NULL, with a typed amountAbsent naming why — never a zero, a dash or a guess.';

-- ============================================================ 4. hr.time_adjustment_create (L3-25)
create or replace function hr.time_adjustment_create(p_employment_id uuid,
                                                     p_original_pay_period_id uuid,
                                                     p_work_date date,
                                                     p_earning_code_id uuid,
                                                     p_hours_delta numeric,
                                                     p_amount_delta numeric default 0,
                                                     p_reason_category_id uuid default null,
                                                     p_reason_note text default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_uid    uuid := auth.uid();
  v_emp    hr.employment%rowtype;
  v_per    hr.pay_period%rowtype;
  v_ec     hr.earning_code%rowtype;
  v_self   boolean;
  v_mine   uuid[];
  v_actor  uuid;
  v_stamp  record;
  v_target uuid;
  v_id     uuid;
  v_req    jsonb;
  v_inst   uuid;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'A correction is always filed by somebody. Sign in and try again.');
  end if;
  if p_employment_id is null or p_original_pay_period_id is null or p_work_date is null
     or p_earning_code_id is null or p_hours_delta is null then
    return hr._time_refusal('hr_arguments_incomplete',
      'A correction needs the employment, the period it corrects, the work date, the earning code and the hours change.',
      jsonb_build_object('p_employment_id', p_employment_id,
                         'p_original_pay_period_id', p_original_pay_period_id,
                         'p_work_date', p_work_date, 'p_earning_code_id', p_earning_code_id,
                         'p_hours_delta', p_hours_delta));
  end if;
  -- the reason is checked BEFORE anything is read, because it is the cheapest refusal to act on
  if coalesce(btrim(p_reason_note), '') = '' then
    return hr._time_refusal('hr_adjustment_reason_required',
      'A post-lock correction requires a written reason. It rides the export and is what a later auditor reads.');
  end if;

  select * into v_emp from hr.employment where id = p_employment_id and deleted_at is null;
  if not found then
    return hr._time_refusal('hr_employment_not_found',
      'No employment with that id is readable.',
      jsonb_build_object('employment_id', p_employment_id));
  end if;
  select * into v_per from hr.pay_period where id = p_original_pay_period_id;
  if not found then
    return hr._time_refusal('hr_pay_period_not_found',
      'No pay period with that id exists.',
      jsonb_build_object('pay_period_id', p_original_pay_period_id));
  end if;
  if v_per.organization_id <> v_emp.organization_id then
    return hr._time_refusal('hr_cross_organization',
      'The employment and the pay period belong to different organizations.');
  end if;

  -- 🚨 RD 8: the ONLY door into a locked period, and it refuses everywhere else.
  if v_per.state not in ('locked','closed') then
    return hr._time_refusal('hr_period_not_locked',
      format('This pay period is %s, not locked. A period that is still open is corrected by fixing the punch, not by filing an adjustment — an adjustment here would create a second record of the same fact.', v_per.state),
      jsonb_build_object('pay_period_id', v_per.id, 'state', v_per.state,
                         'door', 'hr_punch_correct',
                         'adjustment_allowed_states', to_jsonb(ARRAY['locked','closed'])));
  end if;

  select * into v_ec from hr.earning_code where id = p_earning_code_id and deleted_at is null;
  if not found then
    return hr._time_refusal('hr_earning_code_not_found',
      'No earning code with that id is readable.',
      jsonb_build_object('earning_code_id', p_earning_code_id));
  end if;
  if v_ec.organization_id <> v_emp.organization_id then
    return hr._time_refusal('hr_cross_organization',
      'That earning code belongs to a different organization.');
  end if;
  if not v_ec.is_active then
    return hr._time_refusal('hr_earning_code_inactive',
      format('The earning code %s (%s) is not active and cannot be used on a new correction.',
             v_ec.code, v_ec.name),
      jsonb_build_object('earning_code_id', v_ec.id, 'code', v_ec.code));
  end if;

  -- ---------------------------------------------------------------- authority (subject or reach)
  v_mine := hr.employments_of(v_uid, p_work_date);
  v_self := p_employment_id = any (coalesce(v_mine, '{}'::uuid[]));
  if not v_self and not hr.capability(v_uid, 'time.read', p_employment_id, p_work_date) then
    return hr._time_refusal('hr_no_adjustment_authority',
      'A correction is filed by the employee it is about, by a manager with reach over them, or by HR. You are none of those for this employment.',
      jsonb_build_object('capability_required', 'time.read',
                         'subject_employment_id', p_employment_id, 'as_of', p_work_date));
  end if;
  v_actor := hr._time_actor_employment(v_uid, v_emp.organization_id);
  if v_actor is null then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in this organization, so this correction cannot be attributed to anybody.');
  end if;

  -- ---------------------------------------------------------------- RD 5: the STAMPED jurisdiction
  select wi.work_location_id, wi.jurisdiction_id, wi.tz, 'work_interval'::text src
    into v_stamp
    from hr.work_interval wi
   where wi.employment_id = p_employment_id and wi.local_work_date = p_work_date and wi.is_current
   order by wi.started_at nulls last limit 1;
  if not found then
    select p.work_location_id, p.jurisdiction_id, p.tz, 'punch'::text src
      into v_stamp
      from hr.punch p
     where p.employment_id = p_employment_id and p.local_work_date = p_work_date
       and p.voided_at is null
     order by p.occurred_at limit 1;
  end if;
  if not found or v_stamp.jurisdiction_id is null then
    return hr._time_refusal('hr_no_jurisdiction_stamp',
      format('There is no computed interval and no punch on %s for this employment, so there is no recorded jurisdiction to attach this correction to. A jurisdiction is read from the record of the day, never guessed at today''s date.', p_work_date),
      jsonb_build_object('employment_id', p_employment_id, 'work_date', p_work_date,
                         'looked_in', to_jsonb(ARRAY['hr.work_interval (is_current)','hr.punch (not voided)'])));
  end if;

  -- ---------------------------------------------------------------- RD 9: the next open period
  select pp.id into v_target
    from hr.pay_period pp
   where pp.pay_group_id = v_per.pay_group_id and pp.state = 'open'
     and pp.period_start_on > v_per.period_end_on
   order by pp.sequence_number limit 1;

  perform hr.arm_write();
  insert into hr.time_adjustment
    (organization_id, employment_id, original_pay_period_id, target_pay_period_id,
     work_date, earning_code_id, hours_delta, amount_delta, rate,
     reason_category_id, reason_note,
     work_location_id, jurisdiction_id, tz, local_work_date,
     rule_version_ids, engine_key, engine_version, calc,
     actor_type, actor_employment_id, actor_user_id)
  values (v_emp.organization_id, p_employment_id, p_original_pay_period_id, v_target,
          p_work_date, p_earning_code_id, p_hours_delta, coalesce(p_amount_delta, 0), null,
          p_reason_category_id, btrim(p_reason_note),
          v_stamp.work_location_id, v_stamp.jurisdiction_id, v_stamp.tz, p_work_date,
          '{}'::uuid[], 'hr.time.adjustment', 'l3.1',
          jsonb_build_object(
            'jurisdiction_source', v_stamp.src,
            'jurisdiction_read_as_of', p_work_date,
            'original_period_state', v_per.state,
            'target_pending', v_target is null,
            -- RD 10: a 0 delta supplied by the caller is NOT a priced figure
            'amount_source', case when coalesce(p_amount_delta, 0) = 0 then 'not_supplied'
                                  else 'caller_supplied' end,
            'amount_pending', coalesce(p_amount_delta, 0) = 0 and coalesce(p_hours_delta, 0) <> 0,
            'note', 'The locked period is never rewritten. This adjustment rides the NEXT export, tagged to the original period.'),
          case when v_self then 'employee' else 'manager' end, v_actor, v_uid)
  returning id into v_id;

  -- ---------------------------------------------------------------- the correction workflow
  v_req := hr.wf_request('timecard_correction', 'hr_time_adjustment', v_id, v_emp.organization_id,
             jsonb_build_object('employment_id', p_employment_id,
                                'original_pay_period_id', p_original_pay_period_id,
                                'target_pay_period_id', v_target,
                                'work_date', p_work_date,
                                'earning_code', v_ec.code,
                                'earning_code_id', p_earning_code_id,
                                'hours_delta', p_hours_delta,
                                'amount_delta', coalesce(p_amount_delta, 0),
                                'original_period_state', v_per.state),
             p_employment_id, false,
             format('adjustment:%s', v_id));
  v_inst := nullif(v_req ->> 'instance_id', '')::uuid;
  if v_inst is not null then
    perform hr.arm_write();
    update hr.time_adjustment set workflow_instance_id = v_inst where id = v_id;
  end if;

  return hr._time_ok(jsonb_build_object(
    'adjustmentId', v_id,
    'originalPayPeriodId', p_original_pay_period_id,
    'targetPayPeriodId', v_target,
    'workflowInstanceId', v_inst,
    'hoursDelta', p_hours_delta,
    'amountDelta', coalesce(p_amount_delta, 0),
    'workflow', v_req,
    'notice', case when v_target is null
      then 'No open pay period follows this one yet, so this correction is not tagged to a target period. It will ride the next export once payroll opens one; the locked period is never rewritten either way.'
      else 'This correction rides the next export, tagged to the original period. The locked period is never rewritten and its delivered export is never regenerated.' end,
    'provenance', jsonb_build_object(
      'engine_key', 'hr.time.adjustment', 'engine_version', 'l3.1',
      'rule_version_ids', '[]'::jsonb,
      'jurisdiction_source', v_stamp.src, 'as_of', p_work_date,
      'note', 'The jurisdiction on this row was READ from the stamped record of that work date, never resolved at now(). The money on it is whatever the filer supplied; nothing here prices an adjustment.')));
end $fn$;

comment on function hr.time_adjustment_create is
  'SPEC-TIME §1.3 / §7.1 / L3-25 — the post-lock correction lane. Refuses unless the original period is locked or closed (an open period is corrected by fixing the punch, and the refusal names that door), refuses an empty reason note and an inactive earning code, sets target_pay_period_id to the next open period, reads the jurisdiction from the stamped record of the work date, and opens a timecard_correction workflow instance against the adjustment row. The locked period is never rewritten.';

-- ============================================================ 5. hr.attendance_exception_resolve (L3-14)
create or replace function hr.attendance_exception_resolve(p_exception_id uuid,
                                                           p_resolution_state text,
                                                           p_note text default null,
                                                           p_premium_earning_code_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_uid      uuid := auth.uid();
  v_ae       hr.attendance_exception%rowtype;
  v_allowed  text[];
  v_actor    uuid;
  v_lock     jsonb;
  v_wants    boolean;
  v_code     hr.earning_code%rowtype;
  v_want     text;
  v_ww       uuid;
  v_existing uuid;
  v_new      uuid;
  v_written  jsonb := '[]'::jsonb;
  v_capped   boolean := false;
  v_note     text;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'Resolving an exception is always an act by somebody. Sign in and try again.');
  end if;
  if p_exception_id is null or coalesce(btrim(p_resolution_state), '') = '' then
    return hr._time_refusal('hr_arguments_incomplete',
      'Both the exception and the resolution are required.');
  end if;

  select * into v_ae from hr.attendance_exception where id = p_exception_id;
  if not found then
    return hr._time_refusal('hr_exception_not_found',
      'No attendance exception with that id is readable.',
      jsonb_build_object('exception_id', p_exception_id));
  end if;

  v_allowed := hr._time_exception_allowed_resolutions(v_ae.severity);

  -- ---------------------------------------------------------------- authority
  if not hr.capability(v_uid, 'time.read', v_ae.employment_id, v_ae.local_work_date) then
    return hr._time_refusal('hr_no_exception_authority',
      'Resolving an attendance exception is a manager or HR act. An employee can read their own exceptions and comment on them, but not resolve them. You hold no reach over this employment as of this work date.',
      jsonb_build_object('capability_required', 'time.read',
                         'subject_employment_id', v_ae.employment_id,
                         'as_of', v_ae.local_work_date,
                         'allowedResolutions', to_jsonb(v_allowed)));
  end if;
  v_actor := hr._time_actor_employment(v_uid, v_ae.organization_id);
  if v_actor is null then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in this organization, so this resolution cannot be attributed to anybody.');
  end if;

  -- ---------------------------------------------------------------- 🚨 RD 1: the statutory refusal
  if p_resolution_state = 'excused' and v_ae.severity = 'violation' then
    return hr._time_refusal('hr_statutory_premium_not_excusable',
      'This is a statutory violation, and a statutory violation cannot be excused. The premium is owed whether or not anybody agrees it should have happened. Resolve it as corrected — which writes the premium line — or acknowledge it. There is no configuration that changes this.',
      jsonb_build_object('exception_id', v_ae.id, 'exception_kind', v_ae.exception_kind,
                         'severity', v_ae.severity,
                         'allowedResolutions', to_jsonb(v_allowed),
                         'is_a_knob', false));
  end if;
  if not (p_resolution_state = any (v_allowed)) then
    return hr._time_refusal('hr_exception_resolution_unknown',
      format('%s is not a resolution this exception accepts.', p_resolution_state),
      jsonb_build_object('exception_id', v_ae.id, 'severity', v_ae.severity,
                         'allowedResolutions', to_jsonb(v_allowed)));
  end if;
  -- §2.6 / §4.3: excuse REQUIRES a note; acknowledge does not.
  if p_resolution_state = 'excused' and coalesce(btrim(p_note), '') = '' then
    return hr._time_refusal('hr_exception_note_required',
      'Excusing an exception requires a written reason. Acknowledging one does not — that is the difference between the two.',
      jsonb_build_object('allowedResolutions', to_jsonb(v_allowed)));
  end if;

  -- ---------------------------------------------------------------- RD 8: the lock routes onward
  v_lock := hr._punch_period_lock(v_ae.employment_id, v_ae.local_work_date);
  if coalesce((v_lock ->> 'locked')::boolean, false) then
    return hr._time_refusal('hr_period_locked',
      format('The pay period covering %s is %s. Nothing in it is editable in place, and that includes writing a premium line. File a correction instead — it rides the next export, tagged to this period.',
             v_ae.local_work_date, v_lock ->> 'state'),
      jsonb_build_object('pay_period_id', v_lock -> 'pay_period_id', 'state', v_lock -> 'state',
                         'door', 'hr_time_adjustment_create',
                         'allowedResolutions', to_jsonb(v_allowed)));
  end if;

  -- ---------------------------------------------------------------- the premium line, where owed
  v_wants := v_ae.exception_kind in ('meal_not_provided','rest_not_provided')
             and p_resolution_state in ('acknowledged','corrected','closed');

  if v_wants then
    v_want := case v_ae.exception_kind when 'meal_not_provided' then 'MEAL_PREMIUM'
                                       else 'REST_PREMIUM' end;
    if p_premium_earning_code_id is not null then
      select * into v_code from hr.earning_code
       where id = p_premium_earning_code_id and deleted_at is null;
    else
      select * into v_code from hr.earning_code
       where organization_id = v_ae.organization_id and code = v_want and deleted_at is null;
    end if;

    if v_code.id is null then
      return hr._time_refusal('hr_premium_earning_code_missing',
        format('This organization has no %s earning code, so the premium this violation owes cannot be written. Seed the earning-code registry for this organization first.', v_want),
        jsonb_build_object('expected_code', v_want, 'organization_id', v_ae.organization_id,
                           'door', 'hr.earning_code_seed_org',
                           'allowedResolutions', to_jsonb(v_allowed)));
    end if;
    if v_code.code <> v_want or not v_code.is_statutory_premium or not v_code.is_active then
      return hr._time_refusal('hr_premium_earning_code_mismatch',
        format('A %s exception is paid on %s. The code supplied was %s (active=%s, statutory=%s).',
               v_ae.exception_kind, v_want, v_code.code, v_code.is_active, v_code.is_statutory_premium),
        jsonb_build_object('expected_code', v_want, 'supplied_code', v_code.code,
                           'allowedResolutions', to_jsonb(v_allowed)));
    end if;

    -- 🚨 RD 2: the rest premium is ONE PER DAY; the meal line is de-duplicated, not capped.
    select wi.id into v_existing
      from hr.work_interval wi
     where wi.employment_id = v_ae.employment_id
       and wi.local_work_date = v_ae.local_work_date
       and wi.is_current and wi.interval_kind = 'premium_only'
       and wi.earning_code_id = v_code.id
     limit 1;

    if v_existing is not null then
      v_capped := true;
    else
      -- RD 3/4: the workweek the premium belongs to is READ, never invented
      select wi.workweek_id into v_ww
        from hr.work_interval wi
       where wi.employment_id = v_ae.employment_id
         and wi.local_work_date = v_ae.local_work_date and wi.is_current
       limit 1;
      if v_ww is null then
        select ww.id into v_ww from hr.workweek ww
         where ww.employment_id = v_ae.employment_id
           and v_ae.local_work_date between ww.week_start_local_date
                                        and (ww.week_start_local_date + 6)
         order by ww.week_start_local_date desc limit 1;
      end if;
      if v_ww is null then
        return hr._time_refusal('hr_no_workweek_for_premium',
          format('There is no computed workweek covering %s for this employment, so a premium line has nowhere to attach. The premium is still owed — run the recompute for this period first, then resolve this exception again.', v_ae.local_work_date),
          jsonb_build_object('employment_id', v_ae.employment_id,
                             'local_work_date', v_ae.local_work_date,
                             'door', 'E-11 POST /hr/time/recompute',
                             'premium_still_owed', true,
                             'allowedResolutions', to_jsonb(v_allowed)));
      end if;

      perform hr.arm_write();
      insert into hr.work_interval
        (organization_id, employment_id, workweek_id, pay_period_id,
         interval_kind, hours_category, earning_code_id,
         started_at, ended_at, hours, rate, amount, is_overtime,
         source_punch_ids, rounding_applied_minutes, is_current,
         work_location_id, jurisdiction_id, tz, local_work_date,
         rule_version_ids, engine_key, engine_version, calc)
      values (v_ae.organization_id, v_ae.employment_id, v_ww,
              nullif(v_lock ->> 'pay_period_id','')::uuid,
              'premium_only', 'premium', v_code.id,
              null, null, 1.0, null,
              -- 🚨 RD 3: NO AMOUNT. One hour at the regular rate is a computed figure this lane
              -- does not own, and a zero here would read as "no premium owed".
              null, false,
              -- the ATTESTATION punch is the evidence this premium rests on (§4.3)
              case when v_ae.punch_id is not null then ARRAY[v_ae.punch_id] else '{}'::uuid[] end,
              0, true,
              -- RD 5: the stamp comes off the exception, which was stamped at detection
              v_ae.work_location_id, v_ae.jurisdiction_id, v_ae.tz, v_ae.local_work_date,
              -- RD 4: the premium cites the rule that raised the violation it pays for
              v_ae.rule_version_ids, v_ae.engine_key, v_ae.engine_version,
              jsonb_build_object(
                'premium_from_exception_id', v_ae.id,
                'exception_kind', v_ae.exception_kind,
                'severity', v_ae.severity,
                'hours', 1.0,
                'amount_absent', jsonb_build_object(
                  'absent', true, 'advisory', false, 'money_withheld', false,
                  'incomplete', to_jsonb(ARRAY['regular_rate_of_pay_for_the_workweek']),
                  'note', 'No amount is shown because one hour of statutory premium is one hour AT THE REGULAR RATE, and that rate is computed by the recompute engine. This is not zero, and the premium is owed.'),
                'rest_premium_daily_cap', v_ae.exception_kind = 'rest_not_provided',
                'never_merged_with', 'A meal premium and a rest premium on the same day are two separate lines.'))
      returning id into v_new;
      v_written := v_written || hr._time_interval_json(v_new);
    end if;
  end if;

  -- ---------------------------------------------------------------- the resolution itself
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  perform hr.arm_write();
  update hr.attendance_exception
     set resolution_state = p_resolution_state,
         resolution_note = coalesce(v_note, resolution_note),
         resolved_at = case when p_resolution_state in ('open') then null else now() end,
         resolved_by_employment_id = case when p_resolution_state in ('open') then null else v_actor end,
         premium_earning_code_id = coalesce(v_code.id, premium_earning_code_id),
         work_interval_id = coalesce(v_new, work_interval_id)
   where id = p_exception_id;

  return hr._time_ok(jsonb_build_object(
    'exception', hr._time_exception_json(p_exception_id),
    'intervalsWritten', v_written,
    'premiumAlreadyPresent', v_capped,
    'notice', case
      when v_capped and v_ae.exception_kind = 'rest_not_provided'
        then 'A rest premium was already written for this day. The rest premium is capped at one per day, so no second line was added — the existing one stands.'
      when v_capped
        then 'A meal premium for this day and this exception already exists, so no duplicate was written.'
      when v_new is not null and v_ae.exception_kind = 'meal_not_provided'
        then 'A meal premium line was written for this day. If a rest premium is also owed today it is a SEPARATE line — the two are never merged.'
      when v_new is not null
        then 'A rest premium line was written for this day. It is capped at one per day, and it is never merged with a meal premium.'
      when p_resolution_state = 'escalated'
        then 'This exception is marked escalated and surfaces to HR. There is no workflow step behind an attendance exception today, so nothing was routed through the approval engine.'
      else null end,
    'allowedResolutions', to_jsonb(v_allowed)));
end $fn$;

comment on function hr.attendance_exception_resolve is
  'SPEC-TIME §2.6 / §4.3 / L3-14 — the manager''s one act on an attendance exception. `excused` is REFUSED on severity=violation and that is not configurable; `excused` without a note is refused; a locked period is refused with the adjustment lane named. Where a premium is owed it writes interval_kind=premium_only, hours=1.0, MEAL_PREMIUM/REST_PREMIUM, the attestation punch id in source_punch_ids and NO amount (one hour at the regular rate is the engine''s figure, not a zero). The rest premium is capped at one per day; a meal premium and a rest premium on the same day are two lines and are never merged. Every response returns allowedResolutions so the client renders the server''s list.';

-- ============================================================ 6. the PostgREST wrappers
create or replace function public.hr_time_adjustment_create(p_employment_id uuid,
                                                            p_original_pay_period_id uuid,
                                                            p_work_date date,
                                                            p_earning_code_id uuid,
                                                            p_hours_delta numeric,
                                                            p_amount_delta numeric default 0,
                                                            p_reason_category_id uuid default null,
                                                            p_reason_note text default null)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.time_adjustment_create($1, $2, $3, $4, $5, $6, $7, $8);
$fn$;

create or replace function public.hr_attendance_exception_resolve(p_exception_id uuid,
                                                                  p_resolution_state text,
                                                                  p_note text default null,
                                                                  p_premium_earning_code_id uuid default null)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.attendance_exception_resolve($1, $2, $3, $4);
$fn$;

comment on function public.hr_time_adjustment_create is
  'PostgREST-reachable wrapper for hr.time_adjustment_create. Thin delegate, no logic. `anon` holds nothing.';
comment on function public.hr_attendance_exception_resolve is
  'PostgREST-reachable wrapper for hr.attendance_exception_resolve. Thin delegate, no logic. `anon` holds nothing.';

do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr._time_exception_allowed_resolutions(text)',
    'hr._time_exception_json(uuid)',
    'hr._time_interval_json(uuid)',
    'hr.time_adjustment_create(uuid,uuid,date,uuid,numeric,numeric,uuid,text)',
    'hr.attendance_exception_resolve(uuid,text,text,uuid)',
    'public.hr_time_adjustment_create(uuid,uuid,date,uuid,numeric,numeric,uuid,text)',
    'public.hr_attendance_exception_resolve(uuid,text,text,uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v jsonb; a text[];
begin
  if to_regprocedure('hr.time_adjustment_create(uuid,uuid,date,uuid,numeric,numeric,uuid,text)') is null
     or to_regprocedure('hr.attendance_exception_resolve(uuid,text,text,uuid)') is null
     or to_regprocedure('public.hr_time_adjustment_create(uuid,uuid,date,uuid,numeric,numeric,uuid,text)') is null
     or to_regprocedure('public.hr_attendance_exception_resolve(uuid,text,text,uuid)') is null then
    raise exception 'hr_l3_25: one of the four functions was not created';
  end if;
  if has_function_privilege('anon', 'public.hr_time_adjustment_create(uuid,uuid,date,uuid,numeric,numeric,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.hr_attendance_exception_resolve(uuid,text,text,uuid)', 'execute') then
    raise exception 'hr_l3_25: anon holds EXECUTE on a write wrapper';
  end if;

  -- 🚨 RD 1: `excused` is structurally absent on a violation and present otherwise
  a := hr._time_exception_allowed_resolutions('violation');
  if 'excused' = any (a) then
    raise exception 'hr_l3_25: `excused` was offered on a statutory violation';
  end if;
  a := hr._time_exception_allowed_resolutions('warn');
  if not ('excused' = any (a)) then
    raise exception 'hr_l3_25: `excused` must remain available below violation severity';
  end if;

  -- both writers refuse an unauthenticated caller with a NAMED, FLAT code
  v := hr.time_adjustment_create('00000000-0000-0000-0000-000000000000'::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid, current_date,
        '00000000-0000-0000-0000-000000000000'::uuid, 1);
  if coalesce((v ->> 'ok')::boolean, true) or jsonb_typeof(v -> 'error') <> 'string' then
    raise exception 'hr_l3_25: time_adjustment_create did not refuse with a flat named code: %', v;
  end if;
  v := hr.attendance_exception_resolve('00000000-0000-0000-0000-000000000000'::uuid, 'acknowledged');
  if coalesce((v ->> 'ok')::boolean, true) or jsonb_typeof(v -> 'error') <> 'string' then
    raise exception 'hr_l3_25: attendance_exception_resolve did not refuse with a flat named code: %', v;
  end if;
end $$;
