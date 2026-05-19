---
name: window-panels
description: Use for tasks scoped to the WindowPanel COMPONENT primitive itself — drag, resize, minimize/maximize, the tray dock (WindowTray / WindowTraySync), the runtime Window Manager registry (`windowManagerSlice`), URL persistence of window state, and the `window_sessions` DB hydration. Triggers on `features/window-panels/WindowPanel.tsx`, `WindowTray*.tsx`, `WindowPersistenceManager.tsx`, `lib/redux/slices/windowManagerSlice.ts`, or any task adding a `<WindowPanel>` directly on a page outside the overlay system. For OPENING / ADDING / RENDERING / DEBUGGING dialogs, sheets, modals, or windows-as-overlays — use the `overlay-system` skill instead. The two systems were merged in April 2026 (causing a class of silent-render bugs) and split back apart in May 2026; keep them separate.
---

# Window Panels (component primitive + window manager)

> **Scope (after the May 2026 overhaul):** this skill is now narrowed to the **WindowPanel component primitive** and the runtime **Window Manager** (`windowManagerSlice` + `WindowTray`). Overlay RENDERING (controller / openers / dispatch) moved to a separate system documented in the [`overlay-system`](../overlay-system/SKILL.md) skill. Treat any reference below to "the registry drives rendering" as historical context about the deprecated path that's being deleted post-cutover.

The two systems are independent:

- **WindowPanel + Window Manager** (this skill): a draggable/resizable frame component + a Redux-backed runtime registry every mounted `<WindowPanel>` joins. Centralized controls (minimize-all, focus, tray, persistence) act on whatever is in the runtime registry — whether the overlay controller rendered it or a page rendered it directly.
- **Overlay System** ([overlay-system](../overlay-system/SKILL.md)): the controller + openers + catalogue that renders any component on dispatch. Used to render most WindowPanel-using overlays, but doesn't have to be — a page-local `<WindowPanel>` works fine without any overlay involvement.

If your task is "open / close / register an overlay" or "dispatch openOverlay" or "migrate to typed opener" → use the **overlay-system** skill, not this one.

If your task is "the window won't drag", "the tray isn't showing", "window state doesn't persist", "I want to render a WindowPanel directly on a page", or "fix WindowManager focus history" → this skill.

For the original deep architectural reference (which still describes the legacy conflated path), see [`features/window-panels/FEATURE.md`](../../../features/window-panels/FEATURE.md). For the migration history, see [`docs/OVERLAY_WINDOW_OVERHAUL.md`](../../../docs/OVERLAY_WINDOW_OVERHAUL.md).

---

## Mental model

**One registry, one renderer.** Every overlay in the app is declared in a single registry entry. A single unified controller iterates the registry and renders each open overlay through a generic surface component. Every subsystem reads the registry — Tools grid, persistence, URL sync, mobile presentation, slice init.

The practical implication: **adding an overlay is a 2-file change** (registry entry + component file). No `OverlayController` edit, no slice seed, no shell sidebar edit.

```
openOverlay(overlayId)
      │
      ▼
overlaySlice.overlays[overlayId][instanceId] = { isOpen, data, lastUsedAt }
      │
      ▼
UnifiedOverlayController  ──→  OverlaySurface  ──→  React.lazy(componentImport)
(iterates registry)           (subscribes to state)   (mounts component)
      │                              │
      │                              └─→ props: { isOpen, onClose, ...mergedData }
      ▼
WindowPanel shell (desktop) / MobileDrawerSurface / MobileCardSurface / fullscreen mobile
```

---

## The 2-step recipe

### Step 1 — add the registry entry

Edit [`features/window-panels/registry/windowRegistry.ts`](../../../features/window-panels/registry/windowRegistry.ts):

```ts
{
  slug: "my-feature-window",
  overlayId: "myFeatureWindow",
  kind: "window",
  label: "My Feature",
  componentImport: () =>
    import("@/features/window-panels/windows/MyFeatureWindow"),
  defaultData: { selectedId: null, search: "" },
  mobilePresentation: "drawer",
  // optional:
  // ephemeral: true,
  // instanceMode: "multi",
  // mobileSidebarAs: "drawer",
  // urlSync: { key: "my_feature" },
},
```

**Rules:**

