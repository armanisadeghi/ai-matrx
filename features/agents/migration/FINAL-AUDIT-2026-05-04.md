# Final Legacy-System Audit — 2026-05-04

**Branch:** `claude/audit-legacy-systems-I6N9w`
**Scope:** Identify every functionality that would be **lost or broken** if the legacy systems (`recipes`, `prompts`, `prompt-apps`, `prompt-builtins`, `prompt-actions`, `context-menu`, plus their Socket.IO/FastAPI infrastructure) were deleted today.
**Companion docs:** [`README.md`](./README.md) · [`MASTER-PLAN.md`](./MASTER-PLAN.md) · [`INVENTORY.md`](./INVENTORY.md)

This report focuses on **gaps not already documented in `INVENTORY.md`** plus an integrated risk view of the documented gaps. Treat it as the punch-list before Phases 14 → 15 → 16 → 17 → 18 → 19.

---

## 1. Headline — what we cannot delete today

| # | Surface | What's lost on delete | Replacement state |
|---|---|---|---|
| 1 | **Public chat (`/p/chat`, `/p/chat/a/[id]`, `/p/chat/c/[id]`)** | Multi-agent public chat picker, public conversation recovery, guest agent picker UI | **No agent equivalent** — `agent-apps` only covers `/p/[slug]` (single-app URLs). Generic public chat surface needs a new design before deletion. |
| 2 | **`/applets`, `/apps/custom/[slug]`, `/apps/custom/[slug]/[appletSlug]`** | Live parent-child applet pattern with shared working memory; landing page is linked from `MatrixFloatingMenu`; backed by `custom_app_configs` / `custom_applet_configs` (349+ refs) | **Phase 10 blocked on 5 design questions** — no migration to agent-apps yet. |
| 3 | **Quick Actions menu (header ⚡)** | Header dropdown on every authenticated page (Quick Notes / Tasks / Chat / Data + Utilities Hub), and floating sheets attached to context-menu / window-panels registry | **Phase 4 blocked** on design decision (hardcoded vs. `app_actions` table). The feature is consolidated into `features/quick-actions/` (Aug 2025) but still dispatches to legacy execution under the hood. |
| 4 | **Code editor V2/V3/Compact + Multi-File HTML editor** | Live AI code editing inside `/prompt-apps/[id]` (`PromptAppEditor` → `AICodeEditor`) and HTML-page editing tab (`HtmlCodeFilesTab`) | **Phase 6 blocked**: V2 was swapped to `useAgentLauncher` but no `agx_agent` IDs exist for `prompt-app-ui-editor`, `generic-code-editor`, `code-editor-dynamic-context`. The live `/prompt-apps/[id]` path uses `useAICodeEditor` directly and is unaffected by Phase 6 — **but is still an open Phase-18 blocker**. |
| 5 | **`submitChatFastAPI` (Socket.IO gateway thunk)** | Active chat (`features/chat/hooks/useExistingChat.ts`), admin prompt generators (`GeneratePromptForBuiltinModal`, `GeneratePromptForSystemModal`) | Routes already to `/api/ai/agents/{agentId}` — agent-capable but lives in `lib/redux/socket-io/`. Must be either preserved as infrastructure or replaced with `useAgentLauncher` at every call site. **Not in INVENTORY.** |
| 6 | **Public prompt-app data path** | 7 of 61 `prompt_apps` rows were **not migrated** (variable-name mismatches with `variable_definitions`); `/p/[slug]` falls through to the legacy resolver for those slugs | Migration script is ready; needs a follow-up data patch on the 7 outliers before the prompt-app branch of `/p/[slug]` is removed. |
| 7 | **Org placeholder routes** | `org/[slug]/prompts`, `org/[slug]/prompt-apps` ("Coming Soon" pages) | No org-scoped agent equivalents shipped — placeholder pages can be repointed or deleted, not lost. |

---

## 2. Newly discovered legacy couplings (NOT in `INVENTORY.md`)

These are direct imports from legacy directories by features that should be agent-native. Each must be cut before Phase 18 can run.

### 2.1 `features/agents/` itself imports legacy code (3 files)

| File | Imports | Severity |
|---|---|---|
| `features/agents/components/.../AgentsGrid.tsx` | `DesktopFilterPanel` from `features/prompts/components/layouts/` | Medium — UI layout component |
| `features/agents/components/builder/.../SystemMessage.tsx` | `SystemPromptOptimizer` from `features/prompt-actions/` | Medium — feature is agent-builder, the dependency name says "prompt" |
| `features/agents/components/.../SmartAgentResourcePickerButton.tsx` | `Resource` type from `features/prompts/types/resources` | Low — type-only |

