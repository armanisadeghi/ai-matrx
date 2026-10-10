-- HR-REVIEWS: six knobs for the standard performance review (feature hr.performance)
-- target: branch,production
-- additive: yes
-- seeds-guards: yes
-- lane: HR-REVIEWS
--
-- Organization choices for the standard review are knobs, never constants (PLAN-STANDARD row 8 and
-- change 9: keys standard_review_*, never sharing a key with review_360_*). Read by the
-- hr.hr_review_* doors through hr._hr_knob('hr.performance', <key>, <org>, <default>).
-- Inverse: migrations/inverse/hr_rev_04_standard_review_knobs_down.sql.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values, label, description,
   set_by, basis, review_due, overridable_by, override_direction, ui, propagation, public_read, delegable)
values
  ('hr.performance', 'standard_review_self_days', '14'::jsonb, '14'::jsonb, 'integer', 'days', 1, 90, null,
   'Days for the self review',
   'Days from a cycle''s creation to the self review''s due date when HR names no date.',
   'agent', 'Lattice/15Five default two weeks for the self review (lane HR-REVIEWS, 2026-10-09).',
   '2026-12-09', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'standard_review_manager_days', '21'::jsonb, '21'::jsonb, 'integer', 'days', 1, 120, null,
   'Days for the manager review',
   'Days from a cycle''s creation to the manager review''s due date when HR names no date.',
   'agent', 'One week after the self review by default (lane HR-REVIEWS, 2026-10-09).',
   '2026-12-09', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'standard_review_reminder_cadence_hours', '48'::jsonb, '48'::jsonb, 'integer', 'hours', 12, 336, null,
   'Review reminder cadence',
   'Hours between reminders to a person whose review step is still open.',
   'agent', 'Every two days by default (lane HR-REVIEWS, 2026-10-09).',
   '2026-12-09', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'standard_review_manager_sees_self', '"after_both_submit"'::jsonb, '"after_both_submit"'::jsonb,
   'enum', null, null, null, '["after_both_submit","after_employee_submits"]'::jsonb,
   'When the manager sees the self review',
   'after_both_submit keeps both reviews blind until both are in; after_employee_submits shows it once the employee submits.',
   'agent', 'Owner vision of 2026-08-25: blind dual track (STATE.md rule 2) is the default.',
   '2026-12-09', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'standard_review_calibration_required', 'false'::jsonb, 'false'::jsonb, 'boolean', null, null, null, null,
   'Calibration before sharing',
   'When on, a manager cannot share a review until HR has recorded a calibrated rating.',
   'agent', 'Off by default; larger organizations turn it on (lane HR-REVIEWS, 2026-10-09).',
   '2026-12-09', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'standard_review_ack_comment', 'true'::jsonb, 'true'::jsonb, 'boolean', null, null, null, null,
   'Employee comment on acknowledgment',
   'Whether the employee may add a comment when acknowledging their review.',
   'agent', 'On by default: disagreement is preserved, never blocked (PLAN-STANDARD row 11).',
   '2026-12-09', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true)
on conflict (feature, key) do nothing;
