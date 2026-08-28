-- HR domain L5 — migration 12 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 A GAP BETWEEN TWO OF THE FIVE FIGURES, FOUND BY THE SCREEN THAT RENDERS THEM.
--
-- SPEC-LEAVE §5 defines the two figures that split `usage` entries:
--   • **Used (taken)**      — requests in `taken` / `partially_taken`
--   • **Approved upcoming** — requests in `approved` **and** `ends_on >= today`
--
-- And §1.2 explains why those are not exhaustive: a request moves `approved → taken` by the
-- **pay-period close job**, not on its end date. So between the day an absence ends and the day
-- its period closes, a request is `approved` with `ends_on` in the past — and under §5 read
-- literally its hours are counted in **neither** figure.
--
-- That is not a rounding nicety. The `usage` entry was written at approval (§1.2's encumbrance
-- ruling), so **the balance has already moved**, and §5's own identity —
--
--     Accrued − Used(taken) − Approved upcoming − forfeited/expired/paid = latest balance_after
--
-- — which §17 test 3 asserts on every rendered block, **does not hold** while a request sits in
-- that window. `hr.leave_figures` returns `identity_holds`, so the product would have detected its
-- own gap and rendered the divergence banner at an employee, correctly and unhelpfully.
--
-- THE RULING: the identity wins, and the hours land in **Used (taken)**.
-- §5's two clauses are inconsistent for that window, and only one of them is load-bearing. An
-- absence whose last day is behind us is time the employee has taken, whatever the pay-period job
-- has got round to; calling it "upcoming" would be worse, and calling it nothing breaks the one
-- arithmetic the whole section exists to make defensible.
--
-- HOW IT WAS FOUND, because the method is the point: the surface builder consuming
-- `hr_leave_ledger_view` compared its per-entry `counts_toward` mark against `hr.leave_figures`'s
-- two predicates and reported that they disagree on exactly this branch — *"the Used (taken) door
-- shows a row the Used (taken) number does not contain, on the screen whose whole job is
-- answering where did my four hours go."* They refused to hide the row or to re-derive the
-- predicate client-side, and reported it instead. Both refusals were right, and the disagreement
-- was mine.
--
-- Authority: SPEC-LEAVE §1.2, §5, §12, §17 test 3. **Amendment owed to SPEC-LEAVE §5**: the
-- "Used (taken)" definition should read *"requests in `taken` / `partially_taken`, and approved
-- requests whose last day has passed"*.
-- Applied live as `hr_l5_12_figures_close_the_gap_between_ends_on_and_taken`. Idempotent.

create or replace function hr.leave_figures(
  p_employment_id   uuid,
  p_leave_policy_id uuid,
  p_as_of           date default current_date
) returns jsonb
language plpgsql
stable
security definer
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
  -- this migration exists for. A request is flipped to `taken` by the pay-period close job, not
  -- by its own end date, so `approved` with `ends_on` in the past is an absence that HAS been
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

  select coalesce(sum(r.requested_hours), 0) into v_pending
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
    'available',         round(v_balance - v_pending, 4),
    'identity_holds',    v_identity);
end
$function$;

-- -----------------------------------------------------------------------------------
-- Self-proof — the two sides must now agree, and the check must be able to catch them not agreeing
-- -----------------------------------------------------------------------------------

do $$
declare v_fig text; v_view text;
begin
  select pg_get_functiondef(p.oid) into v_fig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_figures';
  select pg_get_functiondef(p.oid) into v_view
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_ledger_view';

  -- the figure must now carry the past-dated approved branch…
  if v_fig !~ 'approved.*ends_on < current_date' then
    raise exception 'hr_l5_12: leave_figures still leaves a past-dated approved request in neither figure';
  end if;
  -- …and the ledger view's mark must still carry its matching one, so the door and the number
  -- describe the same set. If either side is edited alone in future, this fails.
  if v_view !~ 'request_state = ''approved'' then ''used_taken''' then
    raise exception 'hr_l5_12: the ledger view no longer marks a past-dated approved request as used';
  end if;
end $$;
