# Context Menu v3 — the universal right-click / floating menu

**Status:** built, rolling out (v2 frozen). One menu for every surface: a near-zero shell on mount, full power on first open, all modals through the OverlayController.

`EditableContextMenu` / `NonEditableContextMenu` wrap children; the menu does everything automatically from `surfaceName` + a few value props. **The single most important contract is value mapping** (below) — the AI shortcuts and bound agents depend on it.

---

## The load tiers — why this exists

99% of surface renders never open the menu. v2 still paid for the whole menu (MenuBody + react-icons + modals) on every mount; a static import of it once ballooned the prod build 15→24 min. v3 splits the cost by *engagement*:

| Tier | File | Loads |
|---|---|---|
| **T0 — shell** | `ContextMenuV3.tsx` | every mount. Radix trigger, selection capture, floating-icon button, footer. **Imports nothing heavy.** |
| **T1 — MenuContent** | `components/MenuContent.tsx` | first open only (`dynamic({ssr:false})`). Data hooks, launchers, handlers, react-icons, the whole tree. Fires the single deduped fetch on its mount. |
| **OVL — overlays** | OverlayController | on click. Find/Replace, Attach To, Share, Inspect, Compare, Quick Actions — **dispatched, never rendered by the menu.** |

**Invariant:** `MenuContent` is reachable ONLY via the shell's `dynamic()` import. Static-importing it anywhere is an eslint error (`contextMenuV3StaticImportBan`). The shell carries zero data, zero submenus, zero modal code.

---

## No fake menus — the headline invariant

A menu that opens but Copy does nothing and the selection bar is empty is a **bug**, killed at two layers (`value-resolution.ts`):

1. **Self-resolving content (zero wiring).** When the user right-clicks read-only content with no manual selection, the shell captures the subtree's text (`extractElementText`) as a `content` fallback. `resolveActionText` makes Copy / AI act on selection-or-content, so Copy always works. Actions are **source-gated** — an action that can't act never renders.
2. **Loud dev guard.** `reportMenuDiagnostics` SCREAMS (console.error) when a menu opens inert (no selection, no content, no surface items) or when a surface declared an `alwaysAvailable` value it failed to emit. A recovery firing means a real defect got past the surface — never silent.

---

## Value mapping — known values are ALWAYS present; surface values pass through without exception

`resolveApplicationScope` (`value-resolution.ts`) builds the `ApplicationScope` the menu acts on:

- **The 5 generic baselines** — `selection`, `text_before`, `text_after`, `content`, `context` — are guaranteed present via the platform primitive `withBaselineScope` (empty-floored). An agent author can bind to any of them on any surface. **Never reimplement this floor.**
- **Surface-declared values pass through verbatim** from `getApplicationScope()` (live, preferred) or `contextData` (static), merged with the captured selection. Precedence for `content`: surface → editable field value → DOM-text fallback.
- At launch, `launchShortcut` / `launchAgent` resolve the agent's slots from this scope via `mapScopeToInstanceWithSurface` (surface `value_mappings` + the shortcut's `scopeMappings`). The menu does not re-implement mapping.

Declared SurfaceValues live in `features/surfaces/manifests/` (one manifest per surface). A surface that declares a value must emit it — the dev guard screams otherwise.

---

## Public API — two wrappers, one shell

