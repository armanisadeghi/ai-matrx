# Overlay & Window Overhaul

> Living plan. Update as we make decisions or finish stages.

## Status (as of 2026-05-18)

| Stage | Status | Commit |
|---|---|---|
| 0 — SW fix (blob-cache narrowed scope) | ✅ shipped | (deployed earlier) |
| 1 — New `OverlayController.tsx` behind a flag | ✅ shipped | `25c160c6f` |
| 2 — Typed openers (`useOpenX` + `<XController />`) + catalogue | ✅ shipped | `57635640e` |
| 3a — Callback-aware openers re-export hand-written sources | ✅ shipped | `cd0e24407` |
| 3b — Tighten the `as never` casts (35 of 41 done, 6 documented) | ✅ shipped | `ec67ca9c6` |
| 3c — ESLint rule: no JSX spread in controller (warn) | ✅ shipped | `cd0e24407` |
| 3d — Migrate first dispatch site (AgentOptionsMenu — 27 sites) | ✅ shipped | `ec67ca9c6` |
| 4 — Other dispatch site migrations (~290 remaining) | ⏸ incremental | — |
| 5 — Cutover (flip `NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER=1` in prod) | ⏸ awaits user validation | — |
| 6 — Delete legacy `UnifiedOverlayController*` / `OverlaySurface` / `windowRegistry` | ⏸ post-cutover | — |
| 7 — System 4 persistence (URL + `window_sessions` JSONB blob mode) | ⏸ post-cutover | — |

## Cutover handoff — what to do next

The new controller is **complete and type-safe**. It needs browser validation. The fastest way:

1. **Enable in dev** by adding the URL param to any authenticated page:
   ```
   ?newOverlayController=1
   ```
   Or set it sticky once via the browser DevTools console:
   ```js
   localStorage.matrx_new_overlay_controller = "1"
   ```

2. **Click through the overlays you care most about.** The original bug class was agent windows (Edit / Run / Run History / Advanced Editor / Settings) — confirm those open and receive the right agent. Also try at least one each of: a dialog (Email, Save to Notes), a sheet (Quick Tasks), a Window panel (Notes, Cloud Files), and an instanced multi-window (image viewer, full-screen editor).

3. **Watch the console**. The diagnostic middleware is still in place — if any overlay's dispatch fires but the component doesn't mount within 1500 ms, you'll get the heartbeat report telling you which layer broke. With the new controller this should never happen because the dispatch → JSX render path is one synchronous React tree commit.

4. **If validation passes**, flip the flag in production:
   ```bash
   # In Vercel project env vars
   NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER=1
   ```
   Deploy. The legacy `UnifiedOverlayController` keeps mounting until you redeploy with the new env var; both code paths render the same Redux state so the rollback is just toggling the env var back.

5. **After 48 h of clean prod**, come back and I'll do Stage 6 (delete the legacy files). That removes `UnifiedOverlayController`, `UnifiedOverlayControllerImpl`, `OverlaySurface`, `windowRegistry.ts`, and the spread-render pattern entirely.

## Rollback plan

If anything goes wrong:
- **Mid-validation**: just remove the URL param / localStorage key. Page refresh = back on legacy.
- **In prod**: unset `NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER` in Vercel and redeploy. Legacy controller takes over again on next page load.

The new controller cannot break the legacy one — they're independently mounted by the same gate, only one at a time.

## Why

In April 2026 a cleanup pass (commits `9eafe2ce0` … `1eabc0911`) accidentally merged two systems that had always been separate:

- The **overlay controller** — a slim mount that rendered any component (dialog, sheet, toast, window, whatever) on dispatch via per-overlay `dynamic()` imports and explicit JSX wiring. Worked reliably for years.
- The **window panel** — one specific UI primitive: a draggable, resizable, minimize-able frame.

After the merge, both lived in `features/window-panels/` and shared a single registry (`windowRegistry.ts` + `windowRegistryMetadata.ts`). The controller stopped rendering things long-hand and became `UnifiedOverlayController` → `UnifiedOverlayControllerImpl` → `OverlaySurface`, generic spread-renderer of every registered overlay. Direct consequences over the following weeks:

