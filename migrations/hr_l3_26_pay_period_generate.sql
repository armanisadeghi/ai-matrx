-- HR domain L3 — migration 26 (register item HRB-015, lane L3 punch + kiosk).
--
-- `hr.pay_period_generate(p_pay_group_id, p_through_date)` + `public.hr_pay_period_generate`.
-- Nothing in the product created pay periods, so `hr.pay_period` was empty: every timecard read,
-- every period transition and every recompute that attributes hours to a period had nothing to
-- attach to. This is the door that fills it.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 IDEMPOTENCE RIDES THE EXISTING UNIQUE KEY, NOT A DATE COMPARISON.
--    `hr.pay_period` already carries `pay_period_unique (pay_group_id, sequence_number)`. Generation
--    walks the sequence from 1 and inserts `on conflict (pay_group_id, sequence_number) do nothing`,
--    so re-running is a no-op by construction rather than by a pre-check that could race. Gap-free
--    falls out of the same property: the sequence is dense because it is generated, never skipped.
--
-- 2. 🚨 A SEQUENCE THAT EXISTS WITH DIFFERENT DATES IS REPORTED, NOT SILENTLY SKIPPED.
--    `do nothing` cannot tell "already correct" from "already there and WRONG". A period whose
--    stored dates disagree with what the pay group's frequency now produces is real drift - somebody
--    edited a period, or the anchor moved - and silently leaving it would make this door report
--    success over a calendar that no longer matches its own rule. Conflicts come back by sequence
--    number with both date pairs, and they are counted separately from `created` and `unchanged`.
--
-- 3. THE CALENDAR IS ANCHORED AT `first_period_start_on` AND THEN FOLLOWS THE FREQUENCY.
--    weekly/biweekly are pure arithmetic from the anchor (7n / 14n). semimonthly and monthly are
--    CALENDAR-driven after the anchor: the first period runs from the anchor to its natural
--    boundary (the 15th, or month end), and every period after that is a whole half-month or month.
--    An anchor mid-month therefore produces one short first period and then clean boundaries, which
--    is what a payroll calendar actually looks like when a customer starts mid-cycle.
--
-- 4. THE GATE IS THE ONE THE TRANSITION DOOR ALREADY USES - `payroll.read` - resolved through this
--    lane's tenancy-defended `hr._punch_capability` with the org rung, so it cannot be satisfied by
--    a role held in a DIFFERENT organization. Verified live that the capability is reachable
--    (payroll_admin, hr_admin, hr_owner all carry it) rather than assumed: a gate nobody can pass
--    is the N1 failure shape, and this door would have been just as unreachable.
--
-- 5. AN UNKNOWN PAY GROUP IS REFUSED BY NAME AND SCOPED TO THE CALLER'S ORGANIZATIONS, so the
--    refusal cannot be used to probe whether a pay-group id exists in another tenant - the same
--    posture as the exception-list period axis.
--
-- 6. THE LOOP IS BOUNDED. `p_through_date` is capped to 10 years past the anchor and the iteration
--    count is hard-capped, so a mistyped date cannot generate an unbounded calendar inside a
--    transaction that holds a write guard open.
-- ===================================================================================

