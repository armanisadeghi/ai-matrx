# Internal product analytics

AI Matrx exercises its own product analytics without turning the open Google
Workspace OAuth review into a GA4 scope campaign. These are separate systems:
the Google tag writes anonymous page-view telemetry to AI Matrx's own GA4
property and never reads a customer's Analytics account or uses OAuth.

First-party acquisition capture is separate from GA4. `UserAcquisitionCapture`
records a browser fingerprint's first observed host/path, sanitized referrer,
UTM fields, timezone, language, and screen size in the existing
`public.guest_executions.metadata.acquisition` object. It never stores arbitrary
landing-page query strings. The registry then follows the same visitor through
anonymous use and account conversion; `auth.users.is_anonymous` remains the
authority for guest status.

A permanent session observed by the collector is associated through
`metadata.acquisition_user_id`; it never writes `converted_at` or
`converted_to_user_id`. Only the signup/promotion flow can declare conversion.

The root collector skips administration, login, and auth routes. Existing
first-touch metadata is never overwritten, so later navigation cannot rewrite
acquisition history. Collection predating this feature is unknown and stays
unknown—admin UI labels the field **First observed page**, never invents a
historical landing page.

Localhost and loopback referrers are classified as `local_test`. The admin
acquisition surface labels them **Local / agent test** so development and agent
traffic is not mistaken for acquired-user behavior.

`InternalGoogleAnalytics` is mounted by the `(core)` server layout only for a
signed-in `super_admin`. It does not load for guests, ordinary customers, or a
direct Education request, and it refuses to send Education page views after a
client-side navigation. This narrow internal lane is for validating the product
telemetry and the downstream GA4 reader before any customer-facing rollout or
consent-policy decision.

The canonical production property is `properties/425921044`, web stream
`6695751301`, measurement ID `G-Y9F6QPFLFM`.

Production certification on 2026-08-15 showed the deployed tag and inline
initializer on a signed-in super-admin route. GA4 Realtime then reported three
active users, five `page_view` events, and the real Marketing, Brand Assets,
Keywords, and Settings page titles.

## Change log

- 2026-08-19 — Classified localhost and loopback referrers as local/agent test
  traffic in acquisition reporting.
- 2026-08-19 — Added durable first-touch acquisition capture over the canonical
  guest registry, with sanitized URLs and conversion continuity.
- 2026-08-15 — Added super-admin-only page-view collection for AI Matrx's own
  GA4 property, with Education excluded and no Google OAuth dependency.
