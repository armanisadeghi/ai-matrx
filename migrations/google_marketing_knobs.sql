-- google_marketing_knobs — the staleness threshold behind every Google
-- freshness line in Marketing.
--
-- WHY A KNOB AND NOT A CONSTANT (Law 6, `common-docs/policies/limits-are-knobs-
-- agents-set-them.md`): "how old is too old" is a posture, not a fact. An agency
-- watching a client's traffic daily wants to hear about a 24-hour gap; a site
-- that gets one report a month does not. So the line always states the truth
-- ("data through Sep 14 · pulled 40 minutes ago · Google runs about three days
-- behind") and the WARNING tone is the organization's call.
--
-- Starting value, and why:
--   freshness_warning_hours = 72
--     Google's Search Console API finalizes a day about two to three days back,
--     and our nightly sweep runs once a night, so a healthy site is routinely
--     ~48h behind and must never be badged stale for it. 72 hours is the first
--     threshold that only fires when a nightly run has actually been MISSED.
--     It matches the thresholds `seo.gsc_ingestion_health` already uses
--     (migrations/seo_gsc_ingestion_health_v5.sql: 2-day lag + 2 missed nights).
--     GA4 runs about a day behind, and the same 72 hours there means two missed
--     nightly runs — the same meaning, not a second number to keep in step.
--
-- Overridable by organization: another agency's reporting cadence is not ours to
-- decide for them. `override_direction` stays `any`: an org may want a tighter
-- 24h alarm or a looser weekly one, and neither is wrong.
--
-- Reader: `features/marketing/google/freshness.ts`
-- (`useFreshnessWarningHours`). A MISSING knob raises by design
-- (`lib/knobs/featureKnobs.ts` has no fallback), and the freshness line turns
-- that raise into a visible stand-in naming this file — so until this is applied
-- the line tells the truth about the data and says plainly that it cannot warn
-- yet.
--
-- Idempotent (ON CONFLICT DO UPDATE on the metadata, never on `value`, so a
-- human's change in /administration/users/limits survives re-application).
-- Reversible: DELETE the row; the freshness lines go back to stating the facts
-- without a warning tone, and say so.
--
-- NOT APPLIED by the session that wrote it: apply with
--   pnpm db:apply migrations/google_marketing_knobs.sql
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'google.marketing', 'freshness_warning_hours',
  '72'::jsonb, '72'::jsonb, 'integer', 'hours',
  1, 720,
  'Google data — warn when the last pull is older than',
  'How old the last successful pull from Google (Search Console or Analytics) may be before every screen showing those numbers marks them stale. The freshness line always states when the data is from; this only decides when it turns into a warning.',
  'agent',
  'GSC API lag is 2–3 days and our sweep runs nightly, so a healthy site sits ~48h behind; 72 hours is the first threshold that fires only when a nightly run was actually missed, matching seo.gsc_ingestion_health (2-day lag + 2 missed nights).',
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
