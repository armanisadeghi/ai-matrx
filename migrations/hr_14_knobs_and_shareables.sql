-- HR domain, migration 14 of 16 (register item HRB-006, core tranche 4). REGISTRY WIRING, NO DDL.
--
-- Four jobs: the §19.2 platform.feature_knob seed rows; platform.shareable_resource_registry rows
-- for the DIR entities; platform.association_types rows from §17.4; and
-- platform.sync_association_gc_triggers per HR token.
--
-- Authority: SPEC-DATA-MODEL §19.1, §19.2, §17.4, §18.1 file 14.
--
-- 🚨 THIS FILE UNBLOCKS hr.eeo_aggregate. Tranche 3 built it fail-closed on
-- `hr.hiring.eeo_min_cell` because D13 says a missing knob RAISES rather than falling back to a
-- constant — an EEO report that silently used a hardcoded minimum cell would be a
-- re-identification risk wearing a compliance label. Seeding the knob here is what turns the
-- function on, and file 13 taught it to write its audit row either way.
--
-- 🚨 A KNOB IS NOT A RULE (§19.1). Statutory floors live in hr.jurisdiction_rule and an org
-- override below one is REJECTED, not applied. Effective-dated operational values — the workweek
-- start, a pay calendar, a location's timezone — are COLUMNS ON REAL TABLES, because they must be
-- resolvable as of a past date. Nothing seeded here is either of those.
--
-- ON CONFLICT UPDATES THE METADATA, NEVER `value`. Re-running this migration refreshes labels,
-- descriptions, bases and ranges but can never clobber a value a human has set — which is the
-- knob store's own invariant (`set_by='human'` marks a reviewed value).
--
-- Idempotent. Applied live as migration `hr_14_knobs_and_shareables`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 FOUR KNOBS CANNOT BE SEEDED, and this is the SAME live blocker core tranche 1 recorded
--    against `hr.employees.self_service_field_policy` — still open, now with three more
--    instances. `platform.feature_knob.value_type` has a live CHECK admitting only
--    `number | integer | boolean | string | enum`. These four are jsonb or array by nature:
--      hr.employees.self_service_field_policy   — the field-classification map (§19.2)
--      hr.onboarding.asset_recovery_reminder_days — [7,1]
--      hr.training.cert_expiry_reminder_days      — [60,30,7]
--      hr.domain_wide.alert_quiet_hours           — {} (D24g)
--    Seeding them as `string` with a JSON blob inside would lie about the type, defeat the knob
--    store's range/validation machinery and break the "Limits & Knobs" admin page's rendering.
--    Widening the CHECK is a platform change with every knob downstream — not this lane's to
--    make. OPEN FOR THE KNOB-STORE OWNER (feature-knobs SoR); recorded on the HRB-006 register.
--    Consumers must treat these four as absent, which per D13 means they RAISE — the correct
--    loud failure, not a silent default.
--
-- 2. `hr.onboarding.new_hire_report_due_days` IS DELIBERATELY NOT SEEDED. §19.2's own row gives
--    its default as "resolved from hr.jurisdiction_rule" with no range and no rungs — it is a
--    POINTER TO A RULE, not a knob value, and §19.1 is explicit that a knob is not a rule.
--    Seeding it would create exactly the second source of truth the section forbids.
--    hr.new_hire_report.rule_version_id (file 11) is where the resolved answer is frozen.
--
-- 3. SHAREABLE ROWS ARE SEEDED ONLY WHERE SPEC-UI-IA GIVES AN UNAMBIGUOUS PER-RECORD ROUTE.
--    `url_path_template` is a real URL the share UI will navigate to; a guessed path is a dead
--    end the moment someone clicks it (the no-dead-ends law). SPEC-UI-IA's route list has
--    per-record routes for eight DIR-class tokens and list-only routes for the rest
--    (hr_department, hr_location, hr_job_title and hr_pay_group all live inside
--    /hr/settings/structure and /hr/settings/pay-groups with no `:id` segment; hr_crew,
--    hr_interview_kit, hr_schedule_template and hr_schedule_guidance have no route at all yet).
--    The eight that resolve are seeded; the rest are recorded as owed to the lane that builds
--    their routes, which is also the lane that will know the final path.
--
-- 4. §17.4's `role` COLUMN IS `label` LIVE. platform.association_types is
--    (source_type, target_type, label, container_side, conveys_max, is_active, notes) — there is
--    no `role` column, and the PK is (source_type, target_type). And "conveyance is deliberately
--    null" is expressed live as `container_side = 'none'`: both columns are NOT NULL, and
--    conveys_max keeps its 'editor' default, which is INERT because nothing conveys when
--    container_side is 'none'. 🚨 The `file → hr_employee` edge is the one this matters most for
--    — a conveying edge there would publish every I-9, medical note, offer letter and
--    disciplinary attachment to the whole organization, because hr.employee carries an
--    org-audience viewer grant.
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ §19.2 the knob register
-- Every row carries a real `basis` and a review_due 90 days out; platform.v_feature_knob_overdue
-- and the red count on the admin page are what stop them from staying provisional.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
values
-- ---------- hr.employees (HRB-004 seeded these; re-upserted so metadata stays consistent)
('hr.employees','directory_shows_hire_date','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Directory shows hire date','Whether a colleague sees the hire date on a directory card.','agent',
 'Service anniversaries are ordinary workplace information and hiding them by default makes the directory feel evasive; an org that disagrees turns it off.',current_date+90),
