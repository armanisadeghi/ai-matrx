-- HR domain L3 — migration 3 of 7 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE `hr.time.*` NOTIFICATION EVENT DECLARATIONS. Twenty-six `communication.notification_event_type`
-- rows in the Matrx System org, under SPEC-NOTIFICATIONS' names — because SPEC-NOTIFICATIONS owns the
-- vocabulary (SPEC-TIME §14 D12: one event, one name, one owner) and SPEC-TIME §12 is the behavioural
-- requirement, not the naming authority.
--
-- 🚨 L3 BUILDS NO SENDER. No feature builds its own notifier. This migration declares WHAT may fire,
-- to whom, on which channels; the spine delivers it.
--
-- Authority: SPEC-NOTIFICATIONS §2.3 (the catalog), §2.17.1 (the eleven-key reconciliation), §2.19
-- (the three-interrupt policy), §7.1 (per-event knobs); SPEC-TIME §12 and §14 D12.
-- Applied live as `hr_l3_22_notification_events`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 SIX OF SPEC-TIME §12's KEYS DO NOT SHIP UNDER SPEC-TIME's NAMES, AND ONE DOES NOT SHIP AT
--    ALL. §14 D12 rules SPEC-NOTIFICATIONS the owner; §2.17.1 is its reconciliation table. Applied
--    here verbatim:
--      attestation_due          -> attestation_request
--      adjustment_approved      -> correction_decided        (the catalog name covers deny too)
--      missed_punch_detected    -> missing_punch
--      exception_opened         -> exception_raised
--      overtime_unapproved      -> unapproved_overtime_flagged
--      overtime_approaching_manager -> RETIRED (one event, two audiences)
--      exception_escalated      -> NOT DECLARED HERE: escalating an exception runs through
--                                  `hr.wf_escalate`, so the notice is `hr.workflow.step_escalated`,
--                                  which belongs to the workflow engine's §6.1 set.
--    The migration ASSERTS that none of the retired names exists, so a later lane cannot re-create
--    the duplicate by copying SPEC-TIME §12's table.
--
-- 2. THE CATALOG ADDS THREE ROWS SPEC-TIME §12 DOES NOT HAVE, AND THEY SHIP: `timecard_due`,
--    `timecard_submitted` / `timecard_approved` (per-employment grain, distinct from the
--    period-grain `period_submitted` / `period_approved` — both ship), `correction_requested`, and
--    `period_closing`. Plus `overtime_crossed`, a third D24a alert SPEC-TIME §12 never proposed.
--
-- 3. 🚨 SMS FOLLOWS SPEC-NOTIFICATIONS, NOT SPEC-TIME §12's NARROWER SENTENCE, AND THE DISAGREEMENT
--    IS RECORDED RATHER THAN SPLIT. SPEC-TIME §12 says SMS is declared on the time-critical
--    EMPLOYEE-FACING events only (`missed_punch_detected`, `attestation_due`, `attestation_overdue`).
--    SPEC-NOTIFICATIONS §2.3 additionally declares SMS on `timecard_due`, `timecard_rejected`,
--    `export_failed`, `unapproved_overtime_flagged` and the two OT alerts. Two of those are not
--    employee-facing. The owner wins (D12), and its own §2.19 explains why: `export_failed` carries
--    `alert_tier = door_open`, one of exactly three classes permitted to interrupt. Nine of
--    twenty-six rows carry SMS; the other seventeen do not.
--    OWED: SPEC-TIME §12's SMS sentence is narrower than the catalog it now defers to.
--
-- 4. `push` IS DECLARED ON THE TWO OT ALERTS AND IS NOT YET BUILT, SO THE ROW SAYS SO RATHER THAN
--    PRETENDING. SPEC-NOTIFICATIONS marks both with `✚`: the browser/mobile push channels are
--    declared but unbuilt on the spine, and until they land `push` resolves to in-app. The
--    declaration carries `"push": true` and `config.push_resolves_to = "in_app"` so the resolver
--    degrades honestly instead of dropping the notice.
--
-- 5. THE `config` BAG CARRIES §7.1's PER-EVENT KNOBS BECAUSE THERE IS NO REGISTRY TABLE FOR THEM,
--    WHICH IS SPEC-NOTIFICATIONS' OWN RULING. `mandatory` (⚖ — the user may re-channel, never
--    silence), `alert_tier`, `target_kind`, `deep_link_template`, `sensitivity_ceiling`,
--    `digestible`, `sms_locked` and `audience` all land in `notification_event_type.config`.
--    No new registry table is created here.
--
-- 6. `organization_id` IS THE MATRX SYSTEM ORG ON EVERY ROW, AND THAT IS FORCED BY THE SCHEMA, NOT
--    CHOSEN. `notification_event_type.event_key` is globally UNIQUE while `organization_id` is NOT
--    NULL — one row per event, in the system org. The D13 organization rung lives in
--    `communication.notification_event_override`, which is SPEC-NOTIFICATIONS' table and not this
--    lane's to populate. NO NULL ORG is satisfied by an explicit system-org id on every row.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

