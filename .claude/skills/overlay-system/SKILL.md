---
name: overlay-system
description: Use whenever a task touches the overlay rendering system at matrx-frontend — opening / closing / adding / debugging dialogs, sheets, modals, draggable windows, toasts, or any other component that lives at the top of the tree via dispatch. Triggers on `features/overlays/**`, `app/DeferredSingletons.tsx`, the overlay slice in `lib/redux/slices/overlaySlice.ts`, any `dispatch(openOverlay(...))` site, `useOpenX` opener hooks, `XController` components, or anything mentioning "overlay", "open in window", "dialog", "modal", "sheet", "fullscreen overlay", "dispatch overlay", "openOverlay", or "overlay rendering". This skill is the FIRST thing to read before changing how an overlay is rendered, opened, or registered. For the WindowPanel COMPONENT itself (drag, resize, minimize, tray) use the separate `window-panels` skill.
---

# Overlay System

This skill is the canonical how-to for the overlay rendering layer at matrx-frontend. For deep reference, see [`features/overlays/FEATURE.md`](../../../features/overlays/FEATURE.md). For history of the bug class this system was designed to eliminate, see [`docs/OVERLAY_WINDOW_OVERHAUL.md`](../../../docs/OVERLAY_WINDOW_OVERHAUL.md). For known gaps and future work, see [`docs/OVERLAY_WINDOW_ROADMAP.md`](../../../docs/OVERLAY_WINDOW_ROADMAP.md).

---

## The most important context

**The system was rebuilt in May 2026 because a prior cleanup conflated two unrelated layers and the conflation produced a class of silent-render bugs that ate weeks.** The conflation: the *overlay controller* (renders any component at the top of the tree) and the *WindowPanel component* (draggable frame) were merged into one "window-panels" system with a generic `{...spread}` renderer. The spread meant TypeScript couldn't validate prop names; 17+ overlays silently rendered with `undefined` props because dispatch keys had drifted from component prop names.

The fix was to put them back into separate systems. **This skill assumes that separation. Do not re-merge them.**

## The four systems

```
1. Overlay Controller  → transport. Renders any component on dispatch.   ← this skill
2. WindowPanel         → component. Draggable frame. Used by some.       ← window-panels skill
3. Window Manager      → runtime registry. <WindowPanel> joins on mount. ← window-panels skill
4. Window Persistence  → URL + DB channels.                               ← window-panels skill (Stage 7)
```

These are independent. A `<WindowPanel>` rendered on a page directly — without any overlay controller involvement — STILL participates in "minimize all" and the tray. The overlay controller renders a window the same way it renders a dialog: as a normal component with explicit props.

## The hard rules (broken at your peril)

1. **No `{...spread}` in `features/overlays/OverlayController.tsx`.** Wire every prop by name. ESLint enforces with `no-restricted-syntax`. The whole reason this file exists is to make prop wiring auditable by TypeScript; a single spread reintroduces the silent-failure bug class.
2. **Don't put functions in `openOverlay` data.** Use the callback registry via `callbackManager`; the opener hides this from callers. Functions can't travel through Redux.
3. **Don't add a `kind: "window" | "modal" | "sheet"` discriminator** anywhere in the catalogue or controller. Sheets, modals, windows, toasts are all "just components" to the controller. If you find code branching on a kind field, that's the conflation creeping back.
4. **The catalogue is metadata-only.** Nothing iterates `OVERLAY_CATALOGUE` to render. Render is the controller's job, with explicit JSX. If you're writing a `for (const entry of OVERLAY_CATALOGUE)` that renders components, stop.
5. **Don't dispatch `openOverlay` / `closeOverlay` / `toggleOverlay` directly from new code.** Use the typed opener at `features/overlays/openers/<overlayId>.tsx`. ~290 legacy dispatch sites still exist; they'll get migrated incrementally. New code uses openers.
6. **`WindowPanel.tsx` must not import from registry / slice / controller.** It's a leaf component. ESLint pattern enforces.

## How to do common things

### Open an overlay from code

```tsx
// Imperative — for event handlers
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";

function MyButton({ agentId }: { agentId: string }) {
  const openRun = useOpenAgentRunWindow();
  return <button onClick={() => openRun({ initialAgentId: agentId })}>Run</button>;
}
```