('hr.employees','directory_shows_manager','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Directory shows manager','Whether a colleague sees the reporting line on a directory card.','agent',
 'Knowing who to ask is the directory''s main job; the org chart is already org-readable.',current_date+90),
('hr.employees','employee_number_format','"EMP-{seq:05}"'::jsonb,'"EMP-{seq:05}"'::jsonb,'string',null,null,null,null,
 'Employee number format','Template for generated employee numbers.','agent',
 'A zero-padded sequence sorts correctly and is short enough to say out loud; orgs migrating from another system override it.',current_date+90),
('hr.employees','ssn_reveal_requires_reauth','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'SSN reveal requires re-authentication','Force a fresh auth challenge before hr.reveal_ssn returns a value.','agent',
 'The highest-sensitivity field in the schema; a stolen session should not be enough to read it.',current_date+90),
('hr.employees','org_chart_history_enabled','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Historical org chart enabled','Whether hr.org_chart_as_of is exposed in the UI.','agent',
 'The effective-dated data already supports it (AR 1.2); switching it off is a UI choice, not a data one.',current_date+90),
('hr.employees','blended_rate_min_cell','5'::jsonb,'5'::jsonb,'integer',null,3,25,null,
 'Blended rate minimum cell','Fewest distinct employments a scope must contain before hr.blended_labor_rate returns a rate.','agent',
 'Two people in a department means the second person''s salary is the first''s subtraction problem (§4.6). Five is the same floor the EEO aggregate uses.',current_date+90),
('hr.employees','blended_rate_round_to','0.25'::jsonb,'0.25'::jsonb,'number','usd',0.01,5.00,null,
 'Blended rate rounding','Rounding increment applied to a blended labour rate before it is returned.','agent',
 'Rounding is half of what makes the figure non-invertible; without it repeated calls across overlapping scopes can be differenced back to an individual.',current_date+90),
-- ---------- hr.time_and_attendance
('hr.time_and_attendance','rounding_minutes','0'::jsonb,'0'::jsonb,'integer','minutes',0,15,null,
 'Punch rounding increment','Minutes the pairing engine rounds a punch to. 0 = no rounding, the neutral default.','agent',
 'FLSA permits neutral rounding but does not require it; starting at 0 means no employer can be accused of systematic under-rounding on our default. Orgs that want 15-minute rounding opt in.',current_date+90),
('hr.time_and_attendance','rounding_mode','"nearest"'::jsonb,'"nearest"'::jsonb,'enum',null,null,null,'["nearest","up","down"]'::jsonb,
 'Punch rounding mode','Direction the rounding increment is applied in.','agent',
 'Only `nearest` is facially neutral under FLSA; up and down exist because some orgs have bargained for them.',current_date+90),
('hr.time_and_attendance','max_shift_hours','16'::jsonb,'16'::jsonb,'integer','hours',8,24,null,
 'Maximum shift hours','Elapsed hours after which an open punch is treated as an orphan.','agent',
 'A 16-hour cap catches a forgotten clock-out without truncating a genuine double; hr.auto_close_rule overrides it per scope where a live-in shift makes it wrong.',current_date+90),
('hr.time_and_attendance','auto_close_orphan_punch','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Auto-close orphan punches','Whether the engine closes an over-long open punch automatically.','agent',
 'An open punch left forever silently corrupts every week that follows it; auto-close plus an auto_closed_estimate exception is visible, a missing clock-out is not.',current_date+90),
('hr.time_and_attendance','grace_late_minutes','5'::jsonb,'5'::jsonb,'integer','minutes',0,30,null,
 'Late arrival grace','Minutes past the scheduled start before a late_arrival exception is raised.','agent',
 'Below five minutes the exception queue fills with traffic-light noise and managers stop reading it.',current_date+90),
