-- HR domain L1 — migration 8 (register item HRB-013, lane l1-employees).
--
-- THE §1 / §1a NOTIFICATION EVENTS THAT WERE MISSING FROM THE LIVE CATALOG.
-- Applied live as `hr_l1_08_notification_events`. Idempotent.
--
-- Authority: SPEC-EMPLOYEES §9; SPEC-NOTIFICATIONS §2.7 (people) / §2.10 (relations); R-L1 A12.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 24 — §9'S TWENTY-ONE KEYS DO NOT EXIST, AND RE-DECLARING THEM
-- WOULD HAVE BUILT A SECOND CATALOG.
--
-- R-L1 A12 asks this lane to declare "the 21 keys of §9 on
-- `communication.notification_event_type`". Checked live 2026-08-26: **not one of the 21 exists**,
-- and the reason is not that nobody did the work — L10 (HRB-022) declared **134 HR events**,
-- generated from SPEC-NOTIFICATIONS §2's own tables so that an amendment shows up as a red check
-- rather than as somebody's memory.
--
-- The two specs disagree about the GRAMMAR and about the CATALOG:
--   · SPEC-EMPLOYEES §9 writes two segments — `hr.employee_created`, `hr.pay_changed`.
--   · SPEC-NOTIFICATIONS §2, which landed later and which the live catalog was generated from,
--     writes three — `hr.<pillar>.<event>`, e.g. `hr.people.compensation_changed`.
--
-- SPEC-EMPLOYEES §13 D-7 anticipated exactly this: it recorded that SPEC-NOTIFICATIONS did not
-- exist yet, and that if it never landed then §9 "becomes the de-facto contract, which is not what
-- either was designed to be". **It landed.** So §9 is the earlier document and the pillar spec is
-- the one an implementer runs. Declaring §9's 21 keys verbatim would put two catalogs in one
-- table, in two grammars, describing the same events — and every notifier reading one of them
-- would silently ignore the other.
--
-- **What this lane actually owes, then, is the DELTA.** Mapping §9 onto the live catalog:
--
--   §9 key                              live equivalent
--   ─────────────────────────────────── ──────────────────────────────────────────
--   hr.pay_changed                      hr.people.compensation_changed        ✅ exists
--   hr.incident_reported                hr.relations.incident_reported        ✅ exists
--   hr.incident_assigned                hr.relations.case_assigned            ✅ exists
--   hr.separation_recorded              hr.offboarding.initiated              ✅ exists (L7's)
--   hr.verification_letter_delivered    hr.people.verification_letter_ready   ✅ exists
--   hr.name_changed                     hr.people.profile_change_decided      ◐ partial, kept
--   the other fifteen                   — NOTHING                              ← declared below
--
-- Fifteen events, in the LIVE grammar, on the pillar families the catalog already uses. Nothing
-- is renamed, nothing existing is touched, and §9's own list is left to be corrected by amendment
-- rather than by this file pretending both grammars are fine.
-- **→ coordinator: SPEC-EMPLOYEES §9 owes the three-segment keys, or an explicit pointer to
-- SPEC-NOTIFICATIONS §2.7/§2.10 as the roster of record.**
--
-- 🚨 RECORDED TECHNICAL DECISION 25 — HR BUILDS NO NOTIFIER, AND THIS FILE PROVES IT.
-- §9's binding rule: a notification about a subject-excluded incident is never delivered to an
-- excluded actor, because **the audience is computed AFTER the veto**. That is not expressible in
-- a declaration, so `hr.relations.case_escalated` carries `routing_mode = 'computed_audience'` and
-- its description names `hr.incident_excluded` as the filter the spine must apply. Every other row
-- here is `declared_audience`. This file inserts declarations only — no template renderer, no
-- sender, no schedule.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare r record; v_added int := 0; v_sys uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
begin
  for r in
    select * from (values
      -- key, label, description, deep link, tier, mandatory, ceiling, sms_locked, routing
      ('hr.people.created', 'Employee created',
       'Fires when a new employee record is created. Audience: HR admins and the new hire''s manager.',
       '/hr/people', 'informational', false, 'internal', true, 'declared_audience'),
      ('hr.people.invited', 'Platform invite sent',
       'Fires when a new employee is invited to the platform. Audience: the invitee. A failed invite never rolls back the employee — the invite is a follow-up task.',
       '/hr/me', 'informational', false, 'internal', true, 'declared_audience'),
      ('hr.people.position_change_scheduled', 'Position change scheduled',
       'Fires when a position change is recorded with a FUTURE effective date. Audience: the subject, both managers, HR. Nothing has changed yet and the notice says so.',
       '/hr/me', 'informational', false, 'internal', true, 'declared_audience'),
      ('hr.people.position_changed', 'Position changed',
       'Fires on the effective date, when the change actually takes effect — not when it was recorded. Audience: the subject, both managers, HR.',
       '/hr/me', 'informational', true, 'internal', true, 'declared_audience'),
      ('hr.people.transferred', 'Employee transferred',
       'Fires when a department, location or manager moves. Audience: the subject, both managers, HR, and the receiving location''s scheduler.',
       '/hr/me', 'informational', false, 'internal', true, 'declared_audience'),
      ('hr.people.jurisdiction_changed', 'Jurisdiction changed',
       'Fires when a location or home-address change moves the governing jurisdiction. Audience: HR admins. Consumed by Leave & PTO and Time & Attendance — past records keep the jurisdiction they were STAMPED with; nothing is recomputed.',
       '/hr/settings/structure', 'action_required', false, 'internal', true, 'declared_audience'),
      ('hr.people.compensation_retro_detected', 'Retroactive pay change detected',
       'Fires when a compensation row lands with an effective date in the PAST. Audience: payroll administrators and HR admins. No retro pay line is auto-generated — a human decides whether an adjustment is owed.',
       '/hr/me/pay', 'action_required', false, 'confidential', true, 'declared_audience'),
      ('hr.people.rehired', 'Employee rehired',
       'Fires when a second employment spell opens for a person who previously left. Carries the prior employment and the gap in months. Consumed by Leave & PTO for statutory sick-leave reinstatement.',
       '/hr/people', 'informational', false, 'internal', true, 'declared_audience'),
      ('hr.people.engagement_ended', 'Contractor engagement ended',
       'Fires when a contractor engagement reaches its end date or is ended early. Audience: HR and the engagement owner.',
       '/hr/people', 'informational', false, 'internal', true, 'declared_audience'),
      ('hr.people.worker_class_reclassified', 'Worker class reclassified',
       'Fires when a live assignment''s worker class changes. Audience: hr_owner and compliance officers. Misclassification is a real legal exposure and this notice exists so somebody competent reviews it.',
       '/hr/people', 'action_required', true, 'internal', true, 'declared_audience'),
      ('hr.people.name_changed', 'Legal name changed',
       'Fires when a legal name change is applied. Audience: HR; consumed by Onboarding for I-9 / W-4 review. Already-issued artifacts keep their own snapshots and are NOT reissued.',
       '/hr/me', 'informational', false, 'confidential', true, 'declared_audience'),
      ('hr.people.work_permit_expiring', 'Work authorization expiring',
       'Fires when work authorization expires inside 90 days. Audience: HR admins. A countdown, not a status.',
       '/hr/compliance', 'action_required', true, 'confidential', true, 'declared_audience'),
      ('hr.people.verification_consent_requested', 'Verification consent requested',
       'Fires when a verification letter asserting compensation needs the subject''s consent. Audience: the subject, and only the subject — consent is theirs to give and there is no HR override.',
       '/hr/me', 'action_required', true, 'confidential', true, 'declared_audience'),
      ('hr.relations.corrective_action_issued', 'Corrective action issued',
       'Fires when a corrective action is issued. Audience: the subject, the issuer, employee_relations. The subject must be able to read what they are being asked to sign.',
       '/hr/tasks', 'action_required', true, 'restricted', true, 'declared_audience'),
      ('hr.relations.corrective_action_acknowledged', 'Corrective action acknowledged',
       'Fires when the subject acknowledges — or REFUSES to acknowledge. A refusal is a valid outcome and this notice carries it rather than staying silent.',
       '/hr/people/relations', 'informational', false, 'restricted', true, 'declared_audience'),
      ('hr.relations.case_escalated', 'Case escalated',
       'Fires when a case is escalated because its assignee is a party to it. Audience: the escalation target. 🚨 The audience is computed AFTER hr.incident_excluded — a notice about a subject-excluded incident is never delivered to an excluded actor.',
       '/hr/people/relations', 'action_required', true, 'restricted', true, 'computed_audience')
    ) as t(event_key, label, description, deep_link, alert_tier, mandatory, ceiling, sms_locked, routing)
  loop
    insert into communication.notification_event_type
      (event_key, label, description, enabled, organization_id, visibility,
       default_channels, config)
    values (
      r.event_key, r.label, r.description, true, v_sys, 'internal',
      -- object shape, never an array: only an object can express a channel being explicitly OFF,
      -- which §7.1's preference ladder needs (L10's normalization, obeyed here).
      jsonb_build_object('email', true, 'in_app', true),
      jsonb_build_object(
        'mandatory', r.mandatory,
        'alert_tier', r.alert_tier,
        'digestible', not r.mandatory,
        'sms_locked', r.sms_locked,
        'target_kind', null,
        'max_attempts', 5,
        'routing_mode', r.routing,
        'push_declared', false,
        'non_user_capable', false,
        'deep_link_template', r.deep_link,
        'quiet_hours_exempt', false,
        'retry_base_seconds', 60,
        'sensitivity_ceiling', r.ceiling,
        'declared_by', 'HRB-013 (L1) — SPEC-EMPLOYEES §9 delta over SPEC-NOTIFICATIONS §2'))
    on conflict (event_key) do nothing;
    if found then v_added := v_added + 1; end if;
  end loop;
  raise notice 'hr_l1_08: declared % new HR people/relations event(s)', v_added;
