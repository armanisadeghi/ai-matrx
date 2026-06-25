# Window Panels — FEATURE.md

> **⚠️ Read this first** — the May 2026 overhaul split this feature into two independent systems. This doc still describes the older conflated structure and is kept for historical reference + as a guide while the cutover finishes. For most tasks:
> - **Rendering an overlay** (dialog, sheet, modal, window, toast) → [`features/overlays/FEATURE.md`](../overlays/FEATURE.md)
> - **The WindowPanel component itself** (drag, resize, minimize, tray) → this file's "Architecture" and below
> - **Migration history + cutover plan** → [`docs/OVERLAY_WINDOW_OVERHAUL.md`](../../docs/OVERLAY_WINDOW_OVERHAUL.md)
> - **Future improvements + known gaps** → [`docs/OVERLAY_WINDOW_ROADMAP.md`](../../docs/OVERLAY_WINDOW_ROADMAP.md)
>
> **Status**: The legacy `UnifiedOverlayController` / `OverlaySurface` / `windowRegistry` rendering path described below is **deprecated**. It is still mounted as a fallback during the cutover (controlled by `NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER`); once cutover is confirmed in production, the `registry/` directory and the controller files get deleted. The **`WindowPanel.tsx`, `WindowTray.tsx`, `WindowTraySync.tsx`, `WindowPersistenceManager.tsx`, and the window-manager Redux slice STAY** — they are the WindowPanel component primitive and System 3 (Window Manager), independent of overlay rendering.

---

## Quick map (post-cutover state)

```
features/overlays/                  ← overlay rendering layer (NEW canonical)
  OverlayController.tsx                explicit JSX, no spread, type-safe
  openers/<overlayId>.tsx              useOpenX() + <XController />
  catalogue.ts                         render-free metadata
  featureFlag.ts                       cutover flag reader

features/window-panels/             ← WindowPanel component primitive
  WindowPanel.tsx                      the draggable/resizable frame
  WindowTray.tsx                       minimized-windows dock
  WindowTraySync.tsx                   debounced viewport listener
  WindowPersistenceManager.tsx         window_sessions DB hydration
  windows/<feature>/                   window components (rendered by overlay controller)
  registry/                            DEPRECATED — deleted post-cutover
  OverlaySurface.tsx                   DEPRECATED — deleted post-cutover
  UnifiedOverlayController*.tsx        DEPRECATED — deleted post-cutover

lib/redux/slices/
  windowManagerSlice.ts             ← System 3 (Window Manager) — runtime registration
                                       (a <WindowPanel> joins by mounting, not by static declaration)
  overlaySlice.ts                   ← state for the overlay system
```

---

> The original FEATURE.md content (architecture diagrams, registry shape, etc.) is preserved below for historical context. **Treat the "registry" sections as describing the LEGACY path that's being deleted.**

---

## Mental model

A single **registry** declares every overlay in the app — floating windows, bottom sheets, modals, and inline agent widgets. A single **unified controller** iterates that registry and renders each open overlay through a generic **surface** component. A single **tools-grid config** declares which overlays show up in the shell sidebar. Every other subsystem (persistence, URL sync, mobile presentation, Redux slice init) reads the registry — no parallel lists.

Adding a new overlay is a **2-file change**: register it + write the component. No `OverlayController` edit, no slice seed, no Tools-grid edit.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Shell (server component)                                           │
│    Sidebar.tsx — dynamic()-imports SidebarWindowToggle              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ lazy
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SidebarWindowToggle → ToolsGrid                                    │
│    • reads toolsGridTiles.ts (declarative tiles)                    │
│    • each click → dispatch(openOverlay({...}))                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Redux: overlaySlice                                                │
│    overlays[overlayId][instanceId] = { isOpen, data, lastUsedAt }   │
│    actions: open / close / closeAll / toggle /                      │
│             closeAllInstancesOfOverlay / pruneStaleInstances        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  UnifiedOverlayController (single mount in DeferredSingletons)      │
│    ALL_WINDOW_REGISTRY_ENTRIES.map(entry =>                         │
│      <OverlaySurface overlayId={entry.overlayId} />)                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OverlaySurface — per registry entry                                │
│    • subscribes to useOverlayOpen / useOverlayInstances             │
│    • React.lazy(entry.componentImport) — cached module ref          │
│    • merges entry.defaultData under live data                       │
│    • renders <Component isOpen onClose {...data} />                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Window component (mounts <WindowPanel>)                            │
│    • desktop → WindowPanel shell (drag/resize/tray)                 │
│    • mobile → routed by registry.mobilePresentation:                │
│         "fullscreen" → current fullscreen takeover                  │
│         "drawer"     → MobileDrawerSurface (vaul)                   │
│         "card"       → MobileCardSurface (bottom-right floating)    │
│         "hidden"     → do not mount                                 │
└─────────────────────────────────────────────────────────────────────┘
```

Parallel subsystems that read the registry:

- **WindowPersistenceManager** — hydrates `window_sessions` rows on mount; clamps rects to viewport; runs the idle GC sweep (`pruneStaleInstances` every 30 min).
- **UrlPanelManager** — reads `?panels=` query, dispatches hydrators; every `registry.urlSync.key` must have a hydrator in `initUrlHydration.ts` (dev assertion enforces).
- **WindowPanel** — looks up its own registry entry by `overlayId` to resolve `mobilePresentation`, `mobileSidebarAs`, and `urlSync.key`.

---

## The registry (single source of truth)

File: [`registry/windowRegistry.ts`](./registry/windowRegistry.ts)

### Shape

```ts
interface WindowRegistryEntry {
  // Identity
  slug: string;              // kebab-case, stored in window_sessions.window_type
  overlayId: string;         // camelCase, key in overlaySlice
  kind: OverlayKind;         // "window" | "widget" | "sheet" | "modal"