('hr.time_and_attendance','grace_early_minutes','5'::jsonb,'5'::jsonb,'integer','minutes',0,30,null,
 'Early departure grace','Minutes before the scheduled end that still count as a full shift.','agent',
 'Symmetry with the late grace; an asymmetric pair reads as employer-favourable and invites a claim.',current_date+90),
('hr.time_and_attendance','require_break_attestation','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Require break attestation','Whether a clock-out presents the meal/rest attestation prompt.','agent',
 'In California the attestation IS the evidence that a meal was provided; defaulting it on costs a tap and defaulting it off costs a premium per shift.',current_date+90),
('hr.time_and_attendance','employee_attestation_required','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Employee timesheet attestation required','Whether a pay period needs the employee''s attestation before approval.','agent',
 'AR2''s attestation half; a timesheet nobody affirmed is weak evidence in a wage dispute.',current_date+90),
('hr.time_and_attendance','manager_approval_required','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Manager approval required','Whether a pay period needs manager approval before export.','agent',
 'The second pair of eyes before money moves; orgs with a single owner-operator turn it off.',current_date+90),
('hr.time_and_attendance','allow_period_reopen','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Allow pay period reopen','Whether a locked period may be reopened (always reasoned and audited).','agent',
 'Reopen exists so a correction does not require a silent edit; the state machine records who and why either way.',current_date+90),
('hr.time_and_attendance','kiosk_require_photo','false'::jsonb,'false'::jsonb,'boolean',null,null,null,null,
 'Kiosk requires photo','Whether a kiosk punch captures a photo.','agent',
 'Biometric-adjacent capture is off by default; several states regulate it and an employer should opt in knowingly.',current_date+90),
('hr.time_and_attendance','kiosk_require_geo','false'::jsonb,'false'::jsonb,'boolean',null,null,null,null,
 'Kiosk requires geolocation','Whether a kiosk punch captures coordinates.','agent',
 'Location tracking of staff is off by default for the same reason as the photo; the geofence columns exist for orgs that opt in.',current_date+90),
('hr.time_and_attendance','kiosk_max_clock_skew_seconds','300'::jsonb,'300'::jsonb,'integer','seconds',30,3600,null,
 'Maximum kiosk clock skew','How far a device clock may drift before its punches are refused.','agent',
 'Five minutes absorbs ordinary NTP drift on a cheap tablet without letting a mis-set clock rewrite a shift boundary.',current_date+90),
('hr.time_and_attendance','pin_lockout_minutes','15'::jsonb,'15'::jsonb,'integer','minutes',1,1440,null,
 'PIN lockout duration','How long a PIN is locked after too many failures.','agent',
 'Long enough to stop a shoulder-surfing guess, short enough that a genuine employee is not sent home.',current_date+90),
('hr.time_and_attendance','pin_max_failed_attempts','5'::jsonb,'5'::jsonb,'integer',null,3,10,null,
 'PIN failed attempts before lockout','Consecutive failures that trigger the lockout.','agent',
 'A 4-digit PIN mistyped twice is normal; five is where a pattern starts.',current_date+90),
('hr.time_and_attendance','kiosk_session_ttl_minutes','2'::jsonb,'2'::jsonb,'integer','minutes',1,30,null,
 'Person-bound kiosk session TTL','Minutes a PIN-authenticated interaction session stays valid.','agent',
 'The person-bound session must expire fast or the next person in line punches as the last one. Distinct from the DEVICE session TTL below — conflating the two is the R-L3 U-05 trap.',current_date+90),
('hr.time_and_attendance','kiosk_session_ttl_hours','12'::jsonb,'12'::jsonb,'integer','hours',1,24,null,
 'Device kiosk session TTL','Hours a wall tablet''s own device session stays valid between re-authentications.','agent',
 'One working day, so a tablet does not need re-pairing mid-shift. This value NEVER gates a person''s session.',current_date+90),
('hr.time_and_attendance','pairing_code_ttl_minutes','15'::jsonb,'15'::jsonb,'integer','minutes',5,120,null,
 'Pairing code TTL','Minutes an unclaimed device pairing code stays valid.','agent',
 'The pairing code is the only path that mints a device secret; a short single-use window is what keeps it from becoming a standing credential.',current_date+90),
('hr.time_and_attendance','ot_preapproval_required','false'::jsonb,'false'::jsonb,'boolean',null,null,null,null,
 'Overtime pre-approval required','Whether overtime is expected to carry an approved pre-approval.','agent',
 'Off by default because most SMBs do not run the process. 🚨 Even when ON it never gates pay — the FLSA pays hours suffered or permitted, approved or not (D24a).',current_date+90),