end $$;

-- ============================================================ assertions

do $$
declare v_missing text; v_n int; v_bad int;
begin
  select string_agg(k, ', ' order by k) into v_missing from (
    select k from unnest(ARRAY[
      'hr.people.created','hr.people.invited','hr.people.position_change_scheduled',
      'hr.people.position_changed','hr.people.transferred','hr.people.jurisdiction_changed',
      'hr.people.compensation_retro_detected','hr.people.rehired','hr.people.engagement_ended',
      'hr.people.worker_class_reclassified','hr.people.name_changed',
      'hr.people.work_permit_expiring','hr.people.verification_consent_requested',
      'hr.relations.corrective_action_issued','hr.relations.corrective_action_acknowledged',
      'hr.relations.case_escalated']) as k
     where not exists (select 1 from communication.notification_event_type e where e.event_key = k)
  ) s;
  if v_missing is not null then
    raise exception 'hr_l1_08: event(s) not declared: %', v_missing;
  end if;

  -- RECORDED DECISION 24: ONE catalog, one grammar. A two-segment `hr.<event>` key is the old
  -- grammar and its presence means somebody re-declared §9 verbatim beside the live roster.
  select count(*), string_agg(event_key, ', ' order by event_key) into v_bad, v_missing
    from communication.notification_event_type
   where event_key like 'hr.%' and array_length(string_to_array(event_key, '.'), 1) <> 3;
  if v_bad > 0 then
    raise exception 'hr_l1_08: % HR event(s) use the retired two-segment grammar: %', v_bad, v_missing;
  end if;

  -- L10's normalization: object-shaped default_channels everywhere, because only an object can
  -- say a channel is explicitly OFF.
  select count(*) into v_bad from communication.notification_event_type
   where event_key like 'hr.%' and default_channels is not null
     and jsonb_typeof(default_channels) <> 'object';
  if v_bad > 0 then
    raise exception 'hr_l1_08: % HR event(s) carry a non-object default_channels', v_bad;
  end if;

  -- RECORDED DECISION 25: the one event whose audience cannot be declared says so.
  if (select config ->> 'routing_mode' from communication.notification_event_type
       where event_key = 'hr.relations.case_escalated') <> 'computed_audience' then
    raise exception 'hr_l1_08: case_escalated must compute its audience AFTER the veto (§9 rule 1)';
  end if;

  select count(*) into v_n from communication.notification_event_type where event_key like 'hr.%';
  raise notice 'hr_l1_08: % HR events declared in total', v_n;
end $$;
