-- spend_popover_knobs — the two knobs behind the daily spend popover.
--
-- WHY (Arman, 2026-09-11): "floating window popovers that come up once a day or
-- a couple times a day… The key is to scare me by showing me how much money we
-- spent so far today, not by putting blocks in the code."
--
-- "Once a day or a couple times a day" is a preference, not a constant, and
-- "scare me" needs a number to be scared ABOVE. Law 6 (opinions become knobs)
-- and `common-docs/policies/limits-are-knobs-agents-set-them.md`: both are rows
-- here with an agent-chosen starting value and a dated review, never a literal
-- in the client.
--
-- Starting values, and why:
--   times_per_day = 1     — the smallest cadence that still makes the number
--                           unavoidable. A second daily interruption has to
--                           earn itself; 0 turns the popover off entirely.
--   scare_threshold_usd = 100
--                         — today has closed above $100 on the primary ledger
--                           on most recent days ($144.85 over the last 24h and
--                           $108.26 yesterday, measured 2026-09-12), so $100 is
--                           the line where a day is running hot rather than
--                           normal. Above it the popover's headline turns
--                           destructive-toned. It changes the COLOUR and the
--                           wording, never the behaviour — nothing is blocked.
--
-- Both are overridable by organization: another org's finance posture is not
-- ours to fix at the platform level.
--
-- Idempotent (ON CONFLICT DO UPDATE on the metadata, never on `value`, so a
-- human's change in /administration/users/limits survives re-application).
-- Reversible: DELETE the two rows; the popover then refuses to render and says
-- why rather than guessing a cadence (`lib/knobs/featureKnobs.ts` throws on a
-- missing knob — no fallback).
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'platform.spend_popover', 'times_per_day',
  '1'::jsonb, '1'::jsonb, 'integer', 'times per day',
  0, 6,
  'Daily spend popover — times per day',
  'How many times a day a super admin is shown the floating "spent so far today" window. 0 turns it off. Each showing is dismissible, and a dismissal is remembered for the rest of that local day.',
  'agent',
  'Arman 2026-09-11 asked for "once a day or a couple times a day". One is the smallest cadence that still makes the number unavoidable; a second interruption has to earn itself, so it is available but not the default.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'platform.spend_popover', 'scare_threshold_usd',
  '100'::jsonb, '100'::jsonb, 'number', 'USD',
  0, 100000,
  'Daily spend popover — alarm threshold',
  'When today''s AI and provider spend passes this many dollars, the popover and the dashboard headline switch to a destructive tone. It changes the colour and the wording only — nothing is ever blocked.',
  'agent',
  'Arman 2026-09-11: "scare me… not by putting blocks in the code." Measured 2026-09-12, the primary ledger ran $144.85 over the last 24h and $108.26 the previous local day, so $100 is the line above which a day is running hot rather than normal.',
  (current_date + 45),
  ARRAY['organization'], 'any'
)
ON CONFLICT (feature, key) DO UPDATE SET
  default_value      = EXCLUDED.default_value,
  value_type         = EXCLUDED.value_type,
  unit               = EXCLUDED.unit,
  min_value          = EXCLUDED.min_value,
  max_value          = EXCLUDED.max_value,
  label              = EXCLUDED.label,
  description        = EXCLUDED.description,
  basis              = EXCLUDED.basis,
  review_due         = EXCLUDED.review_due,
  overridable_by     = EXCLUDED.overridable_by,
  override_direction = EXCLUDED.override_direction,
  updated_at         = now();