('hr.time_and_attendance','ot_alert_default_threshold_hours','36'::jsonb,'36'::jsonb,'integer','hours',20,60,null,
 'Default approaching-OT threshold','Weekly hours at which the default alert rule fires.','agent',
 'Four hours before the 40-hour federal line leaves a manager time to shorten a shift instead of finding out on the timesheet.',current_date+90),
('hr.time_and_attendance','ip_verification_mode','"off"'::jsonb,'"off"'::jsonb,'enum',null,null,null,'["off","warn","block"]'::jsonb,
 'IP verification mode','What the punch RPC does about an out-of-allowlist source IP.','agent',
 'Off by default: a home-office or hotspot punch is normal for many roles. On `block` the RPC refuses BEFORE inserting and writes an access-audit row rather than a phantom punch (§7.1).',current_date+90),
('hr.time_and_attendance','remote_punch_allowed','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Remote web punch allowed','Whether the web clock accepts a punch from outside a known location.','agent',
 'Remote and field work are ordinary; orgs that need site-bound punching turn it off and use the kiosk lane.',current_date+90),
('hr.time_and_attendance','export_format_default','"generic_csv"'::jsonb,'"generic_csv"'::jsonb,'enum',null,null,null,
 '["quickbooks_online","quickbooks_iif","gusto_csv","adp_csv","generic_csv","json"]'::jsonb,
 'Default payroll export format','Format hr.payroll_export generates unless overridden.','agent',
 'D22: a default that cannot generate a file on day one is a broken default, not an aspiration. generic_csv is the floor and the default; a QBO connector arrives on the provider seam when it is real.',current_date+90),
-- ---------- hr.scheduling
('hr.scheduling','publish_advance_notice_days','14'::jsonb,'14'::jsonb,'integer','days',0,60,null,
 'Publish advance notice','Days ahead a schedule is expected to be published.','agent',
 'Fourteen days is the common fair-workweek ordinance figure; the operative per-shift evaluation still comes from the shift''s own jurisdiction.',current_date+90),
('hr.scheduling','expired_credential','"block"'::jsonb,'"block"'::jsonb,'enum',null,null,null,'["block","warn","ignore"]'::jsonb,
 'Expired credential handling','What scheduling does when a required credential has lapsed.','agent',
 'Blocking by default: a lapsed food-handler or driver certification is a liability the schedule should not create silently.',current_date+90),
('hr.scheduling','min_rest_hours_between_shifts','8'::jsonb,'8'::jsonb,'integer','hours',0,24,null,
 'Minimum rest between shifts','Hours of rest below which a clopening is flagged.','agent',
 'Eight hours is the threshold most predictive-scheduling ordinances use for the clopening premium.',current_date+90),
('hr.scheduling','max_consecutive_days','6'::jsonb,'6'::jsonb,'integer','days',1,14,null,
 'Maximum consecutive days','Consecutive scheduled days before the conflict engine objects.','agent',
 'Six preserves a day of rest in a seven-day week, which several state day-of-rest statutes require.',current_date+90),
('hr.scheduling','ot_would_trigger','"warn"'::jsonb,'"warn"'::jsonb,'enum',null,null,null,'["block","warn","ignore"]'::jsonb,
 'Would-trigger-overtime handling','What scheduling does when an assignment would create overtime.','agent',
 'Warn, not block: overtime is often the right answer, and a hard block pushes managers into shadow spreadsheets.',current_date+90),
('hr.scheduling','open_shift_claim_needs_approval','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Open shift claim needs approval','Whether claiming an open shift requires a manager decision.','agent',
 'The claim re-runs the full conflict set; approval is the human check on what the engine only warned about.',current_date+90),
('hr.scheduling','swap_needs_approval','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Shift swap needs approval','Whether a swap between two employees requires a manager decision.','agent',
 'A swap changes who is qualified to be on the floor; the conflict re-check is advisory, the approval is the decision.',current_date+90),
('hr.scheduling','shift_reminder_lead_minutes','60'::jsonb,'60'::jsonb,'integer','minutes',0,1440,null,
 'Shift reminder lead time','Minutes before a shift that the reminder is sent.','agent',
 'An hour is long enough to travel and short enough to still be relevant; this is one of the two knobs with a per-USER rung.',current_date+90),
('hr.scheduling','ai_draft_posture','"recommend"'::jsonb,'"recommend"'::jsonb,'enum',null,null,null,
 '["apply_final","recommend","review_and_comment","off"]'::jsonb,
 'AI schedule draft posture','How much autonomy the schedule drafter has.','agent',
 'Recommend by default: the draft is genuinely useful and a human publish step is what makes a fair-workweek baseline defensible.',current_date+90),
