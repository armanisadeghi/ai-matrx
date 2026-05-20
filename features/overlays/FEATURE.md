# Overlays — FEATURE.md

> **Canonical reference** for the overlay rendering system.
> Companion docs: [`features/window-panels/FEATURE.md`](../window-panels/FEATURE.md) (the WindowPanel component primitive), [`docs/OVERLAY_WINDOW_OVERHAUL.md`](../../docs/OVERLAY_WINDOW_OVERHAUL.md) (migration history + cutover plan), [`docs/OVERLAY_WINDOW_ROADMAP.md`](../../docs/OVERLAY_WINDOW_ROADMAP.md) (known gaps + future work).
> **Skill**: [`.claude/skills/overlay-system/SKILL.md`](../../.claude/skills/overlay-system/SKILL.md).

---

## What this system is

The overlay system is a **transport layer**: it renders any component at the top of the React tree when Redux state says so. It knows nothing about what those components are. Dialogs, sheets, modals, toasts, draggable windows, inline agent widgets — they all dispatch the same action, they all flow through the same controller, they all get explicit prop wiring.

It is deliberately **decoupled** from the WindowPanel component primitive. A window may participate in the overlay system, but it doesn't have to — and a non-window overlay (a dialog, a sheet) participates in the overlay system without ever touching window-panel code. This separation was the architectural goal of the May 2026 overhaul; see [`docs/OVERLAY_WINDOW_OVERHAUL.md`](../../docs/OVERLAY_WINDOW_OVERHAUL.md) for the history of why.

---

## Mental model

```
┌──────────────────────────────────────────────────────────────────────┐
│  Caller (any component anywhere)                                     │
│    const openSettings = useOpenAgentSettingsWindow();                │
│    openSettings({ initialAgentId: "abc" });                          │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Opener (features/overlays/openers/<overlayId>.tsx)                  │
│    Typed Options shape derived from the component's Props.           │
│    Hides the callbackManager + ref-registry plumbing.                │
│    Dispatches the appropriate openOverlay action.                    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  overlaySlice (lib/redux/slices/overlaySlice.ts)                     │
│    overlays[overlayId][instanceId] = { isOpen, data, lastUsedAt }    │
│    Actions: openOverlay / closeOverlay / toggleOverlay /             │
│             closeAllOverlays / pruneStaleInstances                   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  OverlayController.tsx (the single mount, one big "boring" file)     │
│    For each overlayId:                                                │
│      const isOpen = useAppSelector(s => selectIsOverlayOpen(s, X));  │
│      const data   = useAppSelector(s => selectOverlayData(s, X));    │
│      {isOpen && <X prop1={…} prop2={…} />}   ← EXPLICIT WIRING       │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
                  The actual overlay component
                  (sometimes a <WindowPanel>, sometimes a dialog,
                   sometimes a toast — the controller doesn't care)
```

**The non-negotiable rule:** every prop in `OverlayController.tsx` is wired by name. No `{...spread}`. TypeScript catches dispatch→component prop-shape drift at compile time. ESLint enforces (`no-restricted-syntax` on `JSXSpreadAttribute`).

---

## Files at a glance

```
features/overlays/
├── OverlayController.tsx       # The single mount point. ~2,300 lines, intentionally explicit. Hand-maintained.
├── catalogue.ts                # Render-free metadata for every overlay.
└── openers/
    ├── <overlayId>.tsx         # One file per overlay. Each exports useOpenX() + <XController />.
    └── …                       # ~111 files.
```

The controller is imported directly (no `dynamic()` shell, no flag) and mounted once per provider tree — gated only by `selectAnyOverlayOpen` in `app/DeferredSingletons.tsx` (authenticated) and mounted directly in `app/(public)/PublicProviders.tsx` (public). The legacy system (`UnifiedOverlayController`, `OverlaySurface`, `windowRegistry.ts`, the diagnostics middleware, the feature flag, and the seed codegen) is **deleted** — there is no second path.

---

## How to use the system

### Open an overlay (imperative)

```tsx
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";

function MyComponent({ agentId }: { agentId: string }) {
  const openRun = useOpenAgentRunWindow();
  return (
    <button
      onClick={() =>
        openRun({
          initialAgentId: agentId,
          initialSelectedConversationId: null,
        })
      }
    >
      Run agent
    </button>
  );
}
```

The hook returns a stable function. Its argument is `OpenAgentRunWindowOptions`, derived from `AgentRunWindow`'s Props. TypeScript rejects unknown fields and wrong types.

### Open an overlay (declarative)

```tsx
import { AgentRunWindowController } from "@/features/overlays/openers/agentRunWindow";

function MyComponent({ agentId, open }: Props) {
  return (
    <>
      <SomeOtherUI />
      {open && (
        <AgentRunWindowController
          initialAgentId={agentId}
          initialSelectedConversationId={null}
        />
      )}
    </>
  );
}
```

