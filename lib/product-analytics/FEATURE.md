# Internal product analytics

AI Matrx exercises its own product analytics without turning the open Google
Workspace OAuth review into a GA4 scope campaign. These are separate systems:
the Google tag writes anonymous page-view telemetry to AI Matrx's own GA4
property and never reads a customer's Analytics account or uses OAuth.

`InternalGoogleAnalytics` is mounted by the `(core)` server layout only for a
signed-in `super_admin`. It does not load for guests, ordinary customers, or a
direct Education request, and it refuses to send Education page views after a
client-side navigation. This narrow internal lane is for validating the product
telemetry and the downstream GA4 reader before any customer-facing rollout or
consent-policy decision.

The canonical production property is `properties/425921044`, web stream
`6695751301`, measurement ID `G-Y9F6QPFLFM`.

## Change log

- 2026-08-15 — Added super-admin-only page-view collection for AI Matrx's own
  GA4 property, with Education excluded and no Google OAuth dependency.

