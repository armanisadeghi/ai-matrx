-- HR domain L3 — migration 2 of 7 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE §13 CONFIGURATION REGISTER, AND THE CONFIG-TIME ROUNDING GATE. Every SPEC-TIME §13 knob that
-- was not already live is registered under `hr.time_and_attendance` with `basis` populated, and
-- `hr.time_rounding_config_check` becomes the settings surface's single door onto C5's config
-- validator — three visibly different outcomes, because a warning that looks like a rejection
-- trains people to ignore rejections.
--
-- Authority: SPEC-TIME §10, §13 (D11: `hr.time_and_attendance`, snake_case), §8, §4.4–§4.7, §4.9;
-- SPEC-JURISDICTION §6.2 fixtures `RND-02` / `RND-03` / `RND-04`;
-- /policies/limits-are-knobs-agents-set-them.md. Applied live as
-- `hr_l3_21_knobs_and_config_validation`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 `punch_enabled_worker_classes` IS DECOMPOSED INTO FOUR BOOLEANS, AND THAT IS WHAT MAKES
--    "CONTRACTOR IS NOT AN ACCEPTED VALUE" STRUCTURAL RATHER THAN VALIDATED. §13 registers it as a
--    JSON array; `platform.feature_knob.value_type` admits only `number|integer|boolean|string|enum`
--    under a live CHECK (the same blocker HRB-004 and HRB-012 hit), and this lane does not alter
--    that CHECK. So the set becomes one boolean per admissible class:
--      punch_enabled_worker_class_employee   true
--      punch_enabled_worker_class_intern     true
--      punch_enabled_worker_class_seasonal   true
--      punch_enabled_worker_class_volunteer  false
--    There is NO `…_contractor` row and there never will be. §8's rule ("contractor is never addable
--    to that knob") stops being a predicate somebody has to remember to write and becomes a key that
--    does not exist. A gated class is still excluded from the grid ENTIRELY, not shown with zeros.
--    OWED: SPEC-TIME §13's array row is recorded as these four scalars.
--
-- 2. `approaching_ot_axes` DECOMPOSES THE SAME WAY, FOR THE SAME REASON — four booleans, all true,
--    one per resolved threshold axis (`weekly`, `daily`, `doubletime`, `consecutive_day`).
--
-- 3. `ot_alert_channels` IS A MAP OF LISTS AND BECOMES THREE `string` ROWS, FOLLOWING THE LIVE
--    PRECEDENT rather than inventing one. `hr.workflow.route_absent_approver_action` already holds
--    an ordered list as a comma-separated `string`. Three rows — `_employee`, `_manager`, `_hr` —
--    carry §4.5's declared defaults. The per-user rung stays `communication.notification_preference`,
--    and the role→tier routing stays the D24g principal panel; neither is a knob this lane owns.
--
-- 4. `web_punch_ip_allowlist` REGISTERS AS AN EMPTY `string`, AND THE EMPTY VALUE IS THE LAW.
--    §4.7: "an empty allowlist never blocks anything — an unconfigured allowlist means 'not
--    configured', never 'deny all'". A CIDR list is per-org, per-location data rather than a
--    platform default, and its platform default is genuinely empty, so an empty string is an honest
--    register entry rather than a shape violation. The org rung will need a data table when a real
--    org configures one; that is recorded as a deferral, not built on speculation.
--
-- 5. 🚨 THE REGISTER HAS NO WAY TO SAY "NOT ORG-OVERRIDABLE", SO THE PROHIBITION IS WRITTEN IN THE
--    `basis` WITH A MATCHABLE PREFIX AND THE MISSING COLUMN IS RECORDED AS A DEBT. §13 and §10 both
--    make `show_raw_alongside_rounded` platform-only, the same posture as
--    `hr.jurisdiction_rules.advisory_rules_block_money`. But `platform.feature_knob` has no
--    organization column and its `set_by` CHECK admits only `agent|human` (proven live: a
--    `set_by='platform'` insert is refused), so there is no structural marker to set. The row's
--    `basis` therefore OPENS with the exact string `PLATFORM-ONLY - NEVER ORG-OVERRIDABLE.` so the
--    org-override surface can refuse the key by matching it rather than by carrying a hard-coded
--    list. This is a workaround and it is named as one.
--    OWED: `platform.feature_knob` gains an `org_overridable boolean` (or equivalent), which is the
--    only thing that makes this a rule instead of a convention.
--
-- 6. FOUR SPEC-UI-IA §10 ROWS ARE ABSENT AND ARE **NOT** REGISTERED HERE. `hr.clock.web_punch_enabled`,
--    `hr.clock.kiosk_enabled`, `hr.timesheet.attestation_required` and `hr.timesheet.bulk_approve_enabled`
--    do not exist live and belong to SPEC-UI-IA / lane L1. Registering them under this lane's
--    namespace would create the fifth competing namespace D11 just finished collapsing. Recorded as
--    a debt against SPEC-UI-IA / L1, and this lane READS them when they land.
--
-- 7. `web_punch_ip_verification` IS NOT REGISTERED BECAUSE IT IS ALREADY LIVE UNDER ANOTHER NAME.
--    `hr.time_and_attendance.ip_verification_mode` (default `off`) is the same knob §13 calls
--    `web_punch_ip_verification`. One knob, one row: the live name wins and §13's name is an alias
--    to correct. Its `allowed_values` are set here to §4.7's three postures.
--
-- 8. 🚨 THE ROUNDING GATE DOES NOT REIMPLEMENT NEUTRALITY — IT CALLS C5's `hr.validate_org_config`.
--    A second implementation of a live rule drifts on the first spec change. `hr.validate_org_config
--    (org, 'rounding-bounds', params, jurisdiction_keys, as_of)` is what fixtures `RND-02`/`RND-03`/
--    `RND-04` already exercise green. This lane's contribution is the SURFACE contract: it maps that
--    envelope onto exactly three named outcomes with three different headlines, so the settings
--    screen cannot render a warning as a rejection. `mode='down'` and an over-bound increment come
--    back `rejected`; a California org gets `accepted_with_warning` and its setting is SAVED.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. the §13 knobs
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
select 'hr.time_and_attendance', v.key, v.val, v.val, v.vtype, v.unit, v.minv, v.maxv, v.allowed,
       v.label, v.descr, v.set_by, v.basis, (current_date + interval '180 days')::date
