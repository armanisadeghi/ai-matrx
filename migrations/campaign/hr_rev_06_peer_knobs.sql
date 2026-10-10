-- HR-REVIEWS: two peer-feedback knobs for the standard performance review (feature hr.performance)
-- target: branch,production
-- additive: yes
-- seeds-guards: yes
-- lane: HR-REVIEWS
--
-- PLAN-STANDARD wave 3: peer nominations (employee nominates, manager approves, peer responses are
-- response rows with role 'peer', shown to the manager and HR, to the employee only when the manager
-- shares them, anonymised by knob). Read by the hr.hr_review_peer_* doors through hr._rev_knob.
-- Inverse: migrations/inverse/hr_rev_06_peer_knobs_down.sql.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values, label, description,
   set_by, basis, review_due, overridable_by, override_direction, ui, propagation, public_read, delegable)
values
  ('hr.performance', 'standard_review_peers_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean', null, null, null, null,
   'Peer feedback in reviews',
   'When on, an employee or manager can nominate peers to give feedback on a standard review.',
   'agent', 'Off by default; peer feedback is opt-in per organization (PLAN-STANDARD row 8).',
   '2026-12-10', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true),
  ('hr.performance', 'standard_review_peer_anonymous', 'true'::jsonb, 'true'::jsonb, 'boolean', null, null, null, null,
   'Anonymous peer feedback',
   'When on, an employee shown peer feedback never sees who wrote it; the manager and HR always do.',
   'agent', 'Anonymous by default, as Lattice and Culture Amp ship peer feedback (lane HR-REVIEWS, 2026-10-10).',
   '2026-12-10', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true)
on conflict (feature, key) do nothing;