> **Action:** port these three pieces into `features/agents/` before Phase 18.

### 2.2 `features/code-editor/` imports legacy components (4 files, 7 imports)

- `AICodeEditorModalV2.tsx` (Phase 6 — known)
- `ContextAwareCodeEditorModal.tsx` — 2 imports from `features/prompts/components/`
- `ContextAwareCodeEditorCompact.tsx` — 2 imports from `features/prompts/components/`
- `AICodeEditor.tsx` — 1 import from `features/prompts/`

The two `ContextAware*` files are not in the Phase 6 plan. **Add to Phase 6.**

### 2.3 `features/cx-conversation/` imports `features/public-chat/` (4 files, 9 imports)

- `ConversationInput.tsx` — 5 imports
- `useConversationSession.ts` — 2 imports (type + hook)
- `UnifiedChatWrapper.tsx` — 1 import
- `UserMessage.tsx` — 1 import

This is a chat-layer-on-chat-layer dependency. Document in `INVENTORY.md §8` and target before deleting `features/public-chat/`.

### 2.4 `features/conversation/` imports prompt types (3 files)

- `useAuthenticatedChatProps.ts`, `usePublicChatProps.ts`, `resource-parsing.ts` — all import `Resource` type from `features/prompts/types/resources`.

`features/conversation/` is documented as a Tier 1 feature in `CLAUDE.md`. Move the `Resource` type into a shared `lib/types/` location (or `features/agents/types/`) before deleting `features/prompts/`.

### 2.5 `features/ai-models/` and `features/ai-runs/` import prompt types (4 files)

- `features/ai-models/components/DeprecatedModelsAudit.tsx`, `ModelUsageAudit.tsx`, `services/service.ts`
- `features/ai-runs/utils/name-generator.ts`

Type-only imports (`PromptVariable`, `Resource`, etc.). Same fix: relocate types.

### 2.6 `features/content-templates/` imports prompts (2 files)

- `ContentTemplateManager.tsx`, `SaveTemplateModal.tsx`

Owner unclear — check whether content-templates should live alongside `features/agent-shortcuts/content-blocks` or stay independent.

### 2.7 `features/cx-chat/` and `features/public-chat/` (already known, severity confirmed)

- **`features/cx-chat/`**: 10 prompt imports, used by **all `(ssr)/demos/chat/*` routes**. Per `cx-chat/MIGRATION-TRACKER.md` Phase 6 (2026-03-28) the SSR runtime is on the agent execution system internally — the imports are presentation-layer types/components only. Remap → delete in 18.
- **`features/public-chat/`**: 14 prompt imports (4 × `useAgentConsumer` from prompts/hooks, 4 type imports, 6 component imports). Used by `/p/chat/*` and `/api/cx-chat/*`. **`useAgentConsumer` must be ported** into `features/agents/hooks/` (the new system has no equivalent yet) before this can be unwired. `DEPRECATED-useAgentChat.ts` is still wired into `ChatContainer`.

---

## 3. Infrastructure surfaces — Socket.IO & FastAPI

`lib/redux/socket-io/` is **not legacy-only**. It's a shared streaming/task layer that the new agent system also rides on.

| Symbol | Used by legacy? | Used by new agent system? | What breaks if deleted |
|---|---|---|---|
| `submitChatFastAPI` | Yes (prompts) | Yes (`features/chat/hooks/useExistingChat.ts`, admin prompt generators) | Active chat + admin generators |
| `submitTaskThunk` | Yes (prompts) | Yes (`features/applet/hooks/useAppletRecipe.ts`, `features/scraper/parts/recipes/`, `useCockpitRecipe`) | Applet + Scraper + AI Cockpit |
| `submitAppletAgentThunk` | Yes (legacy applet FastAPI opt-in `?fx=1`) | No | Applet FastAPI mode (low traffic) |
| `socketTasksSlice`, `socketResponseSlice`, `socketConnectionsSlice` | Yes | Yes (chat task tracking, scraper, cockpit) | Streaming UI everywhere |
| `socket-response-selectors`, `socket-task-selectors` | Yes | Yes | Same |

