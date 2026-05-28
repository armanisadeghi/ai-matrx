# FEATURE.md — `agent-connections`

**Status:** `scaffolded` (UI shell + route scaffold — all section data is still hardcoded mock; Preferences tab is real and synced to user prefs)
**Tier:** `1`
**Last updated:** `2026-05-13`

> This is the agent-facing hub for "what can this agent reach?" — models, skills, instructions, prompts, hooks, MCP servers, plugins. It is now mounted as a **Next.js route at `/agent-connections/*`** (one subroute per section, sidebar persists across navigations) AND still surfaced as a floating window panel for the legacy overlay flow. Most sections are still presentational; the new Preferences tab is wired through `useSetting()` to the user-preferences synced cache. The broader MCP + external integrations story lives in the sibling feature `features/api-integrations/` (see forthcoming `features/api-integrations/FEATURE.md`).

---

## Purpose

Agent Connections is the engineer-facing registry surface that governs **which tools, skills, instructions, prompts, hooks, MCP servers, and plugins an agent can reach**. Today it is a presentational shell (sidebar + sectioned body) designed to slot into the agent workspace; the connection/auth data model and runtime resolution still belong to `features/api-integrations/` and `features/agents/services/mcp.service.ts`.

---

## Entry points

**Routes**
- **`/agent-connections`** — Overview. Mounted via `app/(a)/agent-connections/page.tsx`.
- **`/agent-connections/<segment>`** — one subroute per section. Segments are kebab-case (`sub-agents`, `render-blocks`, `mcp-servers`); other sections use their enum value directly. The mapping is declared once in `features/agent-connections/constants.ts → SIDEBAR_SECTIONS[].urlSegment`, and the helpers in `features/agent-connections/routing.ts` (`sectionToHref`, `segmentToSection`) translate both ways.
- `app/(a)/agent-connections/layout.tsx` is the **persistent shell**: reads the panel-layout cookie server-side, then renders `<AgentConnectionsRouteShell>` with the sidebar mounted once and `{children}` filling the right pane. This is the canonical model for window-style pages — copy it for new feature shells.
- Also surfaced as a floating window: **`agent-connections-window`** (overlay id `agentConnectionsWindow`). Opened from the overlay controller and rendered via `features/window-panels/windows/agents/AgentConnectionsWindow.tsx`. The route and the overlay share the same sidebar and section components — the only difference is which navigation mode is active.

**Components (in `features/agent-connections/components/`)**
- `AgentConnectionsSidebar` — left-rail section picker. **Dual-mode**: when given `basePath`, it renders Next `<Link>`s and derives `activeSection` from `usePathname()`; when given `activeSection + onSelect`, it falls back to button + callback (legacy overlay mode).
- `AgentConnectionsBody` — Redux switch-based router for section content (used by the overlay window only — routes mount the section components directly through their `page.tsx`).
- `AgentConnectionsRouteShell` — client shell using `react-resizable-panels` v4 (`<ClientGroup>` + `<RegisteredPanel>` + `<Handle>` from `app/(ssr)/ssr/demos/resizables/_lib/`). Cookie-persisted sidebar width.
- `AgentConnectionsNavContext` — provider exposing `navigate(section)`. `mode="route"` pushes a route; `mode="overlay"` dispatches `setActiveSection`. Used by `OverviewSection`'s card grid so the same component works in both surfaces.
- Per-section components in `components/sections/`: `OverviewSection`, `AgentsSection`, `SubAgentsSection`, `SkillsSection`, `RenderBlocksSection`, `ResourcesSection`, `InstructionsSection`, `PromptsSection`, `CommandsSection`, `HooksSection`, `McpServersSection`, `PluginsSection`, `RegistriesSection`, `PreferencesSection`.
- Shared primitives: `SectionToolbar`, `GroupSection`, `ListRow`, `SectionFooter`, `ScopePicker`.

**Hooks / Services / Redux**
- `redux/ui/slice.ts` — `activeSection`, `viewScope`, `selectedItemId`. The route view does NOT read `activeSection` (the URL is the truth) — only the overlay window does. The slice stays for the overlay, for scope/selection state, and for the overview-card click that fires through `setActiveSection` in overlay mode.
- `redux/skl/` — skill/render/resource definition state (shared with the agents system).
- **Preferences tab** is wired to `useSetting<T>("userPreferences.agentConnections.<key>")` — the new `agentConnections` module on `UserPreferences` (`lib/redux/slices/userPreferencesSlice.ts`). Persistence (IDB + LS + Supabase) is handled automatically by the existing user-preferences engine. **No slice-binding entry was needed** — `features/settings/slice-bindings.ts → userPreferences` already does generic `module.preference` dispatch.

