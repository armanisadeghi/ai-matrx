# FEATURE.md — `connectors`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-17`

---

## Purpose

**The connector primitive** — the generic card, consent dialog, per-capability
health rows and settings panel that every provider is offered through, with
Google as the first provider config (`common-docs/projects/google-native/PLAN.md`
§2, §5.2, §5.3). Plus the user-facing catalogue of external systems a person can attach to their account, plus **`ConnectorStrip`** — the one-line reminder that sits _under the agent input_ and offers the connections a conversation could use. Normal chat shows exactly three fairly rotated, proven-connectable integrations and a `More` door. `More` opens the complete live-only catalogue in a canonical `WindowPanel`; unproven, local-only, and coming-soon Settings placeholders are deliberately excluded.

---

## Entry points

**Components**

- `features/connectors/ConnectorStrip.tsx` — `<ConnectorStrip />`. Client, presentational, props-driven.
- `features/connectors/ConnectorMark.tsx` — the ONE provider-artwork renderer. First-party connectors use local SVG marks; dynamic MCP connectors walk a provider-specific artwork chain (website favicon → known brand glyph → catalogue art → cached 128px favicon), with the catalogue brand color as the final failure fallback.
- `features/connectors/google-status.ts` — the ONE Google scope→product mapping, DERIVED from `provider-config.ts` since 2026-09-17 (`GOOGLE_PRODUCT_SCOPES`, plus the legacy `GOOGLE_CONNECTOR_SCOPES` projection for the registry ids). A scope mapping anywhere else is a fork.

**The connector primitive** (generic; the provider is a config, never a component)

- `features/connectors/provider-config.ts` — `ConnectorProviderConfig` + `GOOGLE_CONNECTOR_PROVIDER`. Nine Google product rows, two groups, one FINAL user-facing sentence each, each row's grant bundle, its server capability keys, and its attachable resource types. **Rollout state is not here** — it comes from the server catalog at request time (PLAN §2: it flips with no rebuild).
- `features/connectors/health.ts` — pure derivation of the per-capability health row: `productHealth`, `accountHealth`, `requiredScopesFor`, `productIsEligible`, `revokeConsequence`. Also the generic `ConnectorAccount` / `ConnectorCapabilityRollout` shapes every provider adapter reports in.
- `features/connectors/consent-plan.ts` — pure: `buildConsentPlan` (what to ask for, what is blocked and why) and `consentOutcomes` (per-row truth read back from the account after the exchange).
- `features/connectors/google-adapter.ts` — the ONE file in the primitive allowed to name Google: `useGoogleConnectorState` (inventory + capability catalog → generic shapes) and `useGoogleConsentRunner` (one GIS window, one `/exchange`).
- `features/connectors/ConnectorPromptCard.tsx` — the dismissible offer card, plus `shouldShowConnectorPrompt` (pure). `ConnectorPromptHost.tsx` is its wired form.
- `features/connectors/ConnectorConsentDialog.tsx` — `ConnectorConsentBody` (the rows, toggles, scope disclosure, org switch, result view) and the `connectorConsentDialog` overlay around it.
- `features/connectors/ConnectedAccountHealth.tsx` — the per-account, per-product health rows with Reconnect and Disconnect.
- `features/connectors/ConnectorsSettingsPanel.tsx` — Settings → Connectors: the health cards plus the same consent body, and the only file in the panel path that names Google.
- `features/connectors/ChatConnectorStrip.tsx` — draws exactly three providers from the persisted fair-rotation bag, resolves their live state, and opens the full integrations window from `More`. Mounted under the real chat composer by `AgentConversationColumn`.
- `features/connectors/LiveIntegrationsList.tsx` — searchable, live-only provider list shared by the floating window. Every named provider has a real Connect, Configure, or Manage door.
- `features/connectors/useLiveConnectors.ts` — the ONE container for connection state and actions across the strip and full list. Google uses the Google connect window; MCP entries use the canonical route selector and OAuth/no-auth/GitHub/configure path.
- `features/connectors/live-connectors.ts` — merges seeded Google/Gmail/Notion definitions with the usable MCP catalogue and enforces the live boundary.
- `features/connectors/rotation.ts` — pure randomized-bag selection and persisted-state parser.
- `features/marketing/google/hooks.ts` and `service.ts` — the shared Google inventory query is **auth-gated twice**: Redux prevents pre-hydration scheduling, and the service requires a live Supabase bearer token immediately before PostgREST. Redux identity can briefly outlive a signed-out client; querying `users.integration_connections` while anonymous is a producer bug because the table is intentionally granted only to `authenticated`. The browser selects generated `credential_present` / `credential_stable` facts; `credential_item_id` and `vault_secret_key` remain private server-side references.

