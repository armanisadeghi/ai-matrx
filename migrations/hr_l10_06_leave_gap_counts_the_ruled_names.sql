-- HR domain L10 — the leave notification gap counts the RULED names (register item HRB-022).
--
-- `hr.leave_notification_gap()` (hr_l5_13) lists nineteen keys and reports, on every apply,
-- whether each has a live declaration. It has been screaming 19-of-19 because SPEC-LEAVE §13 and
-- SPEC-NOTIFICATIONS §2.4 shared **zero** event names — every notice the leave build depends on
-- could not fire, and the six declarations that existed were raised by nothing.
--
-- SPEC-LEAVE §13's reconciliation then ruled that **four of the nineteen were the same fact under
-- another name** and folded them onto the live rows. The catalog has now taken the remaining
-- **fifteen** as declarations (SPEC-NOTIFICATIONS §2.4, 6 -> 21 events). That leaves this
-- function's list holding four keys that were deliberately retired, so it would keep reporting a
-- gap that no longer exists:
--
--     hr.leave.carryover_expiring    -> hr.leave.balance_expiring        (live)
--     hr.leave.certification_due     -> hr.leave.case_certification_due  (live)
--     hr.leave.case_return_upcoming  -> hr.leave.case_return_due         (live)
--     hr.leave.case_opened           -> hr.leave.case_status_changed     (live, "including reaching `open`")
--
-- 🚨 WHY THIS IS WORTH A MIGRATION RATHER THAN A SHRUG. A counter that screams about four keys
-- somebody deliberately renamed is the same defect as `hr.notice.undeliverable` firing for
-- readable in-app notices: **a false alarm is the alarm people learn to ignore**, and this one
-- prints on every apply, in front of every lane. Left alone it would have trained the whole
-- program to skip the line that is supposed to tell them when leave goes silent again.
--
-- The list keeps all nineteen BEHAVIORS. Four of them now check the key the ruling gave them, and
-- the retired name is carried beside it so the mapping is legible at the point of use rather than
-- only in a spec somebody has to remember to open.
--
-- Authority: SPEC-LEAVE §13 (the reconciliation table); SPEC-NOTIFICATIONS §2.4 (roster of
-- record) and §8 D12 (registration happens exactly once, in L10).
-- Applied live as `hr_l10_06_leave_gap_counts_the_ruled_names`. Idempotent.

create or replace function hr.leave_notification_gap()
returns table (event_key text, declared_by text, is_declared boolean, consequence text)
language sql stable as $fn$
  with declared(event_key, consequence) as (
    values
      ('hr.leave.accrual_posted',          'An accrual is written and nobody is told (default-off anyway, so harmless).'),
      ('hr.leave.balance_adjusted',        'HR moves a balance BY HAND and the employee is never told — §6 says they always are.'),
      ('hr.leave.carryover_applied',       'The policy year turns over and nobody hears what happened to their balance.'),
      -- renamed by SPEC-LEAVE §13: was hr.leave.carryover_expiring
      ('hr.leave.balance_expiring',        'Time is about to expire and nobody is warned. The lead-time knob is seeded and unread.'),
      ('hr.leave.forfeiture_upcoming',     'A balance is about to be forfeited where lawful, silently.'),
      ('hr.leave.negative_balance_reached','A balance crosses below zero and neither the employee nor HR hears.'),
      ('hr.leave.balance_cap_reached',     'Accrual stops at the cap and the employee is not told why they stopped earning.'),
      ('hr.leave.policy_config_rejected',  'A policy becomes unlawful on a hire or transfer and no HR admin is paged.'),
      ('hr.leave.blackout_published',      'A blackout window appears on an active policy and nobody enrolled hears.'),
      ('hr.leave.payout_computed',         'A termination payout is computed or flagged unverified and payroll is not told.'),
      ('hr.leave.reinstatement_applied',   'A rehire reinstates a balance and the employee is not told it came back.'),
      -- renamed by SPEC-LEAVE §13: was hr.leave.case_opened
      ('hr.leave.case_status_changed',     'A protected leave case opens or changes and the employee is not told.'),
      -- renamed by SPEC-LEAVE §13: was hr.leave.certification_due
      ('hr.leave.case_certification_due',  'A certification comes due and nobody is reminded.'),
      ('hr.leave.certification_overdue',   'A certification passes unreceived and the leave administrator is not told.'),
      ('hr.leave.entitlement_low',         'Protected entitlement drops below 20% and nobody notices.'),
      ('hr.leave.entitlement_exhausted',   'Protected entitlement hits zero and nobody notices.'),
      -- renamed by SPEC-LEAVE §13: was hr.leave.case_return_upcoming
      ('hr.leave.case_return_due',         'An expected return approaches and nobody is reminded.'),
      ('hr.leave.case_return_overdue',     'An expected return passes and the leave administrator is not told.'),
      ('hr.leave.case_pto_exhausted',      'A concurrent case exhausts the paid policy and the employee is not warned BEFORE it happens.')
  )
  select d.event_key, 'SPEC-LEAVE §13',
         exists (select 1 from communication.notification_event_type t
                  where t.event_key = d.event_key and t.deleted_at is null),
         d.consequence
    from declared d
   order by 3, 1;
$fn$;

comment on function hr.leave_notification_gap() is
  'SPEC-LEAVE §13 — the nineteen leave behaviors that need a declaration, checked against the live catalog. Four keys carry the names SPEC-LEAVE''s reconciliation ruled (the retired name is in a comment beside each). A row reporting is_declared=false means that behavior CANNOT fire.';

-- ── assertions — the counter must be honest in both directions ──────────────────────────────
do $$
declare v_total integer; v_missing integer; v_names text;
begin
  select count(*), count(*) filter (where not is_declared),
         string_agg(event_key, ', ') filter (where not is_declared)
    into v_total, v_missing, v_names
    from hr.leave_notification_gap();

  if v_total <> 19 then
    raise exception 'hr_l10_06: the gap list should still hold 19 behaviors, found %', v_total;
  end if;
  if v_missing > 0 then
    raise exception 'hr_l10_06: % leave behavior(s) still have no declaration: %', v_missing, v_names;
  end if;

  -- and it must still be ABLE to report a gap — a counter that can only say zero says nothing
  if exists (select 1 from hr.leave_notification_gap()
              where event_key = 'hr.leave.__not_a_real_event__') then
    raise exception 'hr_l10_06: the gap list contains a key that cannot exist';
  end if;
  if not exists (
    select 1 from (
      select exists (select 1 from communication.notification_event_type t
                      where t.event_key = 'hr.leave.__probe__' and t.deleted_at is null) as d) x
     where not x.d) then
    raise exception 'hr_l10_06: the declaration predicate cannot answer false — it proves nothing';
  end if;

  raise notice 'hr_l10_06: leave notification gap is ZERO — all 19 behaviors have a live declaration';
end $$;