**API endpoints**
- None owned by this feature. Runtime tool access is resolved server-side from the agent definition (`POST /ai/agents/{id}` — see `features/agents/FEATURE.md`).

---

## Data model

**Database tables**
- None owned by this feature. No `agent_connection` / `agent_connections` table exists in the codebase. Tool and MCP configuration currently lives inside the agent definition itself (`agent_definition`, managed by `features/agents/redux/agent-definition/`) plus the MCP state in `features/agents/redux/mcp.slice.ts`.

**Key types** (`features/agent-connections/types.ts`)
- `AgentConnectionsSection` — `"overview" | "agents" | "skills" | "instructions" | "prompts" | "hooks" | "mcpServers" | "plugins"`
- `SidebarSection`, `OverviewCard` — sidebar + overview card shapes (label, icon, count, action)
- `SectionGroup<T>` — generic `{ key, label, items[] }` grouping used by Skills / Hooks / MCP sections
- `SkillEntry`, `AgentEntry`, `HookEntry`, `McpServerEntry` — list-row item shapes (id, name, description/filename, optional status)
- `McpServerStatus` — `"running" | "stopped" | "error"`

**Mock data source** (`features/agent-connections/data.ts`)
Most sections still read from hardcoded exports: `HOOK_GROUPS`, `MCP_GROUPS`, `AGENT_ENTRIES`, `AGENT_FILE_PREVIEW`. These are placeholders; nothing is fetched. **Exception — Skills:** the `SkillsSection` is live as of 2026-05-27. It reads from `features/skills/` (the canonical slice backed by `/api/skills`), supports full CRUD, filesystem ingest (admin), and category browsing. The legacy `SKILL_GROUPS` mock is no longer wired.

---

## Key flows

### (a) Configuring tool access per agent
**Not implemented here.** Today, tool/model/MCP selection for an agent happens in `features/agents/` (the Builder) and is persisted as part of the agent definition. When a user opens the Connections window there is no `agentId` prop threaded through; the sections render global/mock lists, not per-agent configurations. Wiring this up requires:
1. A route (or prop) providing the active `agentId`.
2. Selectors against `agentDefinition` for the agent's currently attached skills / MCP servers / hooks.
3. Mutations through the existing agent-definition thunks (not new endpoints).

### (b) Managing API keys / external auth
**Not implemented here.** No credential storage, no key vault UI, no service calls. External tool authentication (OAuth, API keys) is the domain of `features/agents/services/mcp-oauth/` and belongs documented in `features/api-integrations/FEATURE.md`. If key management lands in this hub later, it must never surface secrets to the client — tokens are server-side only.

### (c) Runtime resolution at agent invocation
Agent invocations hit `POST /ai/agents/{id}` with the agent ID plus per-call inputs. The server resolves the full tool/MCP/skill list from the stored agent definition and assembles the execution context. **The client never sees the complete tool list directly**, and this UI does not change that — anything it eventually mutates must round-trip through the agent-definition writes on the server. See `features/agents/FEATURE.md` → "Two invocation payloads" for the Builder-vs-Runner split.

### (d) Current demo-only flow (what actually runs today)
1. Overlay controller opens `AgentConnectionsWindow`.
2. Local `useState<AgentConnectionsSection>` starts at `"overview"` (or `initialSection` prop).
3. Sidebar click → `setActiveSection(value)`.
4. `AgentConnectionsBody` switch renders the matching section.
5. Section filters its hardcoded group list by search string; selecting an agent shows `AGENT_FILE_PREVIEW` as a static numbered preview.
6. No mutations, no network calls, no persistence. Close the window — all local state gone.

---

## Invariants & gotchas

