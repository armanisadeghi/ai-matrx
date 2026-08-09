# Context Menu v3 — the universal right-click / floating menu

**Status:** live everywhere — the ONLY context menu (`features/context-menu-v2/` deleted 2026-07-19). One menu for every surface: a near-zero shell on mount, full power on first open, all modals through the OverlayController.

`EditableContextMenu` / `NonEditableContextMenu` wrap children; the menu does everything automatically from `surfaceName` + a few value props. **The single most important contract is value mapping** (below) — the AI shortcuts and bound agents depend on it.

---

## The load tiers — why this exists

99% of surface renders never open the menu. v2 still paid for the whole menu (MenuBody + react-icons + modals) on every mount; a static import of it once ballooned the prod build 15→24 min. v3 splits the cost by _engagement_:

| Tier                        | File                               | Loads                                                                                                                                                                                                                                                      |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T0 — shell**              | `ContextMenuV3.tsx`                | every mount. Radix trigger, selection capture, floating-icon button, footer. **Imports nothing heavy.**                                                                                                                                                    |
| **T1 — MenuContent**        | `components/MenuContent.tsx`       | first open only (`dynamic({ssr:false})`) on a desktop viewport. Pure presentation over the shared engine; react-icons + the whole tree.                                                                                                                    |
| **T1m — MobileMenuContent** | `components/MobileMenuContent.tsx` | first open on a **mobile** viewport (`dynamic`). T1's twin: a 70dvh bottom-sheet drill-down over the SAME engine.                                                                                                                                          |
| **T1e — engine**            | `hooks/useContextMenuActions.ts`   | with either renderer. ALL behavior, exactly once: the single deduped fetch, scope resolution, rich-document actions, every handler (clipboard / history / compare / launch / attach / share / admin). **Never add a handler to a renderer — add it here.** |
| **OVL — overlays**          | OverlayController                  | on click. Find/Replace, Attach To, Share, Inspect, Compare, Quick Actions — **dispatched, never rendered by the menu.**                                                                                                                                    |

**Invariant:** `MenuContent` / `MobileMenuContent` are reachable ONLY via the shell's `dynamic()` import. Static-importing either is an eslint error (`contextMenuV3StaticImportBan`). The shell carries zero data, zero submenus, zero modal code.

## Mobile — the 70dvh bottom-sheet drill-down

On a mobile viewport (`useIsMobile()`) the shell renders a vaul `Drawer` instead of the Radix menus — a constant **70dvh** bottom sheet, one internal scroll area, iPhone-style **multi-tier drill-down** (tap a category → slide to its list with a Back button; the sheet height never changes). Triggered by **long-press** (480 ms, cancels on drag so text-selection/scroll still work) or the **floating selection icon**. `MobileMenuContent` reuses the EXACT same data hooks (`useUnifiedAgentContextMenu`, `useSurfaceBoundAgents`) and `useAgentLauncher`, resolving the SAME scope — so the agent menus (My / Org / System / Default) and the values that reach a launched agent are identical to desktop. Navigation is **path-based** (a list of submenu ids re-resolved against live `rootNodes` each render), so a page updates as agents finish loading or debug toggles, never a stale snapshot.

Both renderers consume ONE `useContextMenuActions` hook (extracted 2026-07-21) — desktop and mobile behavior cannot drift; a launch-path or handler change lands in the hook once.

## Inline agent editing — the WidgetHandle wire

Every **editable** surface gets streaming in-place agent edits with ZERO extra wiring. The shell (`ContextMenuV3.tsx`) derives a `WidgetHandle` from the SAME callbacks the surface already passes (`buildEditableWidgetHandle` in `utils/widget-handle.ts`: `onTextReplace` / `onTextInsertBefore|After` / `getTextarea`, reading current content from the field or `getApplicationScope().content`), registers it via `useOptionalWidgetHandle` (the null-tolerant variant of the canonical `useWidgetHandle`), and both launch handlers pass `runtime.widgetHandleId`. An agent launched from the menu can then stream `widget_text_replace / patch / insert_before|after / prepend / append` client-tool calls that edit the surface live (the same channel `SmartCodeEditor` uses — see `features/agents/types/widget-handle.types.ts` + `CLIENT_SIDE_TOOLS.md`).