- `slug` kebab-case, unique — stored in `window_sessions.window_type`.
- `overlayId` camelCase, unique — key in `overlaySlice`.
- `kind: "window"` requires `mobilePresentation`. Other kinds (`"widget"`, `"sheet"`, `"modal"`) own their own positioning.
- `componentImport` must be a `() => import(...)` lazy returning `{ default: Component }`. For named exports: `.then(m => ({ default: m.MyFeatureWindow }))`.
- `defaultData` documents what `onCollectData` returns. Each key should match a prop name on your component (the surface spreads them).

### Step 2 — write the component

Create `features/window-panels/windows/MyFeatureWindow.tsx`:

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
  return <Inner onClose={onClose} selectedId={selectedId} search={search} />;
}

function Inner({ onClose, selectedId, search }: Omit<Props, "isOpen">) {
  const [sel, setSel] = useState<string | null>(selectedId ?? null);
  const [q, setQ] = useState(search ?? "");

  const collect = useCallback(
    () => ({ selectedId: sel, search: q }),
    [sel, q],
  );

  return (
    <WindowPanel
      id="my-feature-window"          // stable key in windowManagerSlice
      title="My Feature"
      overlayId="myFeatureWindow"     // must match registry
      onClose={onClose}
      onCollectData={collect}          // called before every save
      minWidth={380}
      minHeight={280}
      width={560}
      height={440}
    >
      {/* body */}
    </WindowPanel>
  );
}
```

**That's it.** `UnifiedOverlayController` automatically picks up the new entry. Persistence (`window_sessions`), URL deep-linking, mobile drawer/card/fullscreen routing, and the registry-integrity check all just work. If you want the overlay in the Tools-grid sidebar, add a tile in [`tools-grid/toolsGridTiles.ts`](../../../features/window-panels/tools-grid/toolsGridTiles.ts) — also a one-file change.

---

## Registry fields — quick reference

| Field | Required | Default | Purpose |
|---|---|---|---|
| `slug` | ✅ | — | Unique kebab-case identifier. DB key. |
| `overlayId` | ✅ | — | Unique camelCase identifier. Redux key. |
| `kind` | ✅ | — | `"window"` \| `"widget"` \| `"sheet"` \| `"modal"`. |
| `componentImport` | ✅ | — | Lazy dynamic import. |
| `label` | ✅ | — | Human name. |
| `defaultData` | ✅ | — | Shape doc + restore fallback. |
| `mobilePresentation` | ✅ for `"window"` | — | `"fullscreen"` \| `"drawer"` \| `"card"` \| `"hidden"`. |
| `mobileSidebarAs` | | `"drawer"` | Only for windows with a sidebar. |
| `instanceMode` | | `"singleton"` | `"multi"` allows concurrent instances. |
| `urlSync` | | | `{ key }` for `?panels=<key>` deep-linking. |
| `ephemeral` | | `false` | Skip DB persistence. |
| `heavySnapshot` / `autosave` | | `false` | Phase 7 opt-ins (not yet wired). |

---

## Picking `mobilePresentation`

Decision tree:

1. **Has a sidebar?** → `"drawer"` (sidebar collapses into a nested right-side drawer on mobile).
2. **Content-dominant experience** (chat, feed, editor body)? → `"fullscreen"`.
3. **Small utility / debug surface** (State Analyzer, JSON Truncator, Stream Debug)? → `"card"` (floating bottom-right, non-modal).
4. **Never renders on mobile?** → `"hidden"` (dev warning if opened).

Current window tiers (from the plan):

- **Trivial drawers**: Feedback, UserPreferences, TaskQuickCreate, QuickNoteSave, EmailDialog, ShareModal.
- **Sidebar-heavy drawers**: AgentContentSidebar, AgentSettings, AgentAdvancedEditor, ContentEditorWorkspace, ContentEditorList, QuickTasks, QuickFiles, PdfExtractor, Scraper, Gallery, CloudFiles.
- **Fullscreen content**: Notes(Beta), ListManager, NewsWindow, CanvasViewer, AgentRun, Projects, MarkdownEditor, ImageViewer, FilePreview.
- **Cards**: StreamDebug(History), ChatDebug, AgentDebug, ExecutionInspector, InstanceUIState, MessageAnalysis, AgentAssistantMarkdownDebug, State Analyzer.

---

## URL deep-linking (`?panels=...`)

1. Add `urlSync: { key: "my_feature" }` to the registry entry.
2. Register a hydrator in [`features/window-panels/url-sync/initUrlHydration.ts`](../../../features/window-panels/url-sync/initUrlHydration.ts):

```ts
registerPanelHydrator("my_feature", (dispatch, id, args) => {
  dispatch(openOverlay({
    overlayId: "myFeatureWindow",
    data: { selectedId: args.id ?? null },
  }));
});
```

A dev-time assertion in that file logs a `console.error` if any registry `urlSync.key` lacks a hydrator — missing mappings land in your PR, not in production.

Instance IDs: `WindowPanel` auto-falls-back to the `overlayId` for singletons (reads like `?panels=my_feature:myFeatureWindow`). For multi-instance windows, pass a unique `instanceId` via `openOverlay` at the call site.

---

## Persistence contract

**Save triggers — only two:**

1. **Explicit** — user clicks "Save window state" in the green traffic-light dropdown.
2. **Piggyback** — child code calls `onCollectData` as part of its own save.

Moving, resizing, toggling the sidebar, tab switches — none trigger a DB write.

**`onCollectData`**:

- Return a plain JSON-serialisable object.
- Keys **must** align with `defaultData` (document every key both places).
- Wrap in `useCallback` with all relevant dependencies — it's called synchronously at save time.

**On close** — `WindowPanel` deletes the DB row, so the window doesn't reopen on next load.

**On page load** — `WindowPersistenceManager` fetches rows, runs rect clamping, dispatches `openOverlay` + `restoreWindowState` before `WindowPanel` mounts.

**Ephemeral overlays** — set `ephemeral: true`:

- Debug panels, state viewers, one-shot tool dialogs.
- The "Save window state" button is hidden.
- Closing doesn't attempt a DB delete.
- Use when: callback groups tie the overlay to a caller that can't survive reload; session state can't be meaningfully restored.

**Phase 7 opt-ins (not yet wired):** `autosave` (save on blur/visibilitychange) and `heavySnapshot` (async snapshot-on-blur for windows with heavy in-memory buffers like Scraper results or PDF history).

---

## Bundle rules — non-negotiable

1. **Never statically import a window component** outside `windowRegistry.ts`. Use `componentImport` on the entry; `OverlaySurface` handles lazy mount. An ESLint rule (`no-restricted-imports`) will block violations.
2. **Never statically import `SidebarWindowToggle`** outside its single `dynamic()` mount in `features/shell/components/sidebar/Sidebar.tsx`.
3. **Verify deltas** with `pnpm check:bundle` after changes that could grow chunks. Threshold is +2 KB per route.

If you need a utility from a window component, lift the utility into a shared module (e.g. `features/window-panels/utils/`) — never import the window itself.

---

## State shape

Three slices under `lib/redux/slices/`:

- **`overlaySlice`** — `overlays[overlayId][instanceId] = { isOpen, data, lastUsedAt }`. `initialState.overlays` is `{}`; entries grow lazily on first `openOverlay`. Do not hand-add keys here — the registry IS the list.
- **`windowManagerSlice`** — geometry, z-index, tray slots, `arrangeActiveWindows`.
- **`urlSyncSlice`** — `?panels=` serialisation registry.

Hooks to subscribe to overlay state:

```tsx
import {
  useOverlayOpen,
  useOverlayData,
  useOverlayInstances,
  useOverlayActions,
  useCloseOverlay,
} from "@/features/window-panels/hooks/useOverlay";