('hr.scheduling','ai_fill_posture','"recommend"'::jsonb,'"recommend"'::jsonb,'enum',null,null,null,
 '["apply_final","recommend","review_and_comment","off"]'::jsonb,
 'AI open-shift fill posture','How much autonomy the open-shift filler has.','agent',
 'Same posture as the drafter, for the same reason; filling a shift assigns a person to a place and time.',current_date+90),
('hr.scheduling','default_horizon_days','14'::jsonb,'14'::jsonb,'integer','days',1,400,null,
 'Default scheduling horizon','Default window length when a schedule is created.','agent',
 'A fortnight matches the commonest pay cadence. The upper bound is deliberately 400 — D17 requires six-month construction programmes to be expressible.',current_date+90),
('hr.scheduling','guidance_in_ai_provision','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Include guidance in AI provision','Whether hr.schedule_guidance rows are sent to the drafter.','agent',
 'D24b''s whole point: the manager''s plain-text context is what makes the draft worth reviewing. The per-row sensitivity ceiling still filters what may be sent.',current_date+90),
('hr.scheduling','crew_scheduling_enabled','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Crew scheduling enabled','Whether the crew board and crew-scoped schedules are available.','agent',
 'D17 built the universal grain; orgs with one site can hide the dimension without changing any data.',current_date+90),
-- ---------- hr.leave
('hr.leave','negative_balance_default','false'::jsonb,'false'::jsonb,'boolean',null,null,null,null,
 'Allow negative balances by default','Default for new leave policies.','agent',
 'A negative balance is a debt the employee may not know they took on; policies that allow it should say so deliberately.',current_date+90),
('hr.leave','request_min_notice_days','0'::jsonb,'0'::jsonb,'integer','days',0,90,null,
 'Minimum leave request notice','Days of notice a request is expected to give.','agent',
 'Zero by default because sick leave is same-day by nature; vacation policies set their own via blackout rules.',current_date+90),
('hr.leave','who_is_out_visible_to_peers','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Who-is-out visible to peers','Whether colleagues see who is away (never why).','agent',
 'Coverage planning needs the dates; the REASON is never shown, and a protected-leave case lives behind the restricted wall regardless.',current_date+90),
('hr.leave','accrual_run_cadence','"daily"'::jsonb,'"daily"'::jsonb,'enum',null,null,null,'["daily","per_pay_period"]'::jsonb,
 'Accrual run cadence','How often the accrual engine posts ledger entries.','agent',
 'Daily keeps a balance answerable on any date, which is what statutory sick-leave accrual per hours worked requires.',current_date+90),
-- ---------- hr.hiring
('hr.hiring','eeo_min_cell','5'::jsonb,'5'::jsonb,'integer',null,3,25,null,
 'EEO aggregate minimum cell','Fewest responses in a cell before hr.eeo_aggregate will report it.','agent',
 'Below five a cell starts to identify individuals, and complementary suppression then hides the next-smallest so the total cannot be differenced back. This knob is what makes hr.eeo_aggregate runnable at all — D13 makes it RAISE while unset rather than assume a floor.',current_date+90),
('hr.hiring','rejection_reason_required','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Rejection reason required','Whether a rejected application must carry a reason category.','agent',
 'PLATFORM-LOCKED true: this is the EEOC recordkeeping requirement and it is also a CHECK constraint on hr.application. The knob exists so the UI can explain the rule, not so an org can switch it off.',current_date+90),
('hr.hiring','scorecard_blind_until_submitted','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Scorecards blind until submitted','Whether an interviewer sees others'' scorecards before submitting their own.','agent',
 'Anchoring is the single biggest source of noise in panel interviews; blind-until-submitted is cheap and effective.',current_date+90),
('hr.hiring','interview_feedback_due_hours','48'::jsonb,'48'::jsonb,'integer','hours',4,336,null,
 'Interview feedback due','Hours after an interview that feedback becomes overdue.','agent',
 'Two days: recall decays fast, and a stalled scorecard is the commonest cause of a candidate going cold.',current_date+90),
('hr.hiring','offer_default_expiry_days','7'::jsonb,'7'::jsonb,'integer','days',1,60,null,
 'Offer default expiry','Days an offer stays open unless set otherwise.','agent',
 'A week is long enough to consider and short enough to keep a requisition moving; the offer row carries its own expires_at.',current_date+90),
('hr.hiring','careers_portal_enabled','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Careers portal enabled','Whether the hosted careers page is served.','agent',
 'D21 makes the hosted portal critical; it is on by default and an org that has its own site turns it off and keeps the widget.',current_date+90),
('hr.hiring','widget_enabled','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Careers widget enabled','Whether the embeddable widget answers for this org.','agent',
 'The widget is how a posting reaches an existing marketing site; the per-posting allow_widget switch still applies.',current_date+90),
