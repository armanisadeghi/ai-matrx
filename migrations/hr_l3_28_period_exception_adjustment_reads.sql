-- HR domain L3 — migration 9 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE SIX READS FOUR SHIPPED ROUTES CALL AND NOTHING IMPLEMENTED. `features/hr/time/api/rpc.ts`
-- declares them in its closed `HrTimeRpcName` union; without them routes 31, 32, 33 and the OT
-- queue are mock-only and answer PGRST202 the moment `NEXT_PUBLIC_HR_MOCK` is off. Raised by the
-- surface lanes; built here because `hr` is not exposed to PostgREST and a client cannot select
-- from `hr.pay_period` at all.
--
--   hr.pay_period_list · hr.pay_period_get · hr.attendance_exception_list ·
--   hr.time_adjustment_list · hr.overtime_preapproval_list · hr.overtime_preapproval_get
--
-- Authority: SPEC-TIME §2.6, §2.7, §4.4, §6.2, §7.1; SPEC-CONTRACTS §2.2 (timesheet-family reads
-- stay direct RPCs); R-L3 U-03 / U-12 / U-13; LAW 3 (no capped fetch).
-- Applied live as `hr_l3_28_period_exception_adjustment_reads`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE COUNTS COME FROM THE SERVER, ALWAYS. "38 of 41 approved" is the sentence route 32/33's
--    header renders, and a browser that counts rows it was paged has no way to be right. Every
--    `hr.pay_period_list` row carries `counts.{employments, approved, open, attested, disputed}`
--    computed over the WHOLE period, independent of the page.
--
-- 2. 🚨 TWO STATE MACHINES, LABELLED APART (§14 D8 / U-12). `pay_period.state` is the HEADER state
--    and is returned as `state`; `pay_period_employment.state` is the ROW state and appears only
--    inside `counts`. `submitted` is never a row state, and there is no row-level `reopened`
--    (U-13) — so `counts` has exactly five members and no sixth was invented for a reopened period.
--
-- 3. 🚨 THE ACCESS PREDICATE IS EVALUATED PER SUBJECT ROW, NOT ONCE AT THE ORG. Calling
--    `hr.capability(uid, 'time.read', NULL, …)` would be one cheap call and would be WRONG: with a
--    null subject, `hr.capability` skips `hr.population_contains`, so a manager whose `time.read`
--    is scoped to one department would read the whole organization. The three per-employment lists
--    below therefore call `hr.capability(v_uid, 'time.read', <that row's employment>, <that row's
--    event date>)` inside the predicate. It is a function call per candidate row, and that is the
--    correct trade: an access predicate that is fast and wrong is not a predicate.
--    **DEBT, owner this lane at volume:** at organization scale these lists want a materialised
--    reachable-employment set per caller rather than a per-row predicate. It is a performance
--    change, not a semantic one, and it must not be made by loosening the subject argument.
--
-- 4. `as_of` IS THE EVENT DATE ON EVERY ROW (§0 law 3). An exception is read as of its
--    `local_work_date`, an adjustment as of its `work_date`, a pre-approval as of the date the
--    overtime would be worked, and a pay period as of `period_end_on`. A manager reviewing February
--    in April sees February's access, not April's.
--
-- 5. THE PAGE SHAPE IS `types.ts`'s `PageRequest` — `{ page, pageSize }`, ONE-BASED — because that
--    is what `features/hr/time/api/service.ts` actually sends. `page_size` is accepted as an alias
--    so a snake-case caller is not silently paged at the default.
--    **DISCREPANCY, owner this lane:** `hr.timesheet_period_grid` (hr_l3_23) reads `{limit, offset}`
--    from its `p_page` instead, so the two paginated reads in one lane take two different page
--    shapes. `PageRequest` is the declared client contract and should win; changing the grid is a
--    breaking change to a shipped function and is named here rather than done silently.
--
-- 6. THE ENVELOPE IS snake_case AND THE CLIENT CAMELISES IT. `rpc.ts` now runs `camelizeDeep` over
--    every live response and states that "the SQL bodies build their jsonb in snake_case". These six
--    follow that convention. (`hr.pay_period_transition`, `hr.time_adjustment_create` and
--    `hr.attendance_exception_resolve` shipped with camelCase keys before that mapper existed;
--    camelising an already-camel key is a no-op, so both spellings arrive correctly and neither is
--    churned for tidiness.)
--
-- 7. `hr._time_exception_json` IS REUSED, NOT REIMPLEMENTED. It already emits the
--    `AttendanceExceptionRow` shape including the server-computed `allowedResolutions` — the list and
--    the resolver therefore cannot disagree about which actions exist, which is the entire point of
--    returning the list from the server.
--
-- 8. LAW 3: ALL FOUR LISTS REPORT AN HONEST `total_rows` OVER THE FILTERED SET, INDEPENDENT OF THE
--    PAGE. A capped fetch that a caller treats as complete is a defect; so is a total computed after
--    the limit. The page ceiling is 500 and the default 50.
--
-- 9. THE NINE `hr.time.*` SMS DEFAULTS SEEDED BY `hr_l3_22` ARE CORRECT, AND THE CONTRADICTION IS
--    RECORDED RATHER THAN SPLIT. SPEC-TIME §12 closes with "SMS is declared on the time-critical,
--    employee-facing events only … money and record events never default to SMS", which reads as
--    forbidding SMS on `export_failed`, `timecard_rejected`, `timecard_due` and
--    `unapproved_overtime_flagged`. Verified against the OWNING document: SPEC-NOTIFICATIONS §2.3
--    declares all four `• • •` (email / SMS / in-app) in its own channel column, and carries a
--    reasoned block — "Why SMS is default-ON across this pillar … the hourly loop is people who are
--    not at a desk and do not have work email open" — explaining why. SPEC-TIME §14 D12 hands the
--    `hr.time.*` vocabulary to SPEC-NOTIFICATIONS ("one event, one name, one owner"), and the
--    catalog is the later document with the recorded rationale. The owner wins; the nine rows stand.
--    Live count re-verified while writing this migration: 9 rows carry `sms = true`, exactly as
--    `hr_l3_22` asserted.
--    **OWED, owner SPEC-TIME §12:** its channel sentence is narrower than the catalog it already
--    defers to on names, and a builder reading §12 alone will "fix" a correct seed into a
--    regression. §12 should defer its channel defaults to SPEC-NOTIFICATIONS explicitly.
--
-- 10. `hr.time.unapproved_overtime_flagged` IS THE CANONICAL NAME, NOT A NEW KEY. SPEC-NOTIFICATIONS
--     §2.3 carries the row verbatim ("OT is worked with no approved pre-approval request … Manager +
--     HR admin … 'Unapproved OT: {{employee.name}}, {{hours.ot}}h — paid, flagged for review'"), and
--     its D24a block states outright: "Its `overtime_unapproved` is this catalog's
--     `hr.time.unapproved_overtime_flagged`." `hr_l3_22`'s RD 1 mapped SPEC-TIME §12's
--     `overtime_unapproved` onto it for exactly that reason. Nothing new was coined.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 0. the page reader (RD 5, RD 8)
create or replace function hr._time_page(p_page jsonb, out p_num integer, out p_size integer,
                                         out p_off integer)
returns record language sql immutable as $fn$
  select n, s, (n - 1) * s
    from (select greatest(coalesce((p_page ->> 'page')::integer, 1), 1) n,
                 least(greatest(coalesce((p_page ->> 'pageSize')::integer,
                                         (p_page ->> 'page_size')::integer, 50), 1), 500) s) x;
$fn$;

comment on function hr._time_page is
  'features/hr/time/api/types.ts PageRequest — one-based `page` plus `pageSize` (with page_size accepted as an alias), turned into a zero-based offset. Default 50, ceiling 500.';

-- ============================================================ 1. hr.pay_period_list (route 32)
create or replace function hr.pay_period_list(p_filters jsonb default '{}'::jsonb,
                                              p_page jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_uid  uuid := auth.uid();
  v_mine uuid[];
  v_orgs uuid[];
  pg     record;
  v_tot  integer;
  v_rows jsonb;
  f      jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'The pay-period list is always read as somebody.');
  end if;
  v_mine := hr.employments_of(v_uid, current_date);
  if v_mine is null or cardinality(v_mine) = 0 then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in any organization, so there is no pay group to show you.');
  end if;
  select coalesce(array_agg(distinct em.organization_id), '{}'::uuid[]) into v_orgs
    from hr.employment em where em.id = any (v_mine);

  pg := hr._time_page(p_page);

  with base as (
    select pp.*, pg2.name pay_group_name
      from hr.pay_period pp
      join hr.pay_group pg2 on pg2.id = pp.pay_group_id
     where pp.organization_id = any (v_orgs)
       -- §2.7: payroll and HR admins see the machine; a manager holding timecard_approve in the
       -- pay group sees it read-only. RD 3: the gate is per period, as of the period end date.
       and (hr.capability(v_uid, 'payroll.read', null, pp.period_end_on)
            or hr._time_has_timecard_approve(v_uid, pp.organization_id, pp.period_end_on))
       and (f ->> 'pay_group_id' is null or pp.pay_group_id = (f ->> 'pay_group_id')::uuid)
       and (f ->> 'organization_id' is null or pp.organization_id = (f ->> 'organization_id')::uuid)
       and (f -> 'state' is null
            or pp.state = any (select jsonb_array_elements_text(f -> 'state')))
       and (f ->> 'from' is null or pp.period_end_on >= (f ->> 'from')::date)
       and (f ->> 'to' is null or pp.period_start_on <= (f ->> 'to')::date)
  )
  select count(*)::integer into v_tot from base;

  with base as (
    select pp.*, pg2.name pay_group_name
      from hr.pay_period pp
      join hr.pay_group pg2 on pg2.id = pp.pay_group_id
     where pp.organization_id = any (v_orgs)
       and (hr.capability(v_uid, 'payroll.read', null, pp.period_end_on)
            or hr._time_has_timecard_approve(v_uid, pp.organization_id, pp.period_end_on))
       and (f ->> 'pay_group_id' is null or pp.pay_group_id = (f ->> 'pay_group_id')::uuid)
       and (f ->> 'organization_id' is null or pp.organization_id = (f ->> 'organization_id')::uuid)
       and (f -> 'state' is null
            or pp.state = any (select jsonb_array_elements_text(f -> 'state')))
       and (f ->> 'from' is null or pp.period_end_on >= (f ->> 'from')::date)
       and (f ->> 'to' is null or pp.period_start_on <= (f ->> 'to')::date)
     order by pp.period_start_on desc, pp.sequence_number desc
     offset pg.p_off limit pg.p_size
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id,
           'pay_group_id', b.pay_group_id,
           'pay_group_name', b.pay_group_name,
           'period_start_on', b.period_start_on,
           'period_end_on', b.period_end_on,
           'pay_date', b.pay_date,
           'sequence_number', b.sequence_number,
           -- RD 2: the HEADER state
           'state', b.state,
           'submitted_at', b.submitted_at,
           'approved_at', b.approved_at,
           'exported_at', b.exported_at,
           'locked_at', b.locked_at,
           'closed_at', b.closed_at,
           'reopened_at', b.reopened_at,
           'reopen_reason', b.reopen_reason,
           'boundary_workweek_ids', to_jsonb(coalesce(b.boundary_workweek_ids, '{}'::uuid[])),
           -- 🚨 RD 1: computed over the WHOLE period, never over the page
           'counts', c.counts
         ) order by b.period_start_on desc, b.sequence_number desc), '[]'::jsonb)
    into v_rows
    from base b
    left join lateral (
      select jsonb_build_object(
               'employments', count(*),
               'approved', count(*) filter (where ppe.state = 'approved'),
               'open', count(*) filter (where ppe.state = 'open'),
               'attested', count(*) filter (where ppe.state = 'attested'),
               'disputed', count(*) filter (where ppe.state = 'disputed')) counts
        from hr.pay_period_employment ppe where ppe.pay_period_id = b.id
    ) c on true;

  return hr._time_ok(jsonb_build_object(
    'rows', v_rows,
    'page', pg.p_num,
    'page_size', pg.p_size,
    'total_rows', v_tot,
    'has_more', pg.p_off + jsonb_array_length(v_rows) < v_tot,
    'state_machines_note', 'The `state` on each row is the PAY PERIOD state. The five figures in `counts` are pay_period_employment ROW states — a different machine. `submitted` is never a row state and there is no row-level `reopened`.'));