Rules: the handle registration lives in the SHELL, not MenuContent — MenuContent unmounts on close and the handle must outlive the menu for the whole stream. Only serviceable methods exist on the handle (`deriveClientToolsFromHandle` advertises exactly that subset per turn). Read-only surfaces register nothing. There is NO text-protocol (XML) edit path — the tool channel is the only one. Live proof: `/demos/context-menu/inline-edit`.

---

## No fake menus — the headline invariant

A menu that opens but Copy does nothing and the selection bar is empty is a **bug**, killed at two layers (`value-resolution.ts`):

1. **Self-resolving content (zero wiring).** When the user right-clicks read-only content with no manual selection, the shell captures the subtree's text (`extractElementText`) as a `content` fallback. `resolveActionText` makes Copy / AI act on selection-or-content, so Copy always works. Actions are **source-gated** — an action that can't act never renders.
2. **Loud dev guard.** `reportMenuDiagnostics` SCREAMS (console.error) when a menu opens inert (no selection, no content, no surface items) or when a surface declared an `alwaysAvailable` value it failed to emit. A recovery firing means a real defect got past the surface — never silent.

---

## Two things the shell may never do to the surface it wraps

The menu is a passenger. Both of these were latent in all 45 consumers and only
became visible when the canonical list shell started wrapping every `<tr>`.

1. **Never delete the children.** `components/ui/context-menu`'s hydration-safe
   `ContextMenu` returns `null` until mounted (Radix aria ids differ across the
   SSR boundary). Wrapping a self-contained panel, that is invisible; wrapping a
   list row, the surface **paints empty** and fills in after hydration. The
   shell now renders `children` bare until `useIsMounted` flips — same hydration
   guarantee, no disappearing act.
2. **Never steal a live text field's native menu.** A read-only menu
   (`isEditable === false`) offers Copy and AI actions and no Paste, Undo,
   spellcheck or autofill — exactly what a user right-clicks a text field FOR,
   so swallowing that gesture makes the field strictly worse than an unwrapped
   one. `yieldsToNativeTextMenu` (textarea / text-ish input / contenteditable)
   yields on every right-click path. **It has to run in the CAPTURE phase:**
   Radix's open handler is composed into the trigger's bubble-phase
   `onContextMenu`, so returning early from ours does not stop it, and
   `preventDefault()` would kill the native menu too. Editable surfaces are the
   opposite case — they wire text mutation into the menu deliberately and keep
   it.

---

## Content-aware sections — the menu reads the selection

Some verbs only make sense for a _kind_ of content, so the menu inspects what it
is about to act on and offers them when they apply. The first (and the pattern
for any future one) is **JSON**.

Highlight JSON anywhere — fenced or bare, in an editor or a read-only view — and
a **JSON** submenu appears: Condense · Minify (one line) · Expand · Sort keys A-Z
· add/remove the code fence · Copy minified. Each row carries a REAL before/after
hint ("11 lines → 1 line") computed from the actual output, and any action that
would be a no-op is dropped rather than shown greyed out.

- **Built in the engine hook** (`useContextMenuActions` → `jsonSection`), rendered
  identically by both renderers. `utils/json-menu-actions.ts` holds the builder.
- **Detection and formatting are `lib/json-format`** — the same primitive the
  notes cleanup pass uses, so a note cleaned there and a selection condensed here
  are byte-identical. The menu never sniffs JSON itself.
- **Editable surfaces rewrite in place** (the exact selection when there is one,
  the whole field otherwise, through `onTextReplace` / `spliceInputValue` like
  Cut/Paste). **Read-only surfaces copy instead** — same intent, the only verb
  available; every label reads "Copy …" so nothing lies about what it will do.
- **Broken JSON still gets a section** — one disabled row carrying the parse
  error. Showing nothing on a selection the user clearly believes is JSON is the
  fake-menu failure this file kills on sight.

