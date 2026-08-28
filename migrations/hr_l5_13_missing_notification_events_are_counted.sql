-- HR domain L5 — migration 13 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 THE LOUD PATCH FOR THE THIRTEEN NOTIFICATIONS THAT DO NOT EXIST.
--
-- SPEC-LEAVE §13 declares nineteen `hr.leave.*` events. SPEC-NOTIFICATIONS §2.4 **owns** that
-- vocabulary (D12: *one event, one name, one owner*) and declares **six**, which are the six that
-- are seeded and live. This lane did not seed the difference and did not rename anything — the
-- conflict is on the amendment queue as **L5-A2** and needs a ruling, not a build, because the two
-- specs also disagree about a privacy law: SPEC-NOTIFICATIONS routes `hr.leave.case_return_due` to
-- *"HR admin + manager"*, and SPEC-LEAVE §13 rule 1 says **no case notification ever reaches a
-- manager**.
--
-- The consequence is real and it is currently silent: a balance adjusted by hand does not tell the
-- employee, an unlawful policy configuration does not tell HR, a carryover boundary tells nobody.
-- **Per the loud-patches law, a stand-in ships with a constant, counted, visible scream**, so the
-- doors return the `event_key` they WOULD raise, and this function counts how many of them cannot
-- fire. A gap nobody can count is a gap that becomes permanent.
--
-- Authority: SPEC-LEAVE §13; SPEC-NOTIFICATIONS §2.4; /policies (loud patches).
-- Applied live as `hr_l5_13_missing_notification_events_are_counted`. Idempotent.

create or replace function hr.leave_notification_gap()
returns table(event_key text, declared_in text, exists_live boolean, consequence text)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  with declared(event_key, consequence) as (
    values
      ('hr.leave.accrual_posted',          'An accrual is written and nobody is told (default-off anyway, so harmless).'),
      ('hr.leave.balance_adjusted',        'HR moves a balance BY HAND and the employee is never told — §6 says they always are.'),
      ('hr.leave.carryover_applied',       'The policy year turns over and nobody hears what happened to their balance.'),
      ('hr.leave.carryover_expiring',      'Time is about to expire and nobody is warned. The lead-time knob is seeded and unread.'),
      ('hr.leave.forfeiture_upcoming',     'A balance is about to be forfeited where lawful, silently.'),
      ('hr.leave.negative_balance_reached','A balance crosses below zero and neither the employee nor HR hears.'),
      ('hr.leave.balance_cap_reached',     'Accrual stops at the cap and the employee is not told why they stopped earning.'),
      ('hr.leave.policy_config_rejected',  'A policy becomes unlawful on a hire or transfer and no HR admin is paged.'),
      ('hr.leave.blackout_published',      'A blackout window appears on an active policy and nobody enrolled hears.'),
      ('hr.leave.payout_computed',         'A termination payout is computed or flagged unverified and payroll is not told.'),
      ('hr.leave.reinstatement_applied',   'A rehire reinstates a balance and the employee is not told it came back.'),
      ('hr.leave.case_opened',             'A protected leave case opens and the employee is not told.'),
      ('hr.leave.certification_due',       'A certification comes due and nobody is reminded.'),
      ('hr.leave.certification_overdue',   'A certification passes unreceived and the leave administrator is not told.'),
      ('hr.leave.entitlement_low',         'Protected entitlement drops below 20% and nobody notices.'),
      ('hr.leave.entitlement_exhausted',   'Protected entitlement hits zero and nobody notices.'),
      ('hr.leave.case_return_upcoming',    'An expected return approaches and nobody is reminded.'),
      ('hr.leave.case_return_overdue',     'An expected return passes and the leave administrator is not told.'),
      ('hr.leave.case_pto_exhausted',      'A concurrent case exhausts the paid policy and the employee is not warned BEFORE it happens.')
  )
  select d.event_key, 'SPEC-LEAVE §13',
         exists (select 1 from communication.notification_event_type t
                  where t.event_key = d.event_key and t.deleted_at is null),
         d.consequence
    from declared d
   order by 3, 1;
$function$;

comment on function hr.leave_notification_gap() is
  'THE LOUD PATCH for amendment-queue item L5-A2. SPEC-LEAVE §13 declares nineteen leave events; '
  'SPEC-NOTIFICATIONS §2.4 owns the vocabulary and declares six. This lane seeded nothing and '
  'renamed nothing — the conflict includes a privacy law (whether a manager may be told a '
  'protected absence exists) and needs a ruling. Meanwhile the doors return the event_key they '
  'WOULD raise, and this counts the ones that cannot. A gap nobody can count becomes permanent.';

do $$
declare v_missing integer; v_present integer; v_names text;
begin
  select count(*) filter (where not exists_live), count(*) filter (where exists_live)
    into v_missing, v_present from hr.leave_notification_gap();
  select string_agg(event_key, ', ' order by event_key) into v_names
    from hr.leave_notification_gap() where not exists_live;

  -- The scream. Not an exception — the gap is a ruling somebody else owes, not a build failure,
  -- and refusing to apply would only hide it. But it is COUNTED and it is LOUD.
  raise notice E'\n🚨 hr_l5_13 — LEAVE NOTIFICATION GAP: % of 19 SPEC-LEAVE §13 events do not exist and CANNOT FIRE.\n   Live: %. Missing: %\n   This is amendment-queue item L5-A2 and it needs a RULING (the two specs also disagree about\n   whether a manager may be told a protected absence exists). Count it with hr.leave_notification_gap().',
    v_missing, v_present, v_names;

  -- the control: this must be able to report a DIFFERENT number tomorrow, so assert it measured
  if v_missing + v_present <> 19 then
    raise exception 'hr_l5_13: the gap function does not cover SPEC-LEAVE §13''s nineteen events';
  end if;
end $$;