```tsx
// Declarative — for "render-as-component" use
import { AgentRunWindowController } from "@/features/overlays/openers/agentRunWindow";

function MyPanel({ agentId, showWindow }: Props) {
  return (
    <>
      <Header />
      {showWindow && <AgentRunWindowController initialAgentId={agentId} />}
    </>
  );
}
```

Every overlay has both. The hook is canonical; the Controller component is a 6-line wrapper for callers who want lifecycle = mount/unmount.

### Open an overlay that has callbacks

Use the **callback-aware** opener. It looks the same as a normal opener but accepts handler functions:

```tsx
const openUploader = useOpenImageUploaderWindow();
const handle = openUploader({
  preset: "logo",
  currentUrl: form.logoUrl,
  onUploaded: (e) => setLogoUrl(e.result.primary_url),
  onCleared:  () => setLogoUrl(""),
});
handle.close();
```

The opener internally creates a callback group via `callbackManager` and passes only a `callbackGroupId` string through Redux. Callers never touch `callbackGroupId` directly.

Current callback-aware openers (the only ones with non-primitive event APIs):
- `imageUploaderWindow`
- `smartCodeEditorWindow`, `multiFileSmartCodeEditorWindow`
- `curatedIconPickerWindow`
- `contentEditorWindow`, `contentEditorListWindow`, `contentEditorWorkspaceWindow`

If you need callbacks on a new overlay, look at one of these as a template. The contract files live at `features/window-panels/windows/<feature>/callbacks.ts` (will move to `features/overlays/callbacks/` in a future cleanup pass).

### Add a new overlay

3 steps. Do them in order:

1. **Register the overlayId** in [`features/window-panels/registry/overlay-ids.ts`](../../../features/window-panels/registry/overlay-ids.ts). The `OverlayId` union narrows every dispatch site at compile time.

2. **Write the component** with an explicit Props interface. Use `initial*` for state-seed inputs (TypeScript convention for `useState` seeds):

   ```tsx
   interface MyDialogProps {
     isOpen: boolean;
     onClose: () => void;
     initialFoo?: string | null;
   }
   ```

3. **Add the three artifacts** (controller block, opener file, catalogue entry). The controller is hand-maintained — there is NO codegen (the one-shot seed script was deleted with the legacy registry):
   - [`features/overlays/OverlayController.tsx`](../../../features/overlays/OverlayController.tsx) — add the `const Comp = dynamic(...)` import at the top, the `isOpenById` selector entry, and the **gated** JSX block (see existing patterns). NEVER render the component ungated.
   - `features/overlays/openers/<overlayId>.tsx` — copy an existing opener as the template.
   - `features/overlays/catalogue.ts` — one entry: `{ label, instanceMode, isWindow }`.

### Migrate a legacy dispatch site

Find a file that does `dispatch(openOverlay({ overlayId: "X", data: {...} }))`. Replace with the opener:

```diff
- import { openOverlay } from "@/lib/redux/slices/overlaySlice";
+ import { useOpenX } from "@/features/overlays/openers/X";

  function MyComponent() {
-   const dispatch = useAppDispatch();
+   const openX = useOpenX();
    // ...
-   dispatch(openOverlay({ overlayId: "X", data: { foo: bar } }));
+   openX({ foo: bar });
  }
```

If the opener's exported hook name doesn't match `useOpen` + camelCase(overlayId), it's because the hook is named after the resolved component (e.g. `agentAdvancedEditorWindow.tsx` exports `useOpenAgentContentWindow`). Check the opener file's `export function` line.

### Debug an overlay that doesn't render

Look at the browser console:

- `console.info: [overlays] NEW OverlayController active` — fires once per page session, confirms the controller mounted. There is only one controller now (the legacy controller + its `console.warn` signals + the timeout/heartbeat middleware are all deleted).
- If an overlay doesn't appear: check (a) the dispatch fired (`openOverlay({ overlayId })` with the RIGHT id), (b) the controller has a gated block for that id, (c) the component itself returns something when `isOpen`. A render-time throw will surface through React's error boundary (no more silent 1.5s timeouts).

### How it's mounted

