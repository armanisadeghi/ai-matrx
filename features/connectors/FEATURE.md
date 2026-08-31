# FEATURE.md — `connectors`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-30`

---

## Purpose

The user-facing catalogue of external systems a person can attach to their account, plus **`ConnectorStrip`** — the one-line reminder that sits _under the agent input_ and offers the connections a conversation could use. Normal chat shows exactly three fairly rotated, proven-connectable integrations and a `More` door. `More` opens the complete live-only catalogue in a canonical `WindowPanel`; unproven, local-only, and coming-soon Settings placeholders are deliberately excluded.

---

## Entry points

**Components**

- `features/connectors/ConnectorStrip.tsx` — `<ConnectorStrip />`. Client, presentational, props-driven.
- `features/connectors/ConnectorMark.tsx` — the ONE provider-artwork renderer. First-party connectors use local SVG marks; dynamic MCP connectors walk a provider-specific artwork chain (website favicon → known brand glyph → catalogue art → cached 128px favicon), with the catalogue brand color as the final failure fallback.
- `features/connectors/DirectoryConnectorCards.tsx` — the directory presence for the first-party Google connectors, mounted on `/user-settings/integrations` (features/settings `IntegrationsSettingsPage`) between the GitHub card and the MCP catalog grid. Status from the Google connection inventory via `google-status.ts`; Docs/Sheets and Gmail connect through the floating Google connect window, Search Console doors to `/marketing/connections/google` (its OAuth lives there — never a wrong-scope popup).
- `features/connectors/google-status.ts` — the ONE Google scope→connector mapping (`GOOGLE_CONNECTOR_SCOPES`, `googleConnectedIds`, `googleConnectionFor`). Both containers resolve through it; a scope mapping anywhere else is a fork.
- `features/connectors/ChatConnectorStrip.tsx` — draws exactly three providers from the persisted fair-rotation bag, resolves their live state, and opens the full integrations window from `More`. Mounted under the real chat composer by `AgentConversationColumn`.
- `features/connectors/LiveIntegrationsList.tsx` — searchable, live-only provider list shared by the floating window. Every named provider has a real Connect, Configure, or Manage door.
- `features/connectors/useLiveConnectors.ts` — the ONE container for connection state and actions across the strip and full list. Google uses the Google connect window; MCP entries use the canonical route selector and OAuth/no-auth/GitHub/configure path.
- `features/connectors/live-connectors.ts` — merges seeded Google/Gmail/Notion definitions with the usable MCP catalogue and enforces the live boundary.
- `features/connectors/rotation.ts` — pure randomized-bag selection and persisted-state parser.
- `features/marketing/google/hooks.ts` — the shared Google inventory query is **auth-gated**. Core routes mount before async auth hydration; querying `users.integration_connections` while anonymous is a producer bug because the table is intentionally granted only to `authenticated`.

**Config**

- `features/connectors/registry.ts` — `CONNECTORS`, `connectorsFor(surface)`, `getConnector(id)`.
- `features/connectors/types.ts` — `ConnectorDefinition`, `ConnectorSurface`, `ConnectorStatus`, `ConnectorStatusSource`.
- `features/connectors/marks.tsx` — local brand marks + `lucideMark(Icon)` fallback.

**Routes**

- `features/window-panels/windows/connectors/LiveIntegrationsWindow.tsx` — canonical floating all-live-integrations window; fullscreen on mobile.
- `app/(dev)/demos/connector-strip/page.dev.tsx` — every strip state side by side (nothing / some / all connected, compact, surface filters, raised intents).

**Redux slice(s)** — none. This feature holds no state.

**API endpoints** — none owned.

---

## Data model

No tables of its own. Google connectors use `features/marketing/google/service.ts → listGoogleConnectionInventory()` (Supabase-direct), the same source `features/google-workspace/connection.ts` uses. MCP-backed connectors use `useMcpCatalog()` over `public.get_mcp_catalog_for_user()`: its sanitized `connection_ready` bit is true only for an existing connection, an explicitly certified provider, a proven prior connection path, GitHub's canonical flow, or a real no-auth remote server. Credentials remain in the Unified Credential Vault and never enter this feature. The fair rotation stores only provider ids and bag progress in browser `localStorage` under `matrx.connector-strip.rotation.v1`.

**Key types** (`types.ts`)

- `ConnectorDefinition` — `id`, `name`, `blurb`, local `logo?` or `iconUrl?` + `fallbackIconUrls?` + `brandColor?`, `surfaces`, `manageHref?`, `comingSoonId?`.
- `ConnectorSurface` — `"strip" | "directory"`. **Explicit, never inferred.**
- `ConnectorStatus` — `"connected" | "not_connected" | "unavailable"`.
- `ConnectorStatusSource` — `connectedIds?` (a set) or `resolveStatus?` (a resolver; wins).