The Controller component dispatches `openOverlay` on mount, `closeOverlay` on unmount. Same Options shape. Use this when overlay state is naturally expressed as component lifecycle (especially for AI agents who want to "just render a window" without learning the slice or hook).

### Close from inside the overlay component

The OverlayController passes an `onClose` prop to every overlay component that declares one. Just call it:

```tsx
function MyDialog({ isOpen, onClose }: MyDialogProps) {
  return (
    <Dialog open={isOpen} onClose={onClose}>
      …
      <button onClick={onClose}>Cancel</button>
    </Dialog>
  );
}
```

For multi-instance overlays, the controller also passes `instanceId`; close it with `onClose` (which knows the instance id).

### Open with callbacks

For overlays that need to talk back to the caller (e.g., "tell me when the user uploads an image"), use the **callback-aware openers**. They hide the `callbackManager` registry entirely:

```tsx
const openUploader = useOpenImageUploaderWindow();
const handle = openUploader({
  preset: "logo",
  currentUrl: form.logoUrl,
  onUploaded: (e) => setLogoUrl(e.result.primary_url),    // feels like a normal callback
  onCleared:  () => setLogoUrl(""),
});
// …later
handle.close();
```

Internally, the opener creates a callback group via `callbackManager`, passes the `callbackGroupId` string through Redux, and the component subscribes. **Functions never travel through Redux.** Callback contracts live in [`features/window-panels/windows/<feature>/callbacks.ts`](../window-panels/windows/) (will move to `features/overlays/callbacks/` in a future cleanup pass).

Current callback-aware openers: `imageUploaderWindow`, `smartCodeEditorWindow`, `multiFileSmartCodeEditorWindow`, `curatedIconPickerWindow`, `contentEditorWindow`, `contentEditorListWindow`, `contentEditorWorkspaceWindow`.

---

## Adding a new overlay

A new overlay is a 3-file change:

1. **Add the overlayId** to [`features/window-panels/registry/overlay-ids.ts`](../window-panels/registry/overlay-ids.ts). The `OverlayId` string-literal union narrows every dispatch site at compile time.

2. **Write the component** anywhere (typically under `features/<your-feature>/` or `features/window-panels/windows/<your-feature>/` if it uses `<WindowPanel>`). Declare its Props with `initialX` for state-seed inputs that hydrate `useState`:

   ```tsx
   interface MyDialogProps {
     isOpen: boolean;
     onClose: () => void;
     initialFoo?: string;
   }
   export default function MyDialog({ isOpen, onClose, initialFoo }: MyDialogProps) {
     if (!isOpen) return null;
     return <Dialog onClose={onClose}>…</Dialog>;
   }
   ```