end $fn$;

comment on function hr.pay_period_list is
  'SPEC-TIME §2.7 / route 32 — one row per pay period with its pay-group name, every transition timestamp, reopen_reason, boundary_workweek_ids and the SERVER-computed counts by pay_period_employment.state. Fully paginated with an honest total_rows (LAW 3). Refuses a caller with no employment; shows only periods whose organization the caller holds payroll.read in, or whose pay group they hold timecard_approve in.';

-- ============================================================ 2. hr.pay_period_get (route 33)
create or replace function hr.pay_period_get(p_pay_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_per hr.pay_period%rowtype;
  v_row jsonb;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller', 'A pay period is always read as somebody.');
  end if;
  select * into v_per from hr.pay_period where id = p_pay_period_id;
  if not found then
    return hr._time_refusal('hr_pay_period_not_found', 'No pay period with that id exists.',
      jsonb_build_object('pay_period_id', p_pay_period_id));
  end if;
  if not hr.capability(v_uid, 'payroll.read', null, v_per.period_end_on)
     and not hr._time_has_timecard_approve(v_uid, v_per.organization_id, v_per.period_end_on) then
    return hr._time_refusal('hr_no_period_read_authority',
      'A pay period is readable by HR and payroll, or by a manager holding timecard_approve in its pay group. You hold neither as of this period.',
      jsonb_build_object('capability_required', 'payroll.read',
                         'or_action_required', 'timecard_approve',
                         'as_of', v_per.period_end_on));
  end if;

  select jsonb_build_object(
           'id', v_per.id,
           'pay_group_id', v_per.pay_group_id,
           'pay_group_name', (select name from hr.pay_group where id = v_per.pay_group_id),
           'period_start_on', v_per.period_start_on,
           'period_end_on', v_per.period_end_on,
           'pay_date', v_per.pay_date,
           'sequence_number', v_per.sequence_number,
           'state', v_per.state,
           'submitted_at', v_per.submitted_at,
           'submitted_by_employment_id', v_per.submitted_by_employment_id,
           'approved_at', v_per.approved_at,
           'approved_by_employment_id', v_per.approved_by_employment_id,
           'exported_at', v_per.exported_at,
           'locked_at', v_per.locked_at,
           'locked_by_employment_id', v_per.locked_by_employment_id,
           'closed_at', v_per.closed_at,
           'reopened_at', v_per.reopened_at,
           'reopen_reason', v_per.reopen_reason,
           'boundary_workweek_ids', to_jsonb(coalesce(v_per.boundary_workweek_ids,'{}'::uuid[])),
           'boundary_note', case
             when cardinality(coalesce(v_per.boundary_workweek_ids,'{}'::uuid[])) > 0
             then format('%s workweek(s) straddle this period''s edges. Overtime for those weeks is computed on the whole workweek and attributed to the period containing the week''s end date.',
                         cardinality(v_per.boundary_workweek_ids))
             else null end,
           'counts', (select jsonb_build_object(
                        'employments', count(*),
                        'approved', count(*) filter (where state = 'approved'),
                        'open', count(*) filter (where state = 'open'),
                        'attested', count(*) filter (where state = 'attested'),
                        'disputed', count(*) filter (where state = 'disputed'))
                        from hr.pay_period_employment where pay_period_id = v_per.id),
           'adjustments_tagged_here', (select count(*) from hr.time_adjustment
                                        where original_pay_period_id = v_per.id
                                           or target_pay_period_id = v_per.id),
           'reopen_allowed', coalesce((hr._knob('hr.time_and_attendance','allow_period_reopen')
                                         #>> '{}')::boolean, true),
           'reopen_notice', 'Reopening does NOT un-export and does NOT re-pay. A delivered export is never regenerated in place, because that pays the same hours twice. The fix is an adjustment.')
    into v_row;

  return hr._time_ok(v_row);
end $fn$;

comment on function hr.pay_period_get is
  'SPEC-TIME §2.7 / route 33 — one pay period''s header: every transition timestamp and actor, the boundary-week panel text in words, the server-computed counts by pay_period_employment.state, how many adjustments are tagged to it, and the reopen notice the surface renders verbatim.';

-- ============================================================ 3. hr.attendance_exception_list (route 31)
create or replace function hr.attendance_exception_list(p_filters jsonb default '{}'::jsonb,
                                                        p_page jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_uid  uuid := auth.uid();
  v_mine uuid[];
  v_orgs uuid[];
  pg     record;
  v_tot  integer;
  v_rows jsonb;
  f      jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'The exceptions queue is always read as somebody.');
  end if;
  v_mine := coalesce(hr.employments_of(v_uid, current_date), '{}'::uuid[]);
  if cardinality(v_mine) = 0 then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in any organization, so there are no exceptions to show you.');
  end if;
  select coalesce(array_agg(distinct em.organization_id), '{}'::uuid[]) into v_orgs
    from hr.employment em where em.id = any (v_mine);
  pg := hr._time_page(p_page);

  with visible as (
    select ae.id
      from hr.attendance_exception ae
     where ae.organization_id = any (v_orgs)
       -- §2.6: an employee reads their OWN, read-only. Everyone else needs reach, and RD 3 says
       -- the predicate is asked about THAT employment as of THAT work date.
       and (ae.employment_id = any (v_mine)
            or hr.capability(v_uid, 'time.read', ae.employment_id, ae.local_work_date))
       and (f -> 'resolution_state' is null
            or ae.resolution_state = any (select jsonb_array_elements_text(f -> 'resolution_state')))
       and (f -> 'exception_kind' is null
            or ae.exception_kind = any (select jsonb_array_elements_text(f -> 'exception_kind')))
       and (f -> 'severity' is null
            or ae.severity = any (select jsonb_array_elements_text(f -> 'severity')))
       and (f ->> 'employment_id' is null or ae.employment_id = (f ->> 'employment_id')::uuid)
       and (f ->> 'from' is null or ae.local_work_date >= (f ->> 'from')::date)
       and (f ->> 'to' is null or ae.local_work_date <= (f ->> 'to')::date)
       and (f ->> 'work_location_id' is null
            or ae.work_location_id = (f ->> 'work_location_id')::uuid)
       -- "affects an unapproved period" (§2.6's declared filter)
       and (f ->> 'affects_unapproved_period' is null
            or (f ->> 'affects_unapproved_period')::boolean = exists (
                  select 1 from hr.pay_period pp
                    join hr.employment em2 on em2.pay_group_id = pp.pay_group_id
                   where em2.id = ae.employment_id
                     and ae.local_work_date between pp.period_start_on and pp.period_end_on
                     and pp.state in ('open','submitted','reopened')))
  )
  select count(*)::integer into v_tot from visible;

  with visible as (
    select ae.id, ae.severity, ae.detected_at
      from hr.attendance_exception ae
     where ae.organization_id = any (v_orgs)
       and (ae.employment_id = any (v_mine)
            or hr.capability(v_uid, 'time.read', ae.employment_id, ae.local_work_date))
       and (f -> 'resolution_state' is null
            or ae.resolution_state = any (select jsonb_array_elements_text(f -> 'resolution_state')))
       and (f -> 'exception_kind' is null
            or ae.exception_kind = any (select jsonb_array_elements_text(f -> 'exception_kind')))
       and (f -> 'severity' is null
            or ae.severity = any (select jsonb_array_elements_text(f -> 'severity')))
       and (f ->> 'employment_id' is null or ae.employment_id = (f ->> 'employment_id')::uuid)
       and (f ->> 'from' is null or ae.local_work_date >= (f ->> 'from')::date)
       and (f ->> 'to' is null or ae.local_work_date <= (f ->> 'to')::date)
       and (f ->> 'work_location_id' is null
            or ae.work_location_id = (f ->> 'work_location_id')::uuid)
       and (f ->> 'affects_unapproved_period' is null
            or (f ->> 'affects_unapproved_period')::boolean = exists (
                  select 1 from hr.pay_period pp
                    join hr.employment em2 on em2.pay_group_id = pp.pay_group_id
                   where em2.id = ae.employment_id
                     and ae.local_work_date between pp.period_start_on and pp.period_end_on
                     and pp.state in ('open','submitted','reopened')))
     -- decisions first: violations, then warnings, then the rest, newest within each
     order by case ae.severity when 'violation' then 0 when 'warn' then 1 else 2 end,
              ae.detected_at desc
     offset pg.p_off limit pg.p_size
  )
  -- RD 7: the SAME row builder the resolver uses, so allowedResolutions cannot drift
  select coalesce(jsonb_agg(hr._time_exception_json(v.id)
                            order by case v.severity when 'violation' then 0
                                                     when 'warn' then 1 else 2 end,
                                     v.detected_at desc), '[]'::jsonb)
    into v_rows from visible v;

  return hr._time_ok(jsonb_build_object(
    'rows', v_rows,
    'page', pg.p_num, 'page_size', pg.p_size, 'total_rows', v_tot,
    'has_more', pg.p_off + jsonb_array_length(v_rows) < v_tot,
    'actions_note', 'Every row carries its own allowedResolutions. Render those, never a hardcoded list: `excused` is absent on severity=violation because a statutory-premium exception cannot be excused into nonexistence.'));
end $fn$;

comment on function hr.attendance_exception_list is
  'SPEC-TIME §2.6 / route 31 — the exceptions queue, fully paginated with an honest total_rows. An employee sees their own rows; anyone else needs time.read over that employment as of that work date. Sorted decisions-first (violation, then warn). Each row is built by hr._time_exception_json, so the list and hr.attendance_exception_resolve can never disagree about which actions exist.';

-- ============================================================ 4. hr.time_adjustment_list (route 33)
create or replace function hr.time_adjustment_list(p_filters jsonb default '{}'::jsonb,
                                                   p_page jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_uid  uuid := auth.uid();
  v_mine uuid[];
  v_orgs uuid[];
  pg     record;
  v_tot  integer;
  v_rows jsonb;
  f      jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'The adjustments list is always read as somebody.');
  end if;
  v_mine := coalesce(hr.employments_of(v_uid, current_date), '{}'::uuid[]);
  if cardinality(v_mine) = 0 then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in any organization, so there are no corrections to show you.');
  end if;
  select coalesce(array_agg(distinct em.organization_id), '{}'::uuid[]) into v_orgs
    from hr.employment em where em.id = any (v_mine);
  pg := hr._time_page(p_page);

  with visible as (
    select ta.id
      from hr.time_adjustment ta
     where ta.organization_id = any (v_orgs)
       and (ta.employment_id = any (v_mine)
            or hr.capability(v_uid, 'time.read', ta.employment_id, ta.work_date))
       and (f ->> 'pay_period_id' is null
            or ta.original_pay_period_id = (f ->> 'pay_period_id')::uuid
            or ta.target_pay_period_id = (f ->> 'pay_period_id')::uuid)
       and (f ->> 'employment_id' is null or ta.employment_id = (f ->> 'employment_id')::uuid)
       and (f ->> 'from' is null or ta.work_date >= (f ->> 'from')::date)
       and (f ->> 'to' is null or ta.work_date <= (f ->> 'to')::date)
       and (f ->> 'approved' is null
            or (f ->> 'approved')::boolean = (ta.approved_at is not null))
       and (f ->> 'exported' is null
            or (f ->> 'exported')::boolean = (ta.exported_at is not null))
  )
  select count(*)::integer into v_tot from visible;

  select coalesce(jsonb_agg(s.r order by s.created_at desc), '[]'::jsonb) into v_rows
    from (
      select ta.created_at, jsonb_build_object(
        'id', ta.id,
        'employment_id', ta.employment_id,
        'employee_display_name', e.display_name,
        'original_pay_period_id', ta.original_pay_period_id,
        'target_pay_period_id', ta.target_pay_period_id,
        'work_date', ta.work_date,
        'earning_code_id', ta.earning_code_id,
        'earning_code', ec.code,
        'earning_code_name', ec.name,
        'hours_delta', ta.hours_delta,
        -- money exactly as stored; a 0 the filer never priced says so in `calc`
        'amount_delta', ta.amount_delta,
        'amount_pending', coalesce((ta.calc ->> 'amount_pending')::boolean, false),
        'rate', ta.rate,
        'reason_category_id', ta.reason_category_id,
        'reason_note', ta.reason_note,
        'workflow_instance_id', ta.workflow_instance_id,
        'workflow', hr.wf_for_target('hr_time_adjustment', ta.id),
        'approved_at', ta.approved_at,
        'approved_by_employment_id', ta.approved_by_employment_id,
        'exported_at', ta.exported_at,
        'created_at', ta.created_at,
        'actor_type', ta.actor_type,
        'actor_employment_id', ta.actor_employment_id,
        'locked_period_note', 'This correction rides the NEXT export, tagged to the original period. The locked period is never rewritten.',
        'calc', jsonb_build_object('rule_version_ids', to_jsonb(ta.rule_version_ids),
                                   'engine_key', ta.engine_key,
                                   'engine_version', ta.engine_version,
                                   'calc', ta.calc, 'computed_at', ta.computed_at)) r
        from hr.time_adjustment ta
        join hr.employment em on em.id = ta.employment_id
        join hr.employee e on e.id = em.employee_id
        join hr.earning_code ec on ec.id = ta.earning_code_id
       where ta.organization_id = any (v_orgs)
         and (ta.employment_id = any (v_mine)
              or hr.capability(v_uid, 'time.read', ta.employment_id, ta.work_date))
         and (f ->> 'pay_period_id' is null
              or ta.original_pay_period_id = (f ->> 'pay_period_id')::uuid
              or ta.target_pay_period_id = (f ->> 'pay_period_id')::uuid)
         and (f ->> 'employment_id' is null or ta.employment_id = (f ->> 'employment_id')::uuid)
         and (f ->> 'from' is null or ta.work_date >= (f ->> 'from')::date)
         and (f ->> 'to' is null or ta.work_date <= (f ->> 'to')::date)
         and (f ->> 'approved' is null
              or (f ->> 'approved')::boolean = (ta.approved_at is not null))
         and (f ->> 'exported' is null
              or (f ->> 'exported')::boolean = (ta.exported_at is not null))
       order by ta.created_at desc
       offset pg.p_off limit pg.p_size
    ) s;

  return hr._time_ok(jsonb_build_object(
    'rows', v_rows,
    'page', pg.p_num, 'page_size', pg.p_size, 'total_rows', v_tot,
    'has_more', pg.p_off + jsonb_array_length(v_rows) < v_tot));
end $fn$;

comment on function hr.time_adjustment_list is
  'SPEC-TIME §7.1 / route 33 — the post-lock corrections tagged to a period, fully paginated with an honest total_rows. Each row carries its workflow badge via hr.wf_for_target and its amount exactly as stored, with amount_pending set where the filer supplied no money figure so a 0 is never read as a priced zero.';

-- ============================================================ 5. the OT pre-approval reads (D24a)
create or replace function hr._time_ot_preapproval_json(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'hr','public' as $fn$
  select jsonb_build_object(
    'id', op.id,
    'employment_id', op.employment_id,
    'employee_display_name', e.display_name,
    'workweek_id', op.workweek_id,
    'requested_by_name', (select e2.display_name from hr.employment em2
                            join hr.employee e2 on e2.id = em2.employee_id
                           where em2.id = op.requested_by_employment_id),
    'request_kind', op.request_kind,
    'covers_from', op.covers_from,
    'covers_to', op.covers_to,
    'requested_hours', op.requested_hours,
    'approved_hours', op.approved_hours,
    'reason_category_id', op.reason_category_id,
    'reason_note', op.reason_note,
    'shift_ids', to_jsonb(op.shift_ids),
    'state', op.state,
    'workflow_instance_id', op.workflow_instance_id,
    'workflow', hr.wf_for_target('hr_overtime_preapproval', op.id),
    'decided_at', op.decided_at,
    'decided_by_employment_id', op.decided_by_employment_id,
    'decided_by_name', (select e3.display_name from hr.employment em3
                          join hr.employee e3 on e3.id = em3.employee_id
                         where em3.id = op.decided_by_employment_id),
    'actual_ot_hours', op.actual_ot_hours,
    'variance_hours', op.variance_hours,
    'unapproved_ot_flagged', op.unapproved_ot_flagged,
    'corrective_action_id', op.corrective_action_id,
    'threshold_axes', coalesce(op.calc -> 'threshold_axes', '[]'::jsonb),
    -- 🚨 the law, on every row, so no surface can render this object as a pay gate
    'payment_note', 'Overtime that is worked is PAID whether or not this request was approved. A denial is an instruction not to work the hours; it never withholds pay.',
    'payment_withheld', false,
    'calc', jsonb_build_object('rule_version_ids', to_jsonb(op.rule_version_ids),
                               'engine_key', op.engine_key, 'engine_version', op.engine_version,
                               'calc', op.calc, 'computed_at', op.computed_at))
    from hr.overtime_preapproval op
    join hr.employment em on em.id = op.employment_id
    join hr.employee e on e.id = em.employee_id
   where op.id = p_id and op.deleted_at is null;
$fn$;

comment on function hr._time_ot_preapproval_json is
  'One hr.overtime_preapproval shaped as features/hr/time/api/types.ts OvertimePreapprovalRow, with payment_withheld=false and the plain-words payment note on every row so no surface can render this object as a pay gate.';

create or replace function hr.overtime_preapproval_get(p_preapproval_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_op  hr.overtime_preapproval%rowtype;
  v_at  date;
  v_mine uuid[];
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'An overtime request is always read as somebody.');
  end if;
  select * into v_op from hr.overtime_preapproval
   where id = p_preapproval_id and deleted_at is null;
  if not found then
    return hr._time_refusal('hr_preapproval_not_found',
      'No overtime request with that id is readable.',
      jsonb_build_object('preapproval_id', p_preapproval_id));
  end if;
  v_at := (v_op.covers_from at time zone 'UTC')::date;
  v_mine := coalesce(hr.employments_of(v_uid, v_at), '{}'::uuid[]);
  if not (v_op.employment_id = any (v_mine))
     and not hr.capability(v_uid, 'time.read', v_op.employment_id, v_at) then
    return hr._time_refusal('hr_no_preapproval_read_authority',
      'An overtime request is readable by its subject, by a manager with reach over them, or by HR. You are none of those for this employment.',
      jsonb_build_object('capability_required', 'time.read',
                         'subject_employment_id', v_op.employment_id, 'as_of', v_at));
  end if;
  return hr._time_ok(hr._time_ot_preapproval_json(p_preapproval_id));
end $fn$;

comment on function hr.overtime_preapproval_get is
  'SPEC-TIME §4.4 / route 31b — one overtime pre-approval, readable by its subject, a manager with reach, or HR, as of the date the overtime would be worked.';

create or replace function hr.overtime_preapproval_list(p_filters jsonb default '{}'::jsonb,
                                                        p_page jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_uid  uuid := auth.uid();
  v_mine uuid[];
  v_orgs uuid[];
  pg     record;
  v_tot  integer;
  v_rows jsonb;
  f      jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'The overtime queue is always read as somebody.');
  end if;
  v_mine := coalesce(hr.employments_of(v_uid, current_date), '{}'::uuid[]);
  if cardinality(v_mine) = 0 then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in any organization, so there are no overtime requests to show you.');
  end if;
  select coalesce(array_agg(distinct em.organization_id), '{}'::uuid[]) into v_orgs
    from hr.employment em where em.id = any (v_mine);
  pg := hr._time_page(p_page);

  with visible as (
    select op.id
      from hr.overtime_preapproval op
     where op.deleted_at is null and op.organization_id = any (v_orgs)
       and (op.employment_id = any (v_mine)
            or hr.capability(v_uid, 'time.read', op.employment_id,
                             (op.covers_from at time zone 'UTC')::date))
       and (f -> 'state' is null
            or op.state = any (select jsonb_array_elements_text(f -> 'state')))
       and (f ->> 'employment_id' is null or op.employment_id = (f ->> 'employment_id')::uuid)
       and (f -> 'request_kind' is null
            or op.request_kind = any (select jsonb_array_elements_text(f -> 'request_kind')))
       and (f ->> 'from' is null or op.covers_to >= (f ->> 'from')::timestamptz)
       and (f ->> 'to' is null or op.covers_from <= (f ->> 'to')::timestamptz)
       and (f ->> 'unapproved_ot_flagged' is null
            or (f ->> 'unapproved_ot_flagged')::boolean = op.unapproved_ot_flagged)
  )
  select count(*)::integer into v_tot from visible;

  select coalesce(jsonb_agg(hr._time_ot_preapproval_json(s.id) order by s.covers_from desc),
                  '[]'::jsonb)
    into v_rows
    from (
      select op.id, op.covers_from
        from hr.overtime_preapproval op
       where op.deleted_at is null and op.organization_id = any (v_orgs)
         and (op.employment_id = any (v_mine)
              or hr.capability(v_uid, 'time.read', op.employment_id,
                               (op.covers_from at time zone 'UTC')::date))
         and (f -> 'state' is null
              or op.state = any (select jsonb_array_elements_text(f -> 'state')))
         and (f ->> 'employment_id' is null or op.employment_id = (f ->> 'employment_id')::uuid)
         and (f -> 'request_kind' is null
              or op.request_kind = any (select jsonb_array_elements_text(f -> 'request_kind')))
         and (f ->> 'from' is null or op.covers_to >= (f ->> 'from')::timestamptz)
         and (f ->> 'to' is null or op.covers_from <= (f ->> 'to')::timestamptz)
         and (f ->> 'unapproved_ot_flagged' is null
              or (f ->> 'unapproved_ot_flagged')::boolean = op.unapproved_ot_flagged)
       -- decisions first: still requested, then the rest, newest window first
       order by case when op.state = 'requested' then 0 else 1 end, op.covers_from desc
       offset pg.p_off limit pg.p_size
    ) s;

  return hr._time_ok(jsonb_build_object(
    'rows', v_rows,
    'page', pg.p_num, 'page_size', pg.p_size, 'total_rows', v_tot,
    'has_more', pg.p_off + jsonb_array_length(v_rows) < v_tot,
    'decision_door', 'hr_wf_decide',
    'decision_note', 'There is no overtime decide RPC. A decision is taken through the workflow engine''s hr_wf_decide on the request''s open step — the approval engine is the only approval engine.',
    'payment_note', 'Nothing on this queue gates pay. Overtime that is worked is paid whatever a request says.'));
end $fn$;

comment on function hr.overtime_preapproval_list is
  'SPEC-TIME §4.4 / route 31a — the overtime pre-approval queue, fully paginated with an honest total_rows, sorted still-requested first. Readable rows are the caller''s own plus any employment they hold time.read over as of the date the overtime would be worked. Carries the decision door (hr_wf_decide — there is deliberately no overtime decide RPC) and, on every row, the fact that nothing here withholds pay.';

-- ============================================================ 6. the PostgREST wrappers
create or replace function public.hr_pay_period_list(p_filters jsonb default '{}'::jsonb,
                                                     p_page jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.pay_period_list($1, $2);
$fn$;

create or replace function public.hr_pay_period_get(p_pay_period_id uuid)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.pay_period_get($1);
$fn$;

create or replace function public.hr_attendance_exception_list(p_filters jsonb default '{}'::jsonb,
                                                               p_page jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.attendance_exception_list($1, $2);
$fn$;

create or replace function public.hr_time_adjustment_list(p_filters jsonb default '{}'::jsonb,
                                                          p_page jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.time_adjustment_list($1, $2);
$fn$;

create or replace function public.hr_overtime_preapproval_list(p_filters jsonb default '{}'::jsonb,
                                                               p_page jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.overtime_preapproval_list($1, $2);
$fn$;

create or replace function public.hr_overtime_preapproval_get(p_preapproval_id uuid)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.overtime_preapproval_get($1);
$fn$;

do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr._time_page(jsonb)',
    'hr._time_ot_preapproval_json(uuid)',
    'hr.pay_period_list(jsonb,jsonb)',
    'hr.pay_period_get(uuid)',
    'hr.attendance_exception_list(jsonb,jsonb)',
    'hr.time_adjustment_list(jsonb,jsonb)',
    'hr.overtime_preapproval_list(jsonb,jsonb)',
    'hr.overtime_preapproval_get(uuid)',
    'public.hr_pay_period_list(jsonb,jsonb)',
    'public.hr_pay_period_get(uuid)',
    'public.hr_attendance_exception_list(jsonb,jsonb)',
    'public.hr_time_adjustment_list(jsonb,jsonb)',
    'public.hr_overtime_preapproval_list(jsonb,jsonb)',
    'public.hr_overtime_preapproval_get(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v jsonb; w text;
begin
  foreach w in array ARRAY[
    'public.hr_pay_period_list(jsonb,jsonb)',
    'public.hr_pay_period_get(uuid)',
    'public.hr_attendance_exception_list(jsonb,jsonb)',
    'public.hr_time_adjustment_list(jsonb,jsonb)',
    'public.hr_overtime_preapproval_list(jsonb,jsonb)',
    'public.hr_overtime_preapproval_get(uuid)'] loop
    if to_regprocedure(w) is null then
      raise exception 'hr_l3_28: % was not created', w;
    end if;
    if has_function_privilege('anon', w, 'execute') then
      raise exception 'hr_l3_28: anon holds EXECUTE on %', w;
    end if;
  end loop;

  -- LAW 3: the page reader honours PageRequest and caps at 500
  if (hr._time_page('{"page":3,"pageSize":25}'::jsonb)).p_off <> 50 then
    raise exception 'hr_l3_28: the page reader mis-computed a one-based offset';
  end if;
  if (hr._time_page('{"pageSize":9999}'::jsonb)).p_size <> 500 then
    raise exception 'hr_l3_28: the page reader did not cap pageSize at 500';
  end if;
  if (hr._time_page('{"page_size":10}'::jsonb)).p_size <> 10 then
    raise exception 'hr_l3_28: the page reader did not accept the page_size alias';
  end if;

  -- every read refuses an unauthenticated caller with a FLAT named code rather than raising
  foreach w in array ARRAY['pay_period_list','attendance_exception_list','time_adjustment_list',
                           'overtime_preapproval_list'] loop
    execute format('select hr.%I(''{}''::jsonb, ''{}''::jsonb)', w) into v;
    if coalesce((v ->> 'ok')::boolean, true) or jsonb_typeof(v -> 'error') <> 'string' then
      raise exception 'hr_l3_28: hr.% did not refuse with a flat named code: %', w, v;
    end if;
  end loop;
  v := hr.pay_period_get('00000000-0000-0000-0000-000000000000'::uuid);
  if coalesce((v ->> 'ok')::boolean, true) then
    raise exception 'hr_l3_28: pay_period_get did not refuse';
  end if;
  v := hr.overtime_preapproval_get('00000000-0000-0000-0000-000000000000'::uuid);
  if coalesce((v ->> 'ok')::boolean, true) then
    raise exception 'hr_l3_28: overtime_preapproval_get did not refuse';
  end if;
end $$;