('hr.hiring','custom_stages_enabled','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Custom pipeline stages enabled','Whether an org may name its own stages (D24h).','agent',
 'Orgs name stages after their own process; the closed stage_bucket rollup is what keeps reporting comparable regardless.',current_date+90),
('hr.hiring','ai_screening_posture','"review_and_comment"'::jsonb,'"review_and_comment"'::jsonb,'enum',null,null,null,
 '["recommend","review_and_comment","off"]'::jsonb,
 'AI screening posture','How much autonomy the screening assistant has.','agent',
 '🚨 `apply_final` IS NOT A LEGAL VALUE. D6: AI never decides, and candidate auto-rejection exists under NO mode — the application transition trigger refuses a rejected disposition whose actor is ai_agent or automation.',current_date+90),
-- ---------- hr.onboarding
('hr.onboarding','i9_section2_due_business_days','3'::jsonb,'3'::jsonb,'integer','days',3,3,null,
 'I-9 Section 2 due','Business days after the first day of work by which Section 2 must be completed.','agent',
 'PLATFORM-LOCKED: three business days is the statutory deadline, not a preference. The knob exists so the compliance surface can cite it.',current_date+90),
('hr.onboarding','access_shutoff_mode','"immediate"'::jsonb,'"immediate"'::jsonb,'enum',null,null,null,
 '["immediate","end_of_day","scheduled"]'::jsonb,
 'Access shutoff mode','When provisioning revocation runs on a departure.','agent',
 'AR 1.16''s immediate-vs-end-of-day split. Immediate by default: the window between a termination and a revocation is the one an angry leaver uses.',current_date+90),
('hr.onboarding','provisioning_verification_required','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Provisioning verification required','Whether a shutoff must be verified, not merely requested.','agent',
 'PLATFORM-LOCKED true (AR2): "a failed access shutoff cannot be marked complete merely because an event was emitted." It is also a CHECK constraint on hr.checklist_item.',current_date+90),
('hr.onboarding','exit_survey_enabled','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Exit surveys enabled','Whether a separation triggers an exit-interview invitation.','agent',
 'D24d made exit interviews first-class; the leaver answers through the outsider token lane after access shutoff.',current_date+90),
('hr.onboarding','exit_survey_due_days','14'::jsonb,'14'::jsonb,'integer','days',1,90,null,
 'Exit survey due','Days a leaver has to respond.','agent',
 'Two weeks: long enough to answer after the dust settles, short enough that the answers still describe the job they left.',current_date+90),
('hr.onboarding','survey_anonymity_threshold','5'::jsonb,'5'::jsonb,'integer',null,3,25,null,
 'Survey anonymity threshold','Fewest responses before an anonymous survey aggregate is shown.','agent',
 'The same small-cell floor as the EEO and blended-rate aggregates. The per-survey column overrides it; this is the org default.',current_date+90),
-- ---------- hr.training
('hr.training','mandate_generation_enabled','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Mandated training generation enabled','Whether the rule engine issues jurisdiction-mandated assignments.','agent',
 'Bucket-2 item 9: mandated training is a rule, not a manual assignment. mandate_cycle_key makes the generator safely re-runnable, so leaving it on is the low-risk default.',current_date+90),
-- ---------- hr.domain_wide
('hr.domain_wide','retention_warning_days','30'::jsonb,'30'::jsonb,'integer','days',7,180,null,
 'Retention warning horizon','Days before a disposition becomes due that the compliance surface warns.','agent',
 'This controls only the WARNING horizon, never the statutory floor — the floors are hr.retention_rule rows with citations (§15).',current_date+90),
('hr.domain_wide','break_glass_enabled','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Break-glass enabled','Whether a justified emergency read of confidential data is possible at all.','agent',
 'A system with no break-glass gets one improvised outside the audit trail. Every use writes an hr.access_audit row with the justification.',current_date+90),
('hr.domain_wide','break_glass_justification_min_chars','20'::jsonb,'20'::jsonb,'integer','characters',20,500,null,
 'Break-glass justification minimum','Shortest justification a break-glass read will accept.','agent',
 'Twenty characters is enough to defeat "asdf" and is also a CHECK constraint on hr.access_audit, so the two cannot drift.',current_date+90),
('hr.domain_wide','disposition_dry_run_default','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Disposition dry-run by default','Whether hr.dispose_records defaults to reporting rather than destroying.','agent',
 'PLATFORM-LOCKED true (§15.1): the live sweep is an explicit, approved operation and is never scheduled without an owner ruling. The function signature defaults to true independently.',current_date+90),