- **This is a shell, not a system of record.** Do not treat `data.ts` as a source of truth — any "real" Connections work must resolve through `features/agents/redux/agent-definition/` (tools/skills attached to the agent) and `features/agents/redux/mcp.slice.ts` (MCP server state).
- **Client never sees the full tool list.** The server owns tool resolution per agent invocation. If this hub grows editing capabilities, display must be selector-driven off the already-loaded agent definition, not a separate fetch that would leak the registry.
- **Connection auth stays server-side.** API keys, OAuth tokens, MCP server credentials are never rendered or round-tripped through client state. `features/agents/services/mcp-oauth/` owns the OAuth dance.
- **The stated route does not exist yet.** Docs and PRDs reference `/ai/agents/[id]/connections`; the code ships a floating window instead. Do not create the route without checking with the agent-system owners — it may be intentionally a window/overlay.
- **Sidebar contract is bi-modal.** Pass `basePath` for the route surface OR `activeSection + onSelect` for the overlay. Mixing both is a bug — `basePath` wins and `usePathname()` becomes the source of truth. New surfaces should always use `basePath`.
- **OverviewSection must run inside `<AgentConnectionsNavProvider>`** (or it'll fall back to dispatching `setActiveSection`, which only works in the overlay world). The route shell and the overlay window both mount the provider; if you embed `OverviewSection` somewhere else, wrap it.
- **Cookie name is versioned** (`panels:agent-connections:v1`). Bumping the panel layout's default sizes or panel ids requires bumping the version so old cookies don't clamp to invalid layouts.
- **Prompts are dead.** The Prompts section is a placeholder row. The prompts system has been superseded by agents + shortcuts + agent-apps (see `features/agents/migration/`). A "Prompts" tab inside Connections is legacy surface by name; treat it as a slot to repurpose or remove.
- **No permission gating lives here.** Scope (admin/user/org) is expected to apply to most sections (shortcuts, hooks, instructions are multi-scope by project rule), but nothing enforces or filters by scope in this feature yet.

---

## Related features

- **Depends on (when wired up):** `features/agents/` (agent definition + MCP state + tool registry), `features/api-integrations/` (external tool + MCP catalog, auth storage — see its forthcoming `FEATURE.md`)
- **Depended on by:** `features/window-panels/` (registers the window + overlay), `components/overlays/OverlayController.tsx` (dynamic import + mount)
- **Cross-links:**
  - `features/agents/FEATURE.md` — umbrella for agent runtime, invocation, and tool resolution
  - `features/agents/agent-system-mental-model.md` — how tools participate in an agent turn
  - `features/agents/services/mcp.service.ts` — MCP wiring used at invocation time
  - `features/api-integrations/FEATURE.md` *(forthcoming)* — canonical doc for external integrations, MCP protocol details, and credential storage
  - `features/window-panels/registry/windowRegistry.ts` — registration of `agent-connections-window`

---

## Current work / migration state

Scaffolded UI only. Before adding real behavior:

1. Decide surface (floating window vs. dedicated route under `app/(a)/agents/[id]/...`). Coordinate with the agents migration plan at `features/agents/migration/MASTER-PLAN.md`.
2. Replace hardcoded `data.ts` with selectors off `agentDefinition` + `mcp` slices — no parallel local state (project rule: RTK only for new state).
3. Thread `agentId` through the window/route; all sections become per-agent views.
4. Defer credential / API-key UI to `features/api-integrations/` — do not implement auth storage here.

---

## Change log

- `2026-05-27` — claude: SkillsSection promoted from a placeholder to live. Now reads `/api/skills` via the new `features/skills/` slice, supports browse / create / edit / delete / categories / filesystem ingest (admin), and reacts to sandbox auto-discovery events (`RESOURCE_CHANGED kind="skills.ingested"`). The SkillsCount selector also moved from the legacy `skl` slice to the new `skills` slice; render-blocks / resources are still served from `skl`.
- `2026-05-13` — Promoted to a real Next.js route family under `app/(a)/agent-connections/*` (14 subroutes, persistent sidebar via `layout.tsx`, cookie-persisted resizable shell). Added the `preferences` section + new `agentConnections` module on `UserPreferences` wired through `useSetting()`. Made the sidebar dual-mode (`basePath` for routes, `activeSection + onSelect` for the overlay). Introduced `AgentConnectionsNavContext` so `OverviewSection` works in both surfaces.
- `2026-04-25` — `AgentConnectionsWindow` imports sidebar/body from `components/*` and `AgentConnectionsSection` from `types` instead of `@/features/agent-connections` barrel.
- `2026-04-22` — claude: initial doc.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature — especially when mock data is replaced with real selectors, a real route is added, or this hub starts mutating agent definitions — update status, flows (a)/(b)/(c), and append to the Change log. Stale FEATURE.md cascades across parallel agents.
