-- The super-admin attention dock (features/admin/attention) polls every source
-- it composes on one cadence. The literal in features/admin/attention/poll.ts
-- is a KNOB MIRROR of this row (a React Query refetchInterval on a render path
-- cannot read the DB before it renders). Replaces platform.system_errors
-- outage_poll_ms, whose only consumer — PlatformOutageBanner — is now one
-- source of the dock.

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due)
VALUES
  ('platform.attention', 'poll_ms', '60000', '60000', 'integer', 'milliseconds', 15000, 600000, null,
   'How often the super-admin attention dock re-checks its sources',
   'The dock composes schedule alarms and provider outages into one card on every super-admin page. Each source is re-read on this cadence, on window focus, and after any action taken from the dock. One minute reaches the screen while the problem is still the problem, at one cheap read per source per minute per open tab.',
   'agent', 'Carried over from platform.system_errors.outage_poll_ms (2026-09-13), whose consumer became a source of the dock on 2026-09-14.',
   date '2026-11-15')
ON CONFLICT (feature, key) DO NOTHING;

DELETE FROM platform.feature_knob WHERE feature = 'platform.system_errors' AND key = 'outage_poll_ms';
