# Phase 3 — Unified Agent Context Menu

**Status:** code-complete
**Owner:** claude (phase-3 task)
**Prerequisites:** Phase 1 (complete), Phase 2 (complete)
**Unblocks:** Phases 4, 5, 7

## Goal

Replace `features/context-menu/UnifiedContextMenu.tsx` (1765 LOC) with an agent-native equivalent. The new component reads from `agent_context_menu_view` via `fetchUnifiedMenu` (Phase 1 thunk), routes executions through `useAgentLauncher`, and honours multi-scope visibility with user > org > global precedence.

This is the single highest-leverage migration surface. Every editor in the app hangs off it — if it breaks, half the app breaks.

## Mapping from legacy to new

The legacy component's imports — read `features/context-menu/UnifiedContextMenu.tsx` top — tell the whole story of what needs rerouting:

| Legacy import | New import |
|---|---|
| `useUnifiedContextMenu` from `features/prompt-builtins/hooks` | `useUnifiedAgentContextMenu` from `features/agent-shortcuts/hooks` |
| `PLACEMENT_TYPES`, `PLACEMENT_TYPE_META` from `features/prompt-builtins/constants` | from `features/agent-shortcuts/constants` (built in Phase 1.7) |
| `mapScopeToVariables` from `features/prompt-builtins/utils/execution` | `mapScopeToAgentVariables` from `features/agent-shortcuts/utils/scope-mapping` (Phase 1.8) |
| `usePromptRunner` from `features/prompts/hooks` | `useAgentLauncher` from `features/agents/hooks` |
| `MenuItem`, `ContentBlockItem`, `ShortcutItem` from `features/prompt-builtins/types/menu` | equivalents exported from `features/agent-shortcuts/types` |
| `useQuickActions` from `features/quick-actions` | **unchanged in Phase 3** — Phase 4 migrates to DB-backed shortcuts |
| `selectIsDebugMode`, `selectIsAdmin`, `selectIsOverlayOpen` | unchanged |
| `TextActionResultModal`, `FindReplaceModal`, `ContextDebugModal`, `getIconComponent` | unchanged |

**Component props stay identical** — the legacy public API is not prompt-specific. This means Phase 5 is a mechanical swap at every call site.

## Success criteria
- [x] New component at `features/context-menu-v2/UnifiedAgentContextMenu.tsx` (new directory — do NOT overwrite v1).
- [x] Props surface identical to v1 (`children`, `editorId`, `getTextarea`, `onContentInserted`, `onTextReplace`, `onTextInsertBefore`, `onTextInsertAfter`, `isEditable`, `enabledPlacements`, `contextData`, `className`, `enableFloatingIcon`, `onUndo`, etc.). Adds two optional props: `scope`, `scopeId`, defaulting to `"global" / null` so existing call sites work without change.
- [x] Supports the 5 placement types: AI Actions, Content Blocks, Organization Tools, User Tools, Quick Actions.
- [x] Multi-scope visibility: user > org > global precedence when labels collide. De-duplication happens in the hook (`useUnifiedAgentContextMenu`) via `dedupeByPrecedence`, keyed by `(placementType, parentCategoryId, label)` for categories and `keyboard_shortcut || (categoryId, label)` for shortcuts, and `(categoryId, blockId)` for content blocks.
- [x] Floating selection icon behavior preserved (Mac selection-restoration fix too — ported intact via `selection-tracking.ts` util).
- [x] Keyboard shortcut display preserved (as in v1, the hint is display-only; binding is deferred to a later phase).
- [x] Undo/redo browser actions preserved.
- [x] SSR cache pattern preserved — hook reads `selectContextMenuHydrated` as a warm signal and fetches `fetchUnifiedMenu` on mount to populate the agent slices. A new (additive) RPC `get_ssr_agent_shell_data` is shipped in `migrations/get_ssr_agent_shell_data_rpc.sql`; wiring it into `DeferredShellData` / an agent-shell fetcher is deferred to Phase 5 (integration sweep) to avoid double-fetching.
- [ ] Manual smoke test passes: right-click in Notes, code editor, file-system — menus render and execute correctly. (Blocked — Phase 5 rewires consumers; a standalone testing suite lives at `/ssr/context-menu` — hub, `/ssr/context-menu/lab` — diagnostic, `/ssr/context-menu/scenarios` — 5-panel matrix.)
- [x] `INVENTORY.md` + this doc's Change Log updated.

