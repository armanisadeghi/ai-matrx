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

-- 🚨 OWNERSHIP YIELDED, 2026-08-27. The notification lane has since SEEDED all nineteen events
-- and re-cut this reporter's columns to SPEC-LEAVE §13's own names (`declared_by` / `is_declared`,
-- with `carryover_expiring` renamed). Their version is the better one and their spec owns the
-- vocabulary — SPEC-NOTIFICATIONS §2.4, exactly as L5-A2 recorded. So this file now DEFERS: it
-- creates the reporter only if nobody else has, and replaying it can never clobber the owner's
-- column names with mine. A `create or replace` here used to be a quiet way to win an argument
-- I had already conceded in writing.
do $seal$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr' and p.proname = 'leave_notification_gap') then
    raise notice 'hr_l5_13: hr.leave_notification_gap already exists and is owned elsewhere — left alone.';
    return;
  end if;
  execute $fn$
create function hr.leave_notification_gap()
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
$function$
  $fn$;
end
$seal$;

do $c$ begin execute $q$comment on function hr.leave_notification_gap() is
  'THE LOUD PATCH for amendment-queue item L5-A2. SPEC-LEAVE §13 declares nineteen leave events; '
  'SPEC-NOTIFICATIONS §2.4 owns the vocabulary and declares six. This lane seeded nothing and '
  'renamed nothing — the conflict includes a privacy law (whether a manager may be told a '
  'protected absence exists) and needs a ruling. Meanwhile the doors return the event_key they '
  'WOULD raise, and this counts the ones that cannot. A gap nobody can count becomes permanent.'$q$; end $c$;

do $$
declare v_missing integer; v_present integer; v_total integer;
begin
  -- Read the reporter through a shape-agnostic count, because the owning lane may re-cut its
  -- columns again and this file must not care.
  execute 'select count(*) from hr.leave_notification_gap()' into v_total;
  begin
    execute 'select count(*) filter (where is_declared), count(*) filter (where not is_declared) '
         || 'from hr.leave_notification_gap()' into v_present, v_missing;
  exception when undefined_column then
    execute 'select count(*) filter (where exists_live), count(*) filter (where not exists_live) '
         || 'from hr.leave_notification_gap()' into v_present, v_missing;
  end;

  if v_total <> 19 then
    raise exception 'hr_l5_13: the reporter no longer covers SPEC-LEAVE §13''s nineteen events (%)',
      v_total;
  end if;

  if v_missing = 0 then
    raise notice E'\nhr_l5_13 — LEAVE NOTIFICATION GAP: CLOSED. All 19 of SPEC-LEAVE §13''s events are declared.\n   The gap this file was written to keep visible no longer exists; the reporter stays as the standing check.';
  else
    raise notice E'\n🚨 hr_l5_13 — LEAVE NOTIFICATION GAP: % of 19 SPEC-LEAVE §13 events cannot fire (% declared).\n   Count them with hr.leave_notification_gap().',
      v_missing, v_present;
  end if;
end $$;