create or replace function hr.pay_period_generate(
  p_pay_group_id uuid, p_through_date date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_uid     uuid := auth.uid();
  g         hr.pay_group%rowtype;
  v_through date;
  v_seq     integer := 0;
  v_start   date;
  v_end     date;
  v_cursor  date;
  v_created jsonb := '[]'::jsonb;
  v_conf    jsonb := '[]'::jsonb;
  v_same    integer := 0;
  v_id      uuid;
  v_ex      hr.pay_period%rowtype;
  v_guard   integer := 0;
begin
  if v_uid is null then
    return hr._punch_refusal('hr_no_authenticated_caller',
      'Generating a payroll calendar is always done by somebody. Sign in and try again.');
  end if;
  if p_pay_group_id is null then
    return hr._punch_refusal('hr_arguments_incomplete',
      'A pay group is required: the calendar is generated from its frequency and its first period start.');
  end if;

  select * into g from hr.pay_group where id = p_pay_group_id and deleted_at is null;
  -- decision 5: unknown OR another tenant's = the same refusal, so this cannot probe
  if not found
     or not exists (select 1 from hr.employment em
                     join hr.employee e on e.id = em.employee_id
                    where e.login_user_id = v_uid
                      and em.organization_id = g.organization_id
                      and em.deleted_at is null) then
    return hr._punch_refusal('hr_pay_group_not_found',
      'That pay group does not exist in your organization, so its payroll calendar cannot be generated.',
      jsonb_build_object('pay_group_id', p_pay_group_id));
  end if;

  -- decision 4: the same authority the transition door uses, org-scoped
  if not hr._punch_capability(v_uid, 'payroll.read', null, current_date, g.organization_id) then
    return hr._punch_refusal('hr_period_generate_authority_required',
      'Generating the payroll calendar is an HR or payroll admin act. You do not hold payroll.read '
      || 'in this organization.',
      jsonb_build_object('capability_required', 'payroll.read',
                         'organization_id', g.organization_id, 'pay_group_id', p_pay_group_id));
  end if;

  -- decision 6: bounded
  v_through := coalesce(p_through_date, current_date);
  if v_through < g.first_period_start_on then
    return hr._punch_refusal('hr_through_date_before_anchor',
      format('This pay group''s calendar starts on %s. Generating through %s would produce nothing.',
             g.first_period_start_on, v_through),
      jsonb_build_object('first_period_start_on', g.first_period_start_on, 'through_date', v_through));
  end if;
  if v_through > g.first_period_start_on + 3653 then
    return hr._punch_refusal('hr_through_date_too_far',
      'A payroll calendar is generated at most ten years past its first period start.',
      jsonb_build_object('through_date', v_through,
                         'max_through_date', g.first_period_start_on + 3653));
  end if;

  v_cursor := g.first_period_start_on;

  while v_cursor <= v_through loop
    v_guard := v_guard + 1;
    exit when v_guard > 1200;
    v_seq := v_seq + 1;
    v_start := v_cursor;

    -- decision 3: arithmetic for weekly/biweekly, calendar boundaries for semimonthly/monthly
    v_end := case g.pay_frequency
      when 'weekly'   then v_start + 6
      when 'biweekly' then v_start + 13
      when 'semimonthly' then
        case when extract(day from v_start)::int <= 15
             then (date_trunc('month', v_start)::date + 14)
             else (date_trunc('month', v_start) + interval '1 month - 1 day')::date end
      when 'monthly' then (date_trunc('month', v_start) + interval '1 month - 1 day')::date
    end;

    select * into v_ex from hr.pay_period
     where pay_group_id = g.id and sequence_number = v_seq;

    if found then
      if v_ex.period_start_on = v_start and v_ex.period_end_on = v_end then
        v_same := v_same + 1;
      else
        -- decision 2: drift is reported, never silently accepted
        v_conf := v_conf || jsonb_build_array(jsonb_build_object(
          'sequence_number', v_seq, 'pay_period_id', v_ex.id,
          'stored', jsonb_build_object('period_start_on', v_ex.period_start_on,
                                       'period_end_on', v_ex.period_end_on),
          'generated', jsonb_build_object('period_start_on', v_start, 'period_end_on', v_end),
          'state', v_ex.state));
      end if;
    else
      perform hr.arm_write();
      insert into hr.pay_period (organization_id, pay_group_id, period_start_on, period_end_on,
                                 sequence_number, state, opened_at)
      values (g.organization_id, g.id, v_start, v_end, v_seq, 'open', now())
      on conflict (pay_group_id, sequence_number) do nothing
      returning id into v_id;
      if v_id is not null then
        v_created := v_created || jsonb_build_array(jsonb_build_object(
          'pay_period_id', v_id, 'sequence_number', v_seq,
          'period_start_on', v_start, 'period_end_on', v_end));
        v_id := null;
      else
        v_same := v_same + 1;   -- a concurrent generator won the race; still not a duplicate
      end if;
    end if;

    v_cursor := v_end + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'pay_group_id', g.id,
    'organization_id', g.organization_id,
    'pay_frequency', g.pay_frequency,
    'first_period_start_on', g.first_period_start_on,
    'through_date', v_through,
    'created', v_created,
    'created_count', jsonb_array_length(v_created),
    'unchanged_count', v_same,
    'conflicts', v_conf,
    'conflict_count', jsonb_array_length(v_conf),
    'total_periods', (select count(*) from hr.pay_period where pay_group_id = g.id),
    'note', case when jsonb_array_length(v_conf) > 0
      then 'One or more existing periods have dates that disagree with this pay group''s frequency. '
        || 'They were NOT changed - a period that has already been submitted, approved or exported '
        || 'is evidence. Reconcile them deliberately.' end);
end
$$;

comment on function hr.pay_period_generate(uuid, date) is
  'Idempotent gap-free payroll calendar generation from the pay group first_period_start_on + pay_frequency. Re-running creates nothing (unique on pay_group_id, sequence_number). Existing periods whose dates disagree are REPORTED, never overwritten.';

create or replace function public.hr_pay_period_generate(
  p_pay_group_id uuid, p_through_date date default null)
returns jsonb
language sql
security definer
set search_path to 'public', 'hr'
as $$ select hr.pay_period_generate(p_pay_group_id, p_through_date); $$;

comment on function public.hr_pay_period_generate(uuid, date) is
  'TD-1 wrapper: delegates to hr.pay_period_generate. No logic.';

revoke all on function hr.pay_period_generate(uuid, date) from public, anon;
revoke all on function public.hr_pay_period_generate(uuid, date) from public, anon;
grant execute on function public.hr_pay_period_generate(uuid, date) to authenticated;

do $$
begin
  if to_regprocedure('hr.pay_period_generate(uuid,date)') is null
     or to_regprocedure('public.hr_pay_period_generate(uuid,date)') is null then
    raise exception 'hr_l3_26: the generator or its wrapper did not land';
  end if;
  if has_function_privilege('anon','public.hr_pay_period_generate(uuid,date)','EXECUTE') then
    raise exception 'hr_l3_26: anon can execute the period generator';
  end if;
  if not has_function_privilege('authenticated','public.hr_pay_period_generate(uuid,date)','EXECUTE') then
    raise exception 'hr_l3_26: authenticated cannot execute the period generator';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) > 0 then
    raise exception 'hr_l3_26: the conformance gate went RED';
  end if;
end $$;