1. Prop-name drift between dispatch → defaultData → component Props became invisible to TypeScript. 17 silent-render bugs accumulated, all of the same shape (`agentId` vs `initialAgentId` etc.). The "agent windows broken" thread that started this work is *all* of this class.
2. Render path became 4–5 stacked lazy boundaries (gate → `next/dynamic` shell → impl chunk → `OverlaySurface` → per-window `React.lazy`). Any silent failure in any layer = blank window with no signal.
3. Window-panel features that should have shipped (URL persistence, DB-backed restoration via `window_sessions`) got abandoned mid-flight because the architecture under them moved.
4. Non-window overlays (dialogs, sheets, toasts) got dragged into the same registry shape, with awkward `kind: "window" | "widget" | "sheet" | "modal"` discriminators that nothing actually branches on at render time.

## Goal

Restore the separation:

```
1. Overlay Controller  →  renders anything at top of tree on dispatch (transport only)
2. WindowPanel          →  one component, draggable frame (UI primitive only)
3. Window Manager       →  runtime registry every mounted WindowPanel joins;
                           owns centralized window controls + z-order + focus.
                           Independent of System 1. A page-local <WindowPanel> is
                           a first-class member without ever touching the controller.
4. Window Persistence   →  URL + DB channels. Layers on top of 1+3.
```

**Critical invariant:** systems form a strict stack. Lower systems work in isolation. Higher systems use them but never reach down into rendering decisions.

---

## System 1 — Overlay Controller

The transport layer. Renders any component (dialog, sheet, toast, window, custom) at the top of the tree when slice state says so. Knows nothing about what those components *are*.

### Location

```
features/overlays/
  ├── OverlayController.tsx        # The single mount point. ~2000 lines, boring on purpose.
  ├── catalogue.ts                 # Thin metadata for every overlay (name, label, instanceMode, description)
  ├── openers/                     # Two opener APIs per overlay (hook + component)
  │   ├── useOpenAgentRunWindow.ts
  │   ├── AgentRunWindowController.tsx
  │   └── …
  ├── callbacks/                   # Per-overlay callback contracts (moved from window-panels/windows/*/callbacks.ts)
  └── refs.ts                      # Thin adapter over lib/refs for overlay-scoped refs (see below)
```

The controller does NOT live under `window-panels/`. It renders dialogs, sheets, toasts, modals, and yes also windows. Putting it under `window-panels/` was the original conflation.

### Controller body shape (per overlay)

```tsx
// top of file
const AgentRunWindow = dynamic(
  () => import("@/features/window-panels/windows/agents/AgentRunWindow"),
  { ssr: false },
);

// in the controller body
const isAgentRunOpen = useAppSelector(s => selectIsOverlayOpen(s, "agentRunWindow"));
const agentRunData   = useAppSelector(s => selectOverlayData(s, "agentRunWindow"));

// in the JSX — explicit prop wiring, no spread
{isAgentRunOpen && (
  <AgentRunWindow
    isOpen
    onClose={() => dispatch(closeOverlay({ overlayId: "agentRunWindow" }))}
    initialAgentId={
      typeof agentRunData?.initialAgentId === "string" ? agentRunData.initialAgentId : null
    }
    initialSelectedConversationId={
      typeof agentRunData?.initialSelectedConversationId === "string"
        ? agentRunData.initialSelectedConversationId : null
    }
    callbackGroupId={
      typeof agentRunData?.callbackGroupId === "string" ? agentRunData.callbackGroupId : undefined
    }
  />
)}
```

For multi-instance overlays, swap `selectIsOverlayOpen` + `selectOverlayData` for `selectOpenInstances(s, overlayId).map(...)`. Same explicit-wiring rule.

### Singletons vs multi-instance

Already supported by the slice (`DEFAULT_INSTANCE_ID` for singletons, custom `instanceId` for multi-instance). The catalogue declares `instanceMode: "singleton" | "multi"` for each entry — the **opener** uses this to default behavior so callers don't have to think about it.

| Mode | What `useOpenX()` does | What the controller renders |
|---|---|---|
| `singleton` | Dispatches with the default instanceId. Subsequent opens reuse the slot. | One block: `{isOpen && <X ... />}` |
| `multi` | Generates a fresh `instanceId` per call, returns it in the handle for later close. | `.map(selectOpenInstances)` |
| `singleton-preserved` | Dispatches with default instanceId but never closes between open/close — only toggles `isOpen`. State preserved across closes. | Same as singleton; the slice already does this. |
| `singleton-fresh` | Each open clears prior data first. | Same as singleton; opener handles the clear. |

