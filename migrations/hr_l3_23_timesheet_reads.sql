-- HR domain L3 — migration 4 of 7 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE TWO TIMESHEET READS (L3-22, L3-23). `hr.timesheet_get` is the single read behind routes 5 and
-- 29; `hr.timesheet_period_grid` is the fully-paginated approval grid behind route 28. Both ship a
-- thin `public.hr_<name>` wrapper, because the `hr` schema is not exposed to PostgREST.
--
-- Authority: SPEC-TIME §1.3, §2.2, §2.4, §5, §6.1, §6.2, §8, §9, §10, §14 D8; SPEC-CONTRACTS §2.2
-- (timesheet reads stay direct RPCs); R-L3 U-03/U-13. Applied live as `hr_l3_23_timesheet_reads`.
-- Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE RAW PUNCH CHAIN IS ITS OWN TOP-LEVEL BLOCK PER DAY AND IS NEVER INTERLEAVED WITH THE
--    COMPUTED ROWS. AD-11 / §5.1: "the two blocks are never interleaved", and a surface cannot
--    conflate what the contract has already separated. Each day returns `intervals[]` (computed) and
--    `punch_chain[]` (raw) as sibling arrays. Voided punches are IN the chain, struck-through by the
--    `voided_at` / `voided_by_punch_id` fields — a hidden void is a destroyed record.
--
-- 2. 🚨 EVERY COMPUTED FIGURE CARRIES ITS `{{CALC}}` BLOCK, AT EVERY GRAIN, AS A NAMED `calc_ref`
--    OBJECT. AR2 LOCK 6: a figure rendered without a path to `rule_version_ids`, `engine_key`,
--    `engine_version` and `calc` is an unfinished surface. So the interval, the workweek and the
--    pay_period_employment row each carry one, and the drawer has somewhere to open from wherever
--    the eye lands. This is why the payload is verbose: the alternative is a screen that cannot
--    answer "why".
--
-- 3. 🚨 MONEY IS NEVER SUBSTITUTED. `amount` is returned exactly as stored — including NULL — and a
--    sibling `amount_absent` object names WHY when it is missing (`advisory`, `incomplete`,
--    `money_withheld` lifted straight out of the stored `calc` envelope). No zero, no dash, no
--    guess. A client that renders `0` for a withheld amount is a defect, and this contract gives it
--    no excuse: the absence is typed.
--
-- 4. THE PAY-PERIOD TOTAL IS LABELLED A DISPLAY SUM AND CARRIES ITS BOUNDARY NOTE IN WORDS. §5.1:
--    totals appear at three grains, always labelled, and the pay-period total is a sum of days for
--    display only. Where `hr.pay_period.boundary_workweek_ids` is non-empty the total carries a
--    sentence naming how many workweeks straddle the edges and where their overtime was attributed.
--    A number that is a sum of parts computed under a different rule needs to say so.
--
-- 5. 🚨 THE GRID EXCLUDES A GATED WORKER CLASS ENTIRELY — IT DOES NOT SHOW IT WITH ZEROS. §8: a
--    contractor "shown with zeros" reads as an absent worker rather than an inapplicable one, and
--    that is the difference between a manager chasing somebody and a manager understanding the
--    system. The enabled set is read from the four `punch_enabled_worker_class_*` knobs, resolved
--    AS OF THE PERIOD END DATE against `hr.position_assignment` — never a person-level flag and
--    never the presence of an engagement row. `contractor` has no knob and can never be enabled.
--
-- 6. 🚨 VARIANCE RETURNS A NULL AND A TYPED MARKER, NEVER A ZERO. §6.2: where no schedule exists
--    the column reads "Not scheduled", never `0`, which would read as perfect adherence. The
--    contract returns `scheduled_hours: null`, `variance_hours: null`, `variance_state:
--    "not_scheduled"`. Until lane L4's `hr.shift` rows exist, EVERY row comes back not_scheduled —
--    which is correct, not broken (R-L3 U-17).
--
-- 7. LAW 3: THE GRID IS FULLY PAGINATED AND REPORTS ITS OWN TOTAL. A capped fetch is a defect. The
--    envelope carries `total_count`, `limit`, `offset`, `has_more` and `next_offset`, so an
--    existence check or a set subtraction over this read cannot go confidently wrong. The default
--    page is 100 and the ceiling is 500; `total_count` is the honest figure regardless of page size.
--
-- 8. THE GRID'S AUTHORITY GATE IS `timecard_approve` ANYWHERE IN THE PAY GROUP, DEREFERENCED
--    THROUGH THE ENGINE'S OWN HOLDER RESOLVER RATHER THAN A SECOND COPY OF IT.
--    `hr._time_has_timecard_approve` walks live `hr.approval_authority` rows for the action and asks
--    `hr._wf_holder_employments` to dereference each holder — the same function the workflow
--    selector uses. HR and payroll readers qualify through the `time.read` capability instead. Two
--    doors, one predicate each, no third implementation.
--
-- 9. DEFAULT SORT PUTS DECISIONS FIRST (§6.2): open exceptions, then disputes, then overtime, then
--    clean rows, then name. A grid whose default order is alphabetical makes a manager hunt for the
--    work, and the work is the point of the screen.
--
-- 10. `as_of` IS THE PERIOD END DATE, NEVER `now()`. Law 3 of §0: jurisdiction and eligibility are
--     read as of the EVENT date. A manager reviewing a closed period in March must see the access
--     and the worker class that applied in February.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. small shared predicates
create or replace function hr._time_punch_enabled_worker_classes()
returns text[] language sql stable security definer set search_path to 'hr','public' as $fn$
  -- 🚨 `contractor` has no knob and therefore cannot appear here (§8, RD 5 of hr_l3_21).
  select coalesce(array_agg(c order by c), '{}'::text[])
    from (values ('employee'), ('intern'), ('seasonal'), ('volunteer')) v(c)
   where coalesce((hr._knob('hr.time_and_attendance', 'punch_enabled_worker_class_' || v.c) #>> '{}')::boolean,
                  false);
$fn$;

comment on function hr._time_punch_enabled_worker_classes is
  'SPEC-TIME §8 — the worker classes that may punch, read from the four decomposed knobs. `contractor` is structurally absent: there is no knob to turn on.';

create or replace function hr._time_has_timecard_approve(p_user uuid, p_organization_id uuid,
                                                         p_at date default null)
returns boolean language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_at date := coalesce(p_at, current_date);
  v_mine uuid[];
  r record;
begin
  if p_user is null or p_organization_id is null then return false; end if;
  v_mine := hr.employments_of(p_user, v_at);
  if v_mine is null or cardinality(v_mine) = 0 then return false; end if;

  -- HR / payroll readers come in through the capability lane, not the authority lane.
  if hr.capability(p_user, 'time.read', null, v_at) then return true; end if;

  -- RD 8: dereference each holder with the engine's own resolver; never a second copy of §2.2.
  for r in
    select aa.holder_kind, aa.holder_id
      from hr.approval_authority aa
     where aa.action_type = 'timecard_approve'
       and aa.organization_id = p_organization_id
       and aa.is_active
       and aa.effective_from <= v_at
       and (aa.effective_to is null or aa.effective_to >= v_at)
  loop
    if hr._wf_holder_employments(r.holder_kind, r.holder_id, p_organization_id, v_at) && v_mine then
      return true;
    end if;
  end loop;
  return false;
end $fn$;

comment on function hr._time_has_timecard_approve is
  'SPEC-TIME §1.3 — does this user hold timecard_approve authority anywhere in the organization, as of the event date. Holders are dereferenced through hr._wf_holder_employments, the workflow selector''s own function, so this gate can never disagree with who the engine would actually ask.';

-- ============================================================ 2. hr.timesheet_get  (L3-22)
create or replace function hr.timesheet_get(p_employment_id uuid, p_pay_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_uid   uuid := auth.uid();
  v_mine  uuid[];
  v_emp   hr.employment%rowtype;
  v_per   hr.pay_period%rowtype;
  v_row   hr.pay_period_employment%rowtype;
  v_at    date;
  v_self  boolean;
  v_days  jsonb;
  v_weeks jsonb;
  v_exc   jsonb;
  v_hist  jsonb;
  v_bnd   integer;
  v_ptot  numeric;
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'auth_required',
      'detail', 'a timesheet is always read as somebody');
  end if;
  if p_employment_id is null or p_pay_period_id is null then
    return jsonb_build_object('granted', false, 'reason', 'arguments_required',
      'detail', 'both p_employment_id and p_pay_period_id are required');
  end if;

  select * into v_emp from hr.employment where id = p_employment_id and deleted_at is null;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'employment_not_found',
      'detail', 'no employment with that id is readable');
  end if;
  select * into v_per from hr.pay_period where id = p_pay_period_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'pay_period_not_found',
      'detail', 'no pay period with that id exists');
  end if;
  if v_per.organization_id <> v_emp.organization_id then
    return jsonb_build_object('granted', false, 'reason', 'cross_organization',
      'detail', 'the employment and the pay period belong to different organizations');
  end if;

  -- RD 10: the event date, never now()
  v_at := v_per.period_end_on;
  v_mine := hr.employments_of(v_uid, v_at);
  v_self := p_employment_id = any (coalesce(v_mine, '{}'::uuid[]));

  if not v_self and not hr.capability(v_uid, 'time.read', p_employment_id, v_at) then
    -- THE REFUSAL NAMES WHAT WAS MISSING.
    return jsonb_build_object('granted', false, 'reason', 'not_subject_manager_or_hr',
      'detail', 'a timesheet is readable by its subject, by a manager with reach over them, or by HR. You are none of those for this employment.',
      'capability_required', 'time.read', 'subject_employment_id', p_employment_id, 'as_of', v_at);
  end if;

  select * into v_row from hr.pay_period_employment
   where pay_period_id = p_pay_period_id and employment_id = p_employment_id;

  -- ---------------------------------------------------------------- days (RD 1, RD 2, RD 3)
  select coalesce(jsonb_agg(d order by d ->> 'local_work_date'), '[]'::jsonb) into v_days
  from (
    select jsonb_build_object(
      'local_work_date', dd.d,
      'day_total_hours', coalesce(iv.total_hours, 0),
      'rounding_applied_minutes', coalesce(iv.total_rounding, 0),
      'totals_by_category', coalesce(iv.by_category, '{}'::jsonb),
      -- the COMPUTED block
      'intervals', coalesce(iv.rows_json, '[]'::jsonb),
      -- 🚨 the RAW block, its own sibling array, never interleaved (RD 1)
      'punch_chain', coalesce(pc.rows_json, '[]'::jsonb)
    ) d
    from (
      select distinct x.d
        from (
          select wi.local_work_date d from hr.work_interval wi
           where wi.employment_id = p_employment_id and wi.is_current
             and (wi.pay_period_id = p_pay_period_id
                  or (wi.pay_period_id is null
                      and wi.local_work_date between v_per.period_start_on and v_per.period_end_on))
          union
          select p.local_work_date from hr.punch p
           where p.employment_id = p_employment_id
             and p.local_work_date between v_per.period_start_on and v_per.period_end_on
        ) x
    ) dd
    left join lateral (
      select sum(wi.hours) total_hours,
             sum(wi.rounding_applied_minutes) total_rounding,
             jsonb_object_agg(g.cat, g.h) filter (where g.cat is not null) by_category,
             jsonb_agg(jsonb_build_object(
               'id', wi.id,
               'interval_kind', wi.interval_kind,
               'hours_category', wi.hours_category,
               'earning_code', jsonb_build_object('id', ec.id, 'code', ec.code, 'name', ec.name,
                                                  'is_overtime', ec.is_overtime,
                                                  'is_statutory_premium', ec.is_statutory_premium),
               'started_at', wi.started_at, 'ended_at', wi.ended_at, 'tz', wi.tz,
               'hours', wi.hours, 'rate', wi.rate,
               -- 🚨 RD 3: the amount is whatever is stored, INCLUDING NULL.
               'amount', wi.amount,
               'amount_absent', case when wi.amount is null then jsonb_build_object(
                     'absent', true,
                     'advisory', coalesce(wi.calc -> 'advisory', 'null'::jsonb),
                     'incomplete', coalesce(wi.calc -> 'incomplete', 'null'::jsonb),
                     'money_withheld', coalesce(wi.calc -> 'money_withheld', 'null'::jsonb),
                     'note', 'No amount is shown because a contributing rule is advisory or a fact is missing. This is not zero.')
                   else jsonb_build_object('absent', false) end,
               'is_overtime', wi.is_overtime,
               'rounding_applied_minutes', wi.rounding_applied_minutes,
               'source_punch_ids', to_jsonb(wi.source_punch_ids),
               'position_assignment_id', wi.position_assignment_id,
               'workweek_id', wi.workweek_id,
               'is_current', wi.is_current, 'superseded_by_id', wi.superseded_by_id,
               -- RD 2: the {{CALC}} block, per interval
               'calc_ref', jsonb_build_object('rule_version_ids', to_jsonb(wi.rule_version_ids),
                                              'engine_key', wi.engine_key,
                                              'engine_version', wi.engine_version,
                                              'calc', wi.calc, 'computed_at', wi.computed_at)
             ) order by wi.started_at nulls last, ec.code) rows_json
        from hr.work_interval wi
        join hr.earning_code ec on ec.id = wi.earning_code_id
        left join lateral (select wi.hours_category cat, wi.hours h) g on true
       where wi.employment_id = p_employment_id and wi.is_current
         and wi.local_work_date = dd.d
         and (wi.pay_period_id = p_pay_period_id or wi.pay_period_id is null)
    ) iv on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'punch_kind', p.punch_kind, 'break_paid', p.break_paid,
               'occurred_at', p.occurred_at, 'tz', p.tz,
               'device_reported_at', p.device_reported_at,
               'server_received_at', p.server_received_at,
               'clock_skew_applied_seconds', p.clock_skew_applied_seconds,
               'source', p.source,
               'actor', jsonb_build_object('actor_type', p.actor_type,
                                           'actor_employment_id', p.actor_employment_id,
                                           'actor_device_id', p.actor_device_id,
                                           'actor_note', p.actor_note),
               'jurisdiction_id', p.jurisdiction_id, 'work_location_id', p.work_location_id,
               'geo_captured', (p.geo_lat is not null and p.geo_lng is not null),
               'photo_captured', (p.photo_file_id is not null),
               'attestation_kind', p.attestation_kind,
               'attestation_response', p.attestation_response,
               -- a void is rendered struck through, never hidden
               'voided_at', p.voided_at, 'voided_reason', p.voided_reason,
               'voided_by_punch_id', p.voided_by_punch_id,
               'entered_reason', p.entered_reason, 'original_values', p.original_values
             ) order by p.occurred_at) rows_json
        from hr.punch p
       where p.employment_id = p_employment_id and p.local_work_date = dd.d
    ) pc on true
  ) s;

  -- ---------------------------------------------------------------- workweeks (§5.1, §5.3)
  select coalesce(jsonb_agg(w order by w ->> 'week_start_at'), '[]'::jsonb) into v_weeks
  from (
    select jsonb_build_object(
      'workweek_id', ww.id,
      'week_start_at', ww.week_start_at, 'week_end_at', ww.week_end_at,
      -- the block header names the STAMPED start, not the current setting (§5.1)
      'week_start_dow', ww.week_start_dow, 'week_start_time', ww.week_start_time,
      'week_start_local_date', ww.week_start_local_date, 'tz', ww.tz,
      'is_final', ww.is_final,
      'hours', jsonb_build_object(
        'worked', ww.hours_worked, 'regular', ww.hours_regular,
        'overtime', ww.hours_overtime, 'doubletime', ww.hours_doubletime,
        'paid_leave', ww.hours_paid_leave, 'unpaid_leave', ww.hours_unpaid_leave,
        'holiday', ww.hours_holiday, 'on_call', ww.hours_on_call,
        'of_service', ww.hours_of_service),
      'weighted_average_regular_rate', ww.weighted_average_regular_rate,
      -- §5.3: a multi-rate week shows the breakdown behind the average and NEVER a single week rate
      'multiple_rates', coalesce(rc.n, 0) > 1,
      'rate_components', coalesce(rc.rows_json, '[]'::jsonb),
      'boundary_week', ww.id = any (coalesce(v_per.boundary_workweek_ids, '{}'::uuid[])),
      'calc_ref', jsonb_build_object('rule_version_ids', to_jsonb(ww.rule_version_ids),
                                     'engine_key', ww.engine_key, 'engine_version', ww.engine_version,
                                     'calc', ww.calc, 'computed_at', ww.computed_at)
    ) w
    from hr.workweek ww
    left join lateral (
      select count(*) n,
             jsonb_agg(jsonb_build_object('position_assignment_id', z.pa, 'rate', z.rate,
                                          'hours_at_rate', z.h, 'product', round(z.h * z.rate, 4))
                       order by z.rate) rows_json
        from (select wi.position_assignment_id pa, wi.rate rate, sum(wi.hours) h
                from hr.work_interval wi
               where wi.workweek_id = ww.id and wi.is_current and wi.rate is not null
                 and wi.hours_category = 'worked'
               group by 1, 2) z
    ) rc on true
   where ww.employment_id = p_employment_id
     and exists (select 1 from hr.work_interval wi
                  where wi.workweek_id = ww.id and wi.is_current
                    and (wi.pay_period_id = p_pay_period_id
                         or (wi.pay_period_id is null
                             and wi.local_work_date between v_per.period_start_on and v_per.period_end_on)))
  ) s;

  -- ---------------------------------------------------------------- open exceptions (§5.4)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ae.id, 'exception_kind', ae.exception_kind, 'severity', ae.severity,
           'resolution_state', ae.resolution_state, 'detected_at', ae.detected_at,
           'local_work_date', ae.local_work_date, 'tz', ae.tz,
           'variance_minutes', ae.variance_minutes,
           'scheduled_start_at', ae.scheduled_start_at, 'scheduled_end_at', ae.scheduled_end_at,
           'actual_start_at', ae.actual_start_at, 'actual_end_at', ae.actual_end_at,
           'punch_id', ae.punch_id, 'shift_id', ae.shift_id,
           'work_interval_id', ae.work_interval_id,
           'premium_earning_code_id', ae.premium_earning_code_id,
           'corrective_action_id', ae.corrective_action_id,
           -- §2.6: `excused` is NOT OFFERED on a statutory violation, and the contract says so
           'excuse_offered', ae.severity <> 'violation',
           'calc_ref', jsonb_build_object('rule_version_ids', to_jsonb(ae.rule_version_ids),
                                          'engine_key', ae.engine_key,
                                          'engine_version', ae.engine_version, 'calc', ae.calc)
         ) order by case ae.severity when 'violation' then 0 when 'warn' then 1 else 2 end,
                    ae.detected_at), '[]'::jsonb) into v_exc
    from hr.attendance_exception ae
   where ae.employment_id = p_employment_id
     and ae.local_work_date between v_per.period_start_on and v_per.period_end_on
     and ae.resolution_state in ('open', 'acknowledged', 'escalated');

  -- ---------------------------------------------------------------- edit history (§2.4, §4.1)
  select coalesce(jsonb_agg(jsonb_build_object(
           'punch_id', p.id, 'local_work_date', p.local_work_date,
           'punch_kind', p.punch_kind, 'occurred_at', p.occurred_at, 'tz', p.tz,
           'voided_at', p.voided_at, 'voided_reason', p.voided_reason,
           'voided_by_punch_id', p.voided_by_punch_id,
           'entered_reason', p.entered_reason,
           'original_values', p.original_values,
           'actor', jsonb_build_object('actor_type', p.actor_type,
                                       'actor_employment_id', p.actor_employment_id,
                                       'actor_user_id', p.actor_user_id),
           -- rate-at-time: the rate carried by the intervals this punch produced, as stored
           'rate_at_time', (select jsonb_agg(distinct wi.rate)
                              from hr.work_interval wi
                             where wi.source_punch_ids @> ARRAY[p.id] and wi.rate is not null)
         ) order by p.occurred_at), '[]'::jsonb) into v_hist
    from hr.punch p
   where p.employment_id = p_employment_id
     and p.local_work_date between v_per.period_start_on and v_per.period_end_on
     and (p.voided_at is not null or p.entered_reason is not null);

  v_bnd := cardinality(coalesce(v_per.boundary_workweek_ids, '{}'::uuid[]));
  select coalesce(sum((d ->> 'day_total_hours')::numeric), 0) into v_ptot
    from jsonb_array_elements(v_days) d;

  return jsonb_build_object(
    'granted', true,
    'as_of', v_at,
    'viewer', jsonb_build_object('is_subject', v_self,
                                 'may_edit_punches', not v_self and hr.capability(v_uid, 'time.read', p_employment_id, v_at),
                                 'may_attest', v_self),
    'employment', jsonb_build_object('id', v_emp.id, 'organization_id', v_emp.organization_id,
                                     'status', v_emp.status, 'pay_group_id', v_emp.pay_group_id,
                                     'employee', (select jsonb_build_object('id', e.id,
                                                          'employee_number', e.employee_number,
                                                          'display_name', e.display_name)
                                                    from hr.employee e where e.id = v_emp.employee_id)),
    'pay_period', jsonb_build_object('id', v_per.id, 'state', v_per.state,
                                     'period_start_on', v_per.period_start_on,
                                     'period_end_on', v_per.period_end_on,
                                     'pay_date', v_per.pay_date,
                                     'pay_group_id', v_per.pay_group_id,
                                     'boundary_workweek_ids', to_jsonb(coalesce(v_per.boundary_workweek_ids,'{}'::uuid[]))),
    -- §14 D8: the ROW state and the HEADER state are two different state machines, labelled apart
    'row', case when v_row.id is null then 'null'::jsonb else jsonb_build_object(
        'id', v_row.id,
        'row_state', v_row.state,
        'attested_at', v_row.attested_at,
        -- the statement STORED AS SHOWN — an org editing the knob later never changes this
        'attestation_statement', v_row.attestation_statement,
        'attestation_response', v_row.attestation_response,
        'disputed_at', v_row.disputed_at,
        -- 🚨 §5.5: the employee's words, verbatim, and the manager's answer in a SEPARATE field
        'dispute_note', v_row.dispute_note,
        'dispute_resolution', v_row.dispute_resolution,
        'dispute_resolved_at', v_row.dispute_resolved_at,
        'dispute_resolved_by_employment_id', v_row.dispute_resolved_by_employment_id,
        'manager_approved_at', v_row.manager_approved_at,
        'total_hours', v_row.total_hours, 'total_amount', v_row.total_amount,
        'calc_ref', jsonb_build_object('rule_version_ids', to_jsonb(v_row.rule_version_ids),
                                       'engine_key', v_row.engine_key,
                                       'engine_version', v_row.engine_version,
                                       'calc', v_row.calc, 'computed_at', v_row.computed_at))
      end,
    'workflow', hr.wf_for_target('hr_pay_period_employment', v_row.id),
    'days', v_days,
    'weeks', v_weeks,
    'exceptions', v_exc,
    'edit_history', v_hist,
    -- RD 4: three grains, each labelled, and the pay-period one says what it is
    'totals', jsonb_build_object(
      'day', (select coalesce(jsonb_agg(jsonb_build_object('grain','day',
                       'local_work_date', d ->> 'local_work_date',
                       'hours', (d ->> 'day_total_hours')::numeric)), '[]'::jsonb)
                from jsonb_array_elements(v_days) d),
      'workweek', (select coalesce(jsonb_agg(jsonb_build_object('grain','workweek',
                       'workweek_id', w ->> 'workweek_id',
                       'hours', w -> 'hours',
                       'boundary_week', (w ->> 'boundary_week')::boolean)), '[]'::jsonb)
                     from jsonb_array_elements(v_weeks) w),
      'pay_period', jsonb_build_object(
        'grain', 'pay_period',
        'hours', v_ptot,
        'is_display_sum', true,
        'note', case when v_bnd > 0 then
            format('This total is a sum of days, for display. %s workweek(s) straddle this period''s edges: overtime for those weeks is computed on the whole workweek and attributed to the period containing the week''s end date, so it may be counted in the neighbouring period.', v_bnd)
          else 'This total is a sum of days, for display. Overtime is computed on the workweek, not on the pay period.' end,
        'boundary_workweek_count', v_bnd))
  );