Adding another content-aware section follows the same shape: detect in a shared
primitive, build the action list in the hook, render it in both renderers. Never
a per-surface menu, never a detector living in a renderer.

## Value mapping — known values are ALWAYS present; surface values pass through without exception

`resolveApplicationScope` (`value-resolution.ts`) builds the `ApplicationScope` the menu acts on:

- **The 5 generic baselines** — `selection`, `text_before`, `text_after`, `content`, `context` — are guaranteed present via the platform primitive `withBaselineScope` (empty-floored). An agent author can bind to any of them on any surface. **Never reimplement this floor.**
- **Surface-declared values pass through verbatim** from `getApplicationScope()` (live, preferred) or `contextData` (static), merged with the captured selection. Precedence for `content`: surface → editable field value → DOM-text fallback.
- At launch, `launchShortcut` / `launchAgent` resolve the agent's slots from this scope via `mapScopeToInstanceWithSurface` (surface `value_mappings` + the shortcut's `scopeMappings`). The menu does not re-implement mapping.

Declared SurfaceValues live in `features/surfaces/manifests/` (one manifest per surface). A surface that declares a value must emit it — the dev guard screams otherwise.

---

## Inspecting the contract (admin) — the values inspector

Right-click → Admin Tools → **Context Values** opens the `surfaceContextInspector`
**WindowPanel** (`features/window-panels/windows/admin/SurfaceContextInspectorWindow.tsx`):
non-blocking (surface stays interactive). Sidebar lists every declared key (+ undeclared
scope keys); click opens a closeable tab in the body. Declared **Always** with no
supplied value renders RED. Canonical way to verify a surface honors its value
contract — any admin, no debug-mode toggle.

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
- **Context Values (admin)** → the `surfaceContextInspector` WindowPanel (sidebar + tabs). The raw Redux state analyzer (`adminStateAnalyzer`) is a separate debug-mode item. Delete confirms via `confirm()` (`ConfirmDialogHost`), never a browser dialog.

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

## Managed agent launch defaults

Agents in the framework-managed **Agents** section open in the
`flexible-panel` display mode, rendered by `AgentFlexiblePanel` inside the
draggable/resizable `WindowPanel`. Desktop and mobile renderers consume the
same `MANAGED_CONTEXT_MENU_AGENT_CONFIG`, so every v3 context menu inherits the
same presentation. This default applies only to surface-bound/default agents;
shortcut entries keep their own persisted `displayMode` definitions.

## Launching an agent must NEVER force auto-run

`autoRun` bypasses the user entirely — the request goes straight to the model with
no chance to type or edit. So the menu **never sets `autoRun` when it launches an
agent**; it passes only the shared managed presentation config
(`displayMode: "flexible-panel"`) and lets `autoRun` inherit the safe default
(open-and-wait). A mapped agent must open its input/variable panel and wait for
the user to trigger.

- **Mapped (surface-bound) agents** — `handleBoundAgentExecute` in both renderers.
  It omits `autoRun`; the launch thunk defaults it to `false`.
- **Shortcuts** — carry their own persisted `auto_run` flag (set by the user); the
  launch thunk honors it (`autoRun ?? shortcut.autoRun`). The menu doesn't touch it.

(Both renderers previously hardcoded `autoRun: true` here, forcing every mapped
agent to fire on render. The one-line-per-renderer hardcode was the sole authority
— the bound-agent path reads no per-agent autoRun.)

## v1 features restored

The hard-won pieces are carried over (and improved): the floating selection icon (`components/FloatingSelectionIcon.tsx`, enterprise `TextSelect` icon), the selection preview bar (generalized — shows the resolved **content** when there's no manual selection, so the user always sees what the menu will act on), and the macOS-safe selection capture/restore (`utils/selection-tracking.ts`).

**Undo/Redo** light up on any editable surface even with no history wiring: when the surface supplies no `onUndo`/`onRedo`, the menu falls back to the field's native browser undo stack (`document.execCommand` — the only programmatic trigger for a textarea's built-in history). A surface that owns a richer history still passes `onUndo`/`onRedo`/`canUndo`/`canRedo` to override.

---