insert into communication.notification_event_type
  (organization_id, event_key, label, description, default_channels, config, enabled, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.event_key, v.label, v.descr,
       jsonb_build_object('email', v.email, 'sms', v.sms, 'in_app', true)
         || case when v.push then jsonb_build_object('push', true) else '{}'::jsonb end,
       jsonb_build_object(
         'target_kind', v.target_kind,
         'audience', v.audience,
         'mandatory', v.mandatory,
         'digestible', not v.mandatory,
         'sms_locked', false,
         'quiet_hours_exempt', false,
         'sensitivity_ceiling', 'internal',
         'routing_mode', 'declared_audience',
         'alert_tier', v.tier,
         'deep_link_template', v.link,
         'declared_by', 'SPEC-NOTIFICATIONS §2.3 (owner) — behaviour from SPEC-TIME §12')
         || case when v.push then jsonb_build_object('push_resolves_to', 'in_app') else '{}'::jsonb end,
       true, 'internal'::platform.visibility
from (values
 -- event_key, label, description, email, sms, push, mandatory, tier, target_kind, audience, deep link
 ('hr.time.timecard_due','Timecard due','A pay period closes within the lead window and the employee has an open timesheet.',
  true,true,false,true,'informational','hr_pay_period_employment','the employee','/hr/me/timesheet?period={{period.id}}'),
 ('hr.time.attestation_request','Attestation requested','An attestation is required — a break or meal waiver, or a period close.',
  true,true,false,true,'informational','hr_pay_period_employment','the employee','/hr/me/timesheet?period={{period.id}}#attest'),
 ('hr.time.timecard_submitted','Timecard submitted','An employee submitted or attested to their timecard.',
  true,false,false,false,'informational','hr_pay_period_employment','the approving manager','/hr/time/timesheets/{{employment.id}}'),
 ('hr.time.timecard_approved','Timecard approved','A manager approved one employee''s timecard.',
  false,false,false,false,'informational','hr_pay_period_employment','the employee','/hr/me/timesheet?period={{period.id}}'),
 ('hr.time.timecard_rejected','Timecard returned','A manager rejected or returned one timecard, with a required reason.',
  true,true,false,true,'informational','hr_pay_period_employment','the employee','/hr/me/timesheet?period={{period.id}}'),
 ('hr.time.correction_requested','Correction requested','An employee filed a correction against an approved timesheet.',
  true,false,false,false,'informational','hr_time_adjustment','the manager and HR admin','/hr/time/timesheets/{{employment.id}}'),
 ('hr.time.correction_decided','Correction decided','A post-lock correction reached a decision — approved or denied.',
  true,false,false,false,'informational','hr_time_adjustment','the employee','/hr/me/timesheet?period={{period.id}}'),
 ('hr.time.missing_punch','Missing punch','An orphan or unpaired punch survived the grace window.',
  false,true,false,false,'informational','hr_punch','the employee, then the manager','/hr/me/timesheet?period={{period.id}}'),
 ('hr.time.exception_raised','Exception raised','An attendance exception with severity=violation opened.',
  false,false,false,false,'informational','hr_attendance_exception','the manager; HR too for meal_not_provided / rest_not_provided','/hr/time/exceptions?id={{exception.id}}'),
 ('hr.time.period_closing','Pay period closing','A pay period entered its close window with rows still unapproved.',
  true,false,false,false,'informational','hr_pay_period','HR admin and the approving managers','/hr/time/periods/{{period.id}}'),
 ('hr.time.export_failed','Payroll export failed','A payroll export run failed, or its verification window elapsed un-acknowledged.',
  true,true,false,true,'door_open','hr_payroll_export','payroll admin and HR admin','/hr/time/periods/{{period.id}}'),
 ('hr.time.punch_edited','Punch changed','A manager voided or replaced a punch.',
  true,false,false,true,'informational','hr_punch','THE EMPLOYEE, ALWAYS — never suppressible','/hr/me/timesheet?period={{period.id}}'),
 ('hr.time.orphan_punch_auto_closed','Open punch auto-closed','Auto-close wrote a system clock-out for an unpaired open punch. The result is an ESTIMATE and is marked as one, permanently.',
  true,false,false,false,'informational','hr_punch','employee and manager','/hr/me/timesheet?period={{period.id}}'),
 ('hr.time.attestation_overdue','Attestation overdue','The attestation deadline passed with no action. The step auto-closes as not_attested; it never auto-attests.',
  true,true,false,true,'informational','hr_pay_period_employment','the employee; the manager on the second pass','/hr/me/timesheet?period={{period.id}}#attest'),
 ('hr.time.timecard_disputed','Timecard disputed','An employee attested WITH EXCEPTION. The disagreement is preserved and never overwritten.',
  true,false,false,false,'informational','hr_pay_period_employment','manager; HR where configured','/hr/time/timesheets/{{employment.id}}'),
 ('hr.time.period_submitted','Pay period submitted','A pay period moved to submitted and attestation instances opened.',
  false,false,false,false,'informational','hr_pay_period','managers with rows in the period','/hr/time/periods/{{period.id}}'),
 ('hr.time.period_approved','Pay period approved','A pay period moved to approved.',
  false,false,false,false,'informational','hr_pay_period','payroll admin','/hr/time/periods/{{period.id}}'),
 ('hr.time.period_locked','Pay period locked','A pay period moved to locked. Nothing in it is editable in place after this.',
  false,false,false,false,'informational','hr_pay_period','HR and payroll admin','/hr/time/periods/{{period.id}}'),
 ('hr.time.period_reopened','Pay period REOPENED','A locked pay period was reopened with a reason. Reopening does not un-export and does not re-pay.',
  true,false,false,false,'informational','hr_pay_period','HR, payroll admin and every manager in the pay group','/hr/time/periods/{{period.id}}'),
 ('hr.time.export_generated','Payroll export generated','An export run completed and its artifact was written.',
  false,false,false,false,'informational','hr_payroll_export','payroll admin','/hr/time/periods/{{period.id}}'),
 ('hr.time.export_acknowledged','Payroll export acknowledged','An acknowledgment was recorded against an export run. It can never be superseded after this.',
  false,false,false,false,'informational','hr_payroll_export','payroll admin','/hr/time/periods/{{period.id}}'),
 ('hr.time.kiosk_device_untrusted','Kiosk device untrusted','A device trust_state moved to suspended or revoked, or a device presented a bad secret.',
  true,false,false,true,'door_open','hr_kiosk_device','HR admin','/hr/settings/devices?device={{device.id}}'),
 ('hr.time.kiosk_clock_skew_exceeded','Kiosk clock skew exceeded','A punch was REFUSED because the device clock was too far out. The punch was not written.',
  true,false,false,false,'informational','hr_kiosk_device','HR admin and the device''s location manager','/hr/time/punches?device={{device.id}}'),
 ('hr.time.overtime_approaching','Approaching overtime','Projected workweek hours reached a resolved threshold minus the buffer. Fires once per (employment, workweek, threshold axis).',
  true,true,true,false,'informational','hr_overtime_alert','the employee and their manager','/hr/time/timesheets/{{employment.id}}'),
 ('hr.time.overtime_crossed','Overtime started','An overtime threshold was actually crossed, past the grace window. The hours are computed and owed from this moment regardless of any approval.',
  true,true,true,false,'informational','hr_overtime_alert','the employee''s manager and the employee','/hr/time/timesheets/{{employment.id}}'),
 ('hr.time.unapproved_overtime_flagged','Unapproved overtime — paid, flagged','Overtime was worked with no approved pre-approval. THE HOURS ARE PAID; this opens the review, and nothing about it gates, delays or reduces payment.',
  true,true,false,true,'informational','hr_attendance_exception','manager and HR admin','/hr/time/exceptions?employment={{employment.id}}')
) as v(event_key,label,descr,email,sms,push,mandatory,tier,target_kind,audience,link)
on conflict (event_key) do nothing;

-- ============================================================ assertions
do $$
declare v_n integer; v_bad text;
begin
  select count(*) into v_n from communication.notification_event_type
   where event_key like 'hr.time.%' and deleted_at is null;
  if v_n <> 26 then
    raise exception 'hr_l3_22: expected 26 hr.time.* event types, found % (SPEC-NOTIFICATIONS §2.3)', v_n;
  end if;

  -- RD 6: NO NULL ORG, and one row per event in the system org
  if exists (select 1 from communication.notification_event_type
              where event_key like 'hr.time.%'
                and organization_id is distinct from '39c38960-d30c-4840-b0c1-c9960de95582'::uuid) then
    raise exception 'hr_l3_22: an hr.time.* event type is not owned by the Matrx System org';
  end if;

  -- 🚨 RD 1: the retired SPEC-TIME §12 names must never exist
  select string_agg(event_key, ', ') into v_bad from communication.notification_event_type
   where event_key = any (ARRAY['hr.time.attestation_due','hr.time.adjustment_approved',
                                'hr.time.missed_punch_detected','hr.time.exception_opened',
                                'hr.time.overtime_unapproved','hr.time.overtime_approaching_manager',
                                'hr.time.exception_escalated']);
  if v_bad is not null then
    raise exception 'hr_l3_22: retired SPEC-TIME §12 event keys exist and duplicate the canonical catalog: %', v_bad;
  end if;

  -- RD 3: exactly nine rows carry SMS
  select count(*) into v_n from communication.notification_event_type
   where event_key like 'hr.time.%' and (default_channels ->> 'sms')::boolean;
  if v_n <> 9 then
    raise exception 'hr_l3_22: expected 9 hr.time.* events with SMS, found %', v_n;
  end if;

  -- ⚖ the punch-edit notice is mandatory: a silently edited timecard is a wage claim (§4.1)
  if not exists (select 1 from communication.notification_event_type
                  where event_key = 'hr.time.punch_edited'
                    and (config ->> 'mandatory')::boolean) then
    raise exception 'hr_l3_22: hr.time.punch_edited must be mandatory — SPEC-TIME §4.1 makes it non-suppressible';
  end if;

  -- RD 4: push is declared honestly on the two OT alerts
  select count(*) into v_n from communication.notification_event_type
   where event_key like 'hr.time.overtime_%'
     and (default_channels ->> 'push')::boolean and config ->> 'push_resolves_to' = 'in_app';
  if v_n <> 2 then
    raise exception 'hr_l3_22: the two OT alerts must declare push AND say what it resolves to today';
  end if;

  -- every row carries a deep link: a notice with nowhere to go is half a feature
  select count(*) into v_n from communication.notification_event_type
   where event_key like 'hr.time.%' and coalesce(config ->> 'deep_link_template','') = '';
  if v_n > 0 then
    raise exception 'hr_l3_22: % hr.time.* events carry no deep link', v_n;
  end if;
end $$;
