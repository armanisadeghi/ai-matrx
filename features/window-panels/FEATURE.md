# Window Panels — FEATURE.md

> **Read this first** — the May 2026 overhaul split this feature into two independent systems:
>
> - **Rendering an overlay** (dialog, sheet, modal, window, toast) → [`features/overlays/FEATURE.md`](../overlays/FEATURE.md)
> - **The WindowPanel component itself** (drag, resize, minimize, tray) → this file's "Architecture" and below
> - **Migration history + cutover plan** → [`docs/OVERLAY_WINDOW_OVERHAUL.md`](../../docs/OVERLAY_WINDOW_OVERHAUL.md)
> - **Future improvements + known gaps** → [`docs/OVERLAY_WINDOW_ROADMAP.md`](../../docs/OVERLAY_WINDOW_ROADMAP.md)
>
> **Status**: The cutover is complete. `features/overlays/OverlayController.tsx` is the renderer. `registry/windowRegistryMetadata.ts` is component-free metadata, not a render registry. `WindowPanel.tsx`, `WindowTraySync.tsx`, `WindowPersistenceManager.tsx`, and the window-manager Redux slice form the independent window-management primitive.

---

## Quick map (post-cutover state)

```
features/overlays/                  ← canonical overlay rendering layer
  OverlayController.tsx                explicit JSX, no spread, type-safe
  openers/<overlayId>.tsx              useOpenX() + <XController />
  catalogue.ts                         render-free metadata
  featureFlag.ts                       cutover flag reader

features/window-panels/             ← WindowPanel component primitive
  WindowPanel.tsx                      the draggable/resizable frame
  WindowTray.tsx                       minimized-windows dock
  WindowTraySync.tsx                   debounced viewport listener
  WindowPersistenceManager.tsx         tab-scoped local preservation coordinator
  windows/<feature>/                   window components (rendered by overlay controller)
  registry/windowRegistryMetadata.ts   component-free metadata + preservation policy
  registry/trayPreviewRegistry.ts      minimized semantic-preview registry
  persistence/                         local workspace serialization/storage

lib/redux/slices/
  windowManagerSlice.ts             ← System 3 (Window Manager) — runtime registration
                                       (a <WindowPanel> joins by mounting, not by static declaration)
  overlaySlice.ts                   ← state for the overlay system
```

---

## Change Log

- 2026-07-20 — Reconnected refresh preservation as a local-first, tab-scoped workspace cache. Exact `(overlayId, instanceId)` identity, staged lazy restores, close tombstones, serialized writes, viewport/tray normalization, account isolation, bounded JSON allowlists, and synchronous pagehide/close mirrors replace the disconnected `window_sessions` manager. Preservation is default-deny per audited registry entry; screenshots remain memory-only.
- 2026-07-20 — Rebuilt the minimized-window contract: desktop cards are 240×160, tray geometry is centralized and every slot release/reorder moves both slot numbers and rectangles, the 32px minimized header ignores rich `titleNode` content, and audited windows use inexpensive semantic previews. Raster capture is explicit opt-in only, memory-only, bounded, and never uploaded or persisted.
- 2026-07-19 — Added `surfaceContextWindow` to the universal Agents header for real-time surface variable inspection, and expanded the admin-gated `surfaceContextInspector` into a two-view WindowPanel (live values + embedded manifest/settings editor). Both use mobile drawer presentation and the canonical overlay controller. Their title bars follow the thin chrome contract: friendly surface labels, 24px icon-only actions, canonical compact Copy for AI, and status metadata in the footer instead of oversized header controls.
- 2026-07-18 — Context Menu v3 now uses `AgentFlexiblePanel` (`flexible-panel`) as the shared framework-owned presentation for surface-bound/default Agents across Notes and every other managed context-menu surface; shortcut-specific presentations remain untouched.
- 2026-07-17 — Promoted the canonical Miller Columns context selector into `contextSwitcherWindow`: a 940×650 full Surface-A WindowPanel backed by `appContextSlice`, sharing its core with the new condensed popover face.
- 2026-07-16 — Refined the chat `runControlsWindow` to open as a compact 480px panel inset 72px from the left edge. It now defaults to the shared-state Quickset tab while retaining the conversation workspace and the standard WindowPanel behavior.
- 2026-07-16 — Added the `characterCounterWindow` as an ephemeral, mobile-fullscreen WindowPanel rendered through the canonical overlay controller.

---

## Mental model

Static metadata declares identity, presentation, preservation policy, and labels without importing component code. The canonical overlay controller owns typed lazy render mappings. The Tools grid independently declares placement. Runtime overlay state lives in `overlaySlice`; mounted geometry and staged preservation live in `windowManagerSlice`.

Adding an overlay is a **2-file change**: add its static metadata and typed lazy render block, then write the component. Add Tools-grid placement only when the window belongs there. Never seed `overlaySlice`.

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
│  OverlayController (single lazy mount in DeferredSingletons)       │
│    typed selectors + lazyOverlay() render blocks                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Typed lazy render block                                            │
│    • subscribes to singleton or multi-instance overlay state         │
│    • validates required context and passes explicit props            │
│    • renders the component behind next/dynamic({ ssr: false })       │
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

- **WindowPersistenceManager** — hydrates the current tab/identity workspace from localStorage + IndexedDB, stages lazy restores, and runs the idle overlay GC sweep.
- **UrlPanelManager** — currently unmounted. Its `?panels=` hydrators and registry metadata are dormant until the manager is deliberately re-enabled and tested.
- **WindowPanel** — looks up its own registry entry by `overlayId` to resolve `mobilePresentation`, `mobileSidebarAs`, and `urlSync.key`.