---

## Key flows

### (a) Mounting the strip under an agent input

```tsx
<ConnectorStrip
  connectors={threeRotatedLiveConnectors}
  resolveStatus={resolveLiveStatus}
  onConnect={(id) => openConnectPanel(id)}
  onShowMore={() => openLiveIntegrationsWindow()}
/>
```

Trigger: the composer renders. `ChatConnectorStrip` merges the three seeded providers with the usable live MCP catalogue, draws three ids from a shuffled bag without replacement, and renders one 16px-tall visual row plus `More`. On coarse pointers, invisible pseudo-elements preserve a 40px hit area without consuming layout height. Exit: a provider chip raises its canonical connection/management action; `More` opens the full window.

### (b) A connector the user already has

Status `connected` → a `Check` appears and — when the definition has `manageHref` — the chip becomes a real `<Link>` to the management surface (THE DOOR LAW). Provider artwork remains full-color in every live state; connection state never degrades a brand mark to a generic monochrome symbol. No `manageHref` → the chip is inert, never a fake button.

### (c) Fair rotation across visits

Each visit consumes the next three ids from a shuffled bag. No provider repeats until every eligible provider has had one placement. At a bag boundary, the previous visit's ids are deferred, preventing consecutive overlap whenever the catalogue is large enough. A changed eligible catalogue invalidates the old bag safely.

### (d) The live-only `More` window

The WindowPanel always includes Google, Gmail, and Notion, then adds MCP catalogue entries whose server status is `active`, `beta`, or `community`, whose sanitized `connection_ready` gate is true, and which can be used from the web app now. Disconnected providers also need a real remote endpoint and a direct OAuth, GitHub, or no-auth route. An already-connected remote provider remains visible so its management door is never lost. Unproven, local-only (`stdio`), and `coming_soon` entries never appear.

### (e) A connector we do not support yet

`comingSoonId` set → status is `unavailable` regardless of the connected-set, the chip is dashed + `soon`, and clicking calls `announceComingSoon(id)` against `lib/coming-soon/registry.ts`. **Never a bare "coming soon" string.** Notion no longer uses this path: it is an active MCP-backed connector.

### (f) Adding a provider