## v2 is deleted — v3 owns everything

`features/context-menu-v2/` was deleted 2026-07-19; every consumer (production surfaces + demos) renders v3. The shared modules v3 had been importing from v2 are now v3-owned: `hooks/useUnifiedAgentContextMenu.ts`, `components/BoundAgentsMenuSection.tsx`, `utils/build-application-scope.ts`, `utils/resolveMarkdownContext.ts` (plus the earlier-lifted `utils/selection-tracking.ts`). `PlacementMode` / `ContextMenuExtraSection` live in `types.ts`. The reader-less `contextMenuCache` / `agentContextMenuCache` Redux slices went with it.

For wiring a surface, **invoke the `context-menu-v3` skill** — the per-surface recipe.

## Consolidation backlog — bespoke right-click menus still alive (2026-07-21 inventory)

v3 is the only UNIVERSAL menu, but these independent right-click implementations remain; each is a scoped fold-into-v3 (or explicit keep-with-reason) task. Work top-traffic first:

1. ~~**Files**~~ — DONE 2026-07-21: `FileRowContextMenu` / `FolderRowContextMenu` / `FileRightClickMenu` now render v3 with file actions as `extraSections` (same exports/props; consumers untouched). The 3-dot `FileContextMenu` DropdownMenu stays (button menu, not right-click).
2. ~~**ItemMenu right-click mode**~~ — DONE 2026-07-22: `ItemContextMenu` renders v3 (config → extraSections via `itemMenuToV3.ts`; shared `run-entry.ts` execution; v3 gained checkbox/link kinds + onMenuOpenChange/onCloseAutoFocus + all-open-paths per-target resolution + z-9999 above WindowPanels). Deliberate delta: in-menu single-key shortcut EXECUTION dropped (hints still render) — restore in the engine if missed.
3. **Notes legacy shell** — `NotesSidebar.tsx` / `NoteTabs.tsx` / `NoteTabItem.tsx` via `AdvancedMenu` (only `NotesLayout` + the notes-salvage dev page consume them; dies with the legacy shell).
4. **rich-document** — `runtime/ContextMenuMount.tsx` + `variants/ContextMenu.tsx` (own cursor-anchored menu; overlaps v3's action set almost 1:1).
5. **Code trees** — `features/code/views/explorer/FileTreeNode.tsx`, `views/library/SourceEntryNode.tsx`; **user-lists** `TreeNode.tsx`; **org** `OrgResourceDetail.tsx` local menu.
6. **Coordinate menus** — `components/official/json-explorer/RawJsonExplorer.tsx`, `processor-extractor/ProcessorExtractor.tsx`.
7. **Markdown block menus** — `AdvancedTranscriptViewer`, `TaskChecklist`, candidate-profile parts.
8. **Dormant** — `PdfAnnotationLayer` region-menu plumbing (no consumer passes the handler; suppresses native menu and renders nothing — fix or delete).

---

## Doctrine

- **Build the platform, not the artifact.** v3 is the reusable primitive; every action delegates to an existing system. Forbidden: a copy/save/share/attach/export path that only serves this menu.
- **Loud recovery.** Both no-fake-menu guards scream when they fire — a firing means a real bug got past surface wiring.
- **One menu.** No bespoke per-surface context menus. A surface contributes via `extraSections`, never a fork.

---

## Change Log

- `2026-08-09` — **The shell no longer harms the surface it wraps** (see the section above). (1) `ContextMenuV3` renders its children bare until mounted instead of inheriting the ui wrapper's `null` — a wrapped list row used to vanish from the server render and the first client render. (2) A read-only menu yields to the browser's own menu inside a live text field (`yieldsToNativeTextMenu`, capture phase on the desktop trigger + the mobile `onContextMenu` + the mousedown capture path, which would otherwise leave `selectionLocked` stuck on for a menu that never opens). Both surfaced by the canonical list shell's new row-level right-click.
- `2026-07-27` — **Registered entities are attachable without curated-union casts.** `ContextMenuEntityRef` and the context-assignment write path now consume the generated `EntityTypeToken` contract instead of the older hand-curated `EntityType` subset. Scopeable registered entities such as `web_site` can therefore light up Attach To alongside Share through the standard `entity` prop; association reads/writes still flow through the existing scopes/associations chokepoints.
- `2026-07-22` — **extraSections gained `checkbox` + `link` item kinds** (desktop: Radix CheckboxItem stays open on toggle / real `<a>` anchors; mobile: toggle-and-close with On/Off sublabel / navigate). Prerequisite for folding `ItemContextMenu` into v3.
- `2026-07-21` — **Files menus consolidated + PDF region menu born on v3.** (1) `FileRowContextMenu` / `FolderRowContextMenu` / `FileRightClickMenu` rebuilt as v3 wrappers (extraSections; ConfirmDialog deletes; file rows gain agents/Attach/Share via `matrx-user/files` + `entity`). (2) `PdfRegionContextMenu` (features/file-analysis) finished the abandoned 2026-05-11 annotation right-click: v3 `resolveContextOnOpen` on `data-region-id` + extract/promote/redact/delete against the live endpoints. (3) Adversarial review fixes: destroyInstance no longer unregisters registrant-owned widget handles; widget-handle field fallback writes via native setter + input event (controlled-safe); `buildEditableWidgetHandle` is render-pure (capability presence only).
- `2026-07-21` — **One engine + inline agent editing.** (1) Extracted `hooks/useContextMenuActions.ts` — desktop `MenuContent` and `MobileMenuContent` are now pure presentation over ONE shared engine (handlers, single deduped fetch, scope + rich-doc resolution all live once); the "keep the two handler sets in lockstep" debt is paid, and the mobile Find&Replace now suppresses selection-restore like desktop. (2) Inline agent editing: the shell builds a `WidgetHandle` from the surface's existing editable callbacks (`utils/widget-handle.ts`), registers it via the new `useOptionalWidgetHandle`, and both launch paths pass `runtime.widgetHandleId` — agents launched from the menu stream `widget_text_*` edits into the surface live. Demo: `/demos/context-menu/inline-edit`. (3) Swept the last dead v1/v2-era menu code (`GlobalContextMenu/version-two`, `providers/ContextMenuProvider`, unused ui/context-menu example variants). (4) Added the bespoke-menu consolidation backlog (section above).
- `2026-07-19` — **context-menu-v2 annihilated.** Deleted `features/context-menu-v2/` (component, MenuBody, MarkdownContextMenuProvider, v2-only hooks/utils), the v2 static-import eslint ban (`canonicalMenuStaticImportBan` — v3's `contextMenuV3StaticImportBan` remains), and the reader-less `contextMenuCache`/`agentContextMenuCache` slices. Moved the shared modules into v3 (`hooks/useUnifiedAgentContextMenu`, `components/BoundAgentsMenuSection`, `utils/build-application-scope`, `utils/resolveMarkdownContext`); all type imports now come from `types.ts`. Demo lab + scenarios migrated to v3 wrappers; `canonical-v2` deleted. Skills/docs rewritten against v3 (surface-pro-rollout, surface-registration, context-menu-v3, agent-execution-redux, per-feature FEATURE.mds).
- `2026-07-18` — **Managed Agents now default to WindowPanel.** The shared desktop and mobile v3 launchers consume one `MANAGED_CONTEXT_MENU_AGENT_CONFIG` with `displayMode: "flexible-panel"`, so Notes and every other managed context menu open surface-bound/default agents in `AgentFlexiblePanel` instead of `AgentFullModal`. Shortcut-owned display-mode definitions remain authoritative; managed launches still omit `autoRun`.
- `2026-07-15` — **Selection tracking scoped to the wrapped subtree (browser-freeze fix).** The shell's `selectionchange` handler ran unguarded in EVERY mounted instance: each serialized the full selected text (`selection.toString()` — O(document) on a triple-click of a large paste), stored it in its own state, and rendered its own `FloatingSelectionIcon` at identical coordinates. On /notes (editor + every sidebar row + folder headers) that meant dozens of stacked translucent FABs compounding into a black-shadowed blob AND N× O(document) main-thread work per selection event — a tab freezer. Now each instance holds a `selectionOwnerRef` (the asChild trigger child on desktop, the display:contents wrapper on mobile) and the handler gates ALL work on ownership: the selection's anchor node — or, for textarea/input selections (whose DOM Range stays parked on the host), the focused element — must be inside the wrapped subtree; non-owners clear cheaply with no serialization (unchanged-state bailout ⇒ zero re-renders). **Invariant: never remove the ownership gate; a document-global listener in a many-instance component must scope its work.** (v2 twin still has the unscoped listener — v2 is frozen; migrate consumers instead of patching it.)
- `2026-07-15` — **Notes folder-create parity.** Both Notes v3 surfaces now keep creation beside assignment: the editor menu exposes **New folder…**, and the sidebar note right-click Move submenu lists existing destinations plus **New folder…**. Both delegate to the shared Notes create-and-move flow; no bespoke context-menu folder UI was added.
- `2026-07-14` — **Floating selection trigger contrast fixed.** Replaced the default Tailwind `shadow-lg` / `hover:shadow-xl` styling on both v2 and v3 floating selection icons with the shared `context-menu-floating-icon` surface in `app/globals.css`: translucent primary fill, light highlight ring, backdrop blur, and theme-aware soft shadows so the trigger no longer renders a heavy black halo in light or dark mode.
- `2026-07-12` — **Notes sidebar + mermaid chat block onto v3.** (1) `NoteSidebarRow` / `NoteSidebar` folder headers wrap in `NonEditableContextMenu` (note rows carry `contentSource {type:"note"}` + `entity`; actions via `extraSections` from `noteMenuRegistry.tsx`); `ItemRow` gained `disableContextMenu` so an ItemRow host can hand right-click to v3 while keeping the kebab. `MobileNoteEditor` plain mode wraps in `EditableContextMenu`. (2) Chat `MermaidBlock` wraps in `NonEditableContextMenu` with `surfaceName matrx-user/mermaid-editor` + full manifest scope (`createMermaidEditorScope`), and an `extraSections` "Diagram" group of surface-role agents (`components/mermaid/hooks/useDiagramAgents.ts` — canonical `surface-config.service` resolution, Diagram Editor default first); selecting one opens the canvas workbench with the AI rail open + agent preselected (`metadata.openAiRail/aiAgentId/aiAgentName`), so results land in the workbench's normal apply/version flow.
- `2026-07-09` — **Context Values inspector → WindowPanel.** Replaced the blocking Dialog (`SurfaceContextInspectorOverlay`) with `SurfaceContextInspectorWindow` (sidebar of keys → closeable tabs, like Instance UI State). Fixed header/close collision and right-edge clipping of badges + long values.
- `2026-07-07` — **D25 residual closed — the 4 prompt-menu surfaces confirmed live on v3.** `ContentTemplateManager`, `SaveTemplateModal`, `MarkdownTester`, and `ContentEditor` (plain mode) all wrap their textareas in `EditableContextMenu` with `getTextarea`, restoring right-click content-block insert (`handleContentBlockInsert` → `insertTextAtTextareaCursor`; data via `/api/agent-context-menu` → `agent.context_menu_view`, live `content-block` placement group confirmed). Also killed the dead SSR preload: `DeferredShellData` no longer writes `contextMenuCacheSlice` / `agentContextMenuCacheSlice` (no readers — the menu fetches on open via `fetchUnifiedMenu`), and the orphaned `getSSRAgentShellData` helper was deleted. Both slices remain per the D25 disposition.
- `2026-07-03` — **Killed the hardcoded auto-run.** Both renderers'
  `handleBoundAgentExecute` hardcoded `autoRun: true`, forcing every mapped agent
  launched from the context menu to fire on render — no chance for the user to type
  or edit anything (`autoRun` bypasses input entirely). The menu now omits `autoRun`
  so it inherits the safe open-and-wait default. Also fixed the root cause:
  `DEFAULT_AGENT_EXECUTION_CONFIG.autoRun` was `true` — a broken default (an unset
  value must never auto-fire) — now `false`. A shortcut's explicit `auto_run` flag
  is unaffected and still wins.
- `2026-06-24` — v3 built. Inert shell + lazy MenuContent + value-resolution core with the no-fake-menu guards (content self-resolution + loud dev diagnostics) and the always-present baseline + surface-value passthrough contract. Reuses rich-document (Copy-as/Export/Convert), context-assignment (Attach To), sharing (Share), the unified-menu + bound-agents fetch (deduped — bound-agents service gained a cache), Compare, Quick Actions. Registered `findReplace` + `contextAssignment` overlays; AI result display left to the launcher (no redundant overlay). Restored the floating icon (TextSelect), generalized selection/content preview bar, and macOS-safe selection capture. v2 frozen.
- `2026-06-24` — Demo is the rollout reference: `/demos/context-menu/canonical` rebuilt all-v3 (bare / editable / read-only display + agents / notes / code surface wirings); v2 snapshot preserved at `/demos/context-menu/canonical-v2`. Agent + Code demo panels migrated to v3. Renamed the rich-document download action to **"Download as Markdown"** (`FileDown` icon) — it always blobs `.md`. Print already correct via reuse (`printMarkdownContent`, no heavy-dep import). Open: dual-destination save (local + cloud `SaveAsDialog`), HTML/CSV/Excel conversion modules, broader capability pull-in from the assistant action menu.
- `2026-06-24` — Production rollout COMPLETE + `context-menu-v3` skill added. All ~20 v2 render-consumers migrated to Editable/NonEditableContextMenu (incl. `AgentConversationDisplay` replacing `MarkdownContextMenuProvider` with inlined v3 + preserved `resolveContextOnOpen`, plus 3 audit-missed consumers found by grep verification: research init/synthesis, files preview). v2 menu component has no production consumers. Remaining v2-deletion blockers documented in the migration section.
- `2026-06-25` — **Mobile renderer**: a 70dvh bottom-sheet drill-down (`MobileMenuContent`) the shell shows on mobile viewports (long-press / floating-icon trigger). Reuses the same data hooks + launch path as desktop (parity on agent menus + value-flow); path-based navigation stays live. Handlers ported 1:1 — flagged for consolidation into a shared `useContextMenuActions` hook.
- `2026-06-25` — Added the **Surface Context Values inspector** (`surfaceContextInspector` overlay): admin "Context Values" lays the surface's declared contract (Always/Sometimes) against the live resolved scope and flags any "Always" value the surface failed to supply (loud red). "Inspect Context" previously opened the raw Redux state analyzer — that's now a separate "Redux State" debug item; the values inspector is what verifies a surface honors its contract.
- `2026-06-25` — Default-contract agents now honored on EVERY surface (incl. bare/undeclared): the menu merges `matrx-default/{default,basic-content-display,basic-editor}` bindings — deduped — into a "Default agents" group (`surface-bound-agents.service.ts`, shared with `ProTextarea`). The agents submenu renders without a `surfaceName` (was hidden) and is relabeled "Agents". Added a native Undo/Redo fallback on editable surfaces so basic editors offer undo with no surface wiring.
- `2026-06-29` — Added top-level **Chat** action (opens the floating Chat window panel with the `/chat/new` default agent via `useQuickActions().openChatWindow`). Desktop + mobile drill-down.
- `2026-06-25` — Killed a cross-menu crash class. "Inspect Context" rendered the menu's `context` scope value raw, so any surface whose `context` is a structured object (code editor: `{language, filePath, lineCount, …}`) threw _"Objects are not valid as a React child"_ via `DialogContent`. Fixed at the source — `components/debug/ContextDebugModal.tsx` now JSON-stringifies non-string standard-scope values (matching its Custom Variables branch) — and hardened the shared a11y primitive `lib/react/treeContainsComponent.ts` to SKIP a non-renderable child + scream in dev instead of throwing a misleading trace (it had been the deceptive crash site for every dialog). v3 was never affected: v3's "Inspect Context" opens the global state viewer, not this modal. The crash only appears on the still-live **v2** menu (footer `C1V1`) — a stale checkout tell.
