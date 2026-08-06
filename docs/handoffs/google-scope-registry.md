---
status: active
updated: 2026-08-06
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/projects/google-oauth-verification/PLAN.md]
---

# Google OAuth scope registry — ONE source of truth per repo, kill every parallel path

## Vision — Arman's words

> "we need to have one agent who goes through and FULLY aligns the scopes so we have a
> single point that handles all Google OAuth stuff for us and no where else. I think we
> have a few of them, but in reality, we probably should have one in ai-matrx and one in
> aidream and that's it."

Governing plan:
[`common-docs/projects/google-oauth-verification/PLAN.md`](https://github.com/AI-Matrix-Engine/matrx-common-docs/blob/main/projects/google-oauth-verification/PLAN.md)
— execution step 4 ("Consolidate scope configuration and eliminate the parallel Google
settings/token path") and its "Current scope truth" section. **The registry's expected list
must match Google Cloud's declared Data Access list exactly** — that table (12 scopes as of
2026-08-06) is in the PLAN and outranks every list in code.

## Resources

- The divergent lists to collapse (verified 2026-08-06):
  - `features/marketing/google/types.ts` `GOOGLE_CONNECTION_SCOPES` — what the live UI
    actually requests (openid/email/profile + `webmasters.readonly` + `analytics.readonly`
    + `youtube.readonly`).
  - `lib/googleScopes.ts` `REGISTERED_GOOGLE_SCOPE_URLS` — claims to mirror the GCP
    console ("keep in sync" comment) and is out of sync. 6 scopes incl. two nobody
    requests (`calendar.app.created`, `drive.file`).
  - aidream `aidream/services/google_integrations/service.py` (~lines 87-94) — the
    backend's allowed-scope list (webmasters, analytics.readonly, youtube.readonly).
  - Old `users.integration_connections` rows carry broad legacy grants (full drive,
    documents, spreadsheets, gmail.send…) from a retired flow — display-only data, never a
    source of truth.
- Known real mismatch (from the PLAN): frontend requests `analytics.readonly` but Google
  Cloud Data Access does NOT declare it.
- Working connect flow to preserve unchanged: `features/marketing/google/service.ts` →
  aidream `POST /api/google-integrations/exchange` (see
  `aidream/services/google_integrations/FEATURE.md`).
- Parallel flows to remove: `app/(public)/google-settings/page.tsx` (unauthenticated
  scope-checkbox playground, browser-token flow), `components/GoogleAccessCard.tsx`
  (prototype, stale scopes, non-semantic colors). Check for other consumers of
  `useGoogleAPI` / `GoogleApiProvider` before deleting shared pieces — the provider itself
  (`providers/google-provider/GoogleApiProvider.tsx`) STAYS; it is the canonical popup.

## Remaining work

1. **Create the ONE frontend registry** — extend `lib/googleScopes.ts` into the single
   canonical module (typed scope constants, classification non-sensitive/sensitive/
   restricted, and the exact Google-Cloud-declared list from the PLAN). Every scope string
   in the repo imports from it; grep `googleapis.com/auth/` to find and convert every
   hardcoded literal. `GOOGLE_CONNECTION_SCOPES` in `features/marketing/google/types.ts`
   becomes a re-export/consumer or moves into the registry.
2. **Create the ONE backend registry** — `aidream/services/google_integrations/scopes.py`
   with the same list + classification; `service.py` and any future Google tool import it.
   Keep the two registries byte-equivalent in content; add a comment in each pointing at
   the other and at the PLAN.
3. **Resolve the `analytics.readonly` mismatch** — the product uses it (GA4), so the fix
   is declaring it in Google Cloud Data Access, which needs console access: hand that one
   click to Arman or the console-access agent running
   `aidream/docs/handoffs/google-credentials-leak-cleanup.md`. Until declared, the
   registry marks it `declaredInConsole: false` and CI-greppable.
4. **Delete the parallel flows** — remove `/google-settings` and `GoogleAccessCard`;
   if anything real links to them, point it at the supported connections surface
   (`/marketing/connections/google` today; the Connected Accounts surface from
   `docs/handoffs/google-oauth-product-build.md` later).
5. **Add a drift guard** — a `pnpm check:doc-claims`-style check (or unit test) asserting
   every `googleapis.com/auth/` literal in the repo resolves through the registry, and
   that the registry's declared-in-console list matches the PLAN's table. aidream side:
   a small test asserting `scopes.py` == the registry contract.
6. Update `features/marketing/google/` docs + `aidream/services/google_integrations/FEATURE.md`
   Change Logs; tick PLAN step 4; **delete this handoff**.

## Known traps

- Do NOT request any scope not yet declared in the console — Google granular-consent
  (rolled out through Jan 2026) means partial grants are normal; the connect flow must
  already tolerate a user denying individual scopes.
- Do not touch the legacy DB grant rows; they are historical data. (Old rows keep broader
  `granted_scopes` than the registry — display them faithfully, never mirror them back
  into requests.)
- `drive.file` and `gmail.send` enter the registry as DECLARED-but-not-yet-requested
  (gated) — the product build handoff owns turning them on.