One entry in `registry.ts`: id (generic to the provider, permanent), name (today's truth), blurb (one user-facing line), a local mark, and `surfaces`. For an official OAuth MCP provider, the id must match the canonical `tool.mcp_server.slug`; after a real connection proof, `ChatConnectorStrip` resolves connection state and OAuth generically. Before proof, keep `connection_ready` false and the provider out of chat. Nothing in `ConnectorStrip.tsx` changes.

---

## Invariants & gotchas

- **`ConnectorStrip` owns no connect logic.** It raises intents. `useLiveConnectors` is the sole container that turns those intents into canonical connection flows.
- **Normal chat shows exactly three plus `More`.** Connection state never collapses or hides those discovery/management doors.
- **Rotation is fair, not merely random.** Selection is without replacement across a complete bag; do not replace it with independent random draws that can favor one provider indefinitely.
- **The full window fails closed.** Catalog presence, an official endpoint, OAuth discovery, and an `active` label do not prove usability. Admit a disconnected MCP provider only when `connection_ready` is true; never admit unproven, local-only, or coming-soon entries.
- **`surfaces` is the seeded first-party gate.** Dynamic live MCP providers join through `buildLiveConnectorDefinitions`; niche first-party definitions such as Google Search Console remain directory-only.
- **The `id` is generic; the `name` carries today's truth.** `google-workspace` covers any file the user picks or we create — Docs and Sheets are today's support, not the ceiling. Never bake a feature list into an id or a file name.
- **Provider artwork is canonical.** Dynamic MCP entries walk the real provider-artwork chain; first-party entries render their local SVG. Keep artwork full-color and use the check/chip treatment for connection state—never replace a provider with a generic monochrome icon or initial while provider identity is available.
- **One line, 16px, always.** It sits under a chat input; it may never wrap or compete. Overflow scrolls horizontally (`overflow-x-auto scrollbar-hide`) — this is why nothing breaks at 375px.
- **Touch targets:** the visual chips stay 16px tall; a `before:` pseudo-element expands the hit area to 40px on mobile only (`sm:before:hidden`) without adding a pixel of layout height.
- **Artwork failure stays branded.** Only after every provider-artwork candidate fails may `ConnectorMark` fall back to the catalogue brand color and provider initial, without shifting layout. No emoji or generic provider icon.
- **`resolveStatus` overrides `connectedIds`** — pass one, not both, unless you mean it.

---

## Related features

- Depends on: `features/google-workspace` (`GOOGLE_WORKSPACE_SETTINGS_HREF`), `features/agents` MCP catalog/OAuth primitives, `features/window-panels`, `features/overlays`, `lib/coming-soon`, `components/ui/tooltip`.
- Depended on by: `ChatConnectorStrip` → `AgentConversationColumn` (the real chat composer); Settings also consumes the seeded first-party directory definitions.
- Cross-links: `features/google-workspace/FEATURE.md`, `lib/coming-soon/FEATURE.md`, `features/agent-connections/FEATURE.md` (the agent-facing "what can this agent reach" hub — a different question from "what has this human attached").

---

## Doctrine compliance

**Primitives reused**

- Components: `components/ui/tooltip` (Tooltip/TooltipProvider/TooltipContent), `next/link`, Lucide icons.
- Services/constants: `GOOGLE_WORKSPACE_SETTINGS_HREF` (`features/google-workspace/connection.ts`), `announceComingSoon` (`lib/coming-soon/announce.ts`), `cn` (`lib/utils`).
- Patterns: the `colored`/`currentColor` mark contract from `components/icons/brand-glyphs.tsx`.

**Primitives introduced**

- `ConnectorDefinition` + `CONNECTORS` (`features/connectors/`) — Why new: there was no catalogue of _user-attachable external systems_. Considered extending: `features/agent-connections` (agent reach: skills, MCP, render blocks — a different axis) and `components/icons/maker-brand.ts` (`MakerBrandId` is keyed to `ai.model_public.maker`, i.e. AI model makers; Notion/Gmail are not model makers). Rejected because both would blur two distinct registries.
- `ConnectorStrip` (`features/connectors/ConnectorStrip.tsx`) — Why new: no existing component renders a sub-composer, status-bearing offer row. Considered extending: shortcut chip rows in the composer. Rejected because those raise prompt intents, not account-connection intents, and carry no connected/unavailable state.
- `LiveIntegrationsList` + `LiveIntegrationsWindow` — Why new: the canonical Settings surface truthfully includes setup placeholders and local-only integrations, while chat needs the smaller set usable from the web app now. The list reuses the same catalogue and connect actions as the strip instead of creating a second provider registry.

---

## Change log

- `2026-08-30` — Made chat connector visibility fail closed on the catalog's sanitized `connection_ready` proof and stopped generic OAuth from inventing a CIMD client id unless provider metadata explicitly supports it; Figma now remains hidden while its MCP client admission is pending.
- `2026-08-30` — Completed dynamic-provider artwork fallback: each entry now tries its website favicon, known brand glyph, catalogue art, and cached 128px favicon before any branded initial, eliminating anonymous letter tiles whenever provider identity is available.
- `2026-08-30` — Restored the canonical full-color provider artwork in the rotating chat strip and Integrations window; dynamic MCP entries now retain catalogue `iconUrl`/brand color instead of collapsing to one generic monochrome plug.
- `2026-08-29` — Chat now shows three fairly rotated live integrations plus `More`. The shuffled bag prevents provider favoritism and consecutive repeats when possible; `More` opens a searchable WindowPanel containing every web-usable live integration while excluding local-only and coming-soon Settings entries.
- `2026-08-29` — Aligned the normal-chat connector row to the composer's inner content line and shortened the Workspace chip label to `Google`; the capability detail remains in its description and tooltip.
- `2026-08-29` — Halved the connector reminder's vertical footprint across every Smart Agent Input: the visual row is now 16px with a 2px composer gap, while coarse-pointer hit areas remain 40px via non-layout pseudo-elements.
- `2026-08-28` — Auth-gated the shared Google inventory query so `/chat/new` cannot read the authenticated-only connection table during pre-hydration anonymous state.
- `2026-08-22` — First-party Google connector cards now share one live scope-health reader across Chat and Settings; the directory exposes Workspace, Gmail, and Search Console with each connector's canonical management door.
- `2026-08-19` — Codex: retired the legacy Slack demo callback that returned a bot token in the browser URL. Slack connections must use canonical MCP OAuth so tokens are sealed in Unified Credential Vault.
- `2026-08-19` — Codex: removed Notion's stale Coming Soon promise and connected the real chat strip to the existing per-user MCP catalog and OAuth flow. MCP-backed connector ids now resolve generically by canonical server slug, so future official MCP providers reuse the same path.
- `2026-08-18` — Claude: created the feature — config type, seeded registry (Google Workspace, Gmail, Notion (coming-soon), Google Search Console (directory-only)), the strip, local brand marks, and the `/demos/connector-strip` demo. Verified in light and dark at 1280px and 375px.
