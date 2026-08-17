# FEATURE.md — Bing Webmaster connection

**Status:** active
**Tier:** 1 (Marketing sub-feature)
**Last updated:** 2026-08-15

---

## Purpose

Connect a Bing Webmaster account to AI Matrx, match its verified properties to
managed sites, and make Bing search-performance data available through the
canonical marketing data model.

---

## Entry points

- `/marketing/connections/bing` — guided account connection and site matching.
- `/marketing/connections/bing/callback` — secure Bing OAuth return and token
  exchange completion.
- `BingConnectionsWorkspace` (`BingConnectionsWorkspace.tsx`) — connection UI.
- `useBingConnectionInventory()`, `useStartBingOAuth()`,
  `useCompleteBingOAuth()`, `useConnectBingApiKey()`, `useBindBingSite()`,
  `useDisconnectBing()` (`hooks.ts`) — lifecycle hooks.
- `service.ts` — direct RLS-protected inventory reads plus credential-bearing
  aidream calls.
- `GET /api/bing-integrations/authorize-url` — issue a server-bound OAuth state
  and return Bing's authorization URL.
- `POST /api/bing-integrations/exchange` — exchange the one-time callback code
  with server-held app credentials, vault the refresh token, and discover sites.
- `POST /api/bing-integrations/api-key` — vault the key and discover properties.
- `POST /api/bing-integrations/bind-site` — persist the exact site binding.
- `POST /seo/sites/{site_id}/bing/search-performance/sync` — collect canonical
  Bing performance rows.

---

## Data model

- `users.integration_connections` — safe Bing connection metadata and vault
  reference; never the API key.
- `users.integration_connection_resources` — discovered verified Bing sites.
- `web.site.integrations.marketing.providers.bing_webmaster` — one managed
  site's active connection/property binding.
- `seo.search_performance_daily` — canonical Google/Bing performance facts.
- `BingConnectionSummary`, `BingConnectionResource`, `BingSiteBinding`
  (`types.ts`) — client contract mirrors.

The live shared database must admit `provider='bing_webmaster'`,
`resource_type='bing_webmaster_site'`, and `status='disconnected'` in its
existing integration CHECK constraints. Those values were added and validated
in Matrx Main on 2026-08-15; removing any of them breaks connect, discovery, or
disconnect before the UI can recover.

---

## Key flows

### Connect an account

1. OAuth is the primary path. The user selects organization or personal
   ownership, signs in on Bing, grants `webmaster.read`, and returns through the
   dedicated callback.
2. The OAuth client id, secret, redirect URI, selected owner, and one-time state
   stay server-controlled. The browser receives only the authorization URL and
   later returns Bing's short-lived `code` and opaque `state`.
3. Organization ownership is primary when an active organization exists;
   personal ownership remains available.
4. aidream stores the credential in the canonical vault and discovers every
   verified property.
5. API key connection remains available behind “Use an API key instead” as a
   fallback, with the exact Bing settings path and a focused key field.

### Connect a managed site

1. Site controls render only after a usable Bing connection exists.
2. The site picker is scoped to the active organization.
3. Organization-owned connections are preferred; a lone eligible connection is
   selected automatically.
4. URL normalization ignores protocol, `www`, and a trailing slash to identify
   the matching verified property. Ambiguous cases require an explicit choice.
5. `bindBingSite()` persists the binding; the sync surface can then collect data.

---

## Invariants & gotchas

- **Never show binding controls before a usable connection exists.** A disabled
  multi-select form is a dead end, not setup guidance.
- **OAuth is the primary path; API key is fallback.** Do not make ordinary users
  register a Bing client, carry a client secret, or understand token exchange.
- **The browser never receives the OAuth client secret.** aidream owns the app
  registration, exact callback, state, code exchange, token refresh, and vault.
- **Never display or persist the API key after submission.** aidream vaults it;
  frontend tables contain only a vault reference and safe metadata.
- **Scope managed sites to the active organization.** An organization-owned
  connection cannot bind a site owned by another organization.
- **Do not show raw connection UUIDs as names.** Present ownership and status.
- **Imported Bing properties are preserved.** Connecting refreshes discovery;
  it does not delete employee-created Bing sites.

---

## Related features

- Parent: `features/marketing/FEATURE.md`
- Google connection peer: `features/marketing/google/`
- Site integration consumer: `features/marketing/components/integrations/`
- Search-performance consumer: `features/marketing/seo/keyword-research/`

---

## Doctrine compliance

**Primitives reused**

- Components: `Button`, `Input`, `Label`, `Select`, `Badge`, `RouteModeNav`.
- Hooks: TanStack Query lifecycle hooks and
  `useActiveOrganizationPicker()`.
- Data: canonical integration connection/resource tables and
  `seo.search_performance_daily`.

**Primitives introduced**

- None. The change composes existing connection, vault, organization, and
  marketing primitives.

---

## Current work / migration state

OAuth and API-key connection converge on the same property discovery, binding,
credential vault, token-refresh, and streamed performance-sync lifecycle.

---

## Change log

- 2026-08-15 — Codex: Replaced the developer-facing form with a two-step guided
  flow, hid impossible binding controls, added the direct Bing handoff, focused
  key entry, organization-first ownership, active-org site scoping, automatic
  property matching, and human connection names.
- 2026-08-15 — Codex: Finished the previously server-only Bing OAuth work as a
  product flow, moved app credentials and owner intent fully server-side, added
  the callback route, made OAuth primary, and retained API key as a disclosed
  fallback.
- 2026-08-15 — Codex: Widened and validated the live shared integration CHECK
  constraints for the Bing provider, discovered-site resource, and disconnected
  lifecycle state; regenerated the frontend database types from Matrx Main.
