# FEATURE.md — `connectors`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-18`

---

## Purpose

The user-facing catalogue of external systems a person can attach to their account, plus **`ConnectorStrip`** — the one-line reminder that sits *under the agent input* and offers the connections a conversation could use. This feature owns the **catalogue and the presentation**. It never owns a connect flow: the strip raises `onConnect(providerId)` and the host opens the OAuth/window panel.

---

## Entry points

**Components**
- `features/connectors/ConnectorStrip.tsx` — `<ConnectorStrip />`. Client, presentational, props-driven.
- `features/connectors/ChatConnectorStrip.tsx` — the container that answers "what has this user actually connected" (Google inventory → `connectedIds`) and "what happens on click" (opens the floating Google connect window). Mounted under the real chat composer by `AgentConversationColumn`. Any new surface mounting the strip should reuse this container rather than resolving status again.

**Config**
- `features/connectors/registry.ts` — `CONNECTORS`, `connectorsFor(surface)`, `getConnector(id)`.
- `features/connectors/types.ts` — `ConnectorDefinition`, `ConnectorSurface`, `ConnectorStatus`, `ConnectorStatusSource`.
- `features/connectors/marks.tsx` — local brand marks + `lucideMark(Icon)` fallback.

**Routes**
- `app/(dev)/demos/connector-strip/page.dev.tsx` — every state side by side (nothing / some / all connected, `hideWhenAllConnected`, compact, surface filters, raised intents).

**Redux slice(s)** — none. This feature holds no state.

**API endpoints** — none owned.

---

## Data model

No tables of its own. The connected-set is whatever the host resolves; for the Google connectors that is `features/marketing/google/service.ts → listGoogleConnectionInventory()` (Supabase-direct), the same source `features/google-workspace/connection.ts` uses.

**Key types** (`types.ts`)

- `ConnectorDefinition` — `id`, `name`, `blurb`, `logo`, `surfaces`, `manageHref?`, `comingSoonId?`.
- `ConnectorSurface` — `"strip" | "directory"`. **Explicit, never inferred.**
- `ConnectorStatus` — `"connected" | "not_connected" | "unavailable"`.
- `ConnectorStatusSource` — `connectedIds?` (a set) or `resolveStatus?` (a resolver; wins).

---

## Key flows

### (a) Mounting the strip under an agent input

```tsx
<ConnectorStrip
  connectedIds={connectedIds}          // e.g. ["google-workspace"]
  onConnect={(id) => openConnectPanel(id)}
/>
```

Trigger: the composer renders. The strip reads `connectorsFor("strip")`, maps each entry to a status, and renders one 24px-tall row. Exit: the user clicks a chip → `onConnect(id)` fires; the strip changes nothing itself.

### (b) A connector the user already has

Status `connected` → the mark paints **brand color** (every other state is `currentColor`/muted), a `Check` appears, and — when the definition has `manageHref` — the chip becomes a real `<Link>` to the management surface (THE DOOR LAW). No `manageHref` → the chip is inert, never a fake button.

### (c) Everything connected

The strip **stops nagging**: it collapses to one muted `N tools connected` link to `directoryHref` (default `/user-settings/integrations`), or renders nothing at all with `hideWhenAllConnected`.

### (d) A connector we do not support yet

`comingSoonId` set → status is `unavailable` regardless of the connected-set, the chip is dashed + `soon`, and clicking calls `announceComingSoon(id)` against `lib/coming-soon/registry.ts` (`connectors.notion` today). **Never a bare "coming soon" string.**

### (e) Adding a provider

One entry in `registry.ts`: id (generic to the provider, permanent), name (today's truth), blurb (one user-facing line), a local mark, and `surfaces`. Nothing in `ConnectorStrip.tsx` changes.

---

## Invariants & gotchas

- **The strip owns no connect logic.** It raises an intent. Any Google/Notion/OAuth call inside this directory is a defect.
- **`surfaces` is the gate, not a hint.** `"strip"` is reserved for connections that change what a *normal conversation* can do; niche but real connectors (Google Search Console) are `["directory"]` only — directory-only is **not** the same as coming-soon.
- **The `id` is generic; the `name` carries today's truth.** `google-workspace` covers any file the user picks or we create — Docs and Sheets are today's support, not the ceiling. Never bake a feature list into an id or a file name.
- **Color means connected.** This is a deliberate departure from ChatGPT/Claude/v0, which keep composer chrome monochrome. Here the paint-on-connect is the reward and the only status signal that survives at 11px. An unconnected mark must stay `currentColor`.
- **One line, 24px, always.** It sits under a chat input; it may never wrap or compete. Overflow scrolls horizontally (`overflow-x-auto scrollbar-hide`) — this is why nothing breaks at 375px.
- **Touch targets:** chips are 24px tall by design; a `before:` pseudo-element expands the hit area to 40px on mobile only (`sm:before:hidden`) without adding a pixel of layout height.
- **No hotlinked logos, ever.** Marks are local inline SVG (`marks.tsx`) or a Lucide icon via `lucideMark`. No emoji.
- **`resolveStatus` overrides `connectedIds`** — pass one, not both, unless you mean it.

---

## Related features

- Depends on: `features/google-workspace` (`GOOGLE_WORKSPACE_SETTINGS_HREF`), `lib/coming-soon`, `components/ui/tooltip`.
- Depended on by: `ChatConnectorStrip` → `AgentConversationColumn` (the real chat composer); a future connector **directory** page consumes `connectorsFor("directory")`.
- Cross-links: `features/google-workspace/FEATURE.md`, `lib/coming-soon/FEATURE.md`, `features/agent-connections/FEATURE.md` (the agent-facing "what can this agent reach" hub — a different question from "what has this human attached").

---

## Doctrine compliance

**Primitives reused**
- Components: `components/ui/tooltip` (Tooltip/TooltipProvider/TooltipContent), `next/link`, Lucide icons.
- Services/constants: `GOOGLE_WORKSPACE_SETTINGS_HREF` (`features/google-workspace/connection.ts`), `announceComingSoon` (`lib/coming-soon/announce.ts`), `cn` (`lib/utils`).
- Patterns: the `colored`/`currentColor` mark contract from `components/icons/brand-glyphs.tsx`.

**Primitives introduced**
- `ConnectorDefinition` + `CONNECTORS` (`features/connectors/`) — Why new: there was no catalogue of *user-attachable external systems*. Considered extending: `features/agent-connections` (agent reach: skills, MCP, render blocks — a different axis) and `components/icons/maker-brand.ts` (`MakerBrandId` is keyed to `ai.model_public.maker`, i.e. AI model makers; Notion/Gmail are not model makers). Rejected because both would blur two distinct registries.
- `ConnectorStrip` (`features/connectors/ConnectorStrip.tsx`) — Why new: no existing component renders a sub-composer, status-bearing offer row. Considered extending: shortcut chip rows in the composer. Rejected because those raise prompt intents, not account-connection intents, and carry no connected/unavailable state.

---

## Change log

- `2026-08-18` — Claude: created the feature — config type, seeded registry (Google Workspace, Gmail, Notion (coming-soon), Google Search Console (directory-only)), the strip, local brand marks, and the `/demos/connector-strip` demo. Verified in light and dark at 1280px and 375px.