end $fn$;

comment on function hr.timesheet_get is
  'SPEC-TIME §1.3 / L3-22 — the single read behind routes 5 and 29. Day rows grouped by hours_category and earning code, the RAW punch chain per day in its own block, rounding_applied_minutes per interval, per-week hr.workweek totals with the weighted average and the rate components behind it, open exceptions, the pay_period_employment state with dispute_note verbatim and dispute_resolution separately labelled, edit history with reason/original value/rate-at-time, and a {{CALC}} block at every grain. Refuses when the caller is neither the subject, a manager with reach, nor HR.';

-- ============================================================ 3. hr.timesheet_period_grid (L3-23)
create or replace function hr.timesheet_period_grid(p_pay_period_id uuid,
                                                    p_filters jsonb default '{}'::jsonb,
                                                    p_page jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_uid    uuid := auth.uid();
  v_per    hr.pay_period%rowtype;
  v_at     date;
  v_limit  integer;
  v_offset integer;
  v_classes text[];
  v_var_knob numeric;
  v_total  integer;
  v_rows   jsonb;
  f jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'auth_required',
      'detail', 'the approval grid is always read as somebody');
  end if;
  select * into v_per from hr.pay_period where id = p_pay_period_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'pay_period_not_found',
      'detail', 'no pay period with that id exists');
  end if;

  v_at := v_per.period_end_on;                                            -- RD 10
  if not hr._time_has_timecard_approve(v_uid, v_per.organization_id, v_at) then
    return jsonb_build_object('granted', false, 'reason', 'timecard_approve_authority_required',
      'detail', 'the approval grid is readable by someone holding timecard_approve authority somewhere in this pay group, or by HR with time.read. You hold neither as of this period.',
      'action_required', 'timecard_approve', 'pay_group_id', v_per.pay_group_id, 'as_of', v_at);
  end if;

  -- LAW 3: paginated, and it reports its own total (RD 7)
  v_limit  := least(greatest(coalesce((p_page ->> 'limit')::integer, 100), 1), 500);
  v_offset := greatest(coalesce((p_page ->> 'offset')::integer, 0), 0);
  v_classes := hr._time_punch_enabled_worker_classes();
  v_var_knob := coalesce((hr._knob('hr.time_and_attendance','variance_warn_minutes') #>> '{}')::numeric, 15);

  create temporary table if not exists _l3_grid_scratch (x int) on commit drop;

  with base as (
    select ppe.id ppe_id, ppe.employment_id, ppe.state row_state,
           ppe.disputed_at, ppe.dispute_note, ppe.dispute_resolution,
           ppe.total_hours, ppe.total_amount, ppe.manager_approved_at,
           ppe.rule_version_ids, ppe.engine_key, ppe.engine_version, ppe.calc, ppe.computed_at,
           e.employee_id, emp.display_name, emp.employee_number,
           pa.worker_class, pa.location_id, pa.department_id, pa.manager_employment_id,
           pa.job_title_id, pa.flsa_status
      from hr.pay_period_employment ppe
      join hr.employment e on e.id = ppe.employment_id and e.deleted_at is null
      join hr.employee emp on emp.id = e.employee_id
      left join lateral (
        select pa2.* from hr.position_assignment pa2
         where pa2.employment_id = ppe.employment_id and pa2.deleted_at is null
           and pa2.effective_from <= v_at
           and (pa2.effective_to is null or pa2.effective_to >= v_at)
         order by pa2.is_primary desc, pa2.effective_from desc limit 1
      ) pa on true
     where ppe.pay_period_id = p_pay_period_id
       -- 🚨 RD 5: a gated worker class is EXCLUDED ENTIRELY, not shown with zeros.
       and coalesce(pa.worker_class, 'employee') = any (v_classes)
  ),
  enriched as (
    select b.*,
           coalesce(agg.ot_hours, 0) ot_hours,
           coalesce(agg.dt_hours, 0) dt_hours,
           coalesce(agg.premium_line_count, 0) premium_line_count,
           coalesce(agg.by_category, '{}'::jsonb) by_category,
           coalesce(agg.worked_hours, 0) worked_hours,
           coalesce(agg.auto_closed_present, false) auto_closed_present,
           coalesce(agg.recomputed_since_approval, false) recomputed_since_approval,
           coalesce(exc.open_count, 0) open_exception_count,
           coalesce(exc.by_kind, '{}'::jsonb) open_exceptions_by_kind,
           sch.scheduled_hours,
           st.open_step_id, st.open_step_key, st.open_step_due_at
      from base b
      left join lateral (
        select sum(wi.hours) filter (where wi.is_overtime
                 and coalesce(ec.code,'') <> 'DT') ot_hours,
               sum(wi.hours) filter (where ec.code = 'DT') dt_hours,
               count(*) filter (where wi.interval_kind = 'premium_only') premium_line_count,
               sum(wi.hours) filter (where wi.hours_category = 'worked') worked_hours,
               jsonb_object_agg(k.cat, k.h) filter (where k.cat is not null) by_category,
               bool_or(coalesce((wi.calc ->> 'auto_close_estimate')::boolean, false)) auto_closed_present,
               bool_or(b.manager_approved_at is not null and wi.computed_at > b.manager_approved_at)
                 recomputed_since_approval
          from hr.work_interval wi
          join hr.earning_code ec on ec.id = wi.earning_code_id
          left join lateral (select wi.hours_category cat, wi.hours h) k on true
         where wi.employment_id = b.employment_id and wi.is_current
           and (wi.pay_period_id = p_pay_period_id
                or (wi.pay_period_id is null
                    and wi.local_work_date between v_per.period_start_on and v_per.period_end_on))
      ) agg on true
      left join lateral (
        select count(*) open_count,
               jsonb_object_agg(z.kind, z.n) by_kind
          from (select ae.exception_kind kind, count(*) n
                  from hr.attendance_exception ae
                 where ae.employment_id = b.employment_id
                   and ae.local_work_date between v_per.period_start_on and v_per.period_end_on
                   and ae.resolution_state in ('open','acknowledged','escalated')
                 group by 1) z
      ) exc on true
      left join lateral (
        -- 🚨 RD 6: NULL when there is no schedule at all. Never zero.
        select sum(s.scheduled_hours) scheduled_hours
          from hr.shift s
         where s.employment_id = b.employment_id and s.deleted_at is null
           and s.local_work_date between v_per.period_start_on and v_per.period_end_on
      ) sch on true
      left join lateral (
        select ws.id open_step_id, ws.step_key open_step_key, ws.due_at open_step_due_at
          from hr.workflow_step ws
          join hr.workflow_instance wi2 on wi2.id = ws.workflow_instance_id
         where wi2.target_token = 'hr_pay_period_employment' and wi2.target_id = b.ppe_id
           and ws.state in ('pending','active','awaiting_result')
         order by ws.step_order limit 1
      ) st on true
  ),
  filtered as (
    select * from enriched q
     where (f -> 'row_state' is null
            or q.row_state = any (select jsonb_array_elements_text(f -> 'row_state')))
       and (f ->> 'location_id' is null or q.location_id = (f ->> 'location_id')::uuid)
       and (f ->> 'department_id' is null or q.department_id = (f ->> 'department_id')::uuid)
       and (f ->> 'manager_employment_id' is null
            or q.manager_employment_id = (f ->> 'manager_employment_id')::uuid)
       and (f ->> 'has_open_exception' is null
            or (f ->> 'has_open_exception')::boolean = (q.open_exception_count > 0))
       and (f ->> 'exception_kind' is null
            or q.open_exceptions_by_kind ? (f ->> 'exception_kind'))
       and (f ->> 'has_ot' is null or (f ->> 'has_ot')::boolean = (q.ot_hours > 0 or q.dt_hours > 0))
       and (f ->> 'has_premium' is null
            or (f ->> 'has_premium')::boolean = (q.premium_line_count > 0))
       and (f ->> 'has_dispute' is null or (f ->> 'has_dispute')::boolean = (q.disputed_at is not null))
       and (f ->> 'auto_closed_present' is null
            or (f ->> 'auto_closed_present')::boolean = q.auto_closed_present)
       and (f ->> 'recomputed_since_approval' is null
            or (f ->> 'recomputed_since_approval')::boolean = q.recomputed_since_approval)
       and (f ->> 'variance_beyond_warn' is null
            or ((f ->> 'variance_beyond_warn')::boolean
                = (q.scheduled_hours is not null
                   and abs(q.scheduled_hours - q.worked_hours) * 60 > v_var_knob)))
       and (f ->> 'search' is null
            or q.display_name ilike '%' || (f ->> 'search') || '%'
            or q.employee_number ilike '%' || (f ->> 'search') || '%')
  )
  select count(*)::integer,
         coalesce(jsonb_agg(r order by r.sort_exc, r.sort_disp, r.sort_ot, r.display_name), '[]'::jsonb)
    into v_total, v_rows
    from (
      select q.*,
             -- RD 9: decisions first
             case when q.open_exception_count > 0 then 0 else 1 end sort_exc,
             case when q.disputed_at is not null then 0 else 1 end sort_disp,
             case when q.ot_hours > 0 or q.dt_hours > 0 then 0 else 1 end sort_ot
        from filtered q
    ) r;

  -- page the rows, having already counted them honestly
  select coalesce(jsonb_agg(jsonb_build_object(
           'pay_period_employment_id', r ->> 'ppe_id',
           'employment_id', r ->> 'employment_id',
           'employee', jsonb_build_object('id', r ->> 'employee_id',
                                          'display_name', r ->> 'display_name',
                                          'employee_number', r ->> 'employee_number'),
           'worker_class', r ->> 'worker_class',
           'flsa_status', r ->> 'flsa_status',
           'location_id', r ->> 'location_id', 'department_id', r ->> 'department_id',
           'manager_employment_id', r ->> 'manager_employment_id',
           -- §14 D8: this is the ROW state; the header state is on the envelope
           'row_state', r ->> 'row_state',
           'totals_by_category', r -> 'by_category',
           'total_hours', r -> 'total_hours', 'total_amount', r -> 'total_amount',
           'ot_hours', r -> 'ot_hours', 'dt_hours', r -> 'dt_hours',
           'premium_line_count', r -> 'premium_line_count',
           'open_exception_count', r -> 'open_exception_count',
           'open_exceptions_by_kind', r -> 'open_exceptions_by_kind',
           'has_dispute', (r ->> 'disputed_at') is not null,
           'dispute_note', r -> 'dispute_note',
           'dispute_resolution', r -> 'dispute_resolution',
           'auto_closed_present', r -> 'auto_closed_present',
           'recomputed_since_approval', r -> 'recomputed_since_approval',
           -- 🚨 RD 6: null + a typed marker, never 0
           'scheduled_hours', r -> 'scheduled_hours',
           'worked_hours', r -> 'worked_hours',
           'variance_hours', case when (r ->> 'scheduled_hours') is null then 'null'::jsonb
                                  else to_jsonb((r ->> 'scheduled_hours')::numeric
                                                - (r ->> 'worked_hours')::numeric) end,
           'variance_state', case when (r ->> 'scheduled_hours') is null then 'not_scheduled'
                                  else 'scheduled' end,
           'variance_beyond_warn', case when (r ->> 'scheduled_hours') is null then false
                 else abs((r ->> 'scheduled_hours')::numeric - (r ->> 'worked_hours')::numeric) * 60
                      > v_var_knob end,
           'open_step_id', r -> 'open_step_id',
           'open_step_key', r -> 'open_step_key',
           'open_step_due_at', r -> 'open_step_due_at',
           'calc_ref', jsonb_build_object('rule_version_ids', r -> 'rule_version_ids',
                                          'engine_key', r -> 'engine_key',
                                          'engine_version', r -> 'engine_version',
                                          'calc', r -> 'calc', 'computed_at', r -> 'computed_at')
         )), '[]'::jsonb) into v_rows
    from (select value r from jsonb_array_elements(v_rows)
           offset v_offset limit v_limit) pg;

  return jsonb_build_object(
    'granted', true,
    'as_of', v_at,
    -- §14 D8: the HEADER state, labelled distinctly from the row states above
    'pay_period', jsonb_build_object('id', v_per.id, 'period_state', v_per.state,
                                     'period_start_on', v_per.period_start_on,
                                     'period_end_on', v_per.period_end_on,
                                     'pay_group_id', v_per.pay_group_id,
                                     'boundary_workweek_ids',
                                     to_jsonb(coalesce(v_per.boundary_workweek_ids,'{}'::uuid[]))),
    'progress', jsonb_build_object(
        'approved', (select count(*) from hr.pay_period_employment
                      where pay_period_id = p_pay_period_id and state = 'approved'),
        'total', (select count(*) from hr.pay_period_employment where pay_period_id = p_pay_period_id)),
    'worker_classes_included', to_jsonb(v_classes),
    'worker_classes_excluded_note',
      'A worker class outside the enabled set is excluded from this grid entirely, not shown with zeros. A contractor is never enabled and never appears.',
    'variance_warn_minutes', v_var_knob,
    'filters_applied', f,
    'page', jsonb_build_object('limit', v_limit, 'offset', v_offset,
                               'returned', jsonb_array_length(v_rows),
                               'total_count', v_total,
                               'has_more', v_offset + jsonb_array_length(v_rows) < v_total,
                               'next_offset', case when v_offset + jsonb_array_length(v_rows) < v_total
                                                   then v_offset + v_limit else null end),
    'rows', v_rows);
end $fn$;

comment on function hr.timesheet_period_grid is
  'SPEC-TIME §1.3 / §6.1 / §6.2 / L3-23 — the approval grid behind route 28. One row per employment, FULLY PAGINATED with an honest total_count (LAW 3). Totals by category, OT and DT hours, premium line count, open exception counts BY KIND, dispute flag, scheduled-vs-actual variance (null + not_scheduled, never 0), pay_period_employment.state, and the open workflow step id. A gated worker class is excluded ENTIRELY. Refuses when the caller lacks timecard_approve authority anywhere in the pay group.';

-- ============================================================ 4. the PostgREST wrappers (TD-1)
create or replace function public.hr_timesheet_get(p_employment_id uuid, p_pay_period_id uuid)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.timesheet_get($1, $2);
$fn$;

create or replace function public.hr_timesheet_period_grid(p_pay_period_id uuid,
                                                           p_filters jsonb default '{}'::jsonb,
                                                           p_page jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.timesheet_period_grid($1, $2, $3);
$fn$;

comment on function public.hr_timesheet_get is
  'PostgREST-reachable wrapper for hr.timesheet_get. The `hr` schema is not exposed to PostgREST, so every client-called RPC ships a thin public.hr_<name> delegate carrying no logic (TD-1 / R-L3 U-03). `anon` holds nothing.';
comment on function public.hr_timesheet_period_grid is
  'PostgREST-reachable wrapper for hr.timesheet_period_grid. Thin delegate, no logic. `anon` holds nothing.';

do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr._time_punch_enabled_worker_classes()',
    'hr._time_has_timecard_approve(uuid,uuid,date)',
    'hr.timesheet_get(uuid,uuid)',
    'hr.timesheet_period_grid(uuid,jsonb,jsonb)',
    'public.hr_timesheet_get(uuid,uuid)',
    'public.hr_timesheet_period_grid(uuid,jsonb,jsonb)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v jsonb; v_n integer;
begin
  -- the functions exist with the exact signatures the lane committed to
  foreach v_n in array ARRAY[1] loop null; end loop;
  if to_regprocedure('hr.timesheet_get(uuid,uuid)') is null
     or to_regprocedure('hr.timesheet_period_grid(uuid,jsonb,jsonb)') is null
     or to_regprocedure('public.hr_timesheet_get(uuid,uuid)') is null
     or to_regprocedure('public.hr_timesheet_period_grid(uuid,jsonb,jsonb)') is null then
    raise exception 'hr_l3_23: one of the four functions was not created';
  end if;

  -- 🚨 anon holds nothing (TD-1)
  if has_function_privilege('anon', 'public.hr_timesheet_get(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_timesheet_period_grid(uuid,jsonb,jsonb)', 'execute') then
    raise exception 'hr_l3_23: anon holds EXECUTE on a timesheet wrapper';
  end if;

  -- §8: contractor can never be in the enabled set
  if 'contractor' = any (hr._time_punch_enabled_worker_classes()) then
    raise exception 'hr_l3_23: contractor appeared in the punch-enabled worker classes';
  end if;
  if cardinality(hr._time_punch_enabled_worker_classes()) <> 3 then
    raise exception 'hr_l3_23: expected 3 punch-enabled worker classes by default, got %',
      hr._time_punch_enabled_worker_classes();
  end if;

  -- both reads refuse an unauthenticated caller with a NAMED reason rather than raising
  v := hr.timesheet_get('00000000-0000-0000-0000-000000000000'::uuid,
                        '00000000-0000-0000-0000-000000000000'::uuid);
  if (v ->> 'granted')::boolean or coalesce(v ->> 'reason','') = '' then
    raise exception 'hr_l3_23: timesheet_get did not refuse with a named reason: %', v;
  end if;
  v := hr.timesheet_period_grid('00000000-0000-0000-0000-000000000000'::uuid);
  if (v ->> 'granted')::boolean or coalesce(v ->> 'reason','') = '' then
    raise exception 'hr_l3_23: timesheet_period_grid did not refuse with a named reason: %', v;
  end if;
end $$;
