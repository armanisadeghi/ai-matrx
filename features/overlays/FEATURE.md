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
├── surfaces/
│   └── SidePanelSurface.tsx    # Flexible side-panel chrome for bare content overlays: NON-blocking + drag-to-resize on desktop (width persisted to localStorage), bottom Drawer on mobile. Wrap a gated block in it; pass title + onClose (+ optional defaultWidth/min/max/storageKey). Content can grow the panel via useSidePanelSurface().requestWidthBoost(px).
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

Current callback-aware openers: `imageUploaderWindow`, `smartCodeEditorWindow`, `multiFileSmartCodeEditorWindow`, `curatedIconPickerWindow`, `contentEditorWindow`, `contentEditorListWindow`, `contentEditorWorkspaceWindow`, `fullScreenEditor` (callbacks in [`callbacks/fullScreenEditor.ts`](./callbacks/fullScreenEditor.ts)).

### The severed-callback bug class (`onSave={undefined} /* pass via callbackGroupId */`)

When the explicit controller was seeded by codegen, every component prop that was a **function** got stubbed to `undefined` with a `/* fn — pass via callbackGroupId */ /* TODO: review */` marker — correct (a function can't travel through Redux) but **incomplete**: no callback group was wired to replace it. A stub left this way means **that callback silently never fires** — the button looks alive and does nothing. This is exactly what broke chat's Edit / Edit & resubmit (`fullScreenEditor.onSave`) and HTML-preview Save (`htmlPreview.onSave`).

Two correct ways to finish a stub:
1. **Callback group** — make the opener callback-aware (`callbacks/<overlayId>.ts` + `callbackManager`), pass `callbackGroupId` through data, subscribe in the component. Use when the caller needs the result (`fullScreenEditor`).
2. **Self-handle** — if the component already has the ids it needs, do the work inside it and delete the prop from the controller. Use when there's nothing to hand back (`htmlPreview` self-saves via `editMessage`).

**Never leave a `undefined /* pass via callbackGroupId */` stub for a callback a user can trigger.** `grep "pass via callbackGroupId" OverlayController.tsx` lists every remaining one — each is a latent silent-no-op until finished. As of 2026-06-14 the count is **0**: the 11 that remained after R1 were each audited, found to have zero consumers, and deleted (the *delete-dead-prop* completion — see [KNOWN_DEFECTS.md](../../KNOWN_DEFECTS.md) R2). The grep is the standing guard — any future stub it surfaces is a new latent bug.

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

## Mounting

The controller is mounted once per provider tree, imported directly (no `dynamic()` shell, no feature flag):

- **Authenticated routes** — `app/DeferredSingletons.tsx` mounts it behind an `OverlayControllerGate` that returns `null` until `selectAnyOverlayOpen` is true. So the controller's module (and the per-overlay chunks it lazy-loads) stay out of the page until the user opens their first overlay.
- **Public routes** — `app/(public)/PublicProviders.tsx` mounts it directly.

The cutover is complete: the feature flag, the legacy controller, and the diagnostic middleware are all deleted. There is exactly one render path.

---

## Diagnostic console signal

One production-safe signal, fires at most once per page session:

- `console.info: [overlays] NEW OverlayController active …`
  Confirms the controller mounted. (The legacy `console.warn` signals were removed with the legacy controller.)

There is no longer a timeout/heartbeat middleware: the explicit controller renders synchronously, so a component that throws surfaces through React's normal error boundary rather than a silent 1.5s timeout. The whole silent-failure bug class is structurally impossible now.

---

## Hard rules

1. **No prop spread in `OverlayController.tsx`.** Wire every prop by name. ESLint enforces (`no-restricted-syntax` on `JSXSpreadAttribute`).
2. **Nothing renders ungated.** Every overlay block is gated on `isOpen`. An ungated render mounts on every route and, if the component doesn't self-gate, paints its UI everywhere (the QuickTasksSheet bug). A component that's needed without a trigger does NOT belong here — it goes in `app/Providers.tsx` or the layout.
3. **Don't import `openOverlay`/`closeOverlay` outside `features/overlays/`.** Use the typed opener.
4. **Don't add a `kind` discriminator** to overlay metadata. The controller knows what each overlay is by rendering it explicitly; sheets / modals / windows / toasts are all just components.
5. **Don't put functions in `openOverlay` data.** Use `callbackGroupId` via `callbackManager` (the opener hides this from callers).
6. **Don't introduce a new "registry that the controller iterates."** The controller's render path is explicit JSX. The catalogue is metadata only; nothing iterates it to render.

---

## Architectural boundary with windows

This system is the **overlay controller** (transport). The **WindowPanel component primitive** lives in `features/window-panels/` and is documented separately at [`features/window-panels/FEATURE.md`](../window-panels/FEATURE.md). The two systems are independent:

- A `<WindowPanel>` rendered anywhere joins the runtime window manager (`windowManagerSlice`) at mount and participates in "minimize all", focus history, tray, etc. — **whether or not the overlay controller rendered it**. A page can have a local `<WindowPanel>` that no controller ever touches; it still participates in window-wide actions.
- The overlay controller renders a `<WindowPanel>` the same way it renders a dialog or a toast: by name, with explicit props. From its perspective, WindowPanel is just a component.

If you find yourself adding window-specific concepts to the overlay system (or overlay-specific concepts to WindowPanel), stop. They're separate.

---

## Change log

- **2026-06-15** — Quick Access panels — functional pass. `SidePanelSurface` gained a **content width-boost channel** (`useSidePanelSurface().requestWidthBoost`): panel content can grow the panel (capped to the viewport) instead of shrinking — Quick Chat's history sidebar uses it so opening it pushes the panel's left edge into the page rather than eating the chat. Quick Chat now centers transcript + input (matches `/chat`: `constrainWidth + edgeToEdgeScroll`) and autofocuses the message box. Quick Note / Quick Task autofocus their capture surface on open. Quick Data dropped its half-width table sidebar for a header dropdown picker (full-width table). Utilities Hub: **Files** tab → real `WindowPanelShell` (now with a per-file Context column via `FileList showContext`), **AI Results** tab → `ChatHistoryWorkspace` (frameless body shared with the `quickChatHistory` window) with an optional `enableInput` SmartAgentInput. `ChatHistoryWindow` load sequence now mirrors `/chat` (warm agent payload + instance before hydrate).
- **2026-06-14** — **Closed the severed-callback bug class (D7 → 0).** Audited the 11 `undefined /* pass via callbackGroupId */` stubs that remained after the `fullScreenEditor` fix; every one had zero consumers, so each was deleted (controller stub + component prop/destructure/internal call + opener option). `EmailDialogWindow.onSubmit`, `QuickSaveCodeDialog.{onOpenChange,onSaved}` (+ legacy `open`), `QuickNoteSaveOverlay.onSaved`×2, and the `onOpen`/`onIndexChange` notifiers on `FullscreenBrokerState`/`FullscreenMarkdownEditor`/`FullscreenSocketAccordion`/`ImageViewer` are gone. The `resourcePickerWindow` overlay branch was removed entirely (never opened; consumers render the component directly; `onResourceSelected` is required → it was a latent crash) along with its dead opener file. `grep "pass via callbackGroupId" OverlayController.tsx` → 0. See KNOWN_DEFECTS R2.
- **2026-06-14** — Consolidated Notes to a single multi-instance `notesWindow` overlay in `OverlayController` (removed legacy singleton block + `notesBetaWindow` id). Opener is `useOpenNotesWindow` from `openers/notesWindow.tsx`; component is `NotesWindow` in `windows/notes/NotesWindow.tsx`.
- **2026-06-14** — **Made `fullScreenEditor` callback-aware + killed the `onSave={undefined}` severed-callback bug class.** The controller stubbed `fullScreenEditor.onSave` (and `htmlPreview.onSave`) to `undefined` during the codegen seed and never finished the wiring, so every editor Save silently no-op'd — this is what broke chat's "Edit" and "Edit & resubmit". Added `callbacks/fullScreenEditor.ts` (callbackManager group + `emitFullScreenEditorSave`), upgraded `openers/fullScreenEditor.tsx` to register the group and pass only `callbackGroupId`, and made the bridge prefer the callback then self-handle via `editMessage` when given `conversationId`+`messageId`. `htmlPreview` now self-handles its markdown save (no callback needed). Documented the whole stub class above + the 11 still-severed callbacks (KNOWN_DEFECTS). The bridge now screams (toast + console.error) if it's ever opened with no save target — loud recovery, never silent.
- **2026-06-14** — Restored side-panel chrome for the four bare Quick Access overlays (`quickNotes`, `quickTasks`, `quickChat`, `quickData`, plus `quickChatWindow`). They were authored as chrome-free content (reused as Utilities Hub tabs), so after the legacy `OverlaySurface` was deleted they mounted as an invisible `h-full` div. New primitive `surfaces/SidePanelSurface.tsx` — a **non-blocking, drag-to-resize** right-side panel (modelled on `MessagingSideSheet`: no modal backdrop / no scroll-lock, left-edge resize handle, width persisted per-panel in localStorage, slide-in, ESC/X close), with a bottom Drawer on mobile — now wraps each gated block. Same change: `QuickChatSheet` swapped from the old `AgentRunner` to the live `/chat` route's `AgentConversationColumn` (verified streaming) — this also upgrades the Utilities Hub "Chat" tab.
- **2026-06-02** — Phase F (kg-suggestions): added the `kgSuggestionsDrawer` overlay — the global Knowledge-Graph suggestion inbox (Drawer on mobile / right Sheet on desktop). Registered via overlay-ids + catalogue + opener (`openers/kgSuggestionsDrawer.tsx`) + a gated block in `OverlayController.tsx`. Opened with `useOpenKgSuggestionsDrawer`; data-less singleton. See `features/kg-suggestions/FEATURE.md`.
- **2026-05-19** — Added the `creatorHub` overlay — a global Creator Hub window (WindowPanel with a tab-list sidebar), the creator analogue of the admin Bug indicator. Opened from a Crown in the main sidebar; registered via overlay-ids + catalogue + windowRegistryMetadata + opener (`openers/creatorHub.tsx`).
- **2026-05-18** — Cutover instrumentation: production-safe console signals on both controllers. `cb732f222`
- **2026-05-18** — Stage 3b+3d: 35/41 controller `as never` casts tightened with real type imports; first dispatch-site migration (AgentOptionsMenu). `ec67ca9c6`
- **2026-05-18** — Stage 3a+3c: callback-aware openers as re-exports; ESLint spread ban. `cd0e24407`
- **2026-05-18** — Stage 2: typed openers + catalogue. `57635640e`
- **2026-05-18** — Stage 1: new explicit `OverlayController.tsx` behind a flag. `25c160c6f`
- **2026-04-24 → 2026-05-18** — Conflated state under `features/window-panels/`. Spread-renderer caused 17+ silent-failure bugs. Fully replaced by the above.