3. **Hand-edit the three artifacts.** The controller is hand-maintained (the one-shot seed codegen that bootstrapped it has been deleted). Add:
   - the `isOpenById` selector entry,
   - the `dynamic()` import + the gated JSX block in `OverlayController.tsx`,
   - the opener file under `openers/`,
   - the `catalogue.ts` entry.

   **Cardinal rule:** the JSX block MUST be gated on `isOpen` — never render a component ungated in the controller (an ungated render mounts on every route and, if the component doesn't self-gate, paints its UI everywhere — that was the QuickTasksSheet bug). The shape is:

   - Controller block (in `OverlayController.tsx`):
     ```tsx
     // top
     const MyDialog = dynamic(() => import("@/features/foo/MyDialog"), { ssr: false });
     // ...
     // in JSX:
     {(() => {
       const isOpen = isOpenById.myDialog;
       const data = dataById.myDialog as Record<string, unknown> | null | undefined;
       if (!isOpen) return null;
       return (
         <MyDialog
           isOpen
           onClose={() => dispatch(closeOverlay({ overlayId: "myDialog" }))}
           initialFoo={typeof data?.initialFoo === "string" ? data.initialFoo : undefined}
         />
       );
     })()}
     ```

   - Opener file (`features/overlays/openers/myDialog.tsx`):
     ```tsx
     export interface OpenMyDialogOptions { initialFoo?: string }
     export interface MyDialogHandle { close: () => void }
     export function useOpenMyDialog() {
       const dispatch = useAppDispatch();
       return useCallback((opts: OpenMyDialogOptions = {}): MyDialogHandle => {
         dispatch(openOverlay({ overlayId: "myDialog", data: { initialFoo: opts.initialFoo } }));
         return { close: () => dispatch(closeOverlay({ overlayId: "myDialog" })) };
       }, [dispatch]);
     }
     export function MyDialogController(props: OpenMyDialogOptions): null {
       const open = useOpenMyDialog();
       useEffect(() => {
         const handle = open(props);
         return () => handle.close();
       }, [open, props.initialFoo]);
       return null;
     }
     ```

   - Catalogue entry (`catalogue.ts`): add `myDialog: { label: "My Dialog", instanceMode: "singleton", isWindow: false }`.

---

## Singletons and multi-instance

The catalogue's `instanceMode` is the source of truth:

| Mode | What `useOpenX()` does | What the controller renders |
|---|---|---|
| `singleton` (default) | Dispatches with the default instanceId. Subsequent opens reuse the slot. | One block: `{isOpen && <X … />}` |
| `multi` | Generates a fresh `instanceId` per call, returns it in the handle. | `.map(selectOpenInstances)` |

The opener encapsulates the mode choice; callers don't think about it.

---

## Feature flag (during cutover)

The new controller mounts behind a flag for safety during cutover. Source priority:

1. URL: `?newOverlayController=1` (per-tab dev override)
2. localStorage: `matrx_new_overlay_controller=1` (sticky dev opt-in)
3. Env: `NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER=1` (preview/prod)

Reader: [`featureFlag.ts`](./featureFlag.ts). Used by both [`app/DeferredSingletons.tsx`](../../app/DeferredSingletons.tsx) (authenticated routes) and [`app/(public)/PublicProviders.tsx`](../../app/(public)/PublicProviders.tsx) (public routes) so flipping the env var promotes both surfaces uniformly.

Once the cutover is complete and the legacy code is deleted, the flag goes too. Everything just mounts the new controller.

---

## Diagnostic console signals

All three are production-safe, fire at most once per page session:

- `console.warn: [overlays] LEGACY UnifiedOverlayController is mounting …`
  Indicates the old spread-render controller is rendering somewhere. Useful for confirming cutover. Should never appear in prod after the env var is flipped + deployed.

- `console.info: [overlays] NEW OverlayController active …`
  Confirms the new explicit controller is the active one.

- `console.warn: [overlays] LEGACY OverlaySurface rendering "<overlayId>" …`
  Fires once per unique overlay-id rendered through the legacy path. If you click an overlay and see this warn for its id, that specific overlay is still on the legacy path for the current page.

Plus a deeper diagnostic middleware (`lib/redux/middleware/overlayDiagnostics.ts`) that times overlay dispatches and reports if an overlay was dispatched but no component ever mounted within ~1.5s. Reports the render-tree heartbeat (which layer last reported alive) so silent-failure debugging is fast. This survives the cutover — kept as a permanent safety net.

---

## Hard rules

1. **No prop spread in `OverlayController.tsx`.** Wire every prop by name. ESLint enforces (`no-restricted-syntax: warn`, bumped to error post-cutover).
2. **Don't import `openOverlay`/`closeOverlay` outside `features/overlays/`.** Use the typed opener. Aspirational rule; enforced informally during stage 3, ESLint-warn-then-error in a future pass.
3. **Don't add a `kind` discriminator** to overlay metadata. The controller knows what each overlay is by rendering it explicitly; sheets / modals / windows / toasts are all just components.
4. **Don't put functions in `openOverlay` data.** Use `callbackGroupId` via `callbackManager` (the opener hides this from callers).
5. **Don't introduce a new "registry that the controller iterates."** The controller's render path is explicit JSX. The catalogue is metadata only; nothing iterates it to render.

---

## Architectural boundary with windows

This system is the **overlay controller** (transport). The **WindowPanel component primitive** lives in `features/window-panels/` and is documented separately at [`features/window-panels/FEATURE.md`](../window-panels/FEATURE.md). The two systems are independent:

- A `<WindowPanel>` rendered anywhere joins the runtime window manager (`windowManagerSlice`) at mount and participates in "minimize all", focus history, tray, etc. — **whether or not the overlay controller rendered it**. A page can have a local `<WindowPanel>` that no controller ever touches; it still participates in window-wide actions.
- The overlay controller renders a `<WindowPanel>` the same way it renders a dialog or a toast: by name, with explicit props. From its perspective, WindowPanel is just a component.

If you find yourself adding window-specific concepts to the overlay system (or overlay-specific concepts to WindowPanel), stop. They're separate.

---

## Change log

- **2026-05-19** — Added the `creatorHub` overlay — a global Creator Hub window (WindowPanel with a tab-list sidebar), the creator analogue of the admin Bug indicator. Opened from a Crown in the main sidebar; registered via overlay-ids + catalogue + windowRegistryMetadata + opener (`openers/creatorHub.tsx`).
- **2026-05-18** — Cutover instrumentation: production-safe console signals on both controllers. `cb732f222`
- **2026-05-18** — Stage 3b+3d: 35/41 controller `as never` casts tightened with real type imports; first dispatch-site migration (AgentOptionsMenu). `ec67ca9c6`
- **2026-05-18** — Stage 3a+3c: callback-aware openers as re-exports; ESLint spread ban. `cd0e24407`
- **2026-05-18** — Stage 2: typed openers + catalogue. `57635640e`
- **2026-05-18** — Stage 1: new explicit `OverlayController.tsx` behind a flag. `25c160c6f`
- **2026-04-24 → 2026-05-18** — Conflated state under `features/window-panels/`. Spread-renderer caused 17+ silent-failure bugs. Fully replaced by the above.
