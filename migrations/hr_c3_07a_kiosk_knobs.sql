-- HR domain C3 — migration 7a (register item HRB-007, lane core-c3-access).
--
-- 🚨 THREE OF SPEC-ACCESS §10's SEVEN KIOSK KNOBS WERE NEVER SEEDED, and a probe found it the only
-- way it can be found: `hr._knob` raised on the first live `hr_set_employment_pin` call. That raise
-- is D13 working exactly as designed — a missing knob RAISES rather than falling back to a
-- hard-coded value — and the fix is the seed, never a fallback.
--
-- The kiosk knobs live under the `hr.time_and_attendance` slug because R-CORE-READINESS B2 moved
-- them there by BEHAVIOUR ownership (SPEC-TIME owns kiosk behaviour, as SPEC-ACCESS §10 itself
-- says). Only the slug moved: the register entry is still SPEC-ACCESS §10's, which is why this
-- lane owns the seed. File 14 of the schema build seeded four of the seven
-- (kiosk_session_ttl_hours, kiosk_require_photo, kiosk_require_geo, kiosk_max_clock_skew_seconds);
-- these are the three §10 names that the kiosk auth primitives actually read.
--
-- Authority: SPEC-ACCESS §10, §6.3; D13. Applied live as `hr_c3_07a_kiosk_knobs`. Idempotent.

set local statement_timeout = '120s';
set local lock_timeout = '20s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
values
('hr.time_and_attendance','kiosk_pin_length','4'::jsonb,'4'::jsonb,'integer','digits',4,8,null,
 'Kiosk PIN length','How many digits an employment PIN must have.','agent',
 'Four digits is what every time clock in the world uses and what a break-room queue will tolerate; the second factor here is the DEVICE secret, not PIN entropy, and lockout after five attempts is what actually bounds a guessing attack. Orgs that want six can raise it.',current_date+90),
('hr.time_and_attendance','kiosk_pin_max_attempts','5'::jsonb,'5'::jsonb,'integer',null,3,10,null,
 'Kiosk PIN maximum attempts','Wrong PINs before the employment PIN locks.','agent',
 'Five absorbs an honest mis-type on a greasy tablet twice over while making a 10,000-space guess hopeless at one attempt per lockout window. Lower than three would strand people at shift start, which is the over-tightening failure this domain weighs as heavily as a leak.',current_date+90),
('hr.time_and_attendance','kiosk_lockout_minutes','15'::jsonb,'15'::jsonb,'integer','minutes',1,120,null,
 'Kiosk lockout minutes','How long an employment PIN stays locked after too many wrong attempts.','agent',
 'Long enough to make guessing pointless, short enough that somebody who fat-fingered their PIN at the start of a shift is not sent home. A manager override is the escape hatch for the rest.',current_date+90)
on conflict (feature, key) do update set
  default_value = excluded.default_value, value_type = excluded.value_type, unit = excluded.unit,
  min_value = excluded.min_value, max_value = excluded.max_value, label = excluded.label,
  description = excluded.description, basis = excluded.basis;

-- ============================================================ assertions
do $$
declare v_missing text;
begin
  -- every knob the access + kiosk lane actually reads must resolve, or D13 turns a working
  -- feature into a raise at the worst possible moment
  select string_agg(k, ', ') into v_missing from unnest(ARRAY[
    'hr.access|manager_visibility_depth',
    'hr.access|break_glass_grant_ttl_minutes',
    'hr.access|ssn_reveal_daily_alert_threshold',
    'hr.access|employee_can_see_own_access_log',
    'hr.approvals|top_of_chart_approver',
    'hr.approvals|delegation_max_horizon_days',
    'hr.approvals|delegation_max_depth',
    'hr.onboarding|access_shutoff_mode',
    'hr.domain_wide|break_glass_justification_min_chars',
    'hr.time_and_attendance|kiosk_pin_length',
    'hr.time_and_attendance|kiosk_pin_max_attempts',
    'hr.time_and_attendance|kiosk_lockout_minutes',
    'hr.time_and_attendance|kiosk_session_ttl_hours']) as k
   where not exists (select 1 from platform.feature_knob fk
                      where fk.feature = split_part(k,'|',1) and fk.key = split_part(k,'|',2));
  if v_missing is not null then
    raise exception 'hr_c3_07a: the access lane reads knobs that are not seeded: %', v_missing;
  end if;
end $$;