### Two opener APIs per overlay (callers pick what fits)

#### A. Hook (imperative)

For event-handler dispatch sites:

```tsx
const openAgentRun = useOpenAgentRunWindow();
// in a click handler:
const handle = openAgentRun({
  agentId,
  conversationId: null,
  onConversationSelected: (id) => setActive(id),   // feels like a normal callback
  onClosed: () => setOpen(false),
});
// later
handle.close();
```

#### B. Component (declarative)

For declarative use sites — and explicitly so AI agents can use a simple component without learning the slice/opener pattern:

```tsx
<AgentRunWindowController
  agentId={id}
  conversationId={null}
  onConversationSelected={(id) => setActive(id)}
  onClosed={() => setOpen(false)}
/>
```

Implementation is a 6-line wrapper:

```tsx
export function AgentRunWindowController(props: AgentRunWindowOpenOptions) {
  const open = useOpenAgentRunWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.dispose();
  }, [/* serialize props */]);
  return null;
}
```

Both APIs are codegen'd from a single source per overlay. Adding an overlay = one source file, both APIs auto-exist.

### Callbacks — `callbackManager` (already exists)

Opener hides it entirely. Caller sees normal-looking callbacks:

```tsx
openAgentRun({ onConversationSelected: (id) => ... });
```

Internally:

```tsx
const group = createAgentRunCallbackGroup({ onConversationSelected, onClosed });
dispatch(openOverlay({
  overlayId: "agentRunWindow",
  data: { ...rest, callbackGroupId: group.callbackGroupId },
}));
return { close: () => ..., dispose: () => group.dispose() };
```

The window's component imports the callback group module, subscribes, emits typed events. **The dispatch payload only ever contains the `callbackGroupId` string** — no functions in Redux.

### Refs — use existing `lib/refs/`

You already have `RefProvider` + `useRefManager` + `useComponentRef` at `lib/refs/`. Use it.

Pattern for overlays that need to call methods on the rendered component:

```tsx
// The window component registers methods:
function AgentRunWindow({ ... }) {
  useComponentRef("agentRunWindow:" + instanceId, {
    focusInput: () => inputRef.current?.focus(),
    sendMessage: (text: string) => ...,
  });
  // ...
}

// The opener exposes a `ref` handle that wraps useRefManager().call(...):
const handle = openAgentRun({ ... });
handle.ref.focusInput();              // typed wrapper around refManager.call("agentRunWindow:...", "focusInput")
handle.ref.sendMessage("hello");
```

The typed `ref` proxy is generated per overlay from a method-list declaration in the callback contract file. Not every overlay needs methods; only those that do declare them.