One controller, imported directly (no flag, no `dynamic()` shell):
- Authenticated: `app/DeferredSingletons.tsx` → `OverlayControllerGate` (returns null until `selectAnyOverlayOpen`).
- Public: `app/(public)/PublicProviders.tsx` → mounted directly.

## Patterns to recognize and what to do

| You see this | Do this |
|---|---|
| `dispatch(openOverlay({ overlayId: "X", data: {...} }))` in a file you're editing | Migrate to `useOpenX()`. Add the import, call the hook at the top of the component, replace the dispatch. |
| A component's Props has changed (added/renamed) | Update both the controller block (in `OverlayController.tsx`) AND the opener's Options interface (in `features/overlays/openers/<X>.tsx`). |
| A component rendered **ungated** in the controller (`<X />` not behind `{isOpenById.X ? … : null}` or an `if (!isOpen) return null` IIFE) | Fix it — gate it. Ungated renders mount on every route and paint UI everywhere if the component doesn't self-gate (the QuickTasksSheet bug). If it's genuinely needed without a trigger, move it to `app/Providers.tsx`. |
| A new "registry" or "manifest" being added that the controller iterates | Push back. The render path is explicit JSX. Metadata goes in `catalogue.ts` (renders nothing). |
| `kind: "window"` or `kind: "modal"` showing up in a new entry | Push back. There's no kind discriminator. The controller's JSX knows which component to render. |
| Spread (`{...something}`) appearing in `OverlayController.tsx` | Reject. ESLint flags it. Wire props by name. |

## Files reference

```
features/overlays/
├── FEATURE.md                  ← deep reference
├── OverlayController.tsx       ← THE mount. ~2,300 lines. Hand-maintained, every block gated.
├── catalogue.ts                ← render-free metadata
└── openers/<overlayId>.tsx     ← ~111 files, hook + Controller per overlay

lib/redux/
└── slices/overlaySlice.ts      ← state + actions (typed OverlayId)

features/window-panels/         ← DIFFERENT system — WindowPanel + Window Manager
└── …                              (see window-panels skill)
```

The legacy system is gone: no `UnifiedOverlayController`, no `OverlaySurface`, no `windowRegistry.ts`, no `featureFlag.ts`, no diagnostics middleware, no seed codegen.
```

## Owner's non-negotiables (from the original architectural decision)

These came from the overhaul conversation and are encoded in the design:

- **Type safety, always.** No `{...spread}`. No `as any`. The point of the new system is that TypeScript validates dispatch → component prop-shape end to end.
- **Two systems stay separate.** Overlay rendering and window-panel chrome are unrelated. The button-is-not-the-form analogy: a button being used inside a form doesn't make the button part of the form system. Same here.
- **Windows work without the controller.** A page-local `<WindowPanel id="x">` joins the runtime window manager and participates in centralized controls. The overlay controller is one renderer of windows, not the owner of "what is a window."
- **Openers feel like normal callbacks.** Callers should pass `onUploaded: (e) => …` and not think about callback groups or registry IDs. The opener layer hides that machinery.
- **Both hook and component APIs.** `useOpenX()` for handlers; `<XController />` for declarative use (especially helpful for AI agents who want to "just render a window" without learning the slice).
- **Production-safe diagnostic signals.** Console warns / infos that identify which controller is mounting are present in prod. They cost nothing in prod and make cutover state auditable from any user's DevTools.
- **No "kind" discriminator.** Sheets, modals, dialogs, windows are all just components.

## When you're stuck

- Read [`features/overlays/FEATURE.md`](../../../features/overlays/FEATURE.md) first.
- Look at how an existing overlay does it. Most patterns are present in 2+ overlays already.
- Read [`docs/OVERLAY_WINDOW_OVERHAUL.md`](../../../docs/OVERLAY_WINDOW_OVERHAUL.md) for the WHY of the architecture.
- Read [`docs/OVERLAY_WINDOW_ROADMAP.md`](../../../docs/OVERLAY_WINDOW_ROADMAP.md) for known gaps — your problem may already be triaged.
- If you must change rendering, prefer hand-editing `OverlayController.tsx` over re-running the codegen. The codegen is a one-shot seeder; re-running it loses the hand-tightened type casts.
