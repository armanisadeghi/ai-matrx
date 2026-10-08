-- HR-360: two knobs for the employee 360 review (feature hr.performance)
-- target: branch,production
-- additive: yes
-- seeds-guards: yes
-- lane: HR-360
--
-- Settings are knobs, never constants (plan rule: "default days to complete (14), reminder lead
-- days"). Read by matrx-frontend features/employee-performance-reviews/review-360 through
-- platform.knob_resolve('hr.performance', <key>, <org>) when a review is started.
-- Inverse: migrations/inverse/hr360_review_knobs_down.sql.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction, ui, propagation, public_read, delegable)
values
  ('hr.performance', 'review_360_days_to_complete', '14'::jsonb, '14'::jsonb, 'integer', 'days', 1, 90,
   'Days to complete a 360 review',
   'How many days the employee and the manager get to complete their halves of a 360 review. Sets the due date of both tasks.',
   'agent', 'Replaces a 14-day constant in the 360 review start (lane HR-360, plan of 2026-10-08).',
   '2026-12-08', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'review_360_reminder_lead_days', '3'::jsonb, '3'::jsonb, 'integer', 'days', 0, 30,
   '360 review reminder lead',
   'How many days before a 360 review is due its calendar entry reminds the person.',
   'agent', 'Replaces a reminder-lead constant in the 360 review calendar entry (lane HR-360).',
   '2026-12-08', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true)
on conflict (feature, key) do nothing;