('hr.domain_wide','ai_sensitivity_ceiling_default','"internal"'::jsonb,'"internal"'::jsonb,'enum',null,null,null,
 '["public","internal","confidential"]'::jsonb,
 'Default AI sensitivity ceiling','Highest sensitivity an AI Provision may read by default.','agent',
 'AR B2.20: no Provision reads EEO, medical or investigation data. `restricted` is deliberately not an available value anywhere in the stack.',current_date+90),
('hr.domain_wide','ai_evidence_retention_months','36'::jsonb,'36'::jsonb,'integer','months',12,120,null,
 'AI evidence retention','Months an hr.ai_evidence row is kept.','agent',
 'Three years matches the class floor in §15 and outlasts the typical discrimination-claim window in which a suggestion might be questioned.',current_date+90),
('hr.domain_wide','alert_fallback_to_owner','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Unroutable alerts reach the owner','Whether an alert with no resolved recipient goes to the org owner.','agent',
 'An alert that reaches nobody is worse than a noisy one: the condition still exists and now nobody knows. SPEC-NOTIFICATIONS owns the fallback itself.',current_date+90)
on conflict (feature, key) do update set
  label = excluded.label, description = excluded.description, basis = excluded.basis,
  value_type = excluded.value_type, unit = excluded.unit,
  min_value = excluded.min_value, max_value = excluded.max_value,
  allowed_values = excluded.allowed_values, default_value = excluded.default_value,
  review_due = excluded.review_due;

-- ============================================================ §18.1 shareable resource registry
-- RECORDED DECISION 3: only the eight DIR-class tokens with an unambiguous per-record route in
-- SPEC-UI-IA. A guessed url_path_template is a dead end the moment someone clicks a share link.
insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, display_label,
   url_path_template, rls_uses_has_permission, is_scopeable, is_link_shareable, is_active,
   content_role, notes)
values
  ('hr_employee','hr','employee','id','created_by','Employee','/hr/people/{id}',true,true,false,true,'container',
   'DIR: one org-audience viewer grant per record; editing needs a derived HR grant.'),
  ('hr_requisition','hr','requisition','id','created_by','Requisition','/hr/hiring/requisitions/{id}',true,false,false,true,null,
   'WORK (ruling R1): entity at personal visibility with derived recruiter/HR/hiring-manager grants.'),
  ('hr_candidate','hr','candidate','id','created_by','Candidate','/hr/hiring/candidates/{id}',true,false,false,true,null,
   'WORK (ruling R1). Never link-shareable — a candidate record is not a public object.'),
  ('hr_leave_policy','hr','leave_policy','id','created_by','Leave policy','/hr/settings/leave-policies/{id}',true,false,false,true,null,
   'DIR: org-readable, HR-editable.'),
  ('hr_asset','hr','asset','id','created_by','Asset','/hr/assets/{id}',true,false,false,true,null,
   'DIR (D24e): the company-property registry, vehicles included as an ordinary asset class.'),
  ('hr_checklist_template','hr','checklist_template','id','created_by','Checklist template','/hr/onboarding/templates/{id}',true,false,false,true,null,
   'DIR: joiner/mover/leaver templates.'),
  ('hr_course','hr','course','id','created_by','Course','/hr/training/{id}',true,false,false,true,null,
   'DIR: the course catalogue; versions are children.'),
  ('hr_survey','hr','survey','id','created_by','Survey','/hr/settings/exit-surveys/{id}',true,false,false,true,null,
   'DIR (D24d): exit, stay, onboarding, pulse and engagement surveys share this one family.')
on conflict (resource_type) do update set
  schema_name = excluded.schema_name, table_name = excluded.table_name,
  display_label = excluded.display_label, url_path_template = excluded.url_path_template,
  rls_uses_has_permission = excluded.rls_uses_has_permission,
  is_scopeable = excluded.is_scopeable, is_link_shareable = excluded.is_link_shareable,
  is_active = excluded.is_active, notes = excluded.notes;