**Implication:** `lib/redux/socket-io/` cannot be deleted in Phase 18. It needs an explicit "shared infrastructure — keep" mark. The prompt-specific paths inside it (named in `INVENTORY.md §4`) can be pruned, but the slices stay.

### FastAPI endpoint usage (`ENDPOINTS.ai.chat`)

7 callers identified. Disposition:

- ✅ **Safe to delete**: 4 demo/test routes (`app/(public)/demos/api-tests/...`, `legacy/demo/...`)
- ⚠️ **Stays until Phase 18**: `features/prompt-apps/components/PromptAppPublicRendererDirectImpl.tsx`, `lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts` (prompt-only)
- ⚠️ **Stays until rewired**: `lib/redux/socket-io/thunks/submitChatFastAPI.ts` (shared — see above)
- ⚠️ **Stays until rewired**: `features/public-chat/hooks/DEPRECATED-useAgentChat.ts` (still wired into `/p/chat`)
- ⚠️ **Stays**: `features/tool-call-visualization/admin/hooks/useToolComponentAgent.ts` (admin debug, 2 consumers)

---

## 4. Redux slices — final dispositions

| Slice | Disposition | Notes |
|---|---|---|
| `lib/redux/prompt-execution/*` | Delete in Phase 18 | Prompt-only; `selectors.ts` reads from socket-response-selectors but exports nothing reused. |
| `promptEditorSlice` | Delete in Phase 18 | Internal bridge to `features/agents/components/builder/AgentSettings*` — bridge can be removed. |
| `promptRunnerSlice` | Delete in Phase 18 | Still referenced by SSR notes parallel menu (`app/(dev)/demos/notes/_components/NoteContextMenuContent.tsx` + `useNoteContextMenuGroups.ts`) — port that consumer first. |
| `promptConsumersSlice` | **Keep, rename, or fold into agent slice** | Reused by `features/cx-chat/hooks/useAgentConsumer.ts` for filter/sort state. The slice is genuinely agnostic — call it out as shared infrastructure. |
| `promptCacheSlice` | Delete in Phase 18 | Consumed only by `lib/redux/thunks/promptSystemThunks.ts`, `promptCrudThunks.ts`. |
| `contextMenuCacheSlice` | Delete in Phase 18 | Phase 5 added `agentContextMenuCacheSlice`; remove the legacy fallback path from the v2 hook in the same change. |
| `aiChatSlice` | Phase 20 | Already on the Phase 20 list. |

---

## 5. Routes that would 404 today

Routes whose page.tsx currently imports a legacy feature and **has no agent-system route shipped that covers the same UX**.