Import the wrapper **statically** (it's the lightweight shell; no per-consumer `dynamic()` — that's v3's whole point):

```tsx
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
```

- **`EditableContextMenu`** — textareas/editors. Presets `isEditable`; accepts `getTextarea` / `onTextReplace` / `onTextInsertBefore|After` / `onContentInserted` / `onSave` / `onDelete` (Cut/Paste/Insert/Save/Delete light up).
- **`NonEditableContextMenu`** — viewers, results, rendered markdown. No text mutation; Copy/AI/Attach/Share/Export/Convert still work via content self-resolution.

Both take: `sourceFeature` (required — attribution), `surfaceName` (registry surface → AI actions + bound agents + value mappings), `getApplicationScope` / `contextData` (values), `contentSource` (rich-document source → Copy-as/Export/Convert), `entity` (`{type,id,title,resourceType?,isOwner?}` → Attach To + Share), `placementMode`, `addedContexts`/`excludedContexts`, `extraSections` (surface passthrough), history props, `scope`/`scopeId`, `enableFloatingIcon`. Types: `types.ts`.

---

## Reuse, never fork — what the menu consumes

The menu is a thin consumer of existing platform systems. **Do not recreate any of these here.**

- **Copy-as / Export / Convert** → `rich-document` action registry (`resolveActions` by category). New rich-document actions appear automatically. (`rich-document-actions` skill.)
- **Attach To** → `context-assignment` (`contextAssignment` overlay → `ContextAssignmentWindow`, writes `ctx_scope_assignments`). (`context-assignment` skill.)
- **Share** → `sharing` (`shareModalWindow` overlay).
- **AI Actions / Bound Agents / Content Blocks / My&Org Items** → `useUnifiedAgentContextMenu` + `useSurfaceBoundAgents`, one deduped fetch.
- **Compare** → `useOpenDiffViewerWindow` + `diffCompareSlice`.
- **Quick Actions** → `useQuickActions` (existing overlays).
- **Find/Replace** → `findReplace` overlay (callback-aware opener carries the target element + `onReplace`). **AI result display is the launcher's job** (`launchShortcut` `displayMode`) — there is no separate result overlay.
- **Inspect Context (admin)** → `adminStateAnalyzer` overlay. Delete confirms via `confirm()` (`ConfirmDialogHost`), never a browser dialog.

---

## A double fetch is impossible

The unified-menu thunk (`fetchUnifiedMenu`) has a Redux `scopeLoaded` condition + a module-level inflight map. Bound agents (`fetchSurfaceBoundAgentsGrouped`) gained the same result-cache + inflight map. `MenuContent` remounts on every open and fires both — the guards collapse repeated opens to one network call per session. Routes that pre-fetch agents/shortcuts are a no-op for the menu.

---

## Default agents — honored on every surface

Beyond a surface's own bound agents, the menu always surfaces the platform
**default-contract** agents (`agx_agent_surface` rows on `matrx-default/*`),
deduped against the surface's own, as one "Default agents" group. This honors a
user's (or the system's) defaults everywhere — including bare/undeclared
surfaces — so generic agents (clean-up, "help with this", summarize) need no
per-surface wiring. Qualification (`qualifyingDefaultSurfaces`):

- `matrx-default/default` (5-value contract) — every surface.
- `matrx-default/basic-content-display` (2-value) — every surface.
- `matrx-default/basic-editor` (4-value) — editable surfaces only.

The merge + dedupe live in `surface-bound-agents.service.ts` (one query, cached),
so EVERY consumer — the right-click menu AND `ProTextarea`'s "…" menu — inherits
defaults identically; a surface-bound agent is never shown twice. The "Agents"
submenu renders even with no `surfaceName` (defaults still apply).

## v1 features restored

The hard-won pieces are carried over (and improved): the floating selection icon (`components/FloatingSelectionIcon.tsx`, enterprise `TextSelect` icon), the selection preview bar (generalized — shows the resolved **content** when there's no manual selection, so the user always sees what the menu will act on), and the macOS-safe selection capture/restore (`utils/selection-tracking.ts`).

**Undo/Redo** light up on any editable surface even with no history wiring: when the surface supplies no `onUndo`/`onRedo`, the menu falls back to the field's native browser undo stack (`document.execCommand` — the only programmatic trigger for a textarea's built-in history). A surface that owns a richer history still passes `onUndo`/`onRedo`/`canUndo`/`canRedo` to override.

---

## v2 is frozen — migration

`features/context-menu-v2/` gets no new work; it's deleted once all consumers move. The pure utils v3 lifted from it (`selection-tracking`, `FloatingSelectionIcon`) and the logic it still imports (`useUnifiedAgentContextMenu`, `BoundAgentsMenuSection`) become v3-owned at that point.

**Migration recipe** (per consumer): replace the `dynamic(() => import(".../context-menu-v2/UnifiedAgentContextMenu"))` block + `<UnifiedAgentContextMenu isEditable …>` with a static `import { EditableContextMenu }` (or `NonEditableContextMenu`) and `<EditableContextMenu …>` — drop `isEditable` (the wrapper presets it) and `enabledPlacements` (use `placementMode`). Props are otherwise 1:1. Add `contentSource` + `entity` to unlock Copy-as/Export/Convert/Attach/Share. Verify with `pnpm type-check`; test the surface.

For a rollout, **invoke the `context-menu-v3` skill** — the per-surface recipe.

