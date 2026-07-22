# DataForSEO API lab

Status: **working development demo** at `/demos/seo-dataforseo` (full/dev build only).

This is the direct test surface for `matrx-seo`'s DataForSEO API. The browser talks directly
to the SEO target selected by the canonical API service router with the current Supabase
access token; there is no Next.js proxy or page-specific server setting. The active
organization comes from `selectEffectiveOrganizationId`.

## Contract

- The sidebar Production/Localhost button switches SEO together with aidream, scraper, and
  files. Its adjacent service menu can pin SEO independently. The canonical defaults are
  `https://seo.matrxserver.com` and `http://127.0.0.1:8081`, configurable with
  `NEXT_PUBLIC_SEO_URL` and `NEXT_PUBLIC_SEO_URL_LOCAL`.
- Start the local package from aidream with `./packages/matrx-seo/scripts/run_local.sh`.
  The SEO server must allow this page's Origin (`https://www.aimatrx.com` or
  `http://localhost:3000`) — defaults cover both.
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

- 2026-07-22 — Removed the lab-specific server URL and routed it through the canonical
  multi-service Production/Localhost selection with optional per-service SEO pinning.
- 2026-07-22 — Added the first full DataForSEO lab with operation discovery, editable task
  JSON, cache/fresh controls, durable receipts, and admin raw-evidence panels.
