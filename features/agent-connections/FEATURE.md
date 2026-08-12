# FEATURE.md — `agent-connections`

**Status:** `live` (route family + overlay window shipped; `redux/skl` is the canonical content-block/render-definition store consumed platform-wide; 6 of 14 sections read real data, the rest are declared placeholders)
**Tier:** `1`
**Last updated:** `2026-08-09` — verified against live code this date.

> Two things live here, and the second matters more than the first:
> 1. **The Agent Connections hub UI** — "what can this agent reach?" (agents, skills, render blocks, MCP servers, …) at `/agent-connections/*` and as the `agentConnectionsWindow` overlay.
> 2. **`redux/skl` — the canonical Redux store for `skill.render_definition` rows** ("render blocks" = "content blocks"; same rows). The unified agent context menu, agent-shortcuts hooks, and this hub all read and write through it. **Touching skl is touching the context menu**, not just this page.

---

## Purpose

Agent Connections is the registry surface for what agents can reach — and the home of the one content-block store. The broader external-integrations story (MCP protocol, OAuth, credential storage) belongs to `features/api-integrations/` and `features/agents/services/mcp-oauth/`.

Cross-repo product plan: [`common-docs/projects/ai-work-hub/PLAN.md`](/Users/armanisadeghi/code/common-docs/projects/ai-work-hub/PLAN.md) — read it before building conversation browsing, provider launch, saved requests, skills, associations, or automation for this integration.

---

## The `skl` store — canonical content-block / render-definition state

**Table:** `skill.render_definition` (schema `skill`; the old `public.content_blocks` is retired — see `scripts/dead-relations.json` and `skl-migration-guide.md`). **One slice** (`redux/skl/`, key `skl` in `lib/redux/rootReducer.ts`) holds these rows; there is no parallel copy anywhere.