const isOpen = useOverlayOpen("myFeatureWindow");
const data = useOverlayData<{ selectedId: string | null }>("myFeatureWindow");
const instances = useOverlayInstances("contentEditorWindow"); // multi
const { open, close, toggle } = useOverlayActions();
const handleClose = useCloseOverlay("myFeatureWindow");
```

---

## Common pitfalls

1. **`kind: "window"` without `mobilePresentation`** — dev assertion fails; overlay won't render on mobile. Add `mobilePresentation`.
2. **Registry `urlSync.key` with no hydrator** — dev assertion logs; `?panels=<key>` silently no-ops. Add a `registerPanelHydrator` call in `initUrlHydration.ts`.
3. **Prop names misaligned with `defaultData` keys** — `OverlaySurface` spreads the data onto props. If `defaultData: { selectedId: null }` but your component expects `initialSelectedId`, the prop is undefined. Either rename the component prop or rename the data key — keep them consistent.
4. **Multi-instance without fresh `instanceId`** — instances overwrite each other. Dispatch with `instanceId: \`${slug}-${Date.now()}\`` or use the Tools-grid `instanceStrategy: "fresh-per-click"`.
5. **Editing `overlaySlice.ts` `initialState`** — don't. It's `{}` by design; overlay keys grow lazily. The registry is the list of what exists.
6. **Editing `components/overlays/OverlayController.tsx`** — legacy path, being retired. Changes here are swept away when `NEXT_PUBLIC_OVERLAYS_V2` flips on. Add/modify entries in the registry instead.
7. **Hardcoded rect in `initialRect`** that's larger than a mobile viewport — will land off-screen on phones if persistence restores it. The rect-clamp on hydrate handles older saves, but new `initialRect` values should be reasonable.
8. **Importing Lucide icons directly in a window component for the Tools grid** — icons live in `tools-grid/toolsGridTiles.ts`. Window components should only import icons for their own internal UI.