-- ============================================================ §17.4 association types
-- RECORDED DECISION 4: `role` is `label` live, and "no conveyance" is container_side='none'.
insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
values
  -- 🚨 THE ONE THAT MATTERS MOST. No hr_employee_documents table: files attach through the one
  -- file entity. A conveying edge here would publish every I-9, medical note, offer letter and
  -- disciplinary attachment to the whole organization, because hr.employee carries an
  -- org-audience viewer grant. Personnel documents get per-file iam.permissions grants.
  ('file','hr_employee','personnel_document','none','editor',true,
   'NO CONVEYANCE (coordinator adjudication 2026-08-25). Per-file grants only — the note->web_page conveyance pattern copied here in an earlier draft was wrong.'),
  ('file','hr_employment','evidence','none','editor',true,'Attachments decided per file, never inherited.'),
  ('file','hr_incident','evidence','none','editor',true,'Investigation attachments; the narrative itself lives in hr.restricted_note.'),
  ('file','hr_application','evidence','none','editor',true,'Applicant attachments decided per file.'),
  ('file','hr_leave_case','evidence','none','editor',true,'Leave-case attachments; medical certifications live in hr.restricted_note.'),
  -- the two edges that DO convey
  ('note','hr_employee','hr_note','target','editor',true,'Free-form HR notes ride workbench.notes rather than an HR notes table.'),
  ('note','hr_candidate','hr_note','target','editor',true,'Recruiting notes ride workbench.notes.'),
  -- considered and rejected as edges, recorded so nobody re-derives them
  ('hr_candidate','party','candidate_party','none','editor',true,
   'Optional and late-bound; a plain nullable FK would do. Registered so the rejection is recorded rather than re-litigated.'),
  ('hr_course','hr_job_title','role_curriculum','none','editor',true,'Role-based training assignment is many-to-many and org-editable — the textbook association case.'),
  ('hr_credential','hr_job_title','required_credential','none','editor',true,'Which credentials a role requires; hr.shift.required_credential_ids is the denormalised per-shift copy.'),
  ('hr_employee','scope','scope_member','none','editor',true,'Department/case/client scope tagging reuses context.scopes.')
on conflict (source_type, target_type) do update set
  label = excluded.label, container_side = excluded.container_side,
  conveys_max = excluded.conveys_max, is_active = excluded.is_active, notes = excluded.notes;

-- ============================================================ §18.1 association GC triggers
do $$
declare r record;
begin
  for r in select token from platform.entity_types where schema_name = 'hr' order by token loop
    perform platform.sync_association_gc_triggers(r.token);
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
-- This file writes no DDL of its own, but sync_association_gc_triggers attaches triggers, which
-- the guard sees. Log-driven and scoped, as every file since 07.
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_14',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_bad integer; v_rules text; v_groups integer;
begin
  -- every knob group in §19.2 is represented
  select count(distinct feature) into v_groups from platform.feature_knob where feature like 'hr.%';
  if v_groups < 8 then
    raise exception 'hr_14: only % of the 8 hr.* knob groups are seeded', v_groups;
  end if;

  -- 🚨 the knob that unblocks hr.eeo_aggregate
  if not exists (select 1 from platform.feature_knob where feature='hr.hiring' and key='eeo_min_cell') then
    raise exception 'hr_14: hr.hiring.eeo_min_cell is not seeded — hr.eeo_aggregate stays fail-closed';
  end if;

  -- every hr knob carries a real basis and a review date (§19.2's closing rule)
  select count(*) into v_bad from platform.feature_knob
   where feature like 'hr.%' and (basis is null or btrim(basis) = '' or review_due is null);
  if v_bad > 0 then
    raise exception 'hr_14: % hr knob(s) have no basis or no review_due', v_bad;
  end if;

  -- R-CORE B1's closed vocabulary: no hr.* knob may use a feature slug outside the settled set
  select count(*) into v_bad from platform.feature_knob
   where feature like 'hr.%'
     and feature not in ('hr.employees','hr.time_and_attendance','hr.scheduling','hr.leave',
                         'hr.hiring','hr.onboarding','hr.training','hr.domain_wide');
  if v_bad > 0 then
    raise exception 'hr_14: % hr knob(s) use a feature slug outside the settled vocabulary', v_bad;
  end if;

  -- the shareable rows point at real tables
  select count(*) into v_bad from platform.shareable_resource_registry s
   where s.schema_name = 'hr'
     and not exists (select 1 from platform.entity_types e
                      where e.token = s.resource_type and e.schema_name = s.schema_name
                        and e.table_name = s.table_name);
  if v_bad > 0 then
    raise exception 'hr_14: % shareable row(s) do not match a registered HR token', v_bad;
  end if;

  -- 🚨 the conveyance posture: only the two note edges may convey
  select count(*) into v_bad from platform.association_types
   where (source_type like 'hr\_%' or target_type like 'hr\_%')
     and container_side <> 'none'
     and not (source_type = 'note' and target_type in ('hr_employee','hr_candidate'));
  if v_bad > 0 then
    raise exception 'hr_14: % HR association edge(s) convey when they must not', v_bad;
  end if;
  if (select container_side from platform.association_types
       where source_type='file' and target_type='hr_employee') <> 'none' then
    raise exception 'hr_14: the file->hr_employee edge conveys — every personnel document would be org-readable';
  end if;

  select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%'
     and rule <> 'org_not_null_no_backstop';
  if v_rules is not null then
    raise exception 'hr_14: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
  end if;
  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_14: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