- `features/connectors/attachable-resources.ts` — the ONE decision separating a **plain** connection (a pure MCP server: nothing to choose) from an **attachable** one (GitHub, Google: the useful act is choosing WHICH repositories or files). Pure; driven only by the availability payload's `attachable` list, with NO provider list in the client.
- `features/connectors/attachments.service.ts` — `/api/connections/resources` + `/api/conversations/{id}/attachments` (list / attach / detach). Errors are raised, never swallowed into an empty list.
- `features/connectors/redux/attachments.slice.ts` — `conversationAttachments`: landed `rows`, held `pending` picks, read status, write error.
- `features/connectors/useConversationAttachments.ts` — the ONE container every attachment surface reads through, including the `/chat/new` handoff and the capability gate.
- `features/connectors/ResourceAttachPicker.tsx` — the chooser. One picker for every provider; inventory providers filter locally, live providers search on a debounce and SAY they are searching.
- `features/connectors/AttachResourceDialog.tsx` — overlay container binding the picker to the conversation.
- `features/connectors/AttachedResourcesSection.tsx` — the attached list with per-item remove and an "Add more" door; mounted in the Tools picker.
- `features/connectors/useAttachResourcePicker.ts` — the ONE door to the chooser (`attachResourcePicker` overlay).

**Config**

- `features/connectors/registry.ts` — `CONNECTORS`, `connectorsFor(surface)`, `getConnector(id)`.
- `features/connectors/types.ts` — `ConnectorDefinition`, `ConnectorSurface`, `ConnectorStatus`, `ConnectorStatusSource`.
- `features/connectors/marks.tsx` — local brand marks + `lucideMark(Icon)` fallback.

**Routes**

- `features/overlays/openers/connectorConsentDialog.tsx` — the ONE door to "Choose what to connect" (`useOpenConnectorConsentDialog`).
- `features/window-panels/windows/connectors/LiveIntegrationsWindow.tsx` — canonical floating all-live-integrations window; fullscreen on mobile.
- `app/(dev)/demos/connector-strip/page.dev.tsx` — every strip state side by side (nothing / some / all connected, compact, surface filters, raised intents).

**Redux slice(s)** — `conversationAttachments` (`redux/attachments.slice.ts`). The connector catalogue itself still holds no state; what a person CHOSE out of a connection does, keyed by conversation.

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

### (d2) Two kinds of connection, and choosing what rides this chat

Arman, 2026-09-15: *"You are not differentiating between things that are just
purely a connection to an MCP and those that allow us to select something."*

