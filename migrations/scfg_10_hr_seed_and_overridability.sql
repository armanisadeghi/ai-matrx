-- scfg_10: seed the three keys riding hr._hr_knob's rung-4 caller default
-- (census scfg_00), then declare HR's overridability. MUST precede scfg_12's
-- resolver rewrite: with rung 4 becoming a RAISE, an unseeded key is an outage,
-- and with overridable_by checked, an undeclared feature's org overrides go inert.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due)
values
  ('hr.time_and_attendance', 'punch_enabled_worker_classes',
   '["employee","intern","seasonal"]'::jsonb, '["employee","intern","seasonal"]'::jsonb,
   'json', null, null, null,
   'Punch-enabled worker classes (composite)',
   'The worker classes whose members may punch, as one array. NOTE: duplicates the four punch_enabled_worker_class_* booleans; hr.clock_state and hr.punch_record read this composite key while hr._time_punch_enabled_worker_classes reads the booleans — convergence to one shape is a recorded follow-up.',
   'agent',
   'Matches the rung-4 default hr.clock_state and hr.punch_record carried in code; seeded so the resolver can refuse unseeded keys instead of silently defaulting.',
   '2026-10-15'),
  ('hr.time_and_attendance', 'kiosk_pending_recheck_seconds',
   '10'::jsonb, '10'::jsonb, 'integer', 'seconds', 3, 300,
   'Kiosk pending-trust recheck interval',
   'How often a kiosk in pending trust state rechecks for approval.',
   'agent',
   'Matches the rung-4 default hr._kiosk_device_config and hr_kiosk_session_heartbeat carried in code.',
   '2026-10-15'),
  ('hr.time_and_attendance', 'web_punch_ip_verification',
   '"off"'::jsonb, '"off"'::jsonb, 'string', null, null, null,
   'Web punch IP verification (legacy fallback key)',
   'Fallback mode consulted when ip_verification_mode resolves null at a web punch. Legacy twin of ip_verification_mode — convergence to one key is a recorded follow-up.',
   'agent',
   'Matches the rung-4 default hr.punch_record carried in code.',
   '2026-10-15')
on conflict (feature, key) do nothing;

-- Overridability curation (the seed-never-touches-curation rule from scfg_01
-- means this dedicated migration is the ONLY writer of these columns).
-- Every hr.* key becomes org + sub-org overridable — mirroring what
-- public.hr_knob_set already offered — EXCEPT the two knobs their own module
-- docstrings declare platform-locked.
update platform.feature_knob
   set overridable_by = '{organization,employer_profile,pay_group,location}'
 where feature like 'hr.%'
   and not (feature = 'hr.jurisdiction_rules' and key = 'advisory_rules_block_money')
   and not (feature = 'hr.time_and_attendance' and key = 'show_raw_alongside_rounded');

update platform.feature_knob
   set overridable_by = '{}'
 where (feature = 'hr.jurisdiction_rules' and key = 'advisory_rules_block_money')
    or (feature = 'hr.time_and_attendance' and key = 'show_raw_alongside_rounded');