---

## Debugging

- **Redux DevTools** — filter by `overlays/*` and `windowManager/*` to see overlay open/close and geometry changes.
- **URL deep-link**: paste `?panels=notes:notesWindow,scraper:scraperWindow` to verify hydrators.
- **`NEXT_PUBLIC_OVERLAYS_V2=1`** in `.env.local` switches to the `UnifiedOverlayController` (registry-driven). Legacy `OverlayController` is the default until user smoke test confirms parity.
- **Registry-integrity error in console** — check the message; usually a missing `mobilePresentation` or a duplicated `overlayId`/`slug`. Run `pnpm check:registry` for a CLI view (see below).
- **Window doesn't appear in Tools grid** — check `tools-grid/toolsGridTiles.ts`. Grid placement is declarative; registry membership doesn't auto-add to the grid.
- **Window restores to wrong size on phone** — check the clamp logic in `features/window-panels/utils/rectClamp.ts`. Saved rect from a desktop session will be clamped into the mobile viewport.

---

## Key files

| Path | Role |
|---|---|
| `features/window-panels/registry/windowRegistry.ts` | Single source of truth. |
| `features/window-panels/UnifiedOverlayController.tsx` | Renderer. |
| `features/window-panels/OverlaySurface.tsx` | Per-entry surface. |
| `features/window-panels/WindowPanel.tsx` | Desktop shell + mobile routing. |
| `features/window-panels/mobile/MobileDrawerSurface.tsx` | Mobile drawer surface. |
| `features/window-panels/mobile/MobileCardSurface.tsx` | Mobile card surface. |
| `features/window-panels/tools-grid/toolsGridTiles.ts` | Tools-grid tiles. |
| `features/window-panels/url-sync/initUrlHydration.ts` | `?panels=` hydrators + dev check. |
| `features/window-panels/hooks/useOverlay.ts` | Overlay-state hooks. |
| `features/window-panels/FEATURE.md` | Deep reference. |
| `lib/redux/slices/overlaySlice.ts` | Open/closed + data + lastUsedAt. |
| `scripts/check-registry.ts` | CLI registry-integrity check. |
| `scripts/check-bundle-size.ts` | Per-route bundle-size gate. |

---

## Sustainability checklist (before submitting)

- [ ] Registry entry added with required fields.
- [ ] `kind: "window"` entries have `mobilePresentation`.
- [ ] `mobileSidebarAs` set if the window has a sidebar.
- [ ] `instanceMode: "multi"` if multiple instances are expected.
- [ ] If `urlSync` set, matching hydrator exists in `initUrlHydration.ts`.
- [ ] `onCollectData` return keys ⊇ `defaultData` keys.
- [ ] No static import of the window component outside the registry.
- [ ] `pnpm check:registry` passes (run locally).
- [ ] `pnpm check:bundle` shows no route growth > 2 KB.
- [ ] `pnpm type-check` clean for `features/window-panels/**`.
