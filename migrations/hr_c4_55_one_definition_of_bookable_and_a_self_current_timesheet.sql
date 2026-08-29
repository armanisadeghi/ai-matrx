-- HR domain C4 — migration 55. Two employee-facing surfaces that told a person something
-- impossible or dead (round-42 adversarial walk, defects D3 and D6).
--
-- ⚠️ THE NUMBER 55 IS USED TWICE, AND THAT IS RECORDED RATHER THAN QUIETLY RENUMBERED.
-- A concurrent lane applied `hr_c4_55_a_delivery_failure_speaks_to_the_person_not_the_operator`
-- nine minutes before this file landed — a shared-checkout race, not a conflict: both ledgers key
-- on the FILENAME, both rows exist, and `hr.function_contracts_broken()` is 0. Renaming this file
-- now would orphan `hr_c4_56_restore_my_timesheet_context_client_grant`, which cites "the first
-- hr_c4_55 bytes" by that name. (That 56 is a third lane's corrective for the grant this file's
-- FIRST attempt lost to the definer-grant guard; the declaration below already fixes it, and the
-- two are idempotent over each other.)
--
-- =====================================================================================
-- PART A (D3) — "Available −16 h" UNDER THE CAPTION "What you can book right now."
--
-- 🚨 THE ENGINE WAS NOT WRONG, AND THAT IS THE WHOLE POINT.
-- `hr.leave_wf_validate` decides affordability on the PROJECTED balance at the leave's start date:
--   v_projbal := (hr.leave_project_balance(emp, policy, greatest(starts_on, current_date))
--                  ->> 'projected_available')::numeric
-- An employee with 24 hours today and 54.8 projected on Sep 21 can genuinely book 40 hours in
-- September, and `insufficient_balance` correctly did not fire even with
-- `negative_balance_allowed = false`. §4.2 says so in words: *"Projected, not current: accrual
-- between today and `starts_on` counts."*
--
-- THE DEFECT IS THAT THE PANEL ANSWERED A DIFFERENT QUESTION AND CALLED IT THE SAME ONE.
-- `hr.leave_figures` returns `available = ledger_balance − pending_approval`, which is §5's
-- accounting identity and is CORRECT AS AN ACCOUNTING FIGURE. What it is not is "what you can book
-- right now" — the caption it is rendered under. Once pending exceeds the bank it goes negative,
-- and a negative bookable quantity is not a small number, it is an impossible statement: it
-- contradicts the engine's own decision that the request was affordable, and it is the first thing
-- the employee sees after a submit that produced no warning at all.
--
-- So this migration makes the panel's number and the engine's decision ONE DEFINITION, by the only
-- move that survives the next edit: **the surface asks the same function the engine asks.** It does
-- not re-derive projection arithmetic anywhere — §5 already forbids that in terms
-- (*"two implementations of this arithmetic is a defect"*).
--
-- RECORDED TECHNICAL DECISIONS — PART A
--
-- A1. `available` IS NOT CHANGED. It is §5's identity (`Available = latest balance_after −
--     Pending approval`) and §17's tests assert it. Renaming or clamping it would move the
--     accounting truth to make a caption comfortable. Instead `leave_figures` gains
--     `bookable_now = greatest(0, ledger_balance − pending_approval)` — the quantity the caption
--     actually names — plus `pending_beyond_balance` (the overhang) and `pending_latest_start`
--     (the date the overhang is riding on). The identity keeps its own key; the panel gets its own.
--
-- A2. 🚨 A BOOKABLE QUANTITY IS NEVER NEGATIVE, AND CLAMPING ALONE WOULD BE A SECOND LIE.
--     `greatest(0, …)` on its own turns "−16" into "0" and still says nothing about the 40 hours
--     the person just successfully booked. The clamp therefore ALWAYS ships with the sentence:
--     `hr._leave_sentence` grows a branch that fires exactly when `pending_beyond_balance > 0` and
--     names the overhang, the projected figure, and the date it assumes — §5's rule that *"a
--     projected figure is never shown without the word 'projected' and the date it assumes"*.
--
-- A3. THE PROJECTION IS ATTACHED BY THE COMPOSER, NOT BY `leave_figures`. `hr.leave_project_balance`
--     CALLS `hr.leave_figures`; having `leave_figures` call it back would be mutual recursion. So
--     `hr.my_time_off` (the composer that already assembles a policy row) makes the ONE call, at
--     `pending_latest_start` — the date by which every submitted request has been spent — and merges
--     ONLY the projection's own keys (`projected_available`, `projected_balance`,
--     `projected_as_of`, `projection_basis`, `projects_future_accrual`). It deliberately does not
--     merge the whole object: `leave_project_balance` returns a full figures block whose `as_of` is
--     the PROJECTION date, and letting that overwrite the block's `as_of` would relabel today's five
--     figures as a future date.
--
-- A4. THE PREVIEW SAYS IT BEFORE THE SUBMIT, NOT AFTER. `hr.leave_request_preview` already computed
--     `hr.leave_project_balance(emp, policy, greatest(starts_on, current_date))` — the identical call
--     `leave_wf_validate` makes — and returned it as `projection`, which the form rendered only when
--     `projection_note` was non-null (i.e. only for the policies that do NOT project). For an
--     accruing policy the number the engine was about to decide on was fetched and thrown away. The
--     preview now carries `projection_sentence`, composed here, which states in the four cases that
--     exist what the request is being spent against — including the case where it predicts the
--     refusal the validator is about to raise.
--
-- A5. NO CLIENT COMPOSES ANY OF THIS PROSE. §5: *"The sentence … generated from the policy, never
--     hand-written per screen"*, and `LeaveBalanceBlock` renders `hr._leave_sentence` verbatim. Both
--     new sentences are server-side for that reason.
--
-- =====================================================================================
-- PART B (D6) — `/hr/me/timesheet` IS DEAD FOR EVERY EMPLOYEE, INCLUDING ONES WHOSE DATA EXISTS.
--
-- Reported as "not wired up". Measured: it is wired up, to a door that cannot answer, in a shape
-- the caller cannot read, with filters the door does not have. THREE independent faults, each on
-- its own fatal:
--
--   1. AUTHORITY. `features/hr/me/MyTimesheetContext.tsx` resolved the current period through
--      `hr_pay_period_list`, whose every branch is gated on
--      `hr.capability(uid,'payroll.read',…) or hr._time_has_timecard_approve(uid, org, …)`.
--      That is a MANAGER/PAYROLL door. An ordinary employee holds neither capability, so it
--      returns zero rows for exactly the people this route exists for.
--   2. ENVELOPE. `hr.pay_period_list` answers through `hr._time_ok`, which nests the payload under
--      `data`. The caller read `envelope.rows`, which is `undefined` on every response, refusal or
--      not — so even a payroll admin walking this route resolved nothing.
--   3. FILTERS. It passed `{employment_id, contains}`. `hr.pay_period_list` honours
--      `pay_group_id`, `organization_id`, `state`, `from`, `to` and silently ignores the rest, so
--      the "current period for this employment" was never being asked for in the first place.
--
-- The fix is the seam SPEC-TIME §2.2 already writes — `hr.timesheet_get(self, current_period)` —
-- expressed as a resolver door, so the two ids the frozen `hr.timesheet_get(uuid, uuid)` contract
-- needs are produced by the server rather than guessed by a page.
--
-- RECORDED TECHNICAL DECISIONS — PART B
--
-- B1. A NEW SELF-SCOPED DOOR, NOT A RELAXED MANAGER DOOR. Widening `hr.pay_period_list` so an
--     employee could read it would hand every employee the org's whole pay calendar plus per-period
--     headcount `counts`. The authority on that door is correct; what was missing is a door for the
--     other question. `hr.my_timesheet_context` answers only about the caller's own employments and
--     returns no other person's row, ever.
--
-- B2. 🚨 `hr.timesheet_get` IS NOT TOUCHED. It carries a live `hr.function_contract` row
--     (`hr_l3_88`, `must_contain = {v_reach}`) protecting the order of its reach check, and the
--     whole T-13 non-enumeration property lives in that ordering. Resolution is a separate call
--     that hands it two ids; the frozen two-uuid contract is unchanged.
--
-- B3. THE PERIOD IS THE ONE THE PERSON IS ACTUALLY IN, PROVEN BY THEIR OWN ROW.
--     `hr.pay_period_employment` is the evidence that an employment is enrolled in a period, so the
--     resolution joins through it — never "the org's newest period", which is what a `pay_group`
--     filter alone would have produced for the several overlapping calendars this org runs.
--     The employment's own `pay_group_id` disambiguates when more than one period contains today.
--
-- B4. `most_recent` IS A REAL ANSWER AND IT SAYS SO. If no period contains today (the punch fixture
--     is exactly this: their last period ended 2026-08-27), the door returns the most recent period
--     the person has a row in, with `basis = 'most_recent'` and a sentence naming the dates.
--     Showing a closed period silently would be the same class of defect as the one being fixed;
--     showing nothing would hide hours that exist.
--
-- B5. `none` CARRIES THE REASON, IN THE THREE SHAPES IT COMES IN — no pay group, a pay group with no
--     period that includes them, and an employment that has not started. "That link is not wired up
--     yet" is deleted: a person is never told the product is unfinished when the true answer is a
--     fact about their own record.
--
-- Authority: SPEC-LEAVE §4.2 (projected, not current), §5 (the honesty law, the as-of/projection
-- rules, "two implementations of this arithmetic is a defect"), §4.1 (the cost is shown before
-- submit); SPEC-TIME §2.2 (`hr.timesheet_get(self, current_period)`, the `no-timesheet` sentence).
-- Applied live as `hr_c4_55_one_definition_of_bookable_and_a_self_current_timesheet`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

-- =====================================================================================
-- A1 — the five figures keep their identity; the caption gets its own quantity.
-- =====================================================================================

create or replace function hr.leave_figures(
  p_employment_id uuid,
  p_leave_policy_id uuid,
  p_as_of date default current_date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_pol       hr.leave_policy%rowtype;
  v_accrued   numeric := 0;
  v_used      numeric := 0;
  v_upcoming  numeric := 0;
  v_pending   numeric := 0;
  v_removed   numeric := 0;
  v_balance   numeric := 0;
  v_identity  boolean;
  v_usable    date;
  v_hire      date;
  v_pend_last date;
begin
  v_pol := hr._leave_policy_at(p_leave_policy_id);
  if v_pol.id is null then
    return jsonb_build_object('ok', false, 'refused', 'LEAVE_POLICY_NOT_FOUND');
  end if;

  -- §2.3 / R-L5 U9: an unlimited policy renders the WORD, never a zero and never a bar.
  if v_pol.accrual_method = 'unlimited' then
    return jsonb_build_object(
      'ok', true, 'unlimited', true, 'as_of', p_as_of,
      'policy_id', v_pol.id, 'policy_name', v_pol.name, 'leave_kind', v_pol.leave_kind,
      'sentence', 'Unlimited — requests still need approval.');
  end if;

  select
    coalesce(sum(l.hours_delta) filter (
      where l.entry_kind in ('accrual','carryover','opening_balance','reinstatement')
         or (l.entry_kind = 'adjustment' and l.hours_delta > 0)), 0),
    coalesce(-sum(l.hours_delta) filter (
      where l.entry_kind in ('forfeiture','carryover_expiry','payout')
         or (l.entry_kind = 'adjustment' and l.hours_delta < 0)), 0)
   into v_accrued, v_removed
   from hr.leave_ledger l
  where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
    and l.occurred_on <= p_as_of;

  -- Used (taken) and Approved upcoming are both sums over `usage` entries, split by the state of
  -- the request that caused them, and both are NET OF REVERSALS — a cancelled day is not used
  -- time and is not committed time.
  --
  -- 🚨 The `approved` state appears in BOTH branches, split by the end date, and that is the fix
  -- an earlier migration exists for. A request is flipped to `taken` by the pay-period close job,
  -- not by its own end date, so `approved` with `ends_on` in the past is an absence that HAS been
  -- taken and whose hours have already left the balance. Counting it nowhere breaks the identity
  -- asserted three lines below; counting it as "upcoming" would be a lie about a week that is
  -- over. The two branches below are therefore exhaustive over every `approved` request, which is
  -- what makes `identity_holds` mean something.
  select
    coalesce(-sum(l.hours_delta) filter (
      where r.state in ('taken','partially_taken')
         or (r.state = 'approved' and r.ends_on < current_date)), 0),
    coalesce(-sum(l.hours_delta) filter (
      where r.state = 'approved' and r.ends_on >= current_date), 0)
   into v_used, v_upcoming
   from hr.leave_ledger l
   join hr.leave_request r on r.id = l.leave_request_id
  where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
    and l.entry_kind in ('usage','reversal')
    and l.occurred_on <= p_as_of;

  -- 🚨 `pending_latest_start` RIDES ALONG WITH `pending_approval` AND IS READ FROM THE SAME ROWS.
  -- It is the date by which every request awaiting a decision has been spent, and it is the only
  -- honest as-of for the question "when will the hours I have already asked for exist?".
  -- Resolving it in a second query — or client-side over `requests[]` — would be a second
  -- definition of the same set the moment either predicate changes.
  select coalesce(sum(r.requested_hours), 0), max(r.starts_on)
    into v_pending, v_pend_last
    from hr.leave_request r
   where r.employment_id = p_employment_id and r.leave_policy_id = p_leave_policy_id
     and r.state = 'submitted' and r.deleted_at is null;

  select coalesce(l.balance_after, 0) into v_balance
    from hr.leave_ledger l
   where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
     and l.occurred_on <= p_as_of
   order by l.occurred_on desc, l.created_at desc limit 1;
  v_balance := coalesce(v_balance, 0);

  -- §5 / §17 test 3: the identity the UI asserts. Returned rather than trusted, so a divergence
  -- renders as a loud banner instead of a wrong number.
  v_identity := round(v_accrued - v_used - v_upcoming - v_removed, 4) = round(v_balance, 4);

  select em.hire_date into v_hire from hr.employment em where em.id = p_employment_id;
  if v_pol.usable_after_days > 0 and v_hire is not null then
    v_usable := v_hire + v_pol.usable_after_days;
  end if;

  return jsonb_build_object(
    'ok', true, 'unlimited', false, 'as_of', p_as_of,
    'policy_id', v_pol.id, 'policy_name', v_pol.name, 'leave_kind', v_pol.leave_kind,
    'accrual_method', v_pol.accrual_method, 'accrual_rate', v_pol.accrual_rate,
    'accrual_per_units', v_pol.accrual_per_units, 'increment_minutes', v_pol.increment_minutes,
    'balance_cap', v_pol.balance_cap, 'carryover_allowed', v_pol.carryover_allowed,
    'negative_balance_allowed', v_pol.negative_balance_allowed,
    'negative_balance_floor', v_pol.negative_balance_floor,
    'statutory_basis_rule_class', v_pol.statutory_basis_rule_class,
    'usable_on', v_usable,
    'accrued_to_date',   round(v_accrued, 4),
    'used_taken',        round(v_used, 4),
    'approved_upcoming', round(v_upcoming, 4),
    'pending_approval',  round(v_pending, 4),
    'removed',           round(v_removed, 4),
    'ledger_balance',    round(v_balance, 4),
    -- §5's identity, unchanged and still asserted by §17: Available = balance_after − Pending.
    'available',         round(v_balance - v_pending, 4),
    -- A1/A2: the quantity the caption "What you can book right now" actually names. A bookable
    -- quantity is never negative; the overhang is reported beside it rather than hidden in a sign.
    'bookable_now',           round(greatest(0, v_balance - v_pending), 4),
    'pending_beyond_balance', round(greatest(0, v_pending - v_balance), 4),
    'pending_latest_start',   v_pend_last,
    'identity_holds',    v_identity);
end
$function$;

-- =====================================================================================
-- A2 — the overhang sentence. §5 owns every wording; this is where the new one lives.
-- =====================================================================================

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
  v_over   numeric := coalesce((p_fig ->> 'pending_beyond_balance')::numeric, 0);
  v_pend   numeric := coalesce((p_fig ->> 'pending_approval')::numeric, 0);
  v_projav numeric := nullif(p_fig ->> 'projected_available','')::numeric;
  v_projon date    := nullif(p_fig ->> 'projected_as_of','')::date;
begin
  if coalesce((p_fig ->> 'unlimited')::boolean, false) then
    return 'Unlimited — requests still need approval.';
  end if;
  if v_usable is not null and v_usable > current_date then
    return format('You''ve earned %s hours. You can start using this time on %s.',
                  hr._leave_hours_text(coalesce((p_fig ->> 'accrued_to_date')::numeric, 0)),
                  to_char(v_usable, 'FMMon FMDD'));
  end if;
  if v_bal < 0 then
    return case when v_floor is not null
      then format('Your balance is %s hours. Your organization allows down to %s.',
                  hr._leave_hours_text(v_bal), hr._leave_hours_text(v_floor))
      else format('Your balance is %s hours.', hr._leave_hours_text(v_bal)) end;
  end if;

  -- 🚨 THE OVERHANG SENTENCE (A2). It fires exactly when the hours already asked for exceed the
  -- hours in the bank — the state that used to render as a negative "Available". It never appears
  -- without a number for the overhang, and where the composer supplied the ENGINE'S OWN projection
  -- (`hr.leave_project_balance`, the same call `hr.leave_wf_validate` decides on) it names the
  -- projected figure and the date it assumes, which is §5's standing rule for any projected number.
  if v_over > 0 then
    if v_projav is not null and v_projon is not null then
      return format(
        'You have %s hours banked and %s hours waiting for a decision, so %s of those hours will '
        || 'be earned before you take them. Projected to %s — the last day one of those requests '
        || 'starts — you would have %s hours.',
        hr._leave_hours_text(v_bal), hr._leave_hours_text(v_pend), hr._leave_hours_text(v_over),
        to_char(v_projon, 'FMMon FMDD, YYYY'), hr._leave_hours_text(v_projav));
    end if;
    return format(
      'You have %s hours banked and %s hours waiting for a decision, so %s of those hours will be '
      || 'earned before you take them. There is nothing left to book until one of them is decided.',
      hr._leave_hours_text(v_bal), hr._leave_hours_text(v_pend), hr._leave_hours_text(v_over));
  end if;

  if v_cap is not null and v_bal >= v_cap then
    return format('You''ve reached this policy''s %s-hour cap. You''ll start earning again as soon '
               || 'as you use some time. Nothing expires.', hr._leave_hours_text(v_cap));
  end if;
  if v_method = 'per_hours_worked' then
    return format('You earn %s hour(s) for every %s you work.',
                  hr._leave_hours_text(coalesce((p_fig ->> 'accrual_rate')::numeric, 0)),
                  hr._leave_hours_text(coalesce((p_fig ->> 'accrual_per_units')::numeric, 0)));
  end if;
  if v_up > 0 then
    return format('Available already excludes the %s hours you have approved and not yet taken.',
                  hr._leave_hours_text(v_up));
  end if;
  return case v_method
    when 'per_pay_period'    then format('You earn %s hours each pay period.',
                                    hr._leave_hours_text(coalesce((p_fig ->> 'accrual_rate')::numeric, 0)))
    when 'per_month'         then format('You earn %s hours each month.',
                                    hr._leave_hours_text(coalesce((p_fig ->> 'accrual_rate')::numeric, 0)))
    when 'annual_lump'       then 'Your whole allowance is granted at the start of each policy year.'
    when 'anniversary_lump'  then 'Your whole allowance is granted on your work anniversary.'
    when 'none'              then 'This balance changes only when your organization grants time.'
    else 'Available is what you can book right now.' end;
end
$function$;

-- =====================================================================================
-- A3 — the composer makes the ONE projection call, at the date the overhang rides on.
-- =====================================================================================

create or replace function hr.my_time_off(p_employment_id uuid default null)
returns jsonb
language plpgsql
stable security definer
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
  v_proj jsonb;
  v_on   date;
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

    /*
      🚨 ONE DEFINITION, ASKED — NOT RE-DERIVED (A3).

      When the hours already asked for exceed the hours in the bank, the surface owes the person
      the number the ENGINE will decide on, not a second arithmetic of its own. That number comes
      from `hr.leave_project_balance` — the exact function `hr.leave_wf_validate` calls for
      `projected_balance_at_start`, and the function §5 names when it says two implementations of
      this arithmetic is a defect.

      The as-of is `pending_latest_start`: by that date every submitted request has been spent, so
      `projected_available` there is what is genuinely left after all of them.

      Only the projection's OWN keys are merged. `leave_project_balance` returns a whole figures
      block whose `as_of` is the projection date; merging it wholesale would relabel today's five
      figures with a future date, which is the exact class of dishonesty this migration removes.
      A projection past the horizon refuses (`ok:false`) and is simply not merged — the sentence
      then falls to its no-projection arm rather than quoting a number nobody computed.
    */
    v_on := nullif(v_fig ->> 'pending_latest_start','')::date;
    if coalesce((v_fig ->> 'pending_beyond_balance')::numeric, 0) > 0 and v_on is not null then
      v_proj := hr.leave_project_balance(v_emp, v_r.leave_policy_id, greatest(v_on, current_date));
      if coalesce((v_proj ->> 'ok')::boolean, false) then
        v_fig := v_fig || jsonb_build_object(
          'projected_available',    v_proj -> 'projected_available',
          'projected_balance',      v_proj -> 'projected_balance',
          'projected_as_of',        greatest(v_on, current_date),
          'projection_basis',       v_proj -> 'projection_basis',
          'projects_future_accrual', v_proj -> 'projects_future_accrual');
      end if;
    end if;

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

-- =====================================================================================
-- A4 — the preview states what the request is spent against, BEFORE the button.
-- =====================================================================================

create or replace function hr.leave_request_preview(
  p_employment_id uuid,
  p_leave_policy_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_day_parts jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_view jsonb; v_span jsonb; v_fig jsonb; v_proj jsonb; v_pol hr.leave_policy%rowtype;
  v_words text; v_excl text;
  v_cost numeric; v_book numeric; v_projav numeric; v_on date; v_proj_sentence text;
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
  v_on   := greatest(p_starts_on, current_date);
  -- 🚨 THE ENGINE'S OWN CALL, VERBATIM. `hr.leave_wf_validate` runs exactly this line to obtain
  -- `projected_balance_at_start`. The preview and the decision therefore cannot disagree.
  v_proj := hr.leave_project_balance(p_employment_id, p_leave_policy_id, v_on);

  select string_agg(distinct coalesce(d ->> 'label', 'Non-working day'), ', ')
    into v_excl
    from jsonb_array_elements(v_span -> 'days') d
   where coalesce((d ->> 'excluded')::boolean, false);

  -- §4.1: "a request whose cost the employee cannot see is a request they will dispute" — and a
  -- cost that reads "16. hours" is a cost they will not trust.
  v_words := format('%s day%s selected · %s working day%s · %s hours',
                    (v_span ->> 'calendar_days'),
                    case when (v_span ->> 'calendar_days')::int = 1 then '' else 's' end,
                    (v_span ->> 'working_days'),
                    case when (v_span ->> 'working_days')::int = 1 then '' else 's' end,
                    hr._leave_hours_text((v_span ->> 'total_hours')::numeric));
  if v_excl is not null then
    v_words := v_words || ' · ' || v_excl || ' excluded';
  end if;

  /*
    🚨 A4 — WHAT THIS REQUEST IS BEING SPENT AGAINST, IN WORDS, BEFORE SUBMIT.

    The old preview fetched `projection` and rendered only its `projection_note`, which is non-null
    ONLY for policies that do not project at all. For every accruing policy the number the validator
    was about to decide on was fetched and discarded, and the employee pressed Send with nothing on
    screen but a current balance the decision would not use. Four exhaustive cases:

      · unlimited            → no figures exist; §5 forbids a number here.
      · does not project     → the server's own `projection_note` is the whole truth.
      · cost fits today      → say so plainly; no projection talk on a request that needs none.
      · cost exceeds today   → name the projected figure AND the date, per §5, and — where the
                               policy forbids a negative balance and even the projection is short —
                               say the request will not be accepted, in the same terms
                               `hr.leave_wf_validate` will use when it refuses.
  */
  v_cost   := coalesce((v_span ->> 'total_hours')::numeric, 0);
  v_book   := coalesce((v_fig ->> 'bookable_now')::numeric, 0);
  v_projav := nullif(v_proj ->> 'projected_available','')::numeric;

  if coalesce((v_fig ->> 'unlimited')::boolean, false) then
    v_proj_sentence := null;
  elsif v_proj ->> 'projection_note' is not null then
    v_proj_sentence := v_proj ->> 'projection_note';
  elsif v_cost <= v_book then
    v_proj_sentence := format('You can book %s hours right now, and this costs %s.',
                              hr._leave_hours_text(v_book), hr._leave_hours_text(v_cost));
  elsif v_projav is not null and v_cost <= v_projav then
    v_proj_sentence := format(
      'This books against time you have not earned yet. You can book %s hours right now, but by %s '
      || 'you are projected to have %s — and this costs %s, so it is checked against the projected '
      || 'figure rather than today''s.',
      hr._leave_hours_text(v_book), to_char(v_on, 'FMMon FMDD, YYYY'),
      hr._leave_hours_text(v_projav), hr._leave_hours_text(v_cost));
  elsif v_projav is not null and not v_pol.negative_balance_allowed then
    v_proj_sentence := format(
      'This costs %s hours and you are projected to have %s by %s, so it will not be accepted. '
      || 'Shortening the request or moving it later would fix it.',
      hr._leave_hours_text(v_cost), hr._leave_hours_text(v_projav),
      to_char(v_on, 'FMMon FMDD, YYYY'));
  elsif v_projav is not null then
    v_proj_sentence := format(
      'This costs %s hours and you are projected to have %s by %s, so approving it would leave you '
      || 'below zero. Your organization allows that, and a person decides it.',
      hr._leave_hours_text(v_cost), hr._leave_hours_text(v_projav),
      to_char(v_on, 'FMMon FMDD, YYYY'));
  else
    v_proj_sentence := null;
  end if;

  return jsonb_build_object(
    'granted', true, 'span', v_span, 'breakdown_sentence', v_words,
    'figures', v_fig, 'projection', v_proj,
    'projection_sentence', v_proj_sentence,
    'policy_name', v_pol.name, 'increment_minutes', v_pol.increment_minutes,
    'mandated_uses', v_pol.mandated_uses,
    'documentation_required_after_days', v_pol.documentation_required_after_days,
    'documentation_required',
      (v_pol.documentation_required_after_days is not null
       and (p_ends_on - p_starts_on) + 1 > v_pol.documentation_required_after_days),
    'submittable', not hr._leave_span_is_costless(v_span),
    'blocker', case when hr._leave_span_is_costless(v_span) then
      'We cannot work out how long your working day is, so this request would cost no time at '
      || 'all. There is no shift scheduled on these days and no standard weekly hours on your '
      || 'position. Ask HR to set your standard hours, or pick days you are scheduled to work.'
      end);
end
$function$;

-- =====================================================================================
-- B — the self/current resolver `/hr/me/timesheet` needed and never had.
-- =====================================================================================

create or replace function hr.my_timesheet_context(p_employment_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_mine  uuid[];
  v_emp   uuid;
  v_pg    uuid;
  v_rows  integer;
  v_basis text;
  v_note  text;
  v_reason text;
  v_pid   uuid;
  v_from  date;
  v_to    date;
  v_state text;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'Your timesheet is always read as somebody.');
  end if;

  v_mine := hr.employments_of(v_uid, current_date);
  if v_mine is null or cardinality(v_mine) = 0 then
    -- B5: the four-armed "why you hold no live employment" sentence already exists. Reuse it
    -- rather than writing a fifth wording of the same fact.
    return hr._time_not_employed_refusal(v_uid, 'There is no timesheet to show you.');
  end if;

  -- 🚨 B1 — SELF ONLY, AND AN EXPLICIT ID IS CHECKED, NEVER TRUSTED. Route 5 is self-only by
  -- construction (§2.2); a manager reviewing a report uses route 29. An `?employment=` that is not
  -- the caller's own is refused by name so the surface can say what happened instead of resolving
  -- somebody else's period and handing it to a door that would then refuse in different words.
  if p_employment_id is not null then
    if not (p_employment_id = any (v_mine)) then
      return hr._time_refusal('hr_timesheet_context_not_self',
        'This page only ever works out your own timesheet. A manager opens a report''s hours from '
        || 'their team list instead.',
        jsonb_build_object('checked', 'the employment belongs to the signed-in person',
                           'as_of', current_date));
    end if;
    v_emp := p_employment_id;
  else
    -- The active spell wins; the most recent hire date breaks a tie. This mirrors the resolution
    -- `hr.my_time_off` already uses for the sibling self-service routes.
    select em.id into v_emp
      from hr.employment em
     where em.id = any (v_mine) and em.status = 'active'
     order by em.hire_date desc, em.created_at desc
     limit 1;
    if v_emp is null then
      select em.id into v_emp
        from hr.employment em
       where em.id = any (v_mine)
       order by em.hire_date desc, em.created_at desc
       limit 1;
    end if;
  end if;

  select em.pay_group_id into v_pg from hr.employment em where em.id = v_emp;

  -- B3: the period the person is IN, proven by their OWN `pay_period_employment` row. The
  -- employment's pay group disambiguates the several overlapping calendars an org can run.
  select pp.id, pp.period_start_on, pp.period_end_on, pp.state
    into v_pid, v_from, v_to, v_state
    from hr.pay_period_employment ppe
    join hr.pay_period pp on pp.id = ppe.pay_period_id
   where ppe.employment_id = v_emp
     and (v_pg is null or pp.pay_group_id = v_pg)
     and current_date between pp.period_start_on and pp.period_end_on
   order by pp.period_start_on desc, pp.sequence_number desc
   limit 1;

  if v_pid is not null then
    v_basis := 'current';
  else
    -- B4: no period contains today. The most recent one the person is actually enrolled in is a
    -- real answer with real hours in it — and it is LABELLED, because rendering a closed period as
    -- "your timesheet" without saying so is the same class of defect as a negative bookable balance.
    select pp.id, pp.period_start_on, pp.period_end_on, pp.state
      into v_pid, v_from, v_to, v_state
      from hr.pay_period_employment ppe
      join hr.pay_period pp on pp.id = ppe.pay_period_id
     where ppe.employment_id = v_emp
       and (v_pg is null or pp.pay_group_id = v_pg)
       and pp.period_end_on < current_date
     order by pp.period_end_on desc, pp.sequence_number desc
     limit 1;

    if v_pid is not null then
      v_basis := 'most_recent';
      v_note  := format('No pay period is open for today. These are your hours for %s to %s, the '
                     || 'most recent period you were in.',
                        to_char(v_from, 'FMMon FMDD'), to_char(v_to, 'FMMon FMDD, YYYY'));
    else
      v_basis := 'none';
      -- B5: the reason, in the three shapes it comes in. Never "not wired up yet".
      select count(*)::integer into v_rows
        from hr.pay_period_employment ppe where ppe.employment_id = v_emp;
      if v_pg is null then
        v_reason := 'You are not in a pay group yet, so no pay periods have been created for you '
                 || 'and there is no timesheet to total. HR sets this up on your position.';
      elsif coalesce(v_rows, 0) = 0 then
        v_reason := 'Your pay group has not opened a pay period that includes you yet. Your hours '
                 || 'are being recorded; they appear here as soon as a period covers them.';
      else
        v_reason := 'You are in a pay group, but no pay period covering today has been opened yet. '
                 || 'Your hours appear here as soon as one is.';
      end if;
    end if;
  end if;

  return hr._time_ok(jsonb_build_object(
    'employment_id',   v_emp,
    'pay_group_id',    v_pg,
    'pay_period_id',   v_pid,
    'period_start_on', v_from,
    'period_end_on',   v_to,
    'period_state',    v_state,
    'basis',           v_basis,
    'period_note',     v_note,
    'no_period_reason', v_reason));
end
$function$;

-- The client-reachable wrapper. `hr` is not exposed to PostgREST; `public.hr_<name>` is the one
-- sanctioned spelling (R-L3 U-03).
create or replace function public.hr_my_timesheet_context(p_employment_id uuid default null)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select hr.my_timesheet_context($1);
$function$;

/*
  🚨 THE DOOR IS DECLARED BEFORE IT IS GRANTED, AND THE ORDER IS LOAD-BEARING.

  `enforce_definer_client_grants` is a live `ddl_command_end` event trigger on CREATE FUNCTION and
  GRANT: any SECURITY DEFINER function outside the exempt schemas that is not registered in
  `platform.client_callable_door` (or grandfathered) has its `public`/`anon`/`authenticated` EXECUTE
  silently revoked, INSIDE the same statement. The first cut of this migration granted without
  declaring, and the guard took the grant straight back off — the door existed, the client got a
  403, and nothing said why. The existing `hr_*` wrappers are in the grandfather snapshot rather
  than this register, which is why the pattern is not visible from any of them.
*/
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason)
values
  ('public', 'hr_my_timesheet_context', 'p_employment_id uuid',
   'hr_c4_55',
   'Route 5 (/hr/me/timesheet) resolves the caller''s own employment and current pay period through '
   || 'this wrapper. It is deliberately client-callable by `authenticated` and NEVER by `anon`: it '
   || 'answers only about employments returned by hr.employments_of(auth.uid()), refuses an explicit '
   || 'employment the caller does not hold (hr_timesheet_context_not_self), and returns two ids plus '
   || 'a sentence — no hours, no money, no other person''s row. It exists because the previous '
   || 'resolution ran through hr_pay_period_list, a payroll-authority door, which returns nothing '
   || 'for the ordinary employees this route serves.')
on conflict (schema_name, function_name, identity_args) do update
  set declared_by = excluded.declared_by,
      reason      = excluded.reason,
      declared_at = now();

revoke all on function public.hr_my_timesheet_context(uuid) from public;
revoke all on function public.hr_my_timesheet_context(uuid) from anon;
grant execute on function public.hr_my_timesheet_context(uuid) to authenticated, service_role;

-- =====================================================================================
-- CONTRACTS — what a later edit may not quietly remove.
-- =====================================================================================

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer)
values
  ('hr', 'leave_figures', 'hr_c4_55',
   array['bookable_now', 'pending_beyond_balance', 'greatest(0, v_balance - v_pending)'],
   array[]::text[],
   'D3: "Available" was rendered under the caption "What you can book right now" and went negative '
   || 'once pending exceeded the bank — an impossible statement that contradicted the engine''s own '
   || 'decision that the request was affordable. `available` remains §5''s identity; `bookable_now` '
   || 'is the clamped quantity the caption names, and `pending_beyond_balance` is the overhang that '
   || 'must be reported beside it rather than hidden in a sign.',
   true, true),
  ('hr', '_leave_sentence', 'hr_c4_55',
   array['pending_beyond_balance', 'projected_available'],
   array[]::text[],
   'D3: clamping a negative bookable figure to zero without saying why would be a second lie. The '
   || 'overhang branch is what makes the clamp honest, and it quotes the ENGINE''s projected figure '
   || '(hr.leave_project_balance) with the date it assumes, per §5.',
   true, false),
  ('hr', 'my_time_off', 'hr_c4_55',
   array['leave_project_balance'],
   array[]::text[],
   'D3 / SPEC-LEAVE §5: "two implementations of this arithmetic is a defect". The panel''s projected '
   || 'figure must be ASKED of the same function hr.leave_wf_validate decides on, never re-derived '
   || 'here or on a client.',
   true, true),
  ('hr', 'leave_request_preview', 'hr_c4_55',
   array['projection_sentence', 'leave_project_balance'],
   array[]::text[],
   'D3: the preview must state what the request is spent against BEFORE submit. It already made the '
   || 'engine''s projection call and discarded the number; the sentence is what stops a silent '
   || 'acceptance followed by an impossible balance.',
   true, true),
  ('hr', 'my_timesheet_context', 'hr_c4_55',
   array['employments_of', 'pay_period_employment'],
   array['capability('],
   'D6: /hr/me/timesheet resolved its period through hr.pay_period_list, a payroll/timecard-approve '
   || 'door, so every ordinary employee got zero rows and the page said "that link is not wired up '
   || 'yet". This resolver is SELF-scoped through hr.employments_of and proves period membership '
   || 'through the person''s own hr.pay_period_employment row. It must never acquire a capability '
   || 'gate — that would re-break it for exactly the people it exists for.',
   true, true)
on conflict (schema_name, function_name, home_migration) do update
  set home_migration    = excluded.home_migration,
      must_contain      = excluded.must_contain,
      must_not_contain  = excluded.must_not_contain,
      reason            = excluded.reason,
      is_active         = excluded.is_active,
      must_be_definer   = excluded.must_be_definer,
      declared_at       = now();

-- =====================================================================================
-- SELF-PROOF. Everything below EXECUTES against live rows and raises if the claim is false.
-- =====================================================================================

do $$
declare
  v_emp   uuid;
  v_pol   uuid;
  v_fig   jsonb;
  v_mto   jsonb;
  v_prev  jsonb;
  v_ctx   jsonb;
  v_bad   integer;
  v_n     integer;
begin
  -- ---- A1: bookable_now is never negative, and available keeps §5's identity ----------------
  select le.employment_id, le.leave_policy_id into v_emp, v_pol
    from hr.leave_enrollment le
    join hr.leave_policy p on p.id = le.leave_policy_id
   where le.deleted_at is null and p.accrual_method <> 'unlimited'
   limit 1;

  if v_emp is not null then
    v_fig := hr.leave_figures(v_emp, v_pol, current_date);
    if v_fig -> 'bookable_now' is null or v_fig -> 'pending_beyond_balance' is null then
      raise exception 'hr_c4_55: leave_figures did not return the caption''s own quantity';
    end if;
    if (v_fig ->> 'bookable_now')::numeric < 0 then
      raise exception 'hr_c4_55: bookable_now came back negative (%)', v_fig ->> 'bookable_now';
    end if;
    if round((v_fig ->> 'available')::numeric, 4)
       <> round((v_fig ->> 'ledger_balance')::numeric - (v_fig ->> 'pending_approval')::numeric, 4)
    then
      raise exception 'hr_c4_55: §5''s identity Available = balance − pending no longer holds';
    end if;
  end if;

  -- ---- A1/A2: EVERY non-unlimited enrollment in the database, both worlds -------------------
  -- The clamp must hold for every real row, and wherever the raw identity is negative the
  -- sentence must NAME the overhang rather than leave the clamp unexplained.
  select count(*)::integer into v_n
    from hr.leave_enrollment le
    join hr.leave_policy p on p.id = le.leave_policy_id and p.accrual_method <> 'unlimited'
   cross join lateral (
      select hr.leave_figures(le.employment_id, le.leave_policy_id, current_date) as fig) x
   where le.deleted_at is null
     and ((x.fig ->> 'bookable_now')::numeric < 0
          or ((x.fig ->> 'pending_beyond_balance')::numeric > 0
              and hr._leave_sentence(x.fig) not like '%waiting for a decision%'));
  if v_n > 0 then
    raise exception 'hr_c4_55: % enrollment(s) render a negative bookable figure or an unexplained clamp', v_n;
  end if;

  -- ---- A2: the sentence is the SERVER's and it fires on a constructed overhang ---------------
  if hr._leave_sentence(jsonb_build_object(
       'accrual_method','per_pay_period','ledger_balance', 24, 'pending_approval', 48,
       'pending_beyond_balance', 24, 'projected_available', 54.8,
       'projected_as_of', '2026-09-21')) not like '%Projected to Sep 21, 2026 %54.8 hours%'
  then
    raise exception 'hr_c4_55: the overhang sentence dropped the projected figure';
  end if;
  if hr._leave_sentence(jsonb_build_object(
       'accrual_method','per_pay_period','ledger_balance', 24, 'pending_approval', 48,
       'pending_beyond_balance', 24)) not like '%nothing left to book%'
  then
    raise exception 'hr_c4_55: the no-projection arm of the overhang sentence is missing';
  end if;
  -- and it must NOT fire when there is no overhang — the ordinary world stays ordinary
  if hr._leave_sentence(jsonb_build_object(
       'accrual_method','per_pay_period','accrual_rate', 3.08,
       'ledger_balance', 24, 'pending_approval', 0, 'pending_beyond_balance', 0))
     <> 'You earn 3.08 hours each pay period.'
  then
    raise exception 'hr_c4_55: the ordinary accrual sentence was displaced';
  end if;

  -- ---- A3/A4: the composer and the preview both still answer -------------------------------
  if v_emp is not null then
    -- Run as the subject so `hr._leave_viewer` resolves `self`; these are STABLE reads.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select e.login_user_id from hr.employee e
                                 join hr.employment em on em.employee_id = e.id
                                where em.id = v_emp and e.login_user_id is not null))::text, true);
    if (select e.login_user_id from hr.employee e join hr.employment em on em.employee_id = e.id
         where em.id = v_emp) is not null then
      v_mto := hr.my_time_off(v_emp);
      if coalesce((v_mto ->> 'granted')::boolean, false) then
        if not (v_mto -> 'policies' -> 0 ? 'bookable_now') then
          raise exception 'hr_c4_55: my_time_off no longer carries the caption''s quantity';
        end if;
      end if;
      v_prev := hr.leave_request_preview(v_emp, v_pol, current_date + 30, current_date + 30);
      if coalesce((v_prev ->> 'granted')::boolean, false)
         and not (v_prev ? 'projection_sentence') then
        raise exception 'hr_c4_55: the preview lost its projection sentence';
      end if;
    end if;
    perform set_config('request.jwt.claims', null, true);
  end if;

  -- ---- B: the resolver answers for a REAL employee, self-scoped ------------------------------
  -- Every employment that holds a pay_period_employment row must resolve to a period, and no
  -- employment may resolve to somebody else's.
  for v_emp in
    select distinct ppe.employment_id
      from hr.pay_period_employment ppe
      join hr.employment em on em.id = ppe.employment_id
      join hr.employee e on e.id = em.employee_id and e.login_user_id is not null
     where em.status = 'active' and em.deleted_at is null
     limit 5
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select e.login_user_id from hr.employee e
                                 join hr.employment em on em.employee_id = e.id
                                where em.id = v_emp))::text, true);
    v_ctx := hr.my_timesheet_context(v_emp);
    if not coalesce((v_ctx ->> 'ok')::boolean, false) then
      raise exception 'hr_c4_55: the resolver refused an employment its own holder asked about: %',
        v_ctx ->> 'message';
    end if;
    if (v_ctx -> 'data' ->> 'employment_id')::uuid <> v_emp then
      raise exception 'hr_c4_55: the resolver answered about a different employment';
    end if;
    if (v_ctx -> 'data' ->> 'pay_period_id') is null then
      raise exception 'hr_c4_55: an employment WITH a pay_period_employment row resolved no period';
    end if;
    if (v_ctx -> 'data' ->> 'basis') not in ('current','most_recent') then
      raise exception 'hr_c4_55: a resolved period came back with basis %',
        v_ctx -> 'data' ->> 'basis';
    end if;
    perform set_config('request.jwt.claims', null, true);
  end loop;

  -- B: somebody else's employment is refused BY NAME, not silently resolved
  select em.id into v_emp
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id is not null and em.deleted_at is null limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-8000-000000000000')::text, true);
  v_ctx := hr.my_timesheet_context(v_emp);
  if coalesce((v_ctx ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_55: the resolver answered about an employment the caller does not hold';
  end if;
  perform set_config('request.jwt.claims', null, true);

  -- B: no session at all is a refusal, never a resolution
  v_ctx := hr.my_timesheet_context(null);
  if coalesce((v_ctx ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_55: the resolver answered with no authenticated caller';
  end if;

  -- B: THE GRANT SURVIVED THE GUARD, AND anon STILL CANNOT REACH IT.
  -- Asserted rather than assumed: `enforce_definer_client_grants` revokes inside the GRANT
  -- statement itself, so a door can be created, granted, and unreachable with no error anywhere.
  if not has_function_privilege('authenticated',
        'public.hr_my_timesheet_context(uuid)', 'EXECUTE') then
    raise exception 'hr_c4_55: authenticated cannot execute the door the route calls — the definer grant guard took the grant back (declare it in platform.client_callable_door BEFORE granting)';
  end if;
  if has_function_privilege('anon', 'public.hr_my_timesheet_context(uuid)', 'EXECUTE') then
    raise exception 'hr_c4_55: anon can execute a self-scoped employee door';
  end if;

  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_55: % function contract(s) broken', v_bad;
  end if;

  raise notice 'hr_c4_55: bookable is one definition, and the timesheet resolves itself';
end $$;