from (values
 -- ---- rounding honesty (§10)
 ('show_raw_alongside_rounded','true'::jsonb,'boolean',null,null,null,null,
  'Show raw values beside rounded ones',
  'Whether an interval whose rounding delta is non-zero renders the raw in/out beside the paid in/out.',
  'agent',
  'PLATFORM-ONLY - NEVER ORG-OVERRIDABLE. SPEC-TIME §10 and §13, the same posture as hr.jurisdiction_rules.advisory_rules_block_money. Honesty about how a figure was derived is not an organization''s preference to switch off. platform.feature_knob has no org_overridable column and set_by admits only agent|human, so this sentence IS the marker: an org-override surface refuses any key whose basis opens with it (RD 5).'),

 -- ---- attestation and approval (§2.2, §7.1)
 ('attestation_statement','"I confirm that the hours shown are a complete and accurate record of the time I worked, that I took the meal and rest breaks recorded, and that I have reported any that I did not."'::jsonb,'string',null,null,null,null,
  'Attestation statement',
  'The exact text an employee attests to at period close.',
  'agent',
  'SPEC-TIME §2.2 and §13: org-overridable, and the text SHOWN is copied onto hr.pay_period_employment.attestation_statement at the moment of attestation. An org editing this later must never retroactively change what an employee agreed to.'),
 ('attestation_due_hours_after_period_end','24'::jsonb,'integer','hours',1,336,null,
  'Attestation deadline',
  'Hours after the pay period ends by which an employee must attest before reminders escalate.',
  'agent',
  'SPEC-TIME §13 platform default 24. Chosen so the deadline lands the day after the period closes, ahead of the 48-hour manager approval window. Reminders fire N times and then the step auto-closes as not_attested — it NEVER auto-attests (§2.2).'),
 ('approval_due_hours_after_period_end','48'::jsonb,'integer','hours',1,336,null,
  'Manager approval deadline',
  'Hours after the pay period ends by which a manager must decide a timecard.',
  'agent',
  'SPEC-TIME §13 platform default 48, matching the live timecard_approval definition''s sla_hours so the flow and the register agree.'),

 -- ---- export posture (§7.2)
 ('export_blocks_on_open_dispute','false'::jsonb,'boolean',null,null,null,null,
  'An open dispute blocks the export',
  'Whether an unresolved employee disagreement stops a payroll export run.',
  'agent',
  'SPEC-TIME §13 platform default false: the dispute TRAVELS to the export as evidence rather than blocking pay. Blocking would withhold correct hours over a disagreement about some of them.'),
 ('export_auto_run_on_approval','false'::jsonb,'boolean',null,null,null,null,
  'Auto-generate the export on period approval',
  'Whether approving a period immediately generates the payroll export.',
  'agent',
  'SPEC-TIME §13 platform default false. Generating a payroll file is a deliberate act with a pre-run manifest; nobody should discover one was produced.'),

 -- ---- the grid (§6.2)
 ('variance_warn_minutes','15'::jsonb,'integer','minutes',0,480,null,
  'Scheduled-vs-actual highlight threshold',
  'Minutes of variance against the schedule past which route 28 highlights the row.',
  'agent',
  'SPEC-TIME §13 platform default 15. A display threshold only: it never adjusts pay, and where no schedule exists the column reads "Not scheduled", never 0.'),

 -- ---- punch hygiene (§3.4)
 ('near_duplicate_punch_window_seconds','120'::jsonb,'integer','seconds',10,3600,null,
  'Near-duplicate flag window',
  'Seconds within which a second punch of the same kind is flagged as a suspected duplicate.',
  'agent',
  'SPEC-TIME §13 and §3.4 platform default 120. A near duplicate is WRITTEN and flagged, never refused — refusing it would lose a fact. Distinct from exact idempotency-key duplicates, which collapse as a success.'),

 -- ---- worker-class gating (§8, RD 1)
 ('punch_enabled_worker_class_employee','true'::jsonb,'boolean',null,null,null,null,
  'Employees may punch',
  'Whether worker_class=employee may use the time clock.',
  'agent',
  'SPEC-TIME §8 default set ["employee","intern","seasonal"]. Decomposed to scalars because platform.feature_knob.value_type admits no array (RD 1). There is deliberately NO contractor key: §8 makes contractor punching a worker-classification hazard the product will not offer.'),
 ('punch_enabled_worker_class_intern','true'::jsonb,'boolean',null,null,null,null,
  'Interns may punch','Whether worker_class=intern may use the time clock.','agent',
  'SPEC-TIME §8 default set includes intern. See punch_enabled_worker_class_employee for why this is a scalar and why no contractor key exists.'),
 ('punch_enabled_worker_class_seasonal','true'::jsonb,'boolean',null,null,null,null,
  'Seasonal workers may punch','Whether worker_class=seasonal may use the time clock.','agent',
  'SPEC-TIME §8 default set includes seasonal. See punch_enabled_worker_class_employee.'),
 ('punch_enabled_worker_class_volunteer','false'::jsonb,'boolean',null,null,null,null,
  'Volunteers may punch','Whether worker_class=volunteer may use the time clock.','agent',
  'SPEC-TIME §8: off by default. An org tracking volunteer hours for grant reporting turns this on — and volunteers still NEVER produce OT, premiums or export lines, because those come from earning codes and rules, not from the punch lane.'),

 -- ---- geo / photo posture (§4.9)
 ('geo_required_web_punch','false'::jsonb,'boolean',null,null,null,null,
  'Capture geo on web punches',
  'Whether the web clock requests a location fix on every punch.',
  'agent',
  'SPEC-TIME §4.9 RULED (Arman, 2026-08-25): OFF by default, capture path built complete, on-state visible to the employee. A denied browser permission produces a punch with geo_missing and an exception — never a refused punch.'),
 ('max_geo_accuracy_m','200'::jsonb,'integer','metres',10,10000,null,
  'Geo accuracy ceiling',
  'Accuracy in metres beyond which a captured fix is recorded as unreliable.',
  'agent',
  'SPEC-TIME §13 platform default 200. Poor accuracy is RECORDED, not rejected (§2.1) — a weak GPS fix must never cost somebody a punch.'),

 -- ---- the OT unit (§9)
 ('workweek_start_day','"sunday"'::jsonb,'enum',null,null,null,
  '["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]'::jsonb,
  'Workweek start day',
  'The day the overtime workweek begins.',
  'agent',
  'SPEC-TIME §13 platform default sunday. STAMPED per workweek at creation (hr.workweek.week_start_dow); changing it never re-cuts history, which is why the timesheet block header names the stamped value rather than the current setting.'),
 ('workday_start_local','"00:00"'::jsonb,'string',null,null,null,null,
  'Workday start (local)',
  'The 24-hour window daily overtime is measured over.',
  'agent',
  'SPEC-TIME §13 platform default 00:00. A separate axis from day-column placement (§9 rule 5): where this is not 00:00 the interval detail shows BOTH attributions, because for a 04:00-workday org they are routinely different.'),

 -- ---- kiosk behaviour (§3.3)
 ('kiosk_time_authority','"server"'::jsonb,'enum',null,null,null,'["server","device"]'::jsonb,
  'Kiosk time authority',
  'Which timestamp the engines use when device and server clocks disagree.',
  'agent',
  'SPEC-TIME §3.3 platform default server. BOTH timestamps are always stored: skew is corrected, never rewritten.'),
 ('kiosk_cross_location_punch','"allow_with_flag"'::jsonb,'enum',null,null,null,
  '["allow","allow_with_flag","block"]'::jsonb,
  'Punching at another location',
  'What happens when an employee punches at a kiosk outside their assigned location.',
  'agent',
  'SPEC-TIME §3.3 platform default allow_with_flag: the punch is stamped location_mismatch and raises an exception. A multi-site worker is never blocked.'),
 ('kiosk_heartbeat_seconds','60'::jsonb,'integer','seconds',10,3600,null,
  'Idle-screen heartbeat interval',
  'How often the kiosk idle screen re-checks its trust state.',
  'agent',
  'SPEC-TIME §3.3 platform default 60. This is the upper bound on how long a revoked device can keep taking punches, so it is a security value, not a polling preference.'),
 ('kiosk_confirm_dismiss_seconds','5'::jsonb,'integer','seconds',1,120,null,
  'Confirmation card auto-dismiss',
  'Seconds the kiosk confirmation card stays up before returning to idle.',
  'agent',
  'SPEC-TIME §3.3 platform default 5. Long enough for the next person not to read the last person''s name off the screen is the constraint, not comfort.'),

 -- ---- overtime pre-approval and alerts, D24a (§4.4–§4.6, RD 2, RD 3)
 ('approaching_ot_buffer_minutes','15'::jsonb,'integer','minutes',0,480,null,
  'Approaching-OT alert buffer',
  'How far before a resolved threshold the approaching-overtime alert fires.',
  'agent',
  'SPEC-TIME §4.5 platform default 15. Fires once per (employment, workweek, threshold_axis) — the dedupe key is what stops a 40-hour week producing eleven notifications.'),
 ('approaching_ot_grace_minutes','0'::jsonb,'integer','minutes',0,480,null,
  'Unapproved-OT exception grace',
  'How far past a threshold an employee may go before the unapproved_overtime exception opens.',
  'agent',
  '🚨 SPEC-TIME §4.5: NEVER affects what is computed or paid. The moment a threshold is crossed, OT is computed and owed regardless of grace, buffer, alert or approval. Platform default 0; the knob exists so a manager is not paged over a two-minute overrun.'),
 ('approaching_ot_axis_weekly','true'::jsonb,'boolean',null,null,null,null,
  'Alert on the weekly threshold','Whether the weekly OT threshold produces an approaching-OT alert.','agent',
  'SPEC-TIME §4.5 default: all applicable axes alert. Decomposed from the approaching_ot_axes array (RD 2).'),
 ('approaching_ot_axis_daily','true'::jsonb,'boolean',null,null,null,null,
  'Alert on the daily threshold','Whether the daily OT threshold produces an approaching-OT alert.','agent',
  'SPEC-TIME §4.5 default: all applicable axes alert. Applies where the jurisdiction has a daily threshold at all (California does; federal does not).'),
 ('approaching_ot_axis_doubletime','true'::jsonb,'boolean',null,null,null,null,
  'Alert on the double-time threshold','Whether the double-time threshold produces an approaching-OT alert.','agent',
  'SPEC-TIME §4.5 default: all applicable axes alert.'),
 ('approaching_ot_axis_consecutive_day','true'::jsonb,'boolean',null,null,null,null,
  'Alert on the consecutive-day threshold','Whether the 7th-consecutive-day threshold produces an approaching-OT alert.','agent',
  'SPEC-TIME §4.5 default: all applicable axes alert. California''s 7th-day rule is the case this exists for.'),
 ('ot_alert_channels_employee','"push,sms,in_app"'::jsonb,'string',null,null,null,null,
  'OT alert channels — the employee',
  'Default channels for the approaching-OT alert to the employee, before the per-user rung.',
  'agent',
  'SPEC-TIME §4.5: the employee is the only person who can stop working, so this is the one recipient that gets SMS. Comma-separated following the live hr.workflow.route_absent_approver_action precedent (RD 3).'),
 ('ot_alert_channels_manager','"push,in_app"'::jsonb,'string',null,null,null,null,
  'OT alert channels — the manager',
  'Default channels for the approaching-OT alert to the manager.',
  'agent',
  'SPEC-TIME §4.5: the manager is the only person who can authorize it. No SMS — money and record events never default to SMS.'),
 ('ot_alert_channels_hr','"in_app"'::jsonb,'string',null,null,null,null,
  'OT alert channels — HR and payroll',
  'Default channels for the approaching-OT alert to HR and payroll.',
  'agent',
  'SPEC-TIME §4.5: to HR it is a cost signal, not an interruption — in-app digest only.'),
 ('ot_preapproval_decision_sla_hours','4'::jsonb,'integer','hours',1,168,null,
  'OT pre-approval decision deadline',
  'Hours a manager has to decide an overtime pre-approval before it escalates.',
  'agent',
  'SPEC-TIME §4.4 platform default 4 — overtime is decided the same shift or not at all. On expiry the request ESCALATES; it never auto-approves and never auto-denies.'),
 ('unapproved_ot_opens_exception','true'::jsonb,'boolean',null,null,null,null,
  'Unapproved OT opens a reviewable exception',
  'Whether overtime worked without a matching approval raises an exception for a human to review.',
  'agent',
  '🚨 SPEC-TIME §4.6: setting this false STILL PAYS and STILL RECORDS — it removes only the review gate. Whether unapproved overtime is paid is a law, not a knob, and no value of this key changes it.'),

 -- ---- remote-worker validation, D24l (§4.7, RD 4)
 ('remote_worker_validation','"attest"'::jsonb,'enum',null,null,null,'["none","attest","geo"]'::jsonb,
  'Remote-worker validation',
  'What a remote position assignment is asked for instead of an IP check.',
  'agent',
  'SPEC-TIME §4.7 platform default attest. Evaluated BEFORE IP verification: a remote assignment under none or attest is never subject to block. IP verification exists to catch a shared credential punching from a beach, not to punish a distributed workforce for existing.'),
 ('web_punch_ip_allowlist','""'::jsonb,'string',null,null,null,null,
  'Web punch IP allowlist',
  'Comma-separated CIDR ranges checked when IP verification is on. Empty means not configured.',
  'agent',
  '🚨 SPEC-TIME §4.7: an EMPTY allowlist never blocks anything — an unconfigured allowlist means "not configured", never "deny all". The platform default is genuinely empty. Per-org, per-location lists are data and will need a table when a real org configures one (RD 4).')
) as v(key,val,vtype,unit,minv,maxv,allowed,label,descr,set_by,basis)
on conflict (feature, key) do nothing;