| Route | Backed by | Agent equivalent? |
|---|---|---|
| `/p/chat`, `/p/chat/a/[id]`, `/p/chat/c/[id]` | `features/public-chat/` | ❌ — `/p/[slug]` is single-app, not a chat picker |
| `/applets`, `/applets/[category]/[subcategory]` | `features/applet/` + DB tables | ❌ — Phase 10 blocked |
| `/apps/custom/[slug]`, `/apps/custom/[slug]/[appletSlug]` | `features/applet/` | ❌ — Phase 10 blocked |
| `/prompt-apps`, `/prompt-apps/[id]`, `/prompt-apps/new`, `/prompt-apps/templates`, `/prompt-apps/templates/[mode]` | `features/prompt-apps/` | Partial — `/agent-apps` admin exists but the public `/p/[slug]` resolves agent-apps first; `/prompt-apps/[id]` editor still uses `AICodeEditor` (Phase 6 blocker) |
| `/ai/prompts*` (list, new, edit, run, view, templates, compare, edit-redux, experimental/*) | `features/prompts/` | `/agents` covers list/new/edit/run; experimental routes have no equivalent |
| `/ssr/prompts/*` | SSR mirror of `/ai/prompts/` | `/demos/chat/a/[agentId]` only covers chat |
| `/administration/prompt-builtins/*`, `/administration/shortcut-categories/`, `/administration/prompt-apps/` | `features/prompt-builtins/` | `/administration/system-agents/shortcuts` covers shortcut admin; builtins admin has no agent equivalent |
| `/layout-tests/prompt-input` | `features/prompts/` | None — test route |

**Three of these are linked from primary nav** (`nav-data.ts`): `/prompt-apps`, `/ai/prompts` ("Prompt Builder"), `/applets`. Removing them without redirects breaks the sidebar.

---

## 6. Database — pre-deletion data sweep needed

| Table | Live data? | Action before Phase 19 |
|---|---|---|
| `prompts`, `prompt_versions` | Read but no longer written (all converted to agents) | Verify `agx_agent` parity, then drop |
| `prompt_apps` | 7 unmigrated rows (variable-name mismatches) | Patch input field names → re-run migrate script → drop |
| `prompt_app_executions`, `prompt_app_errors`, `prompt_app_rate_limits` | Historical analytics only | Snapshot to a `legacy/` schema before drop, or drop wholesale |
| `prompt_builtins`, `prompt_builtin_versions`, `prompt_shortcuts` | Read by admin builtins UI; UUIDs referenced from code-editor wrappers (Phase 6 blocker) | Block drop until Phase 6 resolves agent-id mapping |
| `system_prompts`, `system_prompt_executions` | Read by admin prompt generators | Audit and migrate, or drop with admin tools |
| `prompt_actions` | Read by `prompt-execution/actionCacheSlice` | Drop after Phase 18 deletes the slice |
| `prompt_app_categories`, `prompt_app_versions` | Subordinate to `prompt_apps` | Drop with prompt_apps |
| Views: `context_menu_unified_view`, `shortcuts_by_placement_view` | Read by legacy menu | Drop with menu |

---

## 7. Recommendations — minimum work to unblock the Phase 16-19 deletion campaign

Ordered by dependency:

1. **Decide Phase 4** (quick actions design). Without this, the header ⚡ menu's dispatch path is unclear and we cannot remove the legacy quick-actions execution thunks.
2. **Decide Phase 6** (which `agx_agent` IDs back the V2/V3/Compact code editors). Block on a 10-minute decision; without it, both `/prompt-apps/[id]` editing and Multi-File HTML editing block Phase 18.
3. **Decide Phase 10** (applets — 5 design questions). Without this, `/applets` and `/apps/custom/*` cannot redirect/sunset.
4. **Decide `/p/chat`'s fate** (this audit's new question). Either build a multi-agent agent-apps chat picker, or sunset `/p/chat` with a 302 to `/p/[slug]/...`. Today there is no migration target.
5. **Port shared types out of `features/prompts/types/`** to `features/agents/types/` (or `lib/types/`): `PromptVariable`, `Resource`, `PromptSettings`. Six features import from there (§2.4-2.6, plus chat features).
6. **Port `useAgentConsumer`** from `features/prompts/hooks/` into `features/agents/hooks/`. Used by both `cx-chat` and `public-chat`.
7. **Port `mapScopeToVariables`** from `features/prompt-builtins/utils/execution.ts` to `features/agent-shortcuts/utils/` (already noted in `INVENTORY.md §3`). SSR notes parallel menu still imports it.
8. **Patch the 7 unmigrated `prompt_apps` rows** (variable-name mismatches) and re-run the migrate script.
9. **Mark `lib/redux/socket-io/` and `promptConsumersSlice` as shared infrastructure** in `INVENTORY.md` so Phase 18 doesn't accidentally delete them.
10. **Refactor or wrap `submitChatFastAPI`** so its current callers (`useExistingChat`, admin generators) keep working. The thunk already routes to `/api/ai/agents/{agentId}`; the work is mostly a rename + dependency cleanup.

---

## 8. Items already correctly handled (no action required)

- `/ai/recipes*` — recipes feature is standalone, decoupled, no prompt imports. Recipes table can stay or go independently.
- `features/conversation/` (the stub) — 1-line re-export, safe to delete now.
- `features/chat/` — only used by `app/(legacy)/legacy/chat/`. Light coupling. Delete with Phase 18.
- `components/file-system/context-menu.tsx` — distinct `UnifiedContextMenu` for file ops, zero prompt coupling. Leave alone.
- Phase 8 `/p/[slug]` agent-app resolver — primary path; legacy fallback only for the 7 unmigrated rows.

---

## Change Log

| Date | Who | Change |
|---|---|---|
| 2026-05-04 | claude (audit-legacy-systems) | Created. Identified 7 surfaces still load-bearing for users, 7 newly discovered legacy couplings outside the inventory, and 10 ordered prerequisites for Phase 16-19. Adds three previously-untracked items: (a) `submitChatFastAPI` is shared infrastructure, not legacy-only; (b) `promptConsumersSlice` is genuinely agnostic and reused by the new chat surfaces; (c) `/p/chat` has no agent-equivalent route yet — the multi-agent public chat picker is missing from the migration plan. |
