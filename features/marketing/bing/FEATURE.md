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
- `BingConnectionsWorkspace` (`BingConnectionsWorkspace.tsx`) — connection UI.
- `useBingConnectionInventory()`, `useConnectBingApiKey()`,
  `useBindBingSite()`, `useDisconnectBing()` (`hooks.ts`) — lifecycle hooks.
- `service.ts` — direct RLS-protected inventory reads plus credential-bearing
  aidream calls.
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

---

## Key flows

### Connect an account

1. The page shows Bing's real path: Settings → API access → API Key.
2. The user opens Bing, generates a key, and pastes it into the focused field.
3. Organization ownership is primary when an active organization exists;
   personal ownership remains available.
4. aidream stores the credential in the canonical vault and discovers every
   verified property. The browser retains no key after submission.

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
- **Never expose backend OAuth routes or credential-exchange jargon in this UI.**
  API key is the supported product path until a complete OAuth product flow ships.
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

API-key connection, property discovery, binding, and streamed performance sync
are live. OAuth exists only as backend capability and is not a product workflow.

---

## Change log

- 2026-08-15 — Codex: Replaced the developer-facing form with a two-step guided
  flow, hid impossible binding controls, added the direct Bing handoff, focused
  key entry, organization-first ownership, active-org site scoping, automatic
  property matching, and human connection names.