-- ---- allowed_values corrections on two rows that already existed without them (§14 D5, RD 7)
update platform.feature_knob
   set allowed_values = '["nearest","up"]'::jsonb,
       description = 'Rounding direction. "down" is rejected by the neutrality predicate (fixture RND-02).',
       basis = 'SPEC-TIME §14 D5: the column may carry the wider enum, but the config validator accepts nearest and up and REJECTS down. "up" is always employee-favourable and therefore neutral-or-better; "down" always moves time in one direction and fails the neutrality test.'
 where feature = 'hr.time_and_attendance' and key = 'rounding_mode'
   and allowed_values is distinct from '["nearest","up"]'::jsonb;

update platform.feature_knob
   set allowed_values = '["off","warn","block"]'::jsonb,
       label = 'Web punch IP verification',
       description = 'off records source_ip and checks nothing; warn writes the punch stamped ip_mismatch and raises an exception; block refuses with a plain sentence naming who to contact.',
       basis = 'SPEC-TIME §4.7 (D24l), platform default off. This is the live name for the knob §13 calls web_punch_ip_verification — one knob, one row (RD 7). Two rules keep block from becoming a defect: an empty allowlist never blocks anything, and a refusal always names a human path.'
 where feature = 'hr.time_and_attendance' and key = 'ip_verification_mode'
   and allowed_values is distinct from '["off","warn","block"]'::jsonb;

