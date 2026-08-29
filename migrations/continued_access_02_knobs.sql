-- continued_access_02 — THE ORG KNOBS (seed + deliberate overridability curation).
--
-- RECORD of a live change applied via the Supabase MCP on 2026-08-29.
--
-- Arman's standing doctrine: opinion decisions become KNOBS, never rulings and never code. All
-- three of his choices for this primitive land on the ONE existing scoped-configuration
-- primitive (systems/platform/feature-knobs/FEATURE.md). Building a parallel settings mechanism
-- for this feature is banned -- HR, extensibility and esign each did that before 2026-08-29 and
-- all three were consolidated back onto this store.
--
-- 🚨 DEFAULTS ARE FALSE ON PURPOSE. Arman: "It is something that we can make optionally
-- available to our organizations, and they can choose which aspects of it they opt in for."
-- Turning the portal on is NOT consent to every aspect of it, and an income-disclosure channel
-- is the last thing that should switch itself on.
--
-- 🚨 IDEMPOTENT. The seed is `on conflict do nothing` so a re-run never overwrites a human's
-- value; the curation below only writes while `overridable_by` is still the untouched default
-- '{}', so a re-apply cannot clobber a later deliberate change.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due)
values
('continued_access','portal_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
 'Departed-member portal enabled',
 'Whether this organization offers a portal to people whose membership has ended. OFF means a departed person sees nothing and no continued-access feature answers for them.',
 'agent',
 'OFF by default because this is an offering an organization makes, not a default the platform imposes. Arman: "It is something that we can make optionally available to our organizations, and they can choose which aspects of it they opt in for." An org that has not said yes has not said yes.',
 (current_date + 60)),
('continued_access','access_cutoff_days', '0'::jsonb, '0'::jsonb, 'integer',
 'Default access window after departure (days)',
 'How long after departure the portal keeps answering, by default, for people departed from this organization. 0 means indefinitely -- the portal does not expire on its own.',
 'agent',
 '0 (indefinite) by default because Arman named keeping it on indefinitely as a first-class choice, and a silent expiry would quietly break the goodwill the portal exists to create. An org that wants a window sets one; the per-person access_cutoff_at overrides this.',
 (current_date + 60)),
('continued_access','verification_consent_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
 'Portal feature: employment/income verification consent',
 'Whether a departed person may answer employment and income verification requests about themselves through the portal. Requires portal_enabled.',
 'agent',
 'OFF by default: per-feature opt-in is the shape Arman ruled -- "they can choose which aspects of it they opt in for." Turning the portal on is not consent to every aspect of it, and an income-disclosure channel is the last thing that should switch itself on.',
 (current_date + 60))
on conflict (feature, key) do nothing;

update platform.feature_knob
   set min_value = 0, max_value = 3650, unit = 'days'
 where feature = 'continued_access' and key = 'access_cutoff_days'
   and (min_value is null or max_value is null or unit is null);

-- OVERRIDABILITY CURATION -- deliberate, and never folded into a seed's on-conflict.
--
-- All three are the ORGANIZATION's policy about its own alumni. The `user` rung is deliberately
-- ABSENT: a departed person must never be able to switch their own portal on, and a current
-- member must never be able to pre-arrange their own continued access. This is the one place the
-- usual "users override the organization where appropriate" ladder must NOT apply, because the
-- person the setting is about is the person it protects the organization from. There is no
-- sub-org rung because departure is from the organization, not from a pay group or a location.
update platform.feature_knob
   set overridable_by = ARRAY['organization'], override_direction = 'any'
 where feature = 'continued_access'
   and coalesce(array_length(overridable_by, 1), 0) = 0;