  // Rendering
  componentImport: () => Promise<{ default: ComponentType<any> }>;
  label: string;             // shown in tray + window manager
  defaultData: Record<string, unknown>;  // doc + restore fallback
  ephemeral?: boolean;       // skip DB persistence

  // Mobile
  mobilePresentation?: "fullscreen" | "drawer" | "card" | "hidden";
  mobileSidebarAs?: "drawer" | "inline";  // default "drawer"

  // Instancing
  instanceMode?: "singleton" | "multi";   // default "singleton"

  // Integrations
  urlSync?: { key: string };              // ?panels= deep link
  icon?: LucideIconName;                  // (reserved — grid uses toolsGridTiles)
  category?: ToolsCategory;               // (reserved — see above)
  heavySnapshot?: boolean;                // Phase 7 opt-in
  autosave?: boolean;                     // Phase 7 opt-in
  seedData?: (ctx) => Record<string, unknown>;  // rarely used on registry
}
```

### Invariants (checked by `assertRegistryIntegrity`)

1. Every entry has `kind` + `componentImport`.
2. Every `kind: "window"` has `mobilePresentation`.
3. `slug` and `overlayId` are each unique across the registry.
4. Every entry with `urlSync.key` has a hydrator registered in `initUrlHydration.ts` (separate dev check in that file).

### How to add a new overlay

**Step 1** — register it in [`registry/windowRegistry.ts`](./registry/windowRegistry.ts):

```ts
{
  slug: "my-feature-window",
  overlayId: "myFeatureWindow",
  kind: "window",
  label: "My Feature",
  componentImport: () =>
    import("@/features/window-panels/windows/MyFeatureWindow"),
  defaultData: { selectedId: null, search: "" },
  mobilePresentation: "drawer",   // or "fullscreen" / "card" / "hidden"
  // optional:
  // ephemeral: true,
  // instanceMode: "multi",
  // mobileSidebarAs: "drawer",
  // urlSync: { key: "my_feature" },
},
```

**Step 2** — create the component at the path `componentImport` points to:

```tsx
"use client";
import { useCallback, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedId?: string | null;
  search?: string;
}

export default function MyFeatureWindow({ isOpen, onClose, selectedId, search }: Props) {
  if (!isOpen) return null;
  const [sel, setSel] = useState<string | null>(selectedId ?? null);

  const collect = useCallback(
    () => ({ selectedId: sel, search: "" }),
    [sel],
  );

  return (
    <WindowPanel
      id="my-feature-window"
      title="My Feature"
      overlayId="myFeatureWindow"
      onClose={onClose}
      onCollectData={collect}
      minWidth={380}
      minHeight={280}
    >
      <div>…</div>
    </WindowPanel>
  );
}
```

**That's it.** Render, Tools-grid placement (via `toolsGridTiles.ts` if desired), persistence, URL sync, mobile routing — all automatic. Nothing else to touch.

---

## Slots — how to add chrome

**The body is content ONLY. Every piece of chrome — header, footer, sidebar, secondary panel — is a `WindowPanel` prop slot, not body JSX.** Compose chrome by passing the right slot; never hand-roll a header bar or a footer row inside `children`. Reference consumer: `windows/notes/NotesWindow.tsx`.

**Canonical body recipe** — `bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"`.

| Slot | Props | Contract |
|---|---|---|
| **Header** | `title` (string) / `titleNode` (rich JSX, wins over `title`), `actionsLeft`, `actionsRight` | The title is **absolute-centered** across the full header width. Keep header actions **compact** — wide action clusters can reach the centered title and overlap it (known rough edge, see Known gaps). `actions` is deprecated → maps to `actionsRight`. |
| **Footer** | `footer` (single flex row) **OR** `footerLeft` / `footerCenter` / `footerRight` (zoned, mutually exclusive with `footer`); `footerVariant` (`"bar"` default / `"rich"`) | Renders only when content is provided. `footer` wins if both are passed. **`footerVariant="bar"`** (default) applies compact metadata-bar chrome (`text-xs`, tiny buttons/icons via descendant selectors, `bg-muted/40`) for status rows like `NoteMetadataBar` — it **crushes rich content**. Pass **`"rich"`** for a composer / input bar (full-size buttons, multi-row textarea, e.g. `SmartAgentInput`): it drops the compact descendant selectors + `bg-muted/40`, leaving just `shrink-0 border-t` so the slot owns its layout. Reference: `windows/multi-file-smart-code-editor/MultiFileSmartCodeEditorWindow.tsx`. |
| **Sidebar (left)** | `sidebar`, `sidebarDefaultSize` (200px), `sidebarMinSize` (100px), `defaultSidebarOpen` (true), `sidebarClassName` | Resizable + collapsible; a toggle appears next to the traffic lights. **`sidebarExpandsWindow` is a footgun** — it mutates the window rect on every toggle (a second sizing path that fights drag/snap). Avoid; leave it `false`. |
| **Secondary panel (right)** | `secondaryPanel`, `secondaryPanelOpen` (default true when `secondaryPanel` is set), `secondaryPanelDefaultSize` (360px), `secondaryPanelMinSize` (240px), `secondaryPanelClassName` | The canonical home for a **history / inspector / details pane** that belongs to the window, not the body. Resizable, mirrors the sidebar. **Desktop only** — no built-in mobile presentation; the consumer handles mobile (e.g. a Drawer). Reference: `features/notes` `NoteHistoryPane`. |

---

## Slices

All three live under `lib/redux/slices/`:

| Slice | Responsibility |
|---|---|
| `overlaySlice` | Open/closed state + data payload + `lastUsedAt` per overlay/instance. `initialState.overlays` is `{}` — entries grow lazily on first `openOverlay`. |
| `windowManagerSlice` | Window geometry, z-index, tray slots, `arrangeActiveWindows` computations. |
| `urlSyncSlice` | `?panels=` entries the URL manager serializes. |

`overlaySlice` actions:
- `openOverlay({ overlayId, instanceId?, data? })` — stamps `lastUsedAt`.
- `closeOverlay({ overlayId, instanceId? })` — flips isOpen on singleton slots; deletes the entry entirely for multi-instance overlays.
- `closeAllOverlays()`, `toggleOverlay()`.
- `closeAllInstancesOfOverlay({ overlayId })` — nukes every instance of one overlay.
- `pruneStaleInstances({ olderThanMs })` — GC for closed multi-instance entries. Called from the idle sweep in `WindowPersistenceManager`.

`windowManagerSlice` invariant: `registerWindow`/`unregisterWindow` keep the global `windowsHidden` flag from ever stranding `true`, and `revealWindow(id, viewport)` is the single "bring this window into view" primitive. See [`## Silent-render guard`](#silent-render-guard).

---

## Persistence

Table: `window_sessions` (Supabase, RLS-enforced per user).

```
id (uuid) | user_id | window_type (slug) | label | panel_state (jsonb) | data (jsonb) | created_at | updated_at
```

**Save triggers — only two:**
1. **Explicit** — user clicks "Save window state" in the green traffic-light dropdown.
2. **Piggyback** — child component calls `onCollectData` as part of its own save flow.

Moving, resizing, toggling the sidebar, or switching tabs does **not** trigger a DB write. (Phase 7 will add opt-in `autosave` + `heavySnapshot` for specific windows.)

**On close**: `WindowPanel` calls `persistence.closeWindow(overlayId)` which deletes the row.

**On page load**: `WindowPersistenceManager`:
1. Runs a one-time `matrx_window_manager_state` localStorage migration (clamp each rect, dispatch `restoreWindowState`, remove the key).
2. Fetches all `window_sessions` rows for the user.
3. For each row: dispatches `openOverlay({ overlayId, data })` and builds a clamped `WindowEntry` for `windowManagerSlice` via `clampRectToCurrentViewport`.
4. Dispatches `restoreWindowState(entries)` so geometry is in Redux before `WindowPanel` mounts.

**Rect clamping** ([`utils/rectClamp.ts`](./utils/rectClamp.ts)) — restored rects are clamped into the current viewport with a 48 px minimum visible strip so the header stays draggable. Nonsensical rects fall back to a centered default.

**Instance GC** — every 30 minutes (idle-only via `requestIdleCallback`), `pruneStaleInstances({ olderThanMs: 30min })` sweeps closed multi-instance entries that haven't been reopened. Singleton slots are preserved regardless so stable-reference selectors don't thrash.

**Ephemeral overlays** — registry entries with `ephemeral: true` never write to DB. Use for debug panels, one-shot tool dialogs, and callback-group windows whose caller-side state can't survive reload.

---

## Silent-render guard

A triggered panel must **never** silently fail to appear. Two layers enforce it via `overlayRenderWatchdogMiddleware` ([`diagnostics/overlayRenderWatchdog.ts`](./diagnostics/overlayRenderWatchdog.ts)):

**Reveal-on-open (proactive).** Every `openOverlay`/`toggleOverlay` for a `kind: "window"` overlay dispatches `revealWindow(id, viewport)`. `revealWindow` restores a minimized window, clamps an off-screen rect back into view, raises z-index, and clears `windowsHidden` — so re-triggering an already-open window is never a no-op. `windowManagerSlice` hardening: `registerWindow` clears `windowsHidden` (a newly opened window is always shown); `unregisterWindow` resets `windowsHidden` at zero windows (the global hide-all can't strand `true` and silently hide the next open).

**Watchdog (loud recovery).** ~2.5 s after an open, the middleware runs the pure `diagnoseOverlayRender` against live Redux + viewport state. If no visible panel is on screen — **no `WindowPanel` mounted**, `windowsHidden` still on, off-screen, or zero-size — it `console.error`s with diagnostics and shows a self-healing `toast.error` ("Show it" → `revealWindow`). Scoped to **singleton window-kind** overlays; minimized and popped-out states count as OK (parked, not failed). `WindowPanel` calls `ackOverlayRender(overlayId, id)` so the watchdog resolves the real window id even when it differs from the slug. Tests: `__tests__/overlayRenderWatchdog.test.ts`, `__tests__/windowManagerReveal.test.ts`.

---

## Mobile presentation

Every `kind: "window"` declares `mobilePresentation`:

| Value | Rendered as | When to use |
|---|---|---|
| `"fullscreen"` | Full-viewport takeover (legacy mobile branch of WindowPanel) | Content-dominant windows (Notes, AgentRun, CanvasViewer, News). Default. |
| `"drawer"` | Bottom-sheet ([`mobile/MobileDrawerSurface.tsx`](./mobile/MobileDrawerSurface.tsx), vaul, 85 dvh) | Forms, settings, sidebar-heavy windows. Sidebars collapse into a nested right-side drawer. |
| `"card"` | Small floating card ([`mobile/MobileCardSurface.tsx`](./mobile/MobileCardSurface.tsx), bottom-right, 60 dvh max) | Utility/debug windows (Stream Debug, State Analyzer, JSON Truncator). Non-modal. |
| `"hidden"` | Nothing; dev warning if opened | Windows that shouldn't exist on mobile. |

`mobileSidebarAs` — for windows with a sidebar:
- `"drawer"` (default) — sidebar opens in a nested drawer on mobile. Keeps the body full-width.
- `"inline"` — sidebar pushes the body on mobile. Useful for 50/50 split layouts.

Decision tree:
1. Has a sidebar? → `"drawer"`.
2. Is a content-dominant experience (chat, editor, feed)? → `"fullscreen"`.
3. Is a small utility / debug surface? → `"card"`.
4. True alert / system modal? → `"modal"` (registry `kind`).

---

## URL sync

Set `urlSync: { key: "..." }` on a registry entry. `WindowPanel` auto-activates `useUrlSync` when:

1. The entry has `overlayId` defined (caller passes it).
2. Either the caller passes `urlSyncKey`/`urlSyncId` props, or the registry has `urlSync.key`.

Instance id auto-falls-back to `overlayId` for singletons — URL reads like `?panels=notes:notesWindow`.

Every registry `urlSync.key` must have a hydrator in [`url-sync/initUrlHydration.ts`](./url-sync/initUrlHydration.ts). A dev-only assertion in that file logs missing mappings on mount.

---

## Tools grid

Declarative — lives in [`tools-grid/toolsGridTiles.ts`](./tools-grid/toolsGridTiles.ts). Each tile references a registry `overlayId` and provides:

```ts
interface ToolsGridTile {
  id: string;
  label: string;
  icon: LucideIcon;
  category: ToolsCategory;    // voice | notes | content | agents | files-web | general | admin
  gate?: "admin";
  overlayId?: string;         // registered overlay
  instanceStrategy?: "singleton-default" | "fresh-per-click";
  seedData?: (ctx: TileContext) => Record<string, unknown>;
  onActivate?: (ctx: TileContext) => void;   // escape hatch (e.g. Image Studio → router.push)
}
```

[`ToolsGrid.tsx`](./tools-grid/ToolsGrid.tsx) reads the config, groups by category, applies admin gate, and dispatches `openOverlay` with the correct instance strategy.

Multi-tile cases (e.g. two "Notes" tiles opening the same overlay with different seed data) are natively supported.

Bundle: the entire Tools grid + all 53 Lucide icons ship only after the user first clicks the sidebar toggle — `SidebarWindowToggle` is wrapped in `dynamic(..., { ssr: false })` at the shell mount.

---

## Bundle invariant

**Non-negotiable**: `WindowPanel`, the `OverlayController`, the registry, and every `windows/**/*Window.tsx` MUST stay behind the lazy boundary — loaded ONLY via `lazyOverlay(() => import(...))` / `dynamic(..., { ssr: false })`. **NEVER static-import any of them from a route, layout, provider, or boot module.** One static import collapses 100+ lazy overlay chunks into that route's bundle. Read the `code-splitting` skill before adding any `import` of a window-panel file.

**Route-shared units must not import `WindowPanel`.** A component used both inside a window and on a plain page (e.g. the notes `NoteViewControls` / `NotePresenceBanner` / `NoteHistoryPane`) is content that drops INTO a slot — it takes no `WindowPanel` import, so a route rendering it never drags the window stack into its bundle. (These reference `WindowPanel` in comments only; verified zero import.)

Enforced by:
1. Every registry entry's `componentImport` is a lazy `() => import(...)` — Next.js chunks it on demand.
2. **Runtime guard** — `assertLazyLoaded("…/WindowPanel.tsx")` runs at `WindowPanel.tsx` module top (`utils/lazy-bundle-guard.ts`). If the file is parsed during boot it screams a red `[WINDOW-PANELS BUNDLE LEAK]` console banner with the eager-import chain (the leaking file is the top frame). Relies on the side-effect import `import "@/features/window-panels/utils/lazy-bundle-guard"` in `app/DeferredSingletons.tsx` running at boot so the guard's macrotask is scheduled. Deduped per session via `window.__WP_LEAK_REPORTED__`.
3. The overlay controller and `useOverlay` have zero static imports of any window component.
4. `SidebarWindowToggle` (tools grid) is `dynamic(..., { ssr: false })` at the shell mount site.
5. `scripts/check-bundle-size.ts` gates per-route bundle growth at +2 KB per PR — threshold-dependent; the runtime guard catches leaks it misses.

---

## File inventory

### Core (top-level)

| File | Role |
|---|---|
| `WindowPanel.tsx` | Shell (drag, resize, maximize, minimize, mobile routing, persistence, URL sync). Decomposition into modules is Phase 6. |
| `OverlaySurface.tsx` | Generic renderer for one registry entry — singleton + multi-instance. |
| `UnifiedOverlayController.tsx` | Iterates `ALL_WINDOW_REGISTRY_ENTRIES`; one source of truth for mounted overlays. |
| `WindowPersistenceManager.tsx` | Hydrates `window_sessions`; LS migration; idle GC sweep. |
| `WindowTray.tsx` / `WindowTraySync.tsx` | Minimized-window dock chips; responsive chip width via `constants/tray.ts`. |

### Subdirs

| Path | Role |
|---|---|
| `registry/windowRegistry.ts` | Single source of truth for all overlays + types. |
| `service/windowPersistenceService.ts` | Supabase CRUD for `window_sessions`. |
| `hooks/useOverlay.ts` | Factory hooks (`useOverlayOpen`, `useOverlayData`, `useOverlayInstances`, `useOverlayActions`, `useCloseOverlay`). |
| `hooks/useWindowPanel.ts` | Pointer-driven move/resize; Redux window registration. |
| `mobile/MobileDrawerSurface.tsx` | Vaul-based bottom sheet for `mobilePresentation: "drawer"`. |
| `mobile/MobileCardSurface.tsx` | Floating card for `mobilePresentation: "card"`. |
| `tools-grid/toolsGridTiles.ts` | Declarative config for every Tools-grid tile. |
| `tools-grid/ToolsGrid.tsx` | Data-driven Tools-grid renderer. |
| `tools-grid/menuPrimitives.tsx` | `MenuSection` / `MenuDivider` / `MenuItem` / `MenuGridItem`. |
| `url-sync/initUrlHydration.ts` | `registerPanelHydrator` calls + dev-time integrity check. |
| `url-sync/UrlPanelRegistry.ts` | Hydrator map. |
| `url-sync/UrlPanelManager.tsx` | Reads/writes `?panels=`. |
| `url-sync/useUrlSync.ts` | Registers/unregisters open panel in `urlSyncSlice`. |
| `constants/tray.ts` | Tray dimensions + responsive helpers. |
| `utils/rectClamp.ts` | Viewport-safe geometry clamping. |
| `utils/windowArrangements.ts` | `arrangeActiveWindows` tile math. |
| `utils/embed-site-url.ts` | URL normalization for iframe windows. |
| `components/SidebarWindowToggle.tsx` | Shell sidebar toggle (600 LOC post-Phase 3). |
| `components/LayoutIcon.tsx` | Layout arrangement icon buttons. |
| `windows/**` | 60+ window components — every one referenced by a registry `componentImport`. |

### Deleted (Phase 9)

- `FloatingPanel.tsx`, `utils/withGlobalState.tsx`, `hooks/usePanelPersistence.ts`, `TODO-persistence-spec.md`.

### Baselines

- `_baselines/bundle-before.md` — pre-modernization bundle/LOC snapshot. Deleted at the end of Phase 12.

---

## Rollout state

| Phase | Status |
|---|---|
| 0 — Baselines + bundle-size gate | ✅ shipped |
| 1 — Registry schema expansion (59 entries) | ✅ shipped |
| 2 — UnifiedOverlayController + absorbed non-window overlays (33 new entries) | ✅ shipped (legacy `components/overlays/OverlayController.tsx` deleted 2026-05-06; flag retired) |
| 3 — Auto-derived Tools grid + lazy SidebarWindowToggle | ✅ shipped |
| 4 — State cleanup: drift-free initial state, instance GC, LS sidecar retired | ✅ shipped |
| 5 — Mobile presentation layer (drawer/card surfaces, rect clamp) | ✅ shipped |
| 6 — WindowPanel decomposition | ⏸ deferred |
| 7 — Persistence hardening (typed defaultData, autosave, heavy snapshot) | ⏸ deferred |
| 8 — URL-sync completion + build-time pair check | ✅ shipped |
| 9 — Dead code removal | ✅ shipped |
| 10 — Tests (registry integrity, pointer math, persistence, mobile routing) | ⏸ deferred |
| 11 — Docs refresh (this file) | ✅ in progress |
| 12 — `SKILL.md` + guardrails (ESLint) | 🔜 next |
| 13 — Polish (undo/redo, theme tokens) | ⏸ deferred |

---

## Known gaps / future work

1. **Phase 6 — WindowPanel decomposition.** The 1,500-line shell wants to be split into `ResizeFrame` / `WindowHeader` / `TrafficLights` / `Chrome` / `SaveDropdown` / `PersistenceBinding`. Pure internal refactor; public prop surface stays identical. **No header/footer is extracted as a standalone sub-component yet** — chrome lives inline in the shell. Sub-issue: the header has **5 divergent implementations** (desktop `WindowHeader`, mobile-fullscreen `MobileWindowHeader`, mobile-drawer `MobileDrawerSurface`, mobile-card `MobileCardSurface`, popout `PopoutTopBar`) that share no code — consolidate to one core header. Whatever is built **stays behind the lazy boundary** (see Bundle invariant).
2. **Phase 7 — Persistence hardening.**
   - Typed link between `defaultData` and `onCollectData` (registry generic parameter).
   - Autosave-on-blur opt-in per entry.
   - `heavySnapshot` callback for Scraper / PDF Extractor / Markdown tester / Voice pad transcripts.
   - `onReopenAfterReload` for callback-group windows (Content Editor, Smart Code Editor, Image Uploader).
3. **Phase 10 — Tests.** Needs a test harness pass first (`vitest` already present). Priorities:
   - Registry integrity (every kind: "window" has mobilePresentation; every urlSync.key has a hydrator).
   - `clampRectToViewport` edge cases.
   - `overlaySlice` instance GC round-trips.
   - Mobile routing decisions (drawer vs card vs fullscreen).
4. ~~**Legacy `OverlayController.tsx` (2,586 lines) deletion.** Gated on user smoke test with `NEXT_PUBLIC_OVERLAYS_V2=1`.~~ Done 2026-05-06.
5. **`windowManagerSlice` split** (geometry / state / tray / zIndex). Deferred to Phase 13 unless profiling flags tray-op cost.
6. **Responsive tray slot math.** `WindowTray.tsx` pulls desktop chip width from the centralized constants, but `windowManagerSlice`'s slot placement math still uses desktop dimensions. Safe mid-session reshuffle is a Phase 13 item.
7. **Redux DevTools namespace.** Slices are flat (`overlays/*`, `windowManager/*`). Migrating to `windowPanels/overlays/*` would be cosmetic but breaks downstream action-type string matches.
8. **Header title collision.** The header `title`/`titleNode` is absolute-centered across the full width, so very wide `actionsLeft` / `actionsRight` can visually overlap it. Fix is left/center/right tracks (flex columns) instead of an absolute-centered title. Tracked with the Phase 6 header consolidation. Stays behind the lazy boundary.
9. **`secondaryPanel` has no built-in mobile presentation.** Desktop-only slot; the consumer owns mobile (e.g. a Drawer) — `features/notes` `NoteHistoryPane` is the reference. A first-class mobile route for the slot is deferred.

---

## Pop-out windows

**Status**: shipped 2026-04-26. Any `kind: "window"` registry entry pops out automatically — no per-window opt-in.

### What it does

The user can detach any window from the parent viewport into a separate browser window. Two ways to trigger:

1. **Menu**: hover the green traffic light → click "Pop out" in the dropdown.
2. **Drag-out**: drag the window header outside the viewport edge by ≥80 px and hold for ≥250 ms. Release fires the popout.

The popout renders the same window content via React `createPortal` into the popout document's body. Because the children's React tree stays attached to the parent, the popout shares:

- Redux store (no state hydration, no sync layer)
- `callbackManager` (widget handles, agent callback groups)
- Theme + dark-mode (mirrored via MutationObserver on `<html>`)
- Stylesheets (cloned from parent `<head>`, kept in sync via MutationObserver)
- Provider context (Tooltip, Toast, RouterContext, WindowPersistenceContext)

A "Dock" button in the popout's `PopoutTopBar` returns the window to the parent viewport at its original `prePopoutRect`. Closing the popout via the OS X button does the same.

### Browser support

| Browser | Mode | Notes |
|---|---|---|
| Chrome 116+, Edge 116+, Opera | **Document Picture-in-Picture** | Frameless, always-on-top floating window. Single-PiP-per-origin enforced. |
| Safari, Firefox, others | **`window.open` popup** | Universal fallback. Browser chrome visible (URL bar, tabs). |
| Embedded WebView, no `window.open` | (none) | "Pop out" UI hidden entirely. |

### Single-PiP enforcement (multi-popout coexistence)

Chromium allows only one Document PiP window per origin at a time, AND its `requestWindow()` API is destructive: calling it while a PiP is already open silently closes the existing one. To prevent windows from stomping on each other, the popout hook **transparently falls back to `window.open()` for second+ popouts**.

| State | First popout | Second popout |
|---|---|---|
| DPiP supported, slot free | DPiP (frameless, always-on-top) | DPiP (frameless, always-on-top) |
| DPiP supported, slot taken by another window | — | **`window.open()` popup** (browser chrome visible) |
| DPiP unsupported (Safari, Firefox) | `window.open()` popup | `window.open()` popup |

Both windows then coexist independently — neither affects the other. The first one keeps its glass chrome; subsequent ones get regular browser windows. The user can dock the DPiP window to free the slot, then pop a new one out as DPiP if desired.

This replaces the older "refuse with toast + Dock & pop out this one" UX, which surprised users by docking their existing PiP when they expected to open a second window.

### Files

```
features/window-panels/popout/
├── featureDetection.ts            — pip vs popup vs none
├── popoutDragDetector.ts          — pure threshold/dwell logic
├── popoutWindowMap.ts             — module-level Window registry + useSyncExternalStore hook
├── popoutPendingStorage.ts        — sessionStorage flag for reload-recovery toast
├── PopoutContext.tsx              — context exposing popout doc/window/container
├── PopoutShell.tsx                — provider wrapper mounted inside the portal
├── PopoutPortal.tsx               — createPortal wrapper component
├── usePopoutContainer.ts          — Radix container override hook
├── usePopoutWindow.ts             — lifecycle hook (open/close/cleanup)
├── usePopoutControl.ts            — imperative API + opener registry
└── cloneStyles.ts                 — CSS env clone + MutationObservers (theme + HMR)

features/window-panels/WindowPanel/
└── PopoutTopBar.tsx               — slim chrome strip rendered inside popouts
```

### Redux state

`WindowEntry` gains:
- `popoutMode: "pip" | "popup" | null` — orthogonal to `state` enum
- `prePopoutRect: WindowRect | null` — saved rect for dock-back

`WindowManagerState` gains:
- `activePipWindowId: string | null` — single-PiP slot tracker
- `popoutCandidateId: string | null` — drag-out visual feedback

Actions: `popOutWindow({ id, mode })`, `dockWindow(id)`, `setPopoutCandidate({ id })`.

Selectors: `selectPopoutMode(id)`, `selectIsPoppedOut(id)`, `selectActivePipWindowId`, `selectPopoutCandidateId`, `selectDockedWindows`.

`arrangeActiveWindows`, `minimizeWindow`, `minimizeAll` skip popped-out windows. `unregisterWindow` releases the PiP slot if held. `restoreWindowState` (DB hydration) coerces `popoutMode = null` because programmatic re-popout requires a user gesture.

### Programmatic API

```ts
import { usePopoutControl } from "@/features/window-panels/popout/usePopoutControl";

const { popOut, dock } = usePopoutControl();

// Inside a click handler (user gesture required for popout):
popOut("notesWindow", { width: 480, height: 320, title: "Notes" });
// Returns { ok: true, mode: "pip" | "popup" } | { ok: false, reason: ... }

// Anywhere:
dock("notesWindow");
```

### Reload behavior

If a window was popped out at the time of parent reload, `WindowPersistenceManager` shows a toast with a **Restore** action. Clicking the action triggers a fresh popout via `usePopoutControl` — the click satisfies the user-gesture requirement that programmatic restore can't.

The window otherwise restores docked at its `prePopoutRect` from the persistence layer (popout state itself is never written to DB).

### Mobile

Hard-disabled. Mobile uses a fully separate render path (drawer/card/fullscreen takeover), so popout cannot be triggered:
- "Pop out" menu entry hidden via `!isMobile` gate
- Drag-out detection skipped (`onTriggerPopout` is `undefined` on mobile)

### Radix portal retargeting

Tooltips, popovers, dropdowns, dialogs, alert dialogs, and selects (the 6 wrappers under `components/ui/`) read `usePopoutContainer()` from `PopoutContext`. Inside a popout, Radix portals render into the popout's `<body>` instead of the parent's. Outside a popout, the hook returns `undefined` and Radix uses its default (`document.body`) — zero behavior change for the thousands of existing usages elsewhere in the app.

`Sonner`/`Toaster` are mounted globally in `app/layout.tsx`; toasts triggered from popout content render in the parent window. This is intentional — toasts are global UX, the parent is the right surface.

### Threshold tuning

Defaults in `popoutDragDetector.DEFAULT_DRAG_OUT_CONFIG`:
- `outsideThreshold: 80` px past viewport edge
- `dwellMs: 250` ms held outside before triggering

A re-entry into the viewport resets the dwell timer — a glance outside doesn't latch the candidate state. The "Release to pop out" outline + ghost label appear immediately when the dwell threshold is met.

### Test coverage

- `__tests__/popoutReducer.test.ts` — 24 tests on Redux state machine (popOut/dock round-trip, single-PiP enforcement, tray-slot freeing, hydration coercion, etc.)
- `__tests__/popoutDragDetector.test.ts` — 15 tests on threshold/dwell logic across all viewport edges, custom configs, interrupted dwells

---

## Change log

- **2026-06-24** — **Added `audioControlWindow` ("Audio") mini panel.** New compact, singleton, ephemeral window (`windows/AudioControlWindow.tsx`, ~360×460) surfacing the live recording indicator (read-only from `state.recordings`, with a Stop button when the shared `GlobalRecordingProvider` reports an active recording) plus the global playback queue + transport (now-playing/status chip, pause-resume/skip/clear, 0.5×–2× speed, Up-next play/remove, collapsible History replay) via `useAudioPlayback`. SDK-free (hooks/selectors only). Registered the canonical 5 ways: `overlay-ids.ts`, `catalogue.ts` (`isWindow: true`, singleton), `windowRegistryMetadata.ts` (ephemeral, `mobilePresentation: "card"`), `OverlayController.tsx` (lazyOverlay + gated block), and opener `features/overlays/openers/audioControlWindow.tsx` (`useOpenAudioControlWindow` / `AudioControlWindowController`).
- **2026-06-23** — **`footerVariant` escape hatch + `MultiFileSmartCodeEditorWindow` composer moved to the `footer` slot** (Windows Panel System Overhaul, Phase 3 — completing the offender sweep). New `WindowPanel` prop `footerVariant?: "bar" | "rich"` (default `"bar"`): `"bar"` is the existing compact metadata-bar chrome; `"rich"` drops the `text-xs` / `[&_button]:h-5` / `[&_svg]:h-3` descendant selectors and the `bg-muted/40` / `py-1` chrome, leaving `shrink-0 border-t` so a composer / input bar owns its layout. Decided in `WindowPanel`'s single `footerBar` constructor, so it flows through all four render paths (desktop + mobile drawer/card/fullscreen) unchanged. This unblocked the prior 2026-06-22 follow-up: `MultiFileSmartCodeEditorWindow`'s `SmartAgentInput` composer is now the `footer` slot (`footerVariant="rich"`), not the last body element — its state (`conversationId`, `currentFile`) was already hoisted at the window root, so the slot just receives it. Body is now content-only (tab bar + editor).
- **2026-06-23** — **Create Project window sizing/content polish.** `CreateProjectWindow` now opens wider/taller and opts its `WindowPanel` body into hidden overflow with no wrapper padding; `ProjectCreatePanel` puts padding only on Manual/Paste JSON panes so the Use AI runner can fill the pane edge-to-edge while the window geometry remains stable across tabs.
- **2026-06-22** — **`MultiFileSmartCodeEditorWindow` chrome moved to header slots** (Windows Panel System Overhaul, Phase 3 — offender sweep). The body hand-rolled two chrome blocks: a 71-line action strip (file-identity + edit/format/wrap/minimap/copy toolbar) and the agent-input composer. The toolbar's actions now live in `actionsRight` (`EditorActionStrip`), the active-file identity + "launching agent" indicator in `actionsLeft` (`ActiveFileIndicator`); state was already cleanly hoisted at the window root via `useCodeEditorWindowState`, so the slots just receive props (no entanglement). **Partial by design:** the `SmartAgentInput` composer was NOT moved to the `footer` slot — the footer bar hardcodes compact metadata-bar styling (`text-xs`, `[&_button]:h-5`, `[&_svg]:h-3`) tuned for thin chips (see `NoteMetadataBar`), which would crush the multi-row composer (36px send button, 14px icons, textarea). **Missing primitive → follow-up:** a `footerClassName` escape hatch (or a `footerVariant: "bar" | "rich"`) on `WindowPanel` so the `footer` slot can host a rich composer without the compact descendant styling — would unblock this composer and any future "input bar at the window bottom." Until then the composer stays as the last body element (it's the user's input surface, like a chat composer). Body bodyClassName is now the canonical `flex min-h-0 flex-1 flex-col overflow-hidden p-0`; close-binding + callback-group emitter contract unchanged.
- **2026-06-22** — **`secondaryPanel` slot added** (Windows Panel System Overhaul, Phase 2) — a collapsible, resizable RIGHT panel mirroring `sidebar`, the canonical home for a history / inspector / details pane that belongs to the window (not the body). Props `secondaryPanel` / `secondaryPanelOpen` / `secondaryPanelDefaultSize` (360px) / `secondaryPanelMinSize` (240px) / `secondaryPanelClassName`. Desktop only — the consumer handles mobile (Drawer). Reference: `features/notes` `NoteHistoryPane`. Slot contract documented in [`## Slots — how to add chrome`](#slots--how-to-add-chrome).
- **2026-06-22** — **Notes window is now a reference-correct `WindowPanel` consumer** (Windows Panel System Overhaul, Phase 1) — alongside TranscriptionCleanup / VoicePad / SmartCodeEditorWindow. `windows/notes/NotesWindow.tsx` is a thin composition root: all chrome lives in `WindowPanel` slots (`sidebar` / `actionsRight` / `footer`), the body is content-only, geometry comes from explicit `width`/`height`/`position`, and the rect-mutating `sidebarExpandsWindow` is **gone** — single resize system, no second sizing path. See `features/notes/FEATURE.md`.
- **2026-06-14** — Deleted legacy `LegacyNotesWindow` / singleton `notesWindow` overlay. Canonical multi-instance Notes window is now `overlayId: notesWindow` (dropped `notesBetaWindow` id, `notes-beta-*` instance keys, and duplicate registry/opener entries).
- **2026-06-14** — **Silent-render guard** (see [`## Silent-render guard`](#silent-render-guard)). Root-caused a class of silent window-panel non-renders: stale in-memory `windowManagerSlice` state retained across client-side navigation (reset only on full reload) — chiefly the global `windowsHidden` flag rendering every panel `visibility:hidden`, plus re-opening a minimized/off-screen window being a no-op. Fix: `revealWindow` primitive + reveal-on-open middleware; `registerWindow`/`unregisterWindow` can no longer strand `windowsHidden`; new `overlayRenderWatchdogMiddleware` loudly reports + self-heals any "opened but not visible" panel. 17 new tests.
- **2026-05-07** — Image Viewer toolbar now includes icon-only rotate-left, rotate-right, flip-horizontal, and flip-vertical preview transforms. The existing reset control restores zoom, pan, rotation, and flip state together.
- **2026-05-06** — **Pre-launch audit & cleanup.** Registered `curatedIconPickerWindow` (was lazy-imported ad-hoc by `IconInputWithValidation`, bypassing the registry — converted to the callbackManager pattern under `windows/icons/`). Repaired `pnpm check:registry` (parser was broken since the `.map()` refactor; reported 0 entries / 73 false errors). New script also detects orphan windows by grepping for `<WindowPanel>` importers and requires either registry registration or an `@registry-status: sub-component | inline-window` marker. Added markers to 7 legitimate sub-component / inline-window files (`ScraperFloatingWorkspace`, `PdfExtractorWorkspace`, `AgentGateInput`, `CreatorRunPanel`, `CropPreviewWindow`, `InitialCropWindow`, `SettingsShell`). Filled 3 missing URL hydrators (`file_preview`, `crop_studio`, `messages`). Added one-shot `window_sessions` slug migration (`quick-ai-results` → `quick-chat-history`) in `WindowPersistenceManager`. Deleted legacy `components/overlays/OverlayController.tsx` (orphan dead code, 85 KB, 2,586 LOC). Added dev-only `/admin/window-panels-smoketest` page that probes every registered overlay's lazy import + initial mount.
- **2026-05-04** — Added `messagesWindow` (sidebar list + chat thread, singleton, `urlSync: messages`) and `singleMessageWindow` (single `ChatThread`, multi-instance keyed by `conversationId`). Both reuse `ConversationList` + `ChatThread` from `features/messaging/`. Avatar dropdown's "Direct Messages" `LinkMenuItem` replaced with a new `MessagesMenuItem` that opens `messagesWindow` and shows the unread badge. Messaging islands (`LazyMessagingInitializer`, `MessagingSideSheet`) moved from `(a)`-only `DeferredIslands` to app-wide `DeferredSingletons` so messaging works on every authenticated route. `LazyMessagingInitializer` now mounts as soon as a user is authenticated (was gated on `isOpen || isAvailable`) so the dropdown badge is accurate from first paint.
- **2026-04-29** — `quickDataWindow` (Data Tables) now accepts a `selectedTable` data prop and forwards it to `QuickDataSheet` as `initialTableId`, pre-selecting that table on mount. `openQuickDataWindow({ tableId })` helper added in `overlaySlice`; `quick_data` URL hydrator extended to honour `?panels=quick_data:<tableId>`. `MarkdownTable` and `StreamingTableRenderer` now open this window after a successful save instead of showing a giant `ViewTableModal` over the page.
- **2026-04-26** — **Pop-out windows (Document Picture-in-Picture) shipped.** See `## Pop-out windows` section above. Any `kind: "window"` entry can now be popped out into a frameless always-on-top floating window via menu click or drag-out gesture. 39 new unit tests; zero TypeScript errors; zero per-window opt-in required.
- **2026-04-23** — Phases 0–5, 8, 9 shipped. This `FEATURE.md` created; the long-form content previously in `INVENTORY.md` is absorbed above. `usePanelPersistence.ts` / `FloatingPanel.tsx` / `withGlobalState.tsx` / `TODO-persistence-spec.md` deleted. `UnifiedOverlayController` + `OverlaySurface` introduced behind `NEXT_PUBLIC_OVERLAYS_V2` flag. 6 missing URL-sync hydrators filled; dev-time integrity check added. Mobile drawer + card surfaces introduced; `WindowPanel` routes by `registry.mobilePresentation`.
- **2026-04-11** — `INVENTORY.md` last reviewed.