**Migration status: COMPLETE for production.** Every production consumer renders v3 (notes ×2, code ×3, agents working-document / message-builders / chat-input / conversation-display, transcripts, research init+synthesis+document, rag, tasks, cleanup, projects, scraper, files preview). The v2 menu COMPONENT has **no production render-consumers** — verified by grep, not the (incomplete) original audit.

**Remaining before deleting `context-menu-v2/`:** (1) `MarkdownContextMenuProvider` still renders the v2 menu and is used by `SafeBlockRenderer` (markdown-engine internal) — migrate it to render v3 directly (template: `AgentConversationDisplay`). (2) Dev demos `(dev)/demos/context-menu/{lab,scenarios}` still use v2; `canonical-v2` is the intentional v2 reference. (3) Relocate the pure utils (`build-application-scope`, `selection-tracking`, `resolveMarkdownContext`), the `useUnifiedAgentContextMenu` hook + `BoundAgentsMenuSection`, and the `PlacementMode` type (still imported by `build*ContextData.ts`) into v3, then delete v2.

---

## Doctrine

- **Build the platform, not the artifact.** v3 is the reusable primitive; every action delegates to an existing system. Forbidden: a copy/save/share/attach/export path that only serves this menu.
- **Loud recovery.** Both no-fake-menu guards scream when they fire — a firing means a real bug got past surface wiring.
- **One menu.** No bespoke per-surface context menus. A surface contributes via `extraSections`, never a fork.

---

## Change Log

- `2026-06-24` — v3 built. Inert shell + lazy MenuContent + value-resolution core with the no-fake-menu guards (content self-resolution + loud dev diagnostics) and the always-present baseline + surface-value passthrough contract. Reuses rich-document (Copy-as/Export/Convert), context-assignment (Attach To), sharing (Share), the unified-menu + bound-agents fetch (deduped — bound-agents service gained a cache), Compare, Quick Actions. Registered `findReplace` + `contextAssignment` overlays; AI result display left to the launcher (no redundant overlay). Restored the floating icon (TextSelect), generalized selection/content preview bar, and macOS-safe selection capture. v2 frozen.
- `2026-06-24` — Demo is the rollout reference: `/demos/context-menu/canonical` rebuilt all-v3 (bare / editable / read-only display + agents / notes / code surface wirings); v2 snapshot preserved at `/demos/context-menu/canonical-v2`. Agent + Code demo panels migrated to v3. Renamed the rich-document download action to **"Download as Markdown"** (`FileDown` icon) — it always blobs `.md`. Print already correct via reuse (`printMarkdownContent`, no heavy-dep import). Open: dual-destination save (local + cloud `SaveAsDialog`), HTML/CSV/Excel conversion modules, broader capability pull-in from the assistant action menu.
- `2026-06-24` — Production rollout COMPLETE + `context-menu-v3` skill added. All ~20 v2 render-consumers migrated to Editable/NonEditableContextMenu (incl. `AgentConversationDisplay` replacing `MarkdownContextMenuProvider` with inlined v3 + preserved `resolveContextOnOpen`, plus 3 audit-missed consumers found by grep verification: research init/synthesis, files preview). v2 menu component has no production consumers. Remaining v2-deletion blockers documented in the migration section.
- `2026-06-25` — Default-contract agents now honored on EVERY surface (incl. bare/undeclared): the menu merges `matrx-default/{default,basic-content-display,basic-editor}` bindings — deduped — into a "Default agents" group (`surface-bound-agents.service.ts`, shared with `ProTextarea`). The agents submenu renders without a `surfaceName` (was hidden) and is relabeled "Agents". Added a native Undo/Redo fallback on editable surfaces so basic editors offer undo with no surface wiring.
- `2026-06-25` — Killed a cross-menu crash class. "Inspect Context" rendered the menu's `context` scope value raw, so any surface whose `context` is a structured object (code editor: `{language, filePath, lineCount, …}`) threw *"Objects are not valid as a React child"* via `DialogContent`. Fixed at the source — `components/debug/ContextDebugModal.tsx` now JSON-stringifies non-string standard-scope values (matching its Custom Variables branch) — and hardened the shared a11y primitive `lib/react/treeContainsComponent.ts` to SKIP a non-renderable child + scream in dev instead of throwing a misleading trace (it had been the deceptive crash site for every dialog). v3 was never affected: v3's "Inspect Context" opens the global state viewer, not this modal. The crash only appears on the still-live **v2** menu (footer `C1V1`) — a stale checkout tell.