---

## The registry (single source of truth)

Files: [`registry/windowRegistryMetadata.ts`](./registry/windowRegistryMetadata.ts) (static metadata) and the lazy render map in [`../overlays/OverlayController.tsx`](../overlays/OverlayController.tsx)

### Shape

```ts
interface WindowRegistryEntry {
  // Identity
  slug: string; // stable kebab-case URL/diagnostic identifier
  overlayId: string; // camelCase, key in overlaySlice
  kind: OverlayKind; // "window" | "widget" | "sheet" | "modal"

  // Rendering metadata (the component mapping lives in OverlayController)
  label: string; // shown in tray + window manager
  defaultData: Record<string, unknown>; // doc + restore fallback
  ephemeral?: boolean; // skip local refresh preservation

  // Mobile
  mobilePresentation?: "fullscreen" | "drawer" | "card" | "hidden";
  mobileSidebarAs?: "drawer" | "inline"; // default "drawer"

  // Instancing
  instanceMode?: "singleton" | "multi"; // default "singleton"

  // Integrations
  urlSync?: { key: string }; // dormant until UrlPanelManager is mounted
  icon?: LucideIconName; // (reserved — grid uses toolsGridTiles)
  category?: ToolsCategory; // (reserved — see above)
  heavySnapshot?: boolean; // Phase 7 opt-in
  autosave?: boolean; // Phase 7 opt-in
  preservation?: {
    dataKeys: readonly string[]; // explicit JSON allowlist
    requiredDataKeys?: readonly string[];
    allowedDataValues?: Readonly<Record<string, readonly string[]>>;
    maxDataBytes?: number; // default 32 KiB
  };
  seedData?: (ctx) => Record<string, unknown>; // rarely used on registry
}
```

### Registry invariants

1. Every metadata entry has `kind`; every overlay id has one lazy renderer in `OverlayController`.
2. Every `kind: "window"` has `mobilePresentation`.
3. `slug` and `overlayId` are each unique across the registry.
4. Before `UrlPanelManager` is re-mounted, every live `urlSync.key` must have a context-safe hydrator in `initUrlHydration.ts`.

### How to add a new overlay

**Step 1** — register its static contract in [`registry/windowRegistryMetadata.ts`](./registry/windowRegistryMetadata.ts) and lazy renderer in [`../overlays/OverlayController.tsx`](../overlays/OverlayController.tsx):

```ts
{
  slug: "my-feature-window",
  overlayId: "myFeatureWindow",
  kind: "window",
  label: "My Feature",
  defaultData: { selectedId: null, search: "" },
  mobilePresentation: "drawer",   // or "fullscreen" / "card" / "hidden"
  // optional:
  // ephemeral: true,
  // instanceMode: "multi",
  // mobileSidebarAs: "drawer",
  // urlSync: { key: "my_feature" },
},
```

**Step 2** — create the component, then add its `lazyOverlay(() => import(...))` mapping and typed render block to `features/overlays/OverlayController.tsx`:

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

