-- HR-360: the 360 review's meeting defaults and due hour become knobs; meet.observers_visible_to may be set per meeting
-- target: branch,production
-- additive: yes
-- seeds-guards: yes
-- lane: HR-360
--
-- 1. Five hr.performance knobs replace constants in features/employee-performance-reviews/review-360
--    (ReviewMeetingActions: 10:00 next day, 45 minutes, lobby off, join-before-host on; service: the
--    17:00Z due hour).
-- 2. meet.observers_visible_to gains the meet_meeting rung, so a host can say "observers are shown
--    to hosts only" for ONE meeting (the 360 review meeting does) through communication.meet_policy_set.
-- Inverse: migrations/inverse/hr360_meeting_and_due_knobs_down.sql.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction, ui, propagation, public_read, delegable)
values
  ('hr.performance', 'review_360_meeting_hour', '10'::jsonb, '10'::jsonb, 'integer', 'hour', 0, 23,
   '360 meeting start hour', 'The hour (local) a 360 review meeting is first offered, the day after it is ready.',
   'agent', 'Replaces setHours(10) in ReviewMeetingActions (lane HR-360).', '2026-12-08', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'review_360_meeting_minutes', '45'::jsonb, '45'::jsonb, 'integer', 'minutes', 15, 240,
   '360 meeting length', 'How long a 360 review meeting is scheduled for.',
   'agent', 'Replaces durationMinutes: 45 in ReviewMeetingActions (lane HR-360).', '2026-12-08', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'review_360_meeting_lobby', 'false'::jsonb, 'false'::jsonb, 'boolean', null, null, null,
   '360 meeting lobby', 'Whether people wait in a lobby before a 360 review meeting lets them in.',
   'agent', 'Replaces lobbyEnabled: false in ReviewMeetingActions (lane HR-360).', '2026-12-08', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'review_360_meeting_join_before_host', 'true'::jsonb, 'true'::jsonb, 'boolean', null, null, null,
   '360 meeting join before host', 'Whether the employee and manager may join a 360 review meeting before the HR manager.',
   'agent', 'Replaces joinBeforeHost: true in ReviewMeetingActions (lane HR-360).', '2026-12-08', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'review_360_due_hour_utc', '17'::jsonb, '17'::jsonb, 'integer', 'hour', 0, 23,
   '360 due hour (UTC)', 'The hour of the due day, in UTC, when a 360 review half is due.',
   'agent', 'Replaces the 17:00Z/16:00Z due times in review-360 (lane HR-360).', '2026-12-08', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true)
on conflict (feature, key) do nothing;
