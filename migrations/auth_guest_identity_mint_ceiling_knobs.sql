-- auth.guest_identity — the per-client-IP ceiling on NEW guest identities (2026-09-29).
--
-- Every account, a guest included, now gets its own organization at signup, so one
-- anonymous guest identity = an auth.users row + organization + membership + prefs +
-- plans. aidream minted one for ANY X-Fingerprint-Id with no limit, and GoTrue's own
-- per-IP anonymous-signup limit only ever sees aidream's server IP (one attacker could
-- exhaust it and lock every new guest out). aidream's guest resolver
-- (packages/matrx-ai/matrx_ai/db/_guest_registry_impl.py) now counts identities minted
-- from the caller's real IP in the window and refuses with 429 before calling GoTrue.
-- Returning guests (row already holds auth_user_id) never reach the check.
--
-- Agent-set limit (blind approval). Set by the guest-mint hardening lane on 2026-09-29.
-- Basis: a real browser mints ONE guest identity, ever (it is stored in localStorage /
-- the visitor cookie); 30 per hour leaves room for a busy office or carrier NAT sharing
-- one address while bounding a scripted flood to 720/day per address. Arman approved this
-- class of decision in advance (2026-08-20) and has NOT reviewed these numbers.
-- Review due 2026-11-13, once real usage data exists.
--
-- Platform-locked (overridable_by '{}'): abuse protection belongs to nobody's tier.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due, overridable_by)
values
  ('auth.guest_identity', 'new_identities_per_ip', '30'::jsonb, '30'::jsonb, 'integer',
   'identities', 1, 100000,
   'New guest identities per network address',
   'How many new guest (signed-out) identities one network address may create inside the window below. Each identity is a real account with its own organization. Returning guests are never counted or refused. At the ceiling a new visitor is asked to sign in or try later.',
   'agent',
   'A real browser creates one guest identity ever; 30/hour covers an office or carrier NAT sharing an address and bounds a scripted flood to 720/day per address. GoTrue''s own anonymous limit sees only our server, so this is the only per-visitor bound.',
   date '2026-11-13', '{}'),
  ('auth.guest_identity', 'new_identities_window_minutes', '60'::jsonb, '60'::jsonb, 'integer',
   'minutes', 1, 10080,
   'Guest identity ceiling window',
   'The rolling window, in minutes, over which new guest identities from one network address are counted against the ceiling above.',
   'agent',
   'One hour: long enough that a flood cannot reset itself quickly, short enough that a busy shared address recovers within the hour.',
   date '2026-11-13', '{}')
on conflict (feature, key) do update
  set label = excluded.label,
      description = excluded.description,
      basis = excluded.basis,
      unit = excluded.unit,
      min_value = excluded.min_value,
      max_value = excluded.max_value,
      default_value = excluded.default_value,
      value = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.value else excluded.value end,
      review_due = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.review_due else excluded.review_due end;