export default function MyFeatureWindow({
  isOpen,
  onClose,
  selectedId,
  search,
}: Props) {
  if (!isOpen) return null;
  const [sel, setSel] = useState<string | null>(selectedId ?? null);

  const collect = useCallback(() => ({ selectedId: sel, search: "" }), [sel]);

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

In `OverlayController.tsx`, add the `lazyOverlay(() => import(...), { ssr: false })` declaration and the exact typed render block for `myFeatureWindow`. Keep component code out of the static metadata file.

**That's it.** Render and mobile routing are controller/registry driven. URL sync requires a hydrator when declared, Tools-grid placement requires `toolsGridTiles.ts`, and refresh preservation requires an audited `preservation` allowlist (plus `overlayInstanceId` for multi-instance windows).

---

## Slots — how to add chrome

**The body is content ONLY. Every piece of chrome — header, footer, sidebar, secondary panel — is a `WindowPanel` prop slot, not body JSX.** Compose chrome by passing the right slot; never hand-roll a header bar or a footer row inside `children`. Reference consumer: `windows/notes/NotesWindow.tsx`.

**Canonical body recipe** — `bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"`.

| Slot                        | Props                                                                                                                                                                               | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Header**                  | `title` (string) / `titleNode` (rich JSX, wins over `title` while open), `actionsLeft`, `actionsRight`                                                                              | The open-window title is **absolute-centered** across the full header width. Keep header actions **compact** — wide action clusters can reach the centered title and overlap it (known rough edge, see Known gaps). The minimized header is framework-owned: fixed 32px height, 11px one-line text from `title` → registry label → `"Window"`, and it never renders `titleNode` or consumer actions. `actions` is deprecated → maps to `actionsRight`.                                                                                                                                                                      |
| **Footer**                  | `footer` (single flex row) **OR** `footerLeft` / `footerCenter` / `footerRight` (zoned, mutually exclusive with `footer`); `footerVariant` (`"bar"` default / `"rich"`)             | Renders only when content is provided. `footer` wins if both are passed. **`footerVariant="bar"`** (default) applies compact metadata-bar chrome (`text-xs`, tiny buttons/icons via descendant selectors, `bg-muted/40`) for status rows like `NoteMetadataBar` — it **crushes rich content**. Pass **`"rich"`** for a composer / input bar (full-size buttons, multi-row textarea, e.g. `SmartAgentInput`): it drops the compact descendant selectors + `bg-muted/40`, leaving just `shrink-0 border-t` so the slot owns its layout. Reference: `windows/multi-file-smart-code-editor/MultiFileSmartCodeEditorWindow.tsx`. |
| **Sidebar (left)**          | `sidebar`, `sidebarDefaultSize` (200px), `sidebarMinSize` (100px), `defaultSidebarOpen` (true), `sidebarClassName`                                                                  | Resizable + collapsible; a toggle appears next to the traffic lights. **`sidebarExpandsWindow` is a footgun** — it mutates the window rect on every toggle (a second sizing path that fights drag/snap). Avoid; leave it `false`.                                                                                                                                                                                                                                                                                                                                                                                           |
| **Secondary panel (right)** | `secondaryPanel`, `secondaryPanelOpen` (default true when `secondaryPanel` is set), `secondaryPanelDefaultSize` (360px), `secondaryPanelMinSize` (240px), `secondaryPanelClassName` | The canonical home for a **history / inspector / details pane** that belongs to the window, not the body. Resizable, mirrors the sidebar. **Desktop only** — no built-in mobile presentation; the consumer handles mobile (e.g. a Drawer). Reference: `features/notes` `NoteHistoryPane`.                                                                                                                                                                                                                                                                                                                                   |

---

## Slices

All three live under `lib/redux/slices/`:

| Slice                | Responsibility                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overlaySlice`       | Open/closed state + data payload + `lastUsedAt` per overlay/instance. `initialState.overlays` is `{}` — entries grow lazily on first `openOverlay`. |
| `windowManagerSlice` | Window geometry, z-index, tray slots, `arrangeActiveWindows` computations.                                                                          |
| `urlSyncSlice`       | `?panels=` entries the URL manager serializes.                                                                                                      |

`overlaySlice` actions:

- `openOverlay({ overlayId, instanceId?, data? })` — stamps `lastUsedAt`.
- `closeOverlay({ overlayId, instanceId? })` — flips isOpen on singleton slots; deletes the entry entirely for multi-instance overlays.
- `closeAllOverlays()`, `toggleOverlay()`.
- `closeAllInstancesOfOverlay({ overlayId })` — nukes every instance of one overlay.
- `pruneStaleInstances({ olderThanMs })` — GC for closed multi-instance entries. Called from the idle sweep in `WindowPersistenceManager`.

`windowManagerSlice` invariant: `registerWindow`/`unregisterWindow` keep the global `windowsHidden` flag from ever stranding `true`, and `revealWindow(id, viewport)` is the single "bring this window into view" primitive. See [`## Silent-render guard`](#silent-render-guard).

### Minimized-card contract

- Desktop minimized windows are **240×160** cards. Slot zero starts bottom-right, later cards grow left, then wrap upward. Mobile geometry remains 72px tall and viewport-clamped.
- When full cards exceed the current viewport's row capacity, every minimized window reflows into a bounded 32px title-strip overview grid. All 64 supported sessions remain on-screen and individually restorable; dropping back under capacity restores the full-card layout.
- `constants/tray.ts` is the only geometry source. Minimize, resize recomputation, release, reorder, restore, reveal, maximize, unregister, and pop-out update slot order and rendered rectangles together; a slot number must never move without its rectangle.
- Header structure is fixed by `WindowPanel`: 32px tall, traffic lights plus a single truncated 11px title. Rich `titleNode`, consumer header actions, sidebars, and footers do not enter the minimized chrome.
- Preview priority is semantic registry preview → explicitly supplied local screenshot → quiet title fallback. Eleven of the 106 registered windows have semantic previews, including all five preservation pilots, so their normal minimize path performs no raster capture. Capture is an explicit per-window opt-in for a window whose value cannot be represented semantically; it runs once per minimize against a briefly retained offscreen body and is capped at a 320px longest edge, WebP quality 0.62, and an 800ms budget.
- Snapshots are in-memory `Blob` object URLs only: no cloud upload, localStorage, IndexedDB, Redux payload, polling, or refresh loop. The cache holds at most 16 snapshots and revokes URLs on replacement, eviction, restore, and unmount.
- Runtime window ids key screenshots; overlay ids key static metadata/preview registration. This prevents multi-instance windows from sharing an image accidentally.

---

## Persistence

Window layout is device-local UI state, not cloud/domain data. One workspace id lives in `sessionStorage` so refresh keeps the layout while independent tabs do not overwrite one another. A local lease detects cloned tabs and protects active workspaces from cleanup; it renews on save/pageshow/focus/visible activity and releases after the synchronous pagehide flush. If `sessionStorage` is unavailable, the fallback is document-unique (no cross-tab overwrite) but cannot survive refresh. Workspaces are identity-scoped (`auth:<userId>` / `guest:<fingerprint>`); inactive workspaces are reaped toward a five-workspace cap, while active leases may temporarily keep the count above five.

**Storage tiers:** a compact localStorage mirror is written synchronously for reload/pagehide safety; the same payload is queued into the existing IndexedDB warm-cache primitive. If the mirror write fails (quota/disabled storage), any older mirror is removed so hydration must consult the newer IndexedDB record. Writes for one workspace are serialized, so an older completion cannot resurrect a closed window. The whole workspace is capped at 256 KiB / 64 sessions; each window defaults to 32 KiB of semantic JSON.

**Provider coverage:** both authenticated `app/Providers.tsx` and public `app/(public)/PublicProviders.tsx` wrap their overlay controller with `WindowPersistenceManager`. Public windows therefore use the same guest-fingerprint isolation and never fall back to the persistence context's no-op defaults.

**Registry gate:** preservation is default-deny. Five of the 106 registered windows are currently enabled: Messages, Single Message, Site Workbench, Share, and Transcript Studio. A non-ephemeral entry restores only when it declares `preservation.dataKeys`; multi-instance windows must also pass `overlayInstanceId`. `requiredDataKeys` prevents context-dependent windows from reopening without the identity they need. Functions, callbacks, blobs, cyclic/custom objects, and non-allowlisted keys never reach storage.

**On refresh:** the manager validates identity/workspace/schema, normalizes z-order and tray slots, clamps full window rects to the current viewport, stages pending sessions, then opens exact overlay instances. `registerWindow` consumes the staged state atomically; current manual/URL opens beat a late cache read. Pending sessions remain serializable while lazy chunks load, so an early save cannot erase them.

**On close:** `closeOverlay`, the closing branch of `toggleOverlay`, `closeAllInstancesOfOverlay`, and `closeAllOverlays` tombstone the matching window state before the close middleware synchronously flushes the localStorage workspace. Exact, overlay-family, and all-window close intents also suppress a not-yet-hydrated cached session, so closing during a slow IndexedDB read cannot resurrect it.

**Minimized windows:** persistence stores the full pre-minimized rect plus logical tray order, never card pixels or screenshot blobs. Tray card geometry is recomputed for the current viewport. Snapshot previews remain the separate bounded in-memory cache described above and intentionally disappear on refresh.

**Instance GC** — every 30 minutes (idle-only via `requestIdleCallback`), `pruneStaleInstances({ olderThanMs: 30min })` sweeps closed multi-instance entries that haven't been reopened. Singleton slots are preserved regardless so stable-reference selectors don't thrash.

**Ephemeral overlays** — registry entries with `ephemeral: true` never enter the workspace. Use for debug panels, one-shot tool dialogs, and callback-group windows whose caller-side state cannot survive reload.

---

## Silent-render guard

A triggered panel must **never** silently fail to appear. Two layers enforce it via `overlayRenderWatchdogMiddleware` ([`diagnostics/overlayRenderWatchdog.ts`](./diagnostics/overlayRenderWatchdog.ts)):

**Reveal-on-open (proactive).** Every `openOverlay`/`toggleOverlay` for a `kind: "window"` overlay dispatches `revealWindow(id, viewport)`. `revealWindow` restores a minimized window, clamps an off-screen rect back into view, raises z-index, and clears `windowsHidden` — so re-triggering an already-open window is never a no-op. `windowManagerSlice` hardening: `registerWindow` clears `windowsHidden` (a newly opened window is always shown); `unregisterWindow` resets `windowsHidden` at zero windows (the global hide-all can't strand `true` and silently hide the next open).

**Watchdog (loud recovery).** ~2.5 s after an open, the middleware runs the pure `diagnoseOverlayRender` against live Redux + viewport state. If no visible panel is on screen — `windowsHidden` still on, off-screen, or zero-size — it `console.error`s with diagnostics and shows a self-healing `toast.error` ("Show it" → `revealWindow`). Scoped to **singleton window-kind** overlays; minimized and popped-out states count as OK (parked, not failed). Tests: `__tests__/overlayRenderWatchdog.test.ts`, `__tests__/windowManagerReveal.test.ts`.

**"No panel mounted" is ack-gated, never timer-guessed.** Every window enters through `next/dynamic`, so a still-loading chunk (dev compile, slow fetch) is indistinguishable from a genuine no-mount by timer alone. `WindowPanel` calls `ackOverlayRender(overlayId, id)` from a mount effect — strictly after the dynamic import settled — which doubles as the chunk-settle signal and resolves the real window id when it differs from the slug. While no ack exists the watchdog **waits for it** (hard no-mount deadline: 12 s prod / 45 s dev) and diagnoses geometry only once it arrives. If a scream fires and the panel becomes visible while the toast is up, the toast **auto-dismisses** with a recovery `console.info` — a false or stale scream trains people to ignore the real ones.

---

## Mobile presentation

Every `kind: "window"` declares `mobilePresentation`:

Mobile has no minimized tray. Fullscreen mobile chrome therefore does not expose minimize, drawer/card surfaces never expose it, and a desktop-minimized window is restored automatically if the viewport crosses into mobile. This prevents a minimized window from becoming invisible and unrecoverable.

| Value          | Rendered as                                                                                                      | When to use                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `"fullscreen"` | Full-viewport takeover (legacy mobile branch of WindowPanel)                                                     | Content-dominant windows (Notes, AgentRun, CanvasViewer, News). Default.                   |
| `"drawer"`     | Bottom-sheet ([`mobile/MobileDrawerSurface.tsx`](./mobile/MobileDrawerSurface.tsx), vaul, 85 dvh)                | Forms, settings, sidebar-heavy windows. Sidebars collapse into a nested right-side drawer. |
| `"card"`       | Small floating card ([`mobile/MobileCardSurface.tsx`](./mobile/MobileCardSurface.tsx), bottom-right, 60 dvh max) | Utility/debug windows (Stream Debug, State Analyzer, JSON Truncator). Non-modal.           |
| `"hidden"`     | Nothing; dev warning if opened                                                                                   | Windows that shouldn't exist on mobile.                                                    |

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

`UrlPanelManager` is currently not mounted, so `?panels=` hydration is dormant. `WindowPanel` may still register metadata in `urlSyncSlice`, but no manager reads or writes the URL. Share and Transcript Studio intentionally have no `urlSync` metadata because safe hydration requires resource/session context.

If the manager is re-enabled, set `urlSync: { key: "..." }` on a registry entry. `WindowPanel` auto-activates `useUrlSync` when:

1. The entry has `overlayId` defined (caller passes it).
2. Either the caller passes `urlSyncKey`/`urlSyncId` props, or the registry has `urlSync.key`.

Instance id auto-falls-back to `overlayId` for singletons — URL reads like `?panels=notes:notesWindow`.

Every enabled registry `urlSync.key` must have a hydrator in [`url-sync/initUrlHydration.ts`](./url-sync/initUrlHydration.ts). A dev-only assertion logs missing mappings when `UrlPanelManager` mounts.

---

## Tools grid

Declarative — lives in [`tools-grid/toolsGridTiles.ts`](./tools-grid/toolsGridTiles.ts). Each tile references a registry `overlayId` and provides:

```ts
interface ToolsGridTile {
  id: string;
  label: string;
  icon: LucideIcon;
  category: ToolsCategory; // voice | notes | content | agents | files-web | general | admin
  gate?: "admin";
  overlayId?: string; // registered overlay
  instanceStrategy?: "singleton-default" | "fresh-per-click";
  seedData?: (ctx: TileContext) => Record<string, unknown>;
  onActivate?: (ctx: TileContext) => void; // escape hatch (e.g. Image Studio → router.push)
}
```

[`ToolsGrid.tsx`](./tools-grid/ToolsGrid.tsx) reads the config, groups by category, applies admin gate, and dispatches `openOverlay` with the correct instance strategy.

Multi-tile cases (e.g. two "Notes" tiles opening the same overlay with different seed data) are natively supported.

Bundle: the entire Tools grid + all 53 Lucide icons ship only after the user first clicks the sidebar toggle — `SidebarWindowToggle` is wrapped in `dynamic(..., { ssr: false })` at the shell mount.

---

## Bundle invariant

**Non-negotiable**: `WindowPanel`, `OverlayController`, and every `windows/**/*Window.tsx` MUST stay behind the lazy boundary — loaded ONLY via `lazyOverlay(() => import(...))` / `dynamic(..., { ssr: false })`. Component-free `windowRegistryMetadata.ts` is safe in boot code. **NEVER static-import a window component from registry metadata, a route, layout, provider, or boot module.** One static import collapses 100+ lazy overlay chunks into that route's bundle. Read the `code-splitting` skill before adding any import of a window-panel component.

**Route-shared units must not import `WindowPanel`.** A component used both inside a window and on a plain page (e.g. the notes `NoteViewControls` / `NotePresenceBanner` / `NoteHistoryPane`) is content that drops INTO a slot — it takes no `WindowPanel` import, so a route rendering it never drags the window stack into its bundle. (These reference `WindowPanel` in comments only; verified zero import.)

Enforced by:

1. Every overlay component mapping in `OverlayController` uses `lazyOverlay(() => import(...))` — Next.js chunks it on demand.
2. **Runtime guard** — `assertLazyLoaded("…/WindowPanel.tsx")` runs at `WindowPanel.tsx` module top (`utils/lazy-bundle-guard.ts`). If the file is parsed during boot it screams a red `[WINDOW-PANELS BUNDLE LEAK]` console banner with the eager-import chain (the leaking file is the top frame). Relies on the side-effect import `import "@/features/window-panels/utils/lazy-bundle-guard"` in `app/DeferredSingletons.tsx` running at boot so the guard's macrotask is scheduled. Deduped per session via `window.__WP_LEAK_REPORTED__`.
3. The overlay controller and `useOverlay` have zero static imports of any window component.
4. `SidebarWindowToggle` (tools grid) is `dynamic(..., { ssr: false })` at the shell mount site.
5. `scripts/check-bundle-size.ts` gates per-route bundle growth at +2 KB per PR — threshold-dependent; the runtime guard catches leaks it misses.

---

## File inventory

### Core (top-level)

| File                                                    | Role                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WindowPanel.tsx`                                       | Shell (drag, resize, maximize, minimize, mobile routing, persistence, URL sync). Decomposition into modules is Phase 6.                                                                                                                                |
| `WindowPersistenceManager.tsx`                          | Coordinates identity/tab readiness, staged local restore, bounded saves, close flushes, and idle GC.                                                                                                                                                   |
| `WindowTray.tsx` / `WindowTraySync.tsx`                 | Standalone minimized-dock chips + debounced viewport sync. **The `WindowTray` dock is NOT mounted in prod** — minimized windows render as the shrunken `WindowPanel` shell (positioned by `traySlotRect`); `WindowTraySync` keeps those shells docked. |
| `WindowTray/MinimizedWindowContent.tsx`                 | Body of a minimized shell: renders `TrayChipPreview` (registry semantic / explicit snapshot / default) + click-to-restore. Registry and runtime snapshot keys stay distinct.                                                                           |
| `WindowTray/TrayChipPreview.tsx` / `TrayStatusChip.tsx` | Canonical minimized-body preview (3 modes) + the reusable status primitive (tinted icon + count + per-tone breakdown; presentational, colour language from `errorTiers.ts`). Custom previews register in `registry/trayPreviewRegistry.ts`.            |
| `WindowTray/traySnapshotMap.ts`                         | Bounded 16-entry in-memory Blob/object-URL snapshot cache with explicit URL revocation.                                                                                                                                                                |

### Subdirs

| Path                                        | Role                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `registry/windowRegistryMetadata.ts`        | Component-free overlay metadata, presentation flags, and preservation policy.                                      |
| `registry/trayPreviewRegistry.ts`           | Semantic preview mappings and explicit raster-capture opt-ins.                                                     |
| `persistence/windowSessionSerialization.ts` | Validates, bounds, normalizes, and serializes local workspace sessions.                                            |
| `persistence/localWindowSessionStore.ts`    | Composes localStorage + IndexedDB with tab leases, identity isolation, write ordering, and reaping.                |
| `hooks/useOverlay.ts`                       | Factory hooks (`useOverlayOpen`, `useOverlayData`, `useOverlayInstances`, `useOverlayActions`, `useCloseOverlay`). |
| `hooks/useWindowPanel.ts`                   | Pointer-driven move/resize; Redux window registration.                                                             |
| `mobile/MobileDrawerSurface.tsx`            | Vaul-based bottom sheet for `mobilePresentation: "drawer"`.                                                        |
| `mobile/MobileCardSurface.tsx`              | Floating card for `mobilePresentation: "card"`.                                                                    |
| `tools-grid/toolsGridTiles.ts`              | Declarative config for every Tools-grid tile.                                                                      |
| `tools-grid/ToolsGrid.tsx`                  | Data-driven Tools-grid renderer.                                                                                   |
| `tools-grid/menuPrimitives.tsx`             | `MenuSection` / `MenuDivider` / `MenuItem` / `MenuGridItem`.                                                       |
| `url-sync/initUrlHydration.ts`              | `registerPanelHydrator` calls + dev-time integrity check.                                                          |
| `url-sync/UrlPanelRegistry.ts`              | Hydrator map.                                                                                                      |
| `url-sync/UrlPanelManager.tsx`              | Dormant `?panels=` coordinator; currently not mounted.                                                             |
| `url-sync/useUrlSync.ts`                    | Registers/unregisters open panel in `urlSyncSlice`.                                                                |
| `constants/tray.ts`                         | Single source for tray dimensions, margins, wrapping, and slot rectangles.                                         |
| `utils/rectClamp.ts`                        | Viewport-safe geometry clamping.                                                                                   |
| `utils/windowArrangements.ts`               | `arrangeActiveWindows` tile math.                                                                                  |
| `utils/embed-site-url.ts`                   | URL normalization for iframe windows.                                                                              |
| `components/SidebarWindowToggle.tsx`        | Shell sidebar toggle (600 LOC post-Phase 3).                                                                       |
| `components/LayoutIcon.tsx`                 | Layout arrangement icon buttons.                                                                                   |
| `windows/**`                                | Window components, each reached from a typed lazy mapping in `features/overlays/OverlayController.tsx`.            |

### Deleted

- `FloatingPanel.tsx`, `utils/withGlobalState.tsx`, `hooks/usePanelPersistence.ts`, `TODO-persistence-spec.md`.
- `service/windowPersistenceService.ts` — unused cloud CRUD/migration path removed when local workspaces became canonical.

### Baselines

- `_baselines/bundle-before.md` — pre-modernization bundle/LOC snapshot. Deleted at the end of Phase 12.

---

## Rollout state

| Phase                                                                        | Status                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0 — Baselines + bundle-size gate                                             | ✅ shipped                                                                                       |
| 1 — Registry schema expansion (59 entries)                                   | ✅ shipped                                                                                       |
| 2 — UnifiedOverlayController + absorbed non-window overlays (33 new entries) | ✅ shipped (legacy `components/overlays/OverlayController.tsx` deleted 2026-05-06; flag retired) |
| 3 — Auto-derived Tools grid + lazy SidebarWindowToggle                       | ✅ shipped                                                                                       |
| 4 — State cleanup: drift-free initial state, instance GC, LS sidecar retired | ✅ shipped                                                                                       |
| 5 — Mobile presentation layer (drawer/card surfaces, rect clamp)             | ✅ shipped                                                                                       |
| 6 — WindowPanel decomposition                                                | ⏸ deferred                                                                                       |
| 7 — Local persistence hardening + audited semantic preservation pilots       | ✅ platform shipped; broader registry rollout remains audited                                    |
| 8 — URL-sync implementation                                                  | dormant; `UrlPanelManager` is not mounted                                                        |
| 9 — Dead code removal                                                        | ✅ shipped                                                                                       |
| 10 — Tests                                                                   | ✅ preservation/reducer/store coverage shipped; broader mobile matrix remains                    |
| 11 — Docs refresh (this file)                                                | ✅ current                                                                                       |
| 12 — `SKILL.md` + guardrails (ESLint)                                        | 🔜 next                                                                                          |
| 13 — Polish (undo/redo, theme tokens)                                        | ⏸ deferred                                                                                       |

---

## Known gaps / future work

1. **Phase 6 — WindowPanel decomposition.** The 1,500-line shell wants to be split into `ResizeFrame` / `WindowHeader` / `TrafficLights` / `Chrome` / `SaveDropdown` / `PersistenceBinding`. Pure internal refactor; public prop surface stays identical. **No header/footer is extracted as a standalone sub-component yet** — chrome lives inline in the shell. Sub-issue: the header has **5 divergent implementations** (desktop `WindowHeader`, mobile-fullscreen `MobileWindowHeader`, mobile-drawer `MobileDrawerSurface`, mobile-card `MobileCardSurface`, popout `PopoutTopBar`) that share no code — consolidate to one core header. Whatever is built **stays behind the lazy boundary** (see Bundle invariant).
2. **Persistence rollout.** The platform primitive is shipped; registry opt-in remains deliberately audited. Add typed linkage between `defaultData`, `preservation.dataKeys`, and `onCollectData`, then enable additional self-contained windows. Callback-group editors need a real detached/rebind restore contract before opt-in; screenshots and heavy buffers remain excluded.
3. **Semantic-preview rollout.** Eleven windows have state-aware tray previews. Every other window gets the polished, low-cost identity/category fallback card, but it does not yet summarize that window's internal state. Add semantic renderers when a window has a small, safe status payload; do not turn on default raster capture.
4. **Remaining test expansion.** Persistence serialization, local-tier ordering, close middleware, identity handoff, tray order, and geometry have automated coverage. Still add a broader mobile presentation matrix and browser coverage for more than the five preservation pilots.
5. ~~**Legacy `OverlayController.tsx` (2,586 lines) deletion.** Gated on user smoke test with `NEXT_PUBLIC_OVERLAYS_V2=1`.~~ Done 2026-05-06.
6. **`windowManagerSlice` split** (geometry / state / tray / zIndex). Deferred to Phase 13 unless profiling flags tray-op cost.
7. **Redux DevTools namespace.** Slices are flat (`overlays/*`, `windowManager/*`). Migrating to `windowPanels/overlays/*` would be cosmetic but breaks downstream action-type string matches.
8. **Open-window header title collision.** The non-minimized `title`/`titleNode` is absolute-centered across the full width, so very wide `actionsLeft` / `actionsRight` can visually overlap it. The minimized header is already isolated from this class. Fix the open form with left/center/right tracks during Phase 6 header consolidation; keep it behind the lazy boundary.
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

| Browser                            | Mode                            | Notes                                                                     |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Chrome 116+, Edge 116+, Opera      | **Document Picture-in-Picture** | Frameless, always-on-top floating window. Single-PiP-per-origin enforced. |
| Safari, Firefox, others            | **`window.open` popup**         | Universal fallback. Browser chrome visible (URL bar, tabs).               |
| Embedded WebView, no `window.open` | (none)                          | "Pop out" UI hidden entirely.                                             |

### Single-PiP enforcement (multi-popout coexistence)

Chromium allows only one Document PiP window per origin at a time, AND its `requestWindow()` API is destructive: calling it while a PiP is already open silently closes the existing one. To prevent windows from stomping on each other, the popout hook **transparently falls back to `window.open()` for second+ popouts**.

| State                                        | First popout                    | Second popout                                      |
| -------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| DPiP supported, slot free                    | DPiP (frameless, always-on-top) | DPiP (frameless, always-on-top)                    |
| DPiP supported, slot taken by another window | —                               | **`window.open()` popup** (browser chrome visible) |
| DPiP unsupported (Safari, Firefox)           | `window.open()` popup           | `window.open()` popup                              |

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

`arrangeActiveWindows`, `minimizeWindow`, `minimizeAll` skip popped-out windows. `unregisterWindow` releases the PiP slot if held. Local workspace hydration coerces `popoutMode = null` because programmatic re-popout requires a user gesture.

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

The window otherwise restores docked at its `prePopoutRect` from the persistence layer (popout state itself is never cached).

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

- **2026-07-21** — **`audioControlWindow` retitled "Media" + Camera tab (media-capture Phase 8).** `windows/AudioControlWindow.tsx` now has Playback / Recording / Camera / Devices tabs (mobile stacked sections); the Camera tab renders `features/media-capture/components/CameraControlTab.tsx` (read-only diagnostics). Registry label, catalogue label, and the avatar-menu entry say "Media"; overlayId, slug `audio-control-window`, window id, and openers unchanged — zero breakage.
- **2026-07-20** — **Geometry motion.** Programmatic rect changes (snap, arrange, minimize→tray, restore, off-screen clamp) now glide via a CSS transition (`WindowPanel.module.css` `.glide`, 0.45s `cubic-bezier(0.32, 0.72, 0, 1)` on left/top/width/height), and freshly mounted shells (open + windowed↔maximized branch swap) get a `.enter` scale/fade. `useWindowPanel` exposes `isInteracting` (true during an active pointer drag/resize); the shell drops `.glide` while interacting so pointer tracking stays 1:1. The legacy framer-motion `WindowManager` demo (`components/matrx/windows`, `/demos/tests/windows`) whose spring feel this replaces is deleted.
- **2026-07-20** — **Minimized cards are now representative, bounded, and geometry-safe.** Desktop cards changed from 270×100 strips to 240×160 previews. All tray constants/math moved to `constants/tray.ts`; release and reorder reducers now compact both slot ids and pixel rectangles immediately, with coverage for restore, unregister, reveal, maximize, pop-out, drag reorder, row wrapping, viewport recompute, and the 32px overview grid used when full cards exceed viewport capacity. Minimized headers have a fixed 32px/11px framework-owned shape and ignore arbitrary rich `titleNode` content. Audited preservation pilots use semantic previews; raster capture is an explicit opt-in only. When enabled, it remains a one-shot, low-resolution WebP in a 16-entry in-memory object-URL cache, never blocks minimize, uploads or persists nothing, and revokes URLs on lifecycle exit.
- **2026-07-15** — **Notes folder creation parity reaches every window without panel forks.** `NotesWindow`, `NoteInfoWindow`, and every `QuickNoteSaveWindow` instance inherit **New folder…** from their shared Notes cores (sidebar row menus/right-click, tab menus/right-click, metadata/info panels, and quick-save folder picker). The adaptive folder flows render as Dialogs on desktop and Drawers on mobile; the window registry and panel composition contract are unchanged.
- **2026-07-15** — **Context Items window keyboard model completed.** The sidebar item composite now uses roving focus with Up/Down/Home/End navigation, the open-item strip is a real ARIA tablist with Left/Right/Home/End navigation, inactive tabs and closes leave the ordinary Tab sequence, and tab panels are explicitly associated with their tabs. Opening an edit tab focuses its first field while shared panel focus restoration returns users to the opener on close.
- **2026-07-15** — **Added `ragAiCopyWindow` ("Copy RAG result for AI") panel.** A 980×700 singleton, ephemeral composer window with mobile drawer routing. The body keeps its control rail and live XML-ish preview independently scrollable, offers identifiers-only / essentials / everything presets plus per-content toggles and honest char/item caps, and exposes normal selected-content copy alongside the branded AI envelope action. Registered through the canonical explicit overlay controller, typed opener, catalogue, IDs, and static WindowPanel metadata.
- **2026-07-14** — **Exact-page File Preview window contract.** `filePreviewWindow` registry data now includes `pageNumber` plus an internal navigation request id, and the explicit overlay controller forwards both into the window. Callers can use `useOpenFilePreviewWindow({ fileId, pageNumber })` to land on a 1-based PDF page; identical repeat calls still reset the existing singleton to the requested page. URL sync now uses the actual `fileId` and persists the page as `?panels=file_preview:<fileId>:p-<page>`.
- **2026-07-10** — **Layout arrange overlap fix + floating Layout rescue.** (1) `WindowPanel` CSS `minWidth`/`minHeight` no longer override an explicit arranged/snapped rect — uncapped mins (often 480–640) were expanding every left-stack tile past its slot so windows stacked on top of each other. Caps are `min(prop, rect)` (fitContent unchanged). (2) `computeGlobalArrangement` only fills unique slots (`cols×rows`); excess windows keep prior geometry instead of wrapping onto occupied tiles. RTL/BTT mirror simplified now that indices stay in-range. (3) When a windowed panel covers the sidebar Windows trigger (typical after stack-left), `SidebarWindowToggle` portals a floating `LayoutGrid` FAB (`z-[10001]`, bottom-left) that reopens the menu on the Layout tab.
- **2026-07-05** — **Added `runControlsWindow` ("Chat Options") window.** `windows/agents/RunControlsWindow.tsx` — the Smart Input run controls (Attach/Context/Document/Overrides/Tools/Skills/Sandbox/Settings/Preferences/Creator) as a non-blocking singleton, ephemeral WindowPanel (860×640, min 520×420, sidebar slot hosts the tab list, one fixed body size across tabs). Content comes from the shared `RunControlsTabPanel.tsx` core in `features/agents/components/inputs/smart-input/`, keyed per `conversationId`. Replaces the desktop tabbed Popover whose `z-[10001]` buried dialogs opened from inside it; global fix: `components/ui/popover.tsx` popover z now equals the dialog layer (`z-[10000]`) so DOM portal order decides stacking.
- **2026-07-06** — **Watchdog no longer false-screams on slow lazy chunks.** The silent-render watchdog treated "no `WindowPanel` registered yet" after a fixed 2.5 s + 2 s retry as a failure — a cold `next/dynamic` compile in dev (e.g. `pdfExtractorWindow`) outlasted it and fired the "didn't appear" toast on panels that rendered fine seconds later. Now the no-mount verdict is **ack-gated**: the watchdog waits for `ackOverlayRender` (WindowPanel's mount effect = dynamic-import-settled signal) before diagnosing, bounded by a hard no-mount deadline (12 s prod / 45 s dev). Geometry failures (`windowsHidden` / zero-size / off-screen) still scream at ~2.5 s. If a scream fires and the panel becomes visible while the toast is up, the toast auto-dismisses (post-scream 500 ms recovery poll) with a `console.info`. See [`## Silent-render guard`](#silent-render-guard).
- **2026-07-02** — **Resize-handle guard (platform-wide).** Desktop windowed `WindowPanel` shells use a two-layer frame: an `overflow-visible` positioning wrapper (handles sit here, half extending outside the border via translate) + inner `overflow-hidden` chrome. Body wrapper (`WindowPanelBodyShell`) keeps consumer content off handle hit zones. Handles are 10px (`w/h-2.5`), corners centered on shell vertices; **no top-left (`nw`) handle** (traffic-light / close zone); top edge starts at `left-28`. — **Minimized windows render a live preview, not an empty card.** The shrunken `WindowPanel` shell's body (empty below the header) now renders the canonical tray preview via new `WindowTray/MinimizedWindowContent.tsx` → `TrayChipPreview` (registry custom / snapshot / default), click-anywhere-to-restore. This brings `registry/trayPreviewRegistry.ts` to **production** minimized state — the standalone `WindowTray` dock (its other consumer) is not mounted; lookup key is `overlayId ?? id`. New reusable primitive `WindowTray/TrayStatusChip.tsx` — a presentational status mini-view (tinted icon + count + per-tone breakdown; `TrayStatusTone` neutral/info/warning/elevated/critical, same colour language as `lib/diagnostics/errorTiers.ts`) for any window whose minimized value is "a status + a few numbers." First consumer: the Error Inspector's `ErrorInspectorTrayChip` (bug icon coloured by the loudest captured tier, live from the module store — isolated re-renders, zero page impact). A window with no registered preview lands on the default muted label, so the change is safe for all windows.
- **2026-06-26** — **Added `systemInstructionWindow` ("Structured System Instruction") panel.** A draggable/resizable twin of `SystemInstructionModal` — both wrap the same Redux-backed `SystemInstructionEditor` (keyed by `conversationId`), so they stay in sync; the window is just the non-blocking presentation. `windows/agents/SystemInstructionWindow.tsx` (singleton, ephemeral, ~620×640, content-only body in the canonical scroll wrapper). Registered the canonical 5 ways: `overlay-ids.ts`, `catalogue.ts` (`isWindow: true`, singleton), `windowRegistryMetadata.ts` (ephemeral, `mobilePresentation: "drawer"`, `defaultData: { conversationId: "" }`), `OverlayController.tsx` (lazyOverlay + gated block that no-ops on empty `conversationId`), and opener `features/overlays/openers/systemInstructionWindow.tsx` (`useOpenSystemInstructionWindow` / `SystemInstructionWindowController`). The run-settings panel (`RunSettingsEditor`) now offers both as side-by-side **Dialog** / **Window** buttons under the "Structured system prompt" toggle.
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