If `lib/refs/` ends up insufficient (it's centered on component-ID lookup, not necessarily per-overlay scoping), we extend it. We do not build a parallel system.

### Catalogue (`features/overlays/catalogue.ts`)

Thin metadata for **every** overlay — singleton or multi, window or sheet or dialog. You were right that having a uniform place to look up every overlay is cleaner than asymmetric "windows get a catalogue, sheets don't." So:

```ts
export const OVERLAY_CATALOGUE = {
  agentRunWindow: {
    label: "Agent Run",
    description: "Conversation window for a single agent.",
    instanceMode: "singleton",
    propsType: "AgentRunWindowOpenOptions",     // TS-only reference, for tooling
    isWindow: true,                              // if true, also has a System-3 entry
  },
  saveToNotes: {
    label: "Save to Notes",
    description: "Quick-save modal for a note from any content surface.",
    instanceMode: "multi",
    propsType: "SaveToNotesOpenOptions",
    isWindow: false,
  },
  // ...
} as const satisfies Record<OverlayId, OverlayCatalogueEntry>;
```

No `componentImport`. No `defaultData`. No `kind`. Just metadata. Used by:
- The opener-generator script (to know singleton vs multi)
- Admin tooling (e.g. the existing window-panels-smoketest)
- Documentation

The controller does NOT iterate the catalogue. It has its own explicit JSX list.

### Hard rules (enforced by ESLint)

1. **No `JSXSpreadAttribute` inside `OverlayController.tsx`.** Every prop wired by name.
2. **No `dispatch(openOverlay(...))` outside `features/overlays/openers/`.** Every caller uses the typed opener for that overlay.
3. **No imports from `lib/redux/slices/overlaySlice` outside `features/overlays/` and the opener files.** The slice is the controller's private state.
4. **`WindowPanel` may not import from any catalogue, controller, or overlay slice.** Leaf component only.

---

## System 2 — WindowPanel (component primitive)

Stays where it is at `features/window-panels/WindowPanel.tsx`. Already mostly decoupled from the registry. One enforcement:

- May not import from any registry, slice, or controller.
- May call `useWindowRegistration(...)` from System 3 — but only because that's its job as a window primitive.

A consumer renders it directly:

```tsx
<WindowPanel id="my-page-local-window" title="My thing" defaultSize={{ w: 600, h: 400 }}>
  <Body />
</WindowPanel>
```

Whether opened via the controller or rendered inline on a page, this is what makes a window *a window*. Drag, resize, minimize, maximize, close button, header.

---

## System 3 — Window Manager (runtime registry, NOT a static catalogue)

The critical clarification: **windows enter this system by mounting, not by being declared**. Any `<WindowPanel id="...">` anywhere — controller-driven or page-local — is a first-class window manager participant.

> **Already half-built.** The current `lib/redux/slices/windowManagerSlice.ts` *is* the runtime registry, and `features/window-panels/WindowTray.tsx` + `WindowTraySync.tsx` are the centralized-controls primitives. They were never the conflated part — they got dragged into the same folder by association. The cleanup is moving them, ensuring `WindowPanel` registers itself unconditionally on mount, and keeping the tray/sync intact. **No behavior change.**

### Location

```
features/windows/
  ├── manager.ts                   # The Redux slice + manager API
  ├── selectors.ts
  ├── hooks/
  │   ├── useWindowRegistration.ts # Called by WindowPanel internally
  │   ├── useWindowControls.ts     # "minimize all" / "maximize all" / "focus" / "arrange"
  │   └── useWindowFocus.ts
  ├── catalogue.ts                 # OPTIONAL: stable-identity windows (URL hydratable, DB persistable)
  └── components/
      └── WindowControlsBar.tsx    # The chip-tray / minimize-all UI (existing)
```

### Runtime registry (the actual manager)

Lives in a Redux slice. Each entry:

```ts
interface WindowEntry {
  id: string;                 // matches WindowPanel's id prop
  title: string;
  state: "windowed" | "maximized" | "minimized" | "popout";
  rect: { x: number; y: number; w: number; h: number };
  zIndex: number;
  focusedAt: number;          // for focus-history-based z-ordering
  // Optional persistence pointer — set only if this window's id matches a catalogue entry
  catalogueSlug?: string;
}
```

`WindowPanel`'s mount effect does:

```tsx
useWindowRegistration({ id, title, defaultRect });
```

Which dispatches `windowManager/register` on mount and `windowManager/unregister` on unmount. Done. The window is now visible to the manager.

### Centralized controls work uniformly

The window-controls UI iterates the **runtime** registry, not any static catalogue:

```ts
const allWindows = useAppSelector(selectAllRegisteredWindows);
// "Minimize all" dispatches windowManager/minimizeAll → every entry in `allWindows` gets state: "minimized"
```

So a page-local window with `<WindowPanel id="weird-thing">` on `/some-random-page` participates in "minimize all" automatically. **This is the property you said was lost; it's restored by making registration a mount-time effect, not a static declaration.**

### Catalogue (optional, for stable-identity windows only)

`features/windows/catalogue.ts` is a thin static list of windows that:

- Have a stable identity worth restoring across refreshes (URL hydration target).
- Have DB-backed persistence (`window_sessions` row).
- Are referenced from tools-grid tiles or the sidebar window toggle.

Page-local ad-hoc windows do **not** need an entry. They live entirely in the runtime registry and disappear on unmount.

Each catalogue entry:

```ts
{
  slug: "agent-run-window",
  windowId: "agentRunWindow",         // matches the runtime id and (if applicable) the overlayId
  title: "Agent Run",
  defaultSize: { w: 1200, h: 800 },
  mobilePresentation: "fullscreen",
  urlSync: { key: "agent" },
  persistenceMode: "id-only",          // see System 4
}
```

No `componentImport`. No render concerns at all. Persistence and URL hydration look up entries here.

---

## System 4 — Window Persistence

Already half-built. Now finished, because it's no longer tangled with rendering.

### URL channel

```
features/windows/persistence/url/
  ├── UrlPanelRegistry.ts          # existing — registerPanelHydrator(key, fn)
  ├── urlWriteMiddleware.ts        # NEW — watches windowManager actions, writes ?panels=...
  ├── urlReadHydrator.ts           # NEW — parses ?panels=... on boot, fires hydrators
  └── hydrators.ts                 # existing initUrlHydration.ts, slimmed
```

Write side (new): a Redux middleware subscribes to `windowManager/register` and `windowManager/unregister` for entries that have a `catalogueSlug` with `urlSync.key` declared. Updates the URL via `history.replaceState` (debounced). No router round-trip.

Read side (existing): on page boot, parse `?panels=…` and call registered hydrators which dispatch the openers.

### DB channel

```
features/windows/persistence/db/
  ├── WindowPersistenceManager.tsx # existing, kept
  ├── persistenceModes.ts          # NEW — { none, id-only, full } semantics
  └── useWindowCollectData.ts      # NEW — for full-mode windows to provide their ephemeral state
```

Per-window persistence modes (declared in the System-3 catalogue):

| Mode | Saved to DB | Restored by |
|---|---|---|
| `none` | nothing | not restored; always opens fresh |
| `id-only` | just the entity id from `data` (e.g. agentId) | opener called with the same id; the entity's own slice handles the rest |
| `full` | `data` JSONB blob captured via `useWindowCollectData(() => ...)` | opener called with the persisted blob as `initialData` |

Already-existing `WindowPersistenceManager` reads/writes `window_sessions` — just needs the modes wired and `useWindowCollectData` to plumb collected state for `full` windows.

---

## File-level summary of the cutover

### Created
- `features/overlays/OverlayController.tsx`
- `features/overlays/catalogue.ts`
- `features/overlays/openers/*` (one per overlay — hook + component)
- `features/overlays/callbacks/*` (moved from window-panels/windows/*/callbacks.ts)
- `features/overlays/refs.ts`
- `features/windows/manager.ts`, `selectors.ts`, `hooks/*`, `catalogue.ts`
- `features/windows/persistence/url/urlWriteMiddleware.ts`
- `features/windows/persistence/db/persistenceModes.ts`, `useWindowCollectData.ts`
- `scripts/generate-overlay-stub.ts` — codegen for new overlays
- ESLint rules: no spread in controller, no openOverlay outside openers/, no slice imports outside overlays/

### Moved (no behavior change)
- `features/window-panels/url-sync/*` → `features/windows/persistence/url/`
- `features/window-panels/WindowPersistenceManager.tsx` → `features/windows/persistence/db/`
- `lib/redux/slices/windowManagerSlice.ts` → `features/windows/manager.ts` (rename)
- `lib/redux/slices/overlaySlice.ts` stays (it's System 1's state; the slice name is fine)

### Modified
- `app/DeferredSingletons.tsx`: replace `UnifiedOverlayController` mount with `OverlayController`
- `features/window-panels/WindowPanel.tsx`: drop any catalogue/slice/controller imports, call `useWindowRegistration`
- Every existing `dispatch(openOverlay(...))` call site rewritten to use its opener helper (mechanical — sweep)

### Deleted
- `features/window-panels/UnifiedOverlayController.tsx`
- `features/window-panels/UnifiedOverlayControllerImpl.tsx`
- `features/window-panels/OverlaySurface.tsx`
- `features/window-panels/registry/windowRegistry.ts` (was the runtime renderer)
- `features/window-panels/registry/windowRegistryMetadata.ts` (replaced by `features/windows/catalogue.ts` slimmed)
- `features/window-panels/diagnostics/` (the OverlayErrorBoundary + OverlayRenderProbe) — no longer needed; controller has explicit boundaries
- `features/window-panels/registry/overlay-ids.ts` → move to `features/overlays/ids.ts`
- `scripts/check-overlay-key-alignment.ts` (collapses to a 30-line "every id in catalogue is rendered" check)

### Kept unchanged
- `lib/redux/slices/overlaySlice.ts` reducers + actions + selectors. Type-narrowed `OverlayId` union remains.
- `lib/redux/middleware/overlayDiagnostics.ts` — still useful as a safety net (timing watchdog). The key-mismatch warnings stop firing because TS replaces them.
- `utils/callbackManager.ts`
- `lib/refs/*`
- `features/window-panels/WindowPanel.tsx` body (minus the registry imports)
- `features/window-panels/windows/*` window components themselves — same Props, same files

---

## Stages (small, shippable)

### Stage 0 — Stop the bleeding (today)

The blob-cache service worker is currently intercepting *all* fetches and breaking some of them. That's the proximate cause of the agent-window-not-rendering bug right now (the heartbeat tells us the per-window chunk fetch hangs). The fix is one function — narrow `recognize()` in `features/files/cache/service-worker/src/sw.ts` so the SW only ever sees blob/cloud-file URLs.

~30 minutes. Independent of the rest of the work. Unblocks production immediately.

### Stage 1 — Build new alongside old (Days 1–2)

1. Scaffold `features/overlays/` and `features/windows/` (empty modules).
2. Move `lib/refs/` integration helpers in (`features/overlays/refs.ts`).
3. Write the codegen script `scripts/generate-overlay-stub.ts`. It walks the current `windowRegistryMetadata.ts`, reads each component's Props interface, and emits:
   - One block for `OverlayController.tsx` (dynamic + selectors + JSX)
   - `features/overlays/openers/useOpenX.ts` + `XController.tsx`
   - `features/overlays/callbacks/X.ts` stub (if the component has a `callbackGroupId` prop)
   - `features/overlays/catalogue.ts` entry
4. Run codegen, review the generated `OverlayController.tsx` by hand. TS will flag anything ambiguous. Fixups by hand.
5. Behind a feature flag in `DeferredSingletons`: dev mounts the new controller, prod mounts the old one.

### Stage 2 — Validate in dev, cutover prod (Day 3)

1. Open every overlay in dev with the new controller. Diagnostic middleware still firing — should stay silent.
2. Flip the prod flag.
3. Bake 48h.

### Stage 3 — Delete the old system (Day 4)

1. Remove `UnifiedOverlayController*`, `OverlaySurface`, `windowRegistry*`.
2. Strip `componentImport`/`defaultData`/`kind` from the catalogue.
3. Rename `features/window-panels/registry/` → `features/windows/`. Move overlay-ids out.
4. ESLint rules enabled.
5. Audit script collapses to the 30-line check.

### Stage 4 — Land System 3 properly (Days 5–6)

1. Move `windowManagerSlice` → `features/windows/manager.ts`. Add `register`/`unregister` actions.
2. Update `WindowPanel` to call `useWindowRegistration` from its mount effect.
3. Migrate window-controls UI to iterate runtime registry, not catalogue.
4. Verify a page-local `<WindowPanel id="...">` participates in "minimize all" without any catalogue entry.

### Stage 5 — Land System 4 (Days 6–8)

1. Add `persistenceMode` to catalogue entries.
2. Write `urlWriteMiddleware` for the URL channel.
3. Add `useWindowCollectData` and finish `WindowPersistenceManager`'s `full` mode.
4. Verify: open a window, refresh, window comes back. Open another, sign out, sign in elsewhere, window restored.

---

## Hard rules going forward (ESLint-enforced as `warn`)

1. **No prop spread** in `OverlayController.tsx`.
2. **No `openOverlay`/`closeOverlay`/`toggleOverlay` import** outside `features/overlays/`.
3. **No `WindowPanel` import** outside files that actually render windows.
4. **No registry/slice/controller imports** in `WindowPanel.tsx` itself.

Land them as `warn` during the migration so existing dispatch sites don't block builds while they're being swept. Once Stage 3 finishes (every caller on its opener), bump to `error`.

---

## Out of scope (intentionally)

- Splitting WindowPanel into multiple kinds. We have one kind: a window. If we ever need a different chrome (compact dialog, side sheet), it gets its own component name, not a `kind` discriminator.
- "Smart" data merging between dispatch payloads and component defaults. Defaults live in the JSX. If a default needs to be dynamic, it's a normal `useMemo` in the controller block.
- Replacing `callbackManager` or `lib/refs`. They work. Use them.
- A unified "overlay tray" that shows every dialog/sheet/modal alongside windows. Windows have their own tray (System 3). Other overlays don't.