-- ============================================================ 2. the config-time rounding gate (RD 8)
create or replace function hr.time_rounding_config_check(
  p_organization_id   uuid,
  p_rounding_minutes  integer,
  p_rounding_mode     text,
  p_jurisdiction_keys text[] default null,
  p_as_of             date default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_as_of date := coalesce(p_as_of, current_date);
  v_keys  text[] := p_jurisdiction_keys;
  v_res   jsonb;
  v_outcome text;
begin
  if p_organization_id is null then
    return jsonb_build_object('granted', false, 'reason', 'organization_id_required',
      'detail', 'NO NULL ORG: a configuration check is always about one organization''s settings');
  end if;
  if p_rounding_minutes is null or p_rounding_minutes < 0 then
    return jsonb_build_object('granted', false, 'reason', 'rounding_minutes_required',
      'detail', 'the rounding increment must be zero or a positive number of minutes');
  end if;
  if coalesce(btrim(p_rounding_mode),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'rounding_mode_required',
      'detail', 'a rounding mode is required; the platform default is "nearest"');
  end if;

  -- The jurisdictions this org actually operates in, unless the caller named a set.
  if v_keys is null or cardinality(v_keys) = 0 then
    select coalesce(array_agg(distinct j.jurisdiction_key), '{}'::text[]) into v_keys
      from hr.location l
      join hr.jurisdiction j on j.id = l.jurisdiction_id
     where l.organization_id = p_organization_id and l.deleted_at is null;
  end if;
  if v_keys is null or cardinality(v_keys) = 0 then v_keys := ARRAY['US']; end if;

  -- 🚨 ONE implementation of neutrality, and it is C5's. Fixtures RND-02/03/04 exercise it.
  v_res := hr.validate_org_config(p_organization_id, 'rounding-bounds',
             jsonb_build_object('mode', p_rounding_mode, 'increment_minutes', p_rounding_minutes),
             v_keys, v_as_of);

  -- Zero rounding is always lawful and is the platform default; it can never be refused.
  if p_rounding_minutes = 0 then
    return jsonb_build_object(
      'granted', true, 'outcome', 'accepted',
      'headline', 'No rounding. Saved.',
      'detail', 'Not rounding is always lawful, and it is what this platform ships with.',
      'may_save', true, 'jurisdictions_checked', v_keys, 'as_of', v_as_of, 'engine', v_res);
  end if;

  if coalesce((v_res ->> 'violation_count')::integer, 0) > 0 then
    v_outcome := 'rejected';
    return jsonb_build_object(
      'granted', true, 'outcome', v_outcome,
      'headline', 'This rounding setting cannot be saved.',
      'detail', coalesce(
         (select string_agg(x ->> 'message', ' ')
            from jsonb_array_elements(v_res -> 'violations') x
           where x ->> 'message' is not null),
         'the configuration fails a jurisdiction rule'),
      'may_save', false,
      'violations', v_res -> 'violations',
      'warnings', v_res -> 'warnings',
      'jurisdictions_checked', v_keys, 'as_of', v_as_of, 'engine', v_res);
  end if;

  if coalesce((v_res ->> 'warning_count')::integer, 0) > 0 then
    -- 🚨 §10: an advisory rule never blocks a customer. This SAVES, and it says something
    -- visibly different from a rejection, because a warning that reads like a refusal trains
    -- people to ignore refusals.
    v_outcome := 'accepted_with_warning';
    return jsonb_build_object(
      'granted', true, 'outcome', v_outcome,
      'headline', 'Saved, with something you should know.',
      'detail', coalesce(
         (select string_agg(x ->> 'message', ' ')
            from jsonb_array_elements(v_res -> 'warnings') x
           where x ->> 'message' is not null),
         'a rule we have not yet verified suggests this value may be too high'),
      'may_save', true,
      'violations', '[]'::jsonb,
      'warnings', v_res -> 'warnings',
      'jurisdictions_checked', v_keys, 'as_of', v_as_of, 'engine', v_res);
  end if;

  return jsonb_build_object(
    'granted', true, 'outcome', 'accepted',
    'headline', 'Saved.',
    'detail', format('Rounding to the nearest %s minutes, mode "%s", checked against %s.',
                     p_rounding_minutes, p_rounding_mode, array_to_string(v_keys, ', ')),
    'may_save', true, 'violations', '[]'::jsonb, 'warnings', '[]'::jsonb,
    'jurisdictions_checked', v_keys, 'as_of', v_as_of, 'engine', v_res);
end $fn$;

comment on function hr.time_rounding_config_check is
  'SPEC-TIME §10 / L3-42 — config-time rounding validation, not render-time. Three visibly different outcomes: rejected (mode=down, RND-02; increment over the federal bound, RND-03), accepted_with_warning (a California org configuring any rounding, RND-04 — it SAVES), accepted. Neutrality itself is C5''s hr.validate_org_config; this is the surface contract over it.';

create or replace function public.hr_time_rounding_config_check(
  p_organization_id   uuid,
  p_rounding_minutes  integer,
  p_rounding_mode     text,
  p_jurisdiction_keys text[] default null,
  p_as_of             date default null)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.time_rounding_config_check($1,$2,$3,$4,$5);
$fn$;

comment on function public.hr_time_rounding_config_check is
  'PostgREST-reachable wrapper for hr.time_rounding_config_check. The `hr` schema is not exposed to PostgREST (verified live against pgrst.db_schemas), so every RPC a client calls ships a thin public.hr_<name> delegate carrying no logic of its own (R-L3 U-03 / TD-1).';

revoke all on function hr.time_rounding_config_check(uuid,integer,text,text[],date) from public;
grant execute on function hr.time_rounding_config_check(uuid,integer,text,text[],date)
  to authenticated, service_role;
revoke all on function public.hr_time_rounding_config_check(uuid,integer,text,text[],date) from public, anon;
grant execute on function public.hr_time_rounding_config_check(uuid,integer,text,text[],date)
  to authenticated, service_role;

-- ============================================================ assertions
do $$
declare v_n integer; v jsonb;
begin
  select count(*) into v_n from platform.feature_knob where feature = 'hr.time_and_attendance';
  if v_n < 58 then
    raise exception 'hr_l3_21: hr.time_and_attendance holds only % knobs; the §13 register was not fully seeded', v_n;
  end if;

  -- every row this lane owns carries a basis (D13 / limits-are-knobs)
  select count(*) into v_n from platform.feature_knob
   where feature = 'hr.time_and_attendance' and coalesce(btrim(basis),'') = '';
  if v_n > 0 then
    raise exception 'hr_l3_21: % time knobs carry no basis', v_n;
  end if;

  -- 🚨 RD 1: contractor is structurally unrepresentable
  if exists (select 1 from platform.feature_knob
              where feature = 'hr.time_and_attendance' and key like 'punch_enabled_worker_class_%'
                and key like '%contractor%') then
    raise exception 'hr_l3_21: a punch_enabled_worker_class_contractor key exists — §8 forbids it';
  end if;
  select count(*) into v_n from platform.feature_knob
   where feature = 'hr.time_and_attendance' and key like 'punch_enabled_worker_class_%';
  if v_n <> 4 then
    raise exception 'hr_l3_21: expected 4 punch_enabled_worker_class_* rows, found %', v_n;
  end if;

  -- RD 5: the platform-only row carries the matchable prohibition, in words
  if not exists (select 1 from platform.feature_knob
                  where feature = 'hr.time_and_attendance' and key = 'show_raw_alongside_rounded'
                    and basis like 'PLATFORM-ONLY - NEVER ORG-OVERRIDABLE.%') then
    raise exception 'hr_l3_21: show_raw_alongside_rounded must carry the platform-only marker in its basis';
  end if;

  -- RD 8: the three outcomes are visibly different, proven by calling the shipped function
  v := hr.time_rounding_config_check('5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid, 15, 'down',
                                     ARRAY['US-TX'], '2026-03-16'::date);
  if v ->> 'outcome' <> 'rejected' or (v ->> 'may_save')::boolean then
    raise exception 'hr_l3_21: RND-02 (mode=down) did not reject: %', v;
  end if;
  v := hr.time_rounding_config_check('5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid, 30, 'nearest',
                                     ARRAY['US-TX'], '2026-03-16'::date);
  if v ->> 'outcome' <> 'rejected' then
    raise exception 'hr_l3_21: RND-03 (increment over the federal bound) did not reject: %', v;
  end if;
  v := hr.time_rounding_config_check('5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid, 10, 'nearest',
                                     ARRAY['US-CA'], '2026-03-16'::date);
  if v ->> 'outcome' <> 'accepted_with_warning' or not (v ->> 'may_save')::boolean then
    raise exception 'hr_l3_21: RND-04 (a California org rounding) must WARN and SAVE, not reject: %', v;
  end if;
  v := hr.time_rounding_config_check('5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid, 15, 'nearest',
                                     ARRAY['US-TX'], '2026-03-16'::date);
  if v ->> 'outcome' <> 'accepted' then
    raise exception 'hr_l3_21: a lawful federal setting did not accept: %', v;
  end if;
end $$;