The server's availability payload carries `attachable: [{resource_type, source,
label}]` per server — `github` → `github_repository` from our synced inventory;
`google` → `google_drive_file` / `google_sheet` live; a pure MCP server → `[]`.
A non-empty list makes the connection **attachable**, and its chip gains a
chooser door named in the provider's own words (`Choose repositories…`) plus a
count of what is already attached. An empty list keeps the chip **plain**,
because a door onto nothing is a dead control.

The chooser writes `platform.associations` edges through aidream. Picks made on
`/chat/new` — before the conversation row exists — are held against that same
minted id and flushed the instant the attachments GET proves the row is there;
until then they render as their own pending chips rather than passing for
attached. The full list, the remove controls and "Add more" live in the Tools
picker (the composer rail is one 16px line); the chat header carries a summary
where every item opens at the provider.

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
- **A connection is account-wide; an attachment is not.** "GitHub is connected" and "this chat works on `aidream` and `ai-matrx`" are different facts. Attachments are keyed by conversation and never by slug.
- **No provider list decides attachability.** `attachable` comes from the server, labels included, so a new attachable provider is a server change and no frontend change. The one provider-specific branch in the picker is GitHub's access door in the empty state, because GitHub is the only provider whose empty result has a fix the user can perform.
- **Three states are never collapsed:** a read that FAILED is not "nothing attached"; a held pick is not "attached"; a pick that could not be carried over stays on screen with the server's own sentence.
- **The read is gated on the capability existing.** No connection declaring `attachable` → nothing is fetched and nothing renders. This is what makes the frontend half safe to ship before the server half: an ungated read would put an amber warning in the header of every conversation on the platform about a feature nobody has. Guard: `__tests__/nothing-is-read-when-nothing-is-attachable.test.tsx`.
- 🚨 **"CONNECTED" IS NEVER A BOOLEAN THAT LIES.** A product row may say Connected only when three things are true at once: the account can authorize a call, every scope that product needs is granted, and the SERVER says the capability is live for this caller. Each one is a separate state with its own sentence and its own single remedy. The failure this exists to beat is the one every surveyed connector product ships (PLAN §1, last row) and has a recorded instance here: on 2026-07-25 a Search Console sync failed while the row said `status = 'connected'` and the credential reference was gone. Guard: `__tests__/connected-is-never-a-boolean-that-lies.test.ts`.
- 🚨 **ROLLOUT STATE IS THE SERVER'S, NEVER A CLIENT CONSTANT.** A row still behind our gate shows its sentence, no toggle, and "Turns on automatically when ready for your account", from `/api/google-integrations/capabilities` (`rollout_phase` + `eligible` + `admission_error`). `admission_error` is a CODE and is never shown — `google-adapter.ts` maps it to a sentence. A super admin sees `phase: "pending"` with `eligible: true` and CAN switch the row on; that combination is the internal-test lane and must keep working.
- 🚨 **THE REQUEST ASKS FOR EXACTLY WHAT WAS SWITCHED ON, PLUS WHAT THE ACCOUNT ALREADY HOLDS.** Asking for more is how a production Google authorization was rejected outright (`lib/googleScopes.ts`, the `GOOGLE_OUTREACH_INBOX_SCOPES` header); asking for less is what the hub refuses as "this authorization would remove existing Google access" — and if it ever stopped refusing, a grant would be dropped and every picked file stranded. Guard: `__tests__/consent-asks-for-exactly-what-was-switched-on.test.ts`.
- **The prompt card is a normal block ABOVE `ConnectorStrip`, never inside it.** The strip is one 16px line under a composer and its geometry is load-bearing; a card inside it would double the composer footprint on every surface that mounts it. The card is mounted by `NewChatGreeting` (the `/chat/new` screen) and by the settings panel — NOT by `SmartAgentInput`, because an account-wide offer under every composer on the platform is the exact defect `ChatConnectionsStrip` was built to end (2026-09-15).
- **A per-product "last successful call" does not exist yet, and is not faked.** `users.integration_connections` carries ONE `last_verified_at` and ONE `last_error` for the whole account and no per-capability call log (verified live 2026-09-17). `health.ts` returns `lastSuccessAt: null` and the UI labels the two timestamps it does have as account-level.
- **Which organizations an account serves is NOT a setting.** A personal connection has `organization_id` NULL and is reachable by its owner wherever they work; an organization-owned one is reachable by that organization's members, and the two resolve identically for the same provider login. The whole mechanism is the dialog's "Connect for <org>" switch (chair ruling, 2026-09-17) — never a served-organizations editor, which would be a second, weaker copy of the access rule.
- **`resolveStatus` overrides `connectedIds`** — pass one, not both, unless you mean it.

---

## Related features

- Depends on: `features/marketing/google` (the inventory query, the capability catalog, the exchange, `diagnoseGoogleConnection`), `features/google-workspace` (`GOOGLE_WORKSPACE_SETTINGS_HREF`), `features/agents` MCP catalog/OAuth primitives, `features/window-panels`, `features/overlays`, `lib/coming-soon`, `components/ui/tooltip`.
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

- `2026-09-17` — **THE CONNECTOR PRIMITIVE, with Google as the first provider
  config.** Google's ten approved products existed end to end — the OAuth hub,
  the vault, the Picker, incremental per-product consent, a typed capability
  catalog — and a person met none of it: Settings showed three status-only cards
  and chat showed a rotating "you could connect these" line. This is the first
  moment and the machinery under it, built generic because ~80 connectors follow
  (`common-docs/projects/google-native/PLAN.md` §2, §5.2, §5.3): a provider
  declares its products, sentences, grant bundles, capability keys and attachable
  types in `provider-config.ts`, and the card, the "Choose what to connect"
  dialog, the per-capability health rows and the settings panel render whatever
  provider they are handed. `google-adapter.ts` is the only file in the primitive
  that names Google. Beats the champion (the ChatGPT/Codex card and dialog) on
  the thing it gets wrong — "connected" while returning nothing: a row says
  Connected only when the credential works, every scope is granted and the server
  says the capability is live, and every other combination has its own sentence
  and its own Reconnect that asks for only the missing scope. `google-status.ts`
  is now derived from the provider config, so the scope→product map exists once.
  Retired `DirectoryConnectorCards.tsx`; its surface-scope contribution moved to
  the panel under the same key. Settings reads "Connectors" in both navs (the id
  and the route are untouched). Knobs seeded in
  `migrations/connectors_knobs.sql`. Guards, each proven failing-then-passing:
  `consent-asks-for-exactly-what-was-switched-on.test.ts`,
  `connected-is-never-a-boolean-that-lies.test.ts`. **Pending server half:** the
  one-button consent posts `connection_purpose: "google_products"` with
  `capability_keys` to `/api/google-integrations/exchange`, which the deployed hub
  does not accept yet (aidream lane U-P8). Until it does, pressing the button
  reaches Google's consent screen and the exchange answers 422; the dialog says so
  in its own words ("needs the newest AI Matrx server, which is still rolling
  out. Nothing was changed") instead of showing a validation dump, and reads the
  account back so a partial grant can never be invisible.
- `2026-09-15` — **A connection you can choose things out of is not a
  connection you can only connect to.** Every chip in the composer rail and the
  Tools picker wore the same name-plus-state treatment, which is the whole
  truth for a pure MCP server and half the truth for GitHub or Google, where
  the useful act is choosing WHICH repositories or files ride this chat
  (Arman: *"You are not differentiating between things that are just purely a
  connection to an MCP and those that allow us to select something"*). The
  split is driven only by the server's `attachable` payload, so no slug is
  special-cased: `attachable-resources.ts` decides the chip kind and writes the
  chooser's label in the provider's own words, `ResourceAttachPicker` is the
  one chooser for every provider (inventory filters locally, live search
  debounces and announces itself), and `redux/attachments.slice.ts` keeps what
  was chosen per conversation as `platform.associations` edges — including
  picks made on `/chat/new` before the row existed, which are held against the
  same minted id and flushed when the read proves it is there. The reaper
  (`destroyInstanceIfAbandoned`) now counts choosing what a chat works on as
  work, closing the same class that took per-run tool additions until
  2026-09-14. Guards, each proven failing-then-passing:
  `attachable-connections-are-distinct.test.tsx`,
  `attachments-survive-the-new-chat-handoff.test.ts`,
  `nothing-is-read-when-nothing-is-attachable.test.tsx`. **Pending:** the
  aidream half of the contract (`/api/connections/resources`,
  `/api/conversations/{id}/attachments`, and `attachable` on the availability
  payload) was not on `origin/main` when this shipped, so nothing here has been
  exercised against a live server yet; the capability gate keeps the surfaces
  silent until it is.
- `2026-09-13` — **Three honest MCP states, one derivation.** Every connection
  indicator in the chat hierarchy decided from `tool.mcp_user_conn.status`
  alone, so eight of admin@admin.com's servers whose access token expired days
  earlier — and GitHub, whose bearer comes from the first-party GitHub App
  connection rather than any MCP grant — all rendered as Connected (Arman:
  "the ui lies as well since I see a checkmark for git but don't actually have
  the mcp connected according to the agent"). `connection-state.ts` now
  derives exactly three states (`connected` / `needs_reauth` /
  `not_connected`) with a plain-English reason, preferring aidream's
  `GET /api/mcp-connections/availability` (only the server can see whether a
  stored refresh token makes an expired token renewable) and falling back to
  the catalog row — pessimistically, never with a false checkmark. Consumed by
  the chat Tools tab (`RunToolPicker`), the agent tools manager, and this
  feature's strip/list; `useConnectMcpServer` gives every one of them the same
  one-click reconnect door. `run-attachments.ts` reads the per-run truth from
  the run's `mcp_attachments` info event and `mcp_server_unavailable`
  warnings, so an attached server that failed THIS run wears its own error
  text in red instead of a checkmark. Guards (each proven failing-then-passing):
  `connection-state.test.ts`, `run-attachments.test.ts`.
- `2026-09-14` — The column wall that makes those vault references unreadable is now GUARDED, not just documented: `pnpm check:client-reads-granted` reads the LIVE grants, finds every relation this repo's client code reads where `authenticated` holds no table-level SELECT (five today, `users.integration_connections` among them), and fails any call site that says `select("*")`, names a withheld column, or has a select list it cannot resolve. Its self-test replays the pre-3918449ce7 Google select list against the real file and proves the guard fails on it (DD-238).
- `2026-09-12` — Replaced the Google inventory's forbidden vault-reference
  projection with database-generated boolean health facts, and stopped the
  shared query policy from replaying deterministic PostgreSQL `42501` denials.
- `2026-09-12` — Strengthened the shared Google inventory boundary to require
  a bearer token, not merely a session object, before constructing the
  authenticated-only PostgREST read.
- `2026-09-01` — Added a live-session guard at the shared Google inventory service boundary, preventing logout/session-expiry races from issuing anonymous reads against authenticated-only integration tables.
- `2026-08-31` — The Settings directory's Google connector cards now retain 44pt action targets on phones and render contextual loading plus an explicit retryable failure state instead of disappearing while account status is unavailable.
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