**Row shape** (`redux/skl/types.ts` → `SklRenderDefinition`): `blockId`, `label`, `template`, `categoryId`, plus the classification trio —
- `blockType: "render_kind" | "xml" | "markdown"` — how the template renders (`render_kind` binds to the Shape system's `content_ir.kind_component`; this palette itself is the markdown-atom side, per SHAPE_SYSTEM R1).
- `visibility` — the `platform.visibility` enum; `isPublic` is legacy sugar kept in sync (`visibility === "public"`).
- `skillId` — owning skill, nullable.

**Two hydration paths, one merge discipline:**
1. **Full fetch** — `fetchRenderDefinitions` (`redux/skl/thunks.ts`): Supabase direct on `skill.render_definition`, `deleted_at IS NULL`, scope-filtered via `applyScopeFilter` (VIEW LAW satisfied in-thunk), → `renderDefinitionsReceived` (replaces the set).
2. **Context-menu hydration** — `fetchUnifiedMenu` (`features/agents/redux/agent-shortcuts/thunks.ts`) hits `GET /api/agent-context-menu`, backed by the **`agent.context_menu_view`** DB view, and dispatches `sklActions.renderDefinitionsMerged` with partial rows. Since **2026-08-08** the view emits `block_type` / `skill_id` / `visibility`, so wire rows are near-complete. The merge is `Object.assign`-based and **partial-safe**: the thunk OMITS (never nulls) classification fields absent from a stale cached payload, and the slice's defaults (`markdown`/`public`) apply only to rows never seen by any fetch. **Never turn an omitted field into an explicit null on this path** — that would erase a fetched row's real classification.

**Writes** — `createRenderDefinition` / `updateRenderDefinition` / `deleteRenderDefinition` (skl thunks), Supabase direct. `stampScopeForWrite` stamps ownership from the caller's scope and **never writes a NULL `organization_id`** (falls back to `ensureOrgId` → personal org). Converters (`redux/skl/converters.ts`) own the row↔state mapping including the `visibility`/`isPublic` reconciliation — explicit `visibility` wins.

**Compat layer** — `redux/skl/content-block-compat.ts` re-exports the old `agent-content-blocks` names (`AgentContentBlockDef`, `selectAllContentBlocksArray`, `selectContentBlocksByScope`, …) as thin aliases over skl selectors. External consumers import through it or the skl modules directly:
- `features/context-menu-v3/hooks/useUnifiedAgentContextMenu.ts` — the live context menu.
- `features/agent-shortcuts/hooks/useAgentShortcuts.ts` + `types.ts` — shortcut surfaces (maps `"global"` scope → `"user"` before calling skl).
- `features/agents/redux/agent-shortcuts/{thunks,selectors}.ts` — unified-menu hydration + read-through selectors.

**Categories** — render blocks FK to `platform.categories` rows with `dimension='shortcut'` (shared with agent shortcuts). `fetchRenderBlockCategories` reads them (plain `select("*")`; the aliased-json select triggered TS2589), `rowToShortcutCategory` maps name→label / position→sort_order; `selectRenderBlockCategoryTree` builds the parent tree.

**Resources are RETIRED here (2026-07-06).** `skill.resource` is gone; a skill's resources are `code_files`/notes attached via `platform.associations`, managed by `features/skills/` (`createSkillResourceThunk`, `SkillResourcesPanel`). `hooks/useResources.ts` and the slice's `resources` branch are inert — never populated. Migrate callers to `features/skills/`; do not add code here.

**Skill definitions + skill categories are NOT here.** They moved to `features/skills/redux/` (backed by `/api/skills`) in May 2026. Do not add skill/category code to skl.

---

## Entry points

**Routes** — `app/(core)/agent-connections/*` (route group `(core)`, AppShell):
- `/agent-connections` — Overview (card grid). 13 subroutes, one per section; segments from `constants.ts → SIDEBAR_SECTIONS[].urlSegment` (kebab-case where needed: `sub-agents`, `render-blocks`, `mcp-servers`), translated by `routing.ts` (`sectionToHref` / `segmentToSection`).
- `layout.tsx` is the persistent shell: reads the panel-layout cookie (`panels:agent-connections:v1`, versioned — bump on layout-shape changes) server-side, renders `<AgentConnectionsRouteShell>` (react-resizable-panels v4) with the sidebar mounted once. Each `page.tsx` mounts its section component directly.
- **Every sidebar section MUST have a route directory.** The sidebar renders `<Link>`s straight from `SIDEBAR_SECTIONS`; a listed section without a `page.tsx` is a 404 (the Prompts route was exactly this gap until 2026-08-09).

**Overlay** — `agentConnectionsWindow` (opener `features/overlays/openers/agentConnectionsWindow.tsx`, component `features/window-panels/windows/agents/AgentConnectionsWindow.tsx`). Same sidebar + section components; navigation via Redux (`ui` slice) instead of the URL.

**Components** (`components/`)
- `AgentConnectionsSidebar` — **bi-modal**: `basePath` → Next `<Link>`s + `usePathname()`-derived active section (route mode); `activeSection + onSelect` → button/callback (overlay mode). Mixing both is a bug — `basePath` wins. New surfaces always use `basePath`.
- `AgentConnectionsBody` — Redux-switch section router, **overlay only** (routes mount sections via `page.tsx`).
- `AgentConnectionsNavContext` — `navigate(section)` provider; `mode="route"` pushes a URL, `mode="overlay"` dispatches `setActiveSection`. `OverviewSection` requires it (both shells mount it; wrap it yourself anywhere else).
- Shared primitives: `SectionToolbar`, `GroupSection`, `ListRow`, `SectionFooter`, `ScopePicker`, `AgentConnectionsHeaderControls`.

**Section liveness** (`components/sections/`) — the old `data.ts` mock file is **deleted**; nothing renders mock data:
| Live | Reads |
|---|---|
| `SkillsSection` | `features/skills/` slice (`/api/skills`); full CRUD, categories, filesystem ingest (admin) |
| `RenderBlocksSection` | skl via `hooks/useRenderBlocks.ts` (definitions + category tree); badges block type + visibility (see below); detail view read-only, editor pending |
| `AgentsSection` | `features/agents/redux/agent-definition/` (`fetchAgentsList` → `selectLiveAgents`) |
| `McpServersSection` | `features/agents/redux/mcp/mcp.slice.ts` (`fetchCatalog`, `connectServer` / `disconnectServer` / `discoverServerTools`) |
| `PreferencesSection` | `useSetting<T>("userPreferences.agentConnections.<key>")` — persistence via the user-preferences engine, no slice-binding needed |
| `PluginsSection` (shown as **Coding Platforms**) | Owner-scoped `chat.coding_session` rows via direct Supabase; storage health, Claude-first connection status, four-provider filters, fidelity verdicts, and canonical conversation doors/actions |

Placeholders (empty-state copy, no data source): `SubAgentsSection`, `ResourcesSection` (inert slice — see Resources above), `InstructionsSection`, `PromptsSection`, `CommandsSection`, `HooksSection`, `RegistriesSection`. Prompts as a concept is superseded by agents + shortcuts + agent-apps; treat that tab as a slot to repurpose or remove.

**Hooks** (`hooks/`)
- `useRenderBlocks` — fetches definitions + categories for the current view scope; returns tree + byCategoryId.
- `useViewScope` — resolves the ui slice's `viewScope` selection to a concrete scopeId from `appContextSlice` (canonical scope source; nothing mirrored).
- `useAgents`, `useMcpCatalog` — thin adapters over the agents-system slices (no data owned here).
- `useResources` — inert, retired (above).
- `coding-sessions/useCodingSessions.ts` — latest-request-guarded browser read of the signed-in owner's private session bindings. The query declares `created_by = current user` rather than using RLS as its view definition, keeps the last successful rows visible behind `StaleDataNotice` when a refresh fails, and labels the 100-row history ceiling instead of presenting a partial count as a total.

**Redux**
- `redux/skl/` — the canonical store (above).
- `redux/ui/slice.ts` (`agentConnectionsUi`) — `viewScope`, `activeSection`, `selectedItemId`. **Route mode never reads `activeSection`** (URL is truth); the slice serves the overlay, scope/selection state, and overview-card navigation in overlay mode. Scope change clears the selection.

**API endpoints** — none owned. Reads/writes are Supabase-direct (skl) or other features' paths; `GET /api/agent-context-menu` belongs to the agent-shortcuts system.

---

## Key flows

### (a) Render-block classification reaches the UI
`agent.context_menu_view` (2026-08-08) → `fetchUnifiedMenu` → `renderDefinitionsMerged` → `RenderBlocksSection`'s `ClassificationBadges`: list rows badge only the non-baseline (`blockType !== "markdown"`, `visibility !== "public"` — `render_kind` shows as `kind`); the detail header always shows both. Extending fidelity display elsewhere (context menu rows, shortcut pickers) reads the same skl fields — never a second fetch.

### (b) Editing a render block
`RenderBlocksSection` detail is read-only today (template `<pre>`; three-pane editor + live `BlockRenderer` preview is the declared next step). Any mutation goes through the skl thunks — they keep the context menu, shortcut hooks, and this hub consistent because all three read one slice.

### (c) Per-agent connection configuration
**Not implemented.** No `agentId` is threaded into the hub; sections show global/scope-filtered lists. Tool/model/MCP selection per agent lives in `features/agents/` (the Builder) inside the agent definition. Wiring it here means: thread `agentId`, select off `agentDefinition`, mutate via existing agent-definition thunks — no new endpoints.

### (d) Runtime resolution at invocation
The server resolves the full tool/skill/MCP set from the stored agent definition on `POST /ai/agents/{id}`. The client never sees the complete tool list; nothing in this hub changes that.

### (e) Coding-platform bridge health and history
`PluginsSection` is repurposed as **Coding Platforms** because the provider integrations are plugins/extensions. It reads `chat.coding_session` directly through browser Supabase (RLS owner-only plus an explicit owner predicate), joins only the canonical conversation's display/action state, and never reads `chat.coding_session_entry` raw payloads. A successful empty read says **Storage reachable**, not “plugin installed”; a binding is **Detected** only after an authenticated adapter has delivered a session. Every session names its conversation through `EntityRef` (open/new-tab/peek) and reuses `buildConversationMenu` for share, canonical fork/duplicate, pin, archive, and knowledge-graph state. The binding surface suppresses inline Rename (which only `ItemRow` can service) and conversation Delete (which would leave the surviving provider binding pointing at a deleted conversation); users can open the canonical conversation for those lifecycle operations.

Fidelity is a verdict, never an inference: `event_mirror` says native resume is unavailable and continuation is a seeded handoff; `native` says only that the exact ledger exists and lists the still-required credential/workspace/runtime/lease checks. The page never turns either state into a “Resume” button on its own. Canonical provider vocabulary is storage `claude_code|codex|cursor|vscode`, conversation `source_app` `claude-code|codex|cursor|vscode`, and `source_feature='code-editor'`; the conversation source tree provides the provenance filter.

---

## Invariants & gotchas

- **One content-block store.** Every consumer of `skill.render_definition` rows goes through `redux/skl` (directly or via `content-block-compat`). A second slice, local cache, or bespoke fetch of these rows is a defect.
- **The merge path must stay partial-safe.** `renderDefinitionsMerged` may receive stale cached payloads missing the classification trio; senders omit those keys, never null them. The slice's `markdown`/`public` defaults are for never-fetched rows only.
- **`visibility` is authoritative; `isPublic` is derived.** Converters and the unified-menu hydration both maintain `isPublic = visibility === "public"`. Never set one without the other.
- **No NULL `organization_id` on writes** — `stampScopeForWrite` + `ensureOrgId` guarantee it; keep that guarantee on any new write path.
- **Sidebar section ⇒ route directory** (see Entry points). Adding a section touches `types.ts`, `constants.ts`, a section component, `AgentConnectionsBody`, and a `page.tsx`.
- **Sidebar is bi-modal; `basePath` for every new surface.** `OverviewSection` needs `AgentConnectionsNavProvider`.
- **Connection auth stays server-side.** No credentials/tokens in client state; `features/agents/services/mcp-oauth/` owns the OAuth dance; external-integration credential UI belongs to `features/api-integrations/`.
- **Skill/category/resource code does not come back here** — `features/skills/` owns all three now.
- **Cookie name is versioned** (`panels:agent-connections:v1`).
- **No permission gating in this feature** — scope filtering is a view filter (RLS is the ceiling); nothing here enforces admin tiers.
- **Raw coding state stays private.** The browser lists owner-scoped bindings and canonical conversation identity only. It never fetches raw session entries, commands, paths, file content, or system messages; sharing/forking acts on the canonical conversation.
- **No false resume.** `event_mirror` is never labeled native, and `native` is never labeled resumable without the runtime prerequisites. Seeded handoff and native resume remain distinct product actions.
- **Conversation actions use conversation state.** Never derive archive/pin/knowledge-graph state from the provider binding. The joined canonical conversation plus `platform.user_entity_state` are authoritative, and this surface refreshes its private read model after a successful mutation. If the user-state read fails, Pin/Unpin is omitted rather than rendered from a guessed default.

---

## Related features

- **`features/agents/`** — agent definitions (AgentsSection's data), MCP slice + service (McpServersSection's data), the unified-menu thunk that hydrates skl, runtime invocation.
- **`features/agent-shortcuts/`** + **`features/context-menu-v3/`** — the main consumers of skl content blocks.
- **`features/skills/`** — skill definitions, categories, and skill resources (all formerly here).
- **`features/content-ir/`** — the Shape system; `render_kind` blocks bind to `content_ir.kind_component` (SHAPE_SYSTEM R1).
- **`features/api-integrations/`** — external integrations + credential storage.
- **Coding Session Bridge** — cross-repo contract: `/Users/armanisadeghi/code/common-docs/systems/coding-session-bridge/FEATURE.md`.
- **`features/window-panels/` / `features/overlays/`** — the overlay surface (`agentConnectionsWindow`).
- `skl-migration-guide.md` (this folder) — the 2026-04 `skl_` namespace migration rationale; historical context, superseded on table names by the live schema (`skill.render_definition`, `platform.categories`).

---

## Current work / next steps

1. **Render-block editor** — three-pane detail editor + live `BlockRenderer` preview (detail view is read-only today).
2. **Per-agent view** — thread `agentId` so sections show one agent's attached set (flow c).
3. **Coding platform installation** — publish the Claude marketplace package, then replace the honest “not published” distribution status with the verified install command; Codex/Cursor/VS Code adapters follow the shared contract.
4. **Placeholder sections** — each needs a real data source or removal; Prompts is a repurpose-or-remove candidate.
5. **Retire `hooks/useResources.ts`** + the slice's `resources` branch once no import remains.

---

## Change log

- `2026-08-11` — Linked the canonical AI Work Hub plan that turns the existing Coding Platforms,
  chat, skills, projects, tasks, war rooms, and schedules primitives into one user-facing workflow.
- `2026-08-11` — The Skills vertical is **agent-writable**: `matrx-user/connections-skills` gained 5 ask-policy `mode:"draft"` targets over the skill editor (label, description, type, body, trigger patterns), with handlers in `features/skills/components/SkillDetailEditor.tsx`. `SkillsSection` now passes that editor `surfaceName` + `onDraftSnapshot` and spreads the returned draft into `getScope`, so the manifest's new `skill_draft_*` values report the STAGED form while `selected_skill_summary` keeps reporting the saved registry row. Nothing else in the vertical changed — the browser, ingest panel and category tree register no handlers and offer an agent no write tool. See `features/surfaces/FEATURE.md` (2026-08-11).
- `2026-08-09` — Repurposed the Plugins placeholder as the live Coding Platforms bridge: direct owner-scoped `chat.coding_session` health/history, Claude-first detection/install truth, four-provider vocabulary, explicit event-mirror/native-ledger verdicts, retryable stale reads, and canonical conversation open/new-tab/peek/share/fork actions. Registered Claude Code, Codex, Cursor, and VS Code in conversation provenance filters; raw entry payloads remain owner-only and unread by the browser.
- `2026-08-09` — Adversarial review closed four truthfulness gaps before release: the personal history now declares its owner predicate, initial load says “Checking” rather than “Storage reachable,” the 100-row ceiling is disclosed, invalid timestamps fail visibly, and canonical actions read canonical conversation/UES state instead of provider-binding fields or hard-coded defaults. Non-row Rename and orphan-producing Delete are suppressed on this surface.
- `2026-08-09` — Full FEATURE.md rewrite against live code (doc previously described a mock-data scaffold; `data.ts` deleted, routes live under `(core)`, skl documented as the canonical content-block store). Added `ClassificationBadges` to `RenderBlocksSection` — first UI consumer of the 2026-08-08 block_type/visibility fidelity (list rows badge non-baseline; detail always). Fixed the dead Prompts sidebar link by adding the missing `app/(core)/agent-connections/prompts/page.tsx`.
- `2026-08-09` — Resources filter chips no longer wrap mid-word at 375px: the row is an `overflow-x-auto` rail and each chip carries `shrink-0 whitespace-nowrap`. The global unlayered mobile block in `app/globals.css` sets `word-break: break-word` on every `div`/`span`, so a flex chip that is allowed to shrink gets its label broken letter-by-letter — chips must always opt out of both shrinking and breaking.
- `2026-08-08` — `agent.context_menu_view` now emits `block_type` / `skill_id` / `visibility` on content-block items (view applied live + ledger-recorded); `fetchUnifiedMenu` hydration consumes them, so `redux/skl` `renderDefinitionsMerged` no longer silently defaults unfetched personal `render_kind` blocks to public-markdown. Wire types optional to tolerate stale cached payloads.
- `2026-07-22` — Added a `// VIEW LAW:` comment to `redux/skl/thunks.ts` `fetchRenderDefinitions` noting the scope is applied immediately below via `applyScopeFilter`, clearing THE VIEW LAW's bare-RLS guard finding (no behavior change).
- `2026-05-27` — claude: SkillsSection promoted from a placeholder to live. Now reads `/api/skills` via the new `features/skills/` slice, supports browse / create / edit / delete / categories / filesystem ingest (admin), and reacts to sandbox auto-discovery events (`RESOURCE_CHANGED kind="skills.ingested"`). The SkillsCount selector also moved from the legacy `skl` slice to the new `skills` slice; render-blocks / resources are still served from `skl`.
- `2026-05-13` — Promoted to a real Next.js route family (14 subroutes, persistent sidebar via `layout.tsx`, cookie-persisted resizable shell). Added the `preferences` section + new `agentConnections` module on `UserPreferences` wired through `useSetting()`. Made the sidebar dual-mode (`basePath` for routes, `activeSection + onSelect` for the overlay). Introduced `AgentConnectionsNavContext` so `OverviewSection` works in both surfaces.
- `2026-04-25` — `AgentConnectionsWindow` imports sidebar/body from `components/*` and `AgentConnectionsSection` from `types` instead of `@/features/agent-connections` barrel.
- `2026-04-22` — claude: initial doc.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature — especially when a placeholder section gains a data source, the render-block editor lands, or per-agent wiring starts — update status, flows, invariants, and append to the Change log. Stale FEATURE.md cascades across parallel agents.
