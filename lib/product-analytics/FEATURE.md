# Internal product analytics

AI Matrx exercises its own product analytics without turning the open Google
Workspace OAuth review into a GA4 scope campaign. These are separate systems:
the Google tag writes anonymous page-view telemetry to AI Matrx's own GA4
property and never reads a customer's Analytics account or uses OAuth.

First-party acquisition capture is separate from GA4. Proxy issues
`matrx_acquisition_visitor` and queues the first host/path, sanitized referrer,
UTM fields, IP, user-agent, language, and request classification through
`NextFetchEvent.waitUntil`; Postgres never delays the response. The browser then
enriches timezone, language, screen, and the existing guest ID. Both paths call
the atomic `public.record_acquisition_first_touch`, which stores only missing
fields in `public.guest_executions.metadata.acquisition`. Arbitrary landing-page
query strings are never stored.

New guest AI use adopts the server visitor ID instead of waiting for hardware
fingerprinting. Returning browsers retain their prior guest ID, which is linked
to the acquisition row. `auth.users.is_anonymous` remains the guest authority.

Email signup, guest promotion, and OAuth link the visitor row through
`metadata.acquisition_user_id` with `after`, even when no AI execution exists.
Only guest promotion can write `converted_at` or `converted_to_user_id`.

The collector skips administration and auth callbacks. Existing first-touch
values are never overwritten, so later navigation cannot rewrite acquisition
history. Collection predating this feature stays **Historical — not collected**;
a captured request without a referrer is **Direct / browser withheld**.

Localhost and loopback landing hosts or referrers are `local_test`. The admin
surface retains those rows but excludes them and bots from headline people,
account, conversion, and cost totals.

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

- 2026-08-20 — Added zero-blocking server first-request capture, atomic browser
  enrichment, first-party guest identity, signup/OAuth account association, and
  non-poisoning localhost/bot acquisition totals.
- 2026-08-19 — Classified localhost and loopback referrers as local/agent test
  traffic in acquisition reporting.
- 2026-08-19 — Added durable first-touch acquisition capture over the canonical
  guest registry, with sanitized URLs and conversion continuity.
- 2026-08-15 — Added super-admin-only page-view collection for AI Matrx's own
  GA4 property, with Education excluded and no Google OAuth dependency.
