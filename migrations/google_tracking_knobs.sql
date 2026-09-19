-- google_tracking_knobs — how old a site's tracking snapshot may be before the
-- site's tracking line offers to re-check it.
--
-- WHY A KNOB AND NOT A CONSTANT (Law 6, `common-docs/policies/limits-are-knobs-
-- agents-set-them.md`): "how old is too old" is a posture, not a fact. The
-- tracking line always states the truth ("snapshot taken 3 days ago · reads the
-- container's workspace draft, not what is published"); this decides only when
-- that turns into a warning and the Re-check button starts asking to be pressed.
--
-- 🚨 THIS IS NOT `google.marketing.freshness_warning_hours`, and must never be
-- folded into it. That knob means "the data PROVIDER is behind" — Google's own
-- Search Console / GA4 lag, which we cannot influence and which changes daily.
-- This one means "OUR last look at the container is old". A Tag Manager
-- container changes when a person edits it, not on a daily cadence, so the two
-- questions have different right answers and one number cannot serve both.
--
-- Starting value, and why:
--   snapshot_max_age_hours = 168 (one week)
--     A container is edited by a human, rarely — most go months untouched. The
--     modal reader is an agency reviewing a client's site weekly, so a week-old
--     snapshot is exactly as fresh as their own cadence and a warning before
--     then would be noise they learn to ignore. 72 hours (the provider-lag
--     number) would badge a perfectly healthy, unchanged container stale twice
--     a week, and a warning that is usually wrong is worse than none (Law 4).
--     Taking a snapshot spends a Google Tag Manager API call and a live fetch
--     of the customer's own site, so nagging also costs real requests.
--
-- Overridable by organization: an agency that publishes container changes daily
-- wants a 24-hour alarm; one that reviews quarterly does not. `override_direction`
-- stays `any` — neither direction is wrong, and this is a site posture rather
-- than a personal one, so `overridable_by` is organization only, never user.
--
-- Reader: `features/marketing/tracking/knobs.ts` (`useTrackingSnapshotMaxAgeHours`).
-- A MISSING row raises by design (`lib/knobs/featureKnobs.ts` has no fallback)
-- and the reader turns that raise into a VISIBLE stand-in naming this file — so
-- until this is applied the panel still states when the snapshot was taken and
-- says plainly that it cannot judge whether that is too old.
--
-- Idempotent (ON CONFLICT DO UPDATE on the metadata, never on `value`, so an
-- administrator's change in /administration/users/limits survives re-application).
-- Reversible: DELETE the row; the tracking line goes back to stating the facts
-- without a staleness verdict, and says so.
--
-- NOT APPLIED by the session that wrote it (no SUPABASE_MATRIX_* credentials in
-- this container): the chair applies it. Ledger: public._schema_migrations
-- (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'google.tracking', 'snapshot_max_age_hours',
  '168'::jsonb, '168'::jsonb, 'integer', 'hours',
  1, 2160,
  'Tracking snapshot — offer a re-check when the last one is older than',
  'How old a site''s Google Tag Manager tracking snapshot may be before the site''s tracking line marks it stale and offers to re-check. The line always says when the snapshot was taken; this only decides when that becomes a warning. Re-checking spends a Tag Manager API call and one fetch of the site.',
  'agent',
  'A container is edited by a person and rarely changes; the modal reader reviews a client site weekly, so 168 hours matches that cadence and only warns once a real review has been missed. The 72-hour provider-lag threshold would badge an unchanged, healthy container stale twice a week.',
  DATE '2026-10-31',
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