## Out of scope
- Consumer wiring — Phase 5 does the mechanical swap.
- Removing the v1 component or v1 hook — Phase 18.
- Migrating quick actions to DB — Phase 4.

## Tasks
- **3.1** Create `features/context-menu-v2/UnifiedAgentContextMenu.tsx` by structured port from v1 (keep the same top-level structure — this is a dependency swap, not a rewrite).
- **3.2** Create `features/agent-shortcuts/hooks/useUnifiedAgentContextMenu.ts` (may have been stubbed by Phase 1.7; if so, flesh out).
- **3.3** Implement scope precedence in the hook: given two items with the same label but different scopes, user > org > global wins.
- **3.4** Write `get_ssr_shell_data` replacement RPC if the current one hard-codes `context_menu_unified_view`. Either update it or add a parallel one.
- **3.5** Wire the v2 component into one test consumer (e.g. a throwaway page under `app/(a)/demos/`) to verify the end-to-end path before Phase 5 rewires production call sites.

## Change log
| Date | Who | Change |
|---|---|---|
| 2026-04-20 | initial plan | Phase created |
| 2026-04-20 | main agent | Expanded scope with concrete import-swap table keyed off legacy `UnifiedContextMenu.tsx`. |
| 2026-04-21 | claude (phase-3) | Shipped `features/context-menu-v2/` (component + hook + subcomponents + selection-tracking util). Legacy `features/context-menu/UnifiedContextMenu.tsx` untouched. Files created: `features/context-menu-v2/{index.ts, UnifiedAgentContextMenu.tsx}`, `features/context-menu-v2/hooks/useUnifiedAgentContextMenu.ts`, `features/context-menu-v2/components/{MenuBody.tsx, FloatingSelectionIcon.tsx}`, `features/context-menu-v2/utils/selection-tracking.ts`, `app/(a)/demos/context-menu-v2/page.tsx`, `migrations/get_ssr_agent_shell_data_rpc.sql`. Routes agent execution through `useAgentLauncher().launchShortcut(shortcutId, applicationScope, opts)` — the launch thunk internally resolves variable mappings via `mapScopeToInstance`, so the component no longer needs to call `mapScopeToAgentVariables` directly (the util remains available for any consumer that wants to pre-resolve variables). Known caveats: (a) the `/api/agent-context-menu` route currently ignores the `scope` / `scopeId` query-string params — visibility is delegated to table RLS as intended by the view's header comment; if a future scope filter is wanted server-side, the route is the place to add it. (b) `get_ssr_agent_shell_data` RPC is shipped but not yet wired into `DeferredShellData.tsx` — Phase 5 will make that swap since it's the coordinated integration phase. (c) Keyboard-shortcut binding is not live (same as v1). |
| 2026-05-13 | claude | Fixed two breakages and consolidated the demo surface. **DB:** migrated `agx_context_menu_view` to emit `user_id`/`organization_id`/`project_id`/`task_id` on categories AND items (was missing — caused `extractScopeFromUnifiedItem` to default everything to `global`, hiding user/org rows), and changed the content-block discriminator from `'render_block'` to `'content_block'` (matched what `fetchUnifiedMenu` already filtered on, was silently dropping every content block). **Surface integration end-to-end for shortcuts:** added `surfaceName?` prop to `UnifiedAgentContextMenu` → propagated to `runtime.surfaceName` on every launch → `launchAgentExecution` shortcut branch now calls `fetchSurfaceValueMappingsForLaunch(agentId, surfaceName, state)` and passes the result as `surfaceValueMappings` to `createInstanceFromShortcut` → `createInstanceFromShortcut` now uses `mapScopeToInstanceWithSurface` when surface mappings are present, falling back to legacy `mapScopeToInstance` + `scopeMappings` otherwise. No half-fix: both paths funnel through the same instance-creation thunk so downstream stays identical. **Demo consolidation:** unified `/demos/context-menu-v2/{page.tsx, debug/page.tsx}` (deleted) and the standalone `/ssr/context-menu/page.tsx` (moved to `/ssr/context-menu/lab/page.tsx`) into a single testing suite at `/ssr/context-menu/*`. New shape: hub (`/page.tsx`) driven by `_registry.ts`, layout-owned nav strip in `_components/ContextMenuNav.tsx`, full diagnostic lab at `/lab`, 5-panel scenario matrix at `/scenarios`, and registered placeholders for planned `surface-mappings` + `launch-inspector` pages so future advanced testing is a single registry edit. |
