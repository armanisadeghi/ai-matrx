# FEATURE.md — `@ai-matrx/canvas` (package mechanics)

Verified against code 2026-10-01.

**What it is:** THE canvas — one docked column on the right edge of an app. It owns its own strip of
the window's top edge (the host header ENDS at the canvas edge), holds panes that split in either
direction, every pane holds tabs, every tab is one item. Full screen, width drag, memory between
sessions, and "the same thing never opens twice" are the package's job, never a host's.

The owner's ruling (Arman, 2026-10-01): a canvas that renders on the top right *"the same everywhere,
open and close with a single button… any UI that needs to show you something throws it into the
canvas"*, modelled on the Claude Code and Codex panes — *"the top of the page gets taken over by the
canvas when it's open… then the canvas doesn't have to fight for space"*, tabs inside it, a pane
header with a kind's custom button, `…`, full screen and close.

## Shape

| Layer | Where |
|---|---|
| Types (JSON-only state, branded ids) | `src/core/types.ts` |
| Identity (`kind::key`), JSON check | `src/core/ids.ts` |
| Layout tree helpers (split / remove / resize / validate) | `src/core/layout.ts` |
| THE reducer + action creators (no RTK dependency) | `src/core/reducer.ts` |
| Store seam: standalone store or a host Redux store | `src/core/store.ts` |
| Memory (localStorage port, restorable-only snapshot) | `src/core/persistence.ts` |
| Controller — the one imperative API, validation, autosave | `src/core/controller.ts` |
| Selectors | `src/core/selectors.ts` |
| Kind registry (`globalThis` `Symbol.for`) | `src/react/registry.ts` |
| Provider, hooks, host ports, hotkeys (⌘\ toggles, Esc leaves full screen) | `src/react/provider.tsx` |
| Column, splits, width handle, `CanvasToggle`, `CanvasFrame` | `src/react/CanvasColumn.tsx` |
| Pane: tabs (drag between panes), kind action, `…` menu, body, launcher | `src/react/CanvasPane.tsx` |
| Structural CSS (`--mxc-*` tokens only) / default token values | `src/styles.css` / `src/tokens.css` |

Entries: `@ai-matrx/canvas` (core, no React), `@ai-matrx/canvas/react`, `@ai-matrx/canvas/styles.css`,
`@ai-matrx/canvas/tokens.css`.

## Rules

- **Every piece of state is in the store, and the store is the host's.** A Redux host mounts
  `canvasReducer` and binds it with `bindCanvasToReduxStore(store, root => root.<key>)`; a host without
  Redux gets `createCanvasStore()` — the same reducer. Never hold canvas state in component state
  beyond a live drag.
- **Item data is plain JSON.** The controller REFUSES functions, Dates, class instances and announces
  the refusal through `onError`. Callbacks travel by id through a host registry, never in data.
- **Identity is `kind::key`.** Opening an existing item refreshes it and focuses its pane — it never
  duplicates and never moves. A caller chooses a key that names the THING (an artifact id, a
  conversation id), not the moment.
- **A new sort of content is ONE `registerCanvasKind(defineCanvasKind({...}))` call** — component or
  lazy `load`, `title`, `restore`, `keepAlive`, `launcher`, `HeaderAction`, `menuItems`. Never edit
  canvas code to add a content type.
- **Saving, sharing and history are answered once by the host** through `CanvasProvider`'s
  `itemActions` port (or a kind's `menuItems`) and land in every qualifying tab's `…` menu.
- **Closing the last pane puts the canvas away and keeps its tabs**; the toggle brings everything back.
  Closing a pane among several closes its tabs.
- **No framework imports** (no `next/*`), no module-level mutable state outside `Symbol.for` slots,
  no hardcoded colours — tokens only.
- Host placement is the host's: a shell reads `useCanvasColumnWidth()` (0 = put away, null = full
  screen; already fitted so the app keeps 420px) and `onLiveWidth`; a shell-less app wraps itself in
  `<CanvasFrame>`. Under 768px the column is a full-screen layer with a Hide button, and a remembered
  "open" is never restored there.
- **Available means a column is on screen** (`controller.isPresented()` / `useCanvasIsPresented()`),
  never "a provider exists" — a layout with a store but no column refuses opens aloud.
- **A draft that gets a durable id is re-keyed in place** (`controller.rekey`), never left under its
  draft key — otherwise the saved thing opens twice.
- **Autosave reacts to canvas state only**; full screen is never restored after a reload.

## Setting up a new host (Vite, Electron, another Next app)

```tsx
import "@ai-matrx/tap-target/styles.css";
import "@ai-matrx/canvas/styles.css";
import "@ai-matrx/canvas/tokens.css"; // only if the app has no theme mapping --mxc-* tokens
import { CanvasProvider, CanvasFrame, CanvasToggle, registerCanvasKind, defineCanvasKind } from "@ai-matrx/canvas/react";

registerCanvasKind(defineCanvasKind({ id: "note", label: "Note", icon: NoteIcon, load: () => import("./NoteView") }));

<CanvasProvider>{/* standalone store + localStorage memory */}
  <CanvasFrame><App header={<CanvasToggle />} /></CanvasFrame>
</CanvasProvider>
```

A Redux host passes `store={bindCanvasToReduxStore(store, (s) => s.canvasHost)}` after mounting
`canvasReducer`.

## Host in this repo

`features/canvas/host/` — `CanvasHostProvider` (Redux key `canvasHost`), `ShellCanvasColumn`
(`--shell-canvas-w` on `<html>`, `canvas-host.css`), artifact kinds, `useArtifactCanvas`.

## Tests

`src/__tests__/core.test.ts` (jest, run from the repo root: `npx jest packages/canvas`). Strict
types: `pnpm tsc -p packages/canvas/tsconfig.json`.

## Not yet

- Publishing to npm (the package is a private workspace package until its first publish).
- Pop-out to a floating window (`popOut` port exists; the host has not wired it).
- Server-rendered open state (the column appears after hydration reads memory).

## Change Log

- **2026-10-02** — Review fixes: window-fitted width, phone Hide + no restored open, presence-based
  availability, `rekey`, canvas-only autosave, Escape guard, snapshot normalization, tab drop index,
  lazy retry; the "…" menu is Radix + package CSS (design-system dependency removed).
- **2026-10-01** — Created: core reducer/controller/persistence, React column/panes/tabs/toggle/frame,
  kind registry; the app's canvas moved onto it.
