# DataForSEO API lab

Status: **working development demo** at `/demos/seo-dataforseo` (full/dev build only).

This is the direct test surface for `matrx-seo`'s DataForSEO API. The browser talks directly
to the selected SEO server with the current Supabase access token; there is no Next.js proxy.
The active organization comes from `selectEffectiveOrganizationId`.

## Contract

- Default local server: `http://127.0.0.1:8081`; start it from aidream with
  `./packages/matrx-seo/scripts/run_local.sh`.
- The operation selector is loaded from `GET /providers/dataforseo/operations`, so the UI
  cannot drift from the package allowlist.
- The task editor accepts one exact DataForSEO task object. The client wraps it in the
  provider's task array and sends a `raw_provider` collection, allowing every approved
  operation to be inspected without inventing normalized facts.
- Normal runs are cache-first using the operation TTL returned by the server. “Force fresh”
  sends `force_refresh=true` and can spend provider credits.
- After collection, the lab loads `GET /collections/{run_id}/evidence`. Super admins see the
  exact request to Matrx, literal provider request(s) with auth redacted, full raw provider
  response(s), task checkpoints, costs, and the entire durable evidence object. Non-admins do
  not render raw panels.
- Provider failures include the durable `run_id`; the lab still loads the captured request and
  response evidence for failed paid calls.

## Files

- `DataForSeoLab.tsx` — interactive test surface.
- `client.ts` — typed direct REST client.
- `types.ts` — API contracts mirrored from `matrx_seo.standalone.app`.

## Change log

- 2026-07-22 — Added the first full DataForSEO lab with operation discovery, editable task
  JSON, cache/fresh controls, durable receipts, and admin raw-evidence panels.
