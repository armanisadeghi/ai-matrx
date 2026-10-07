# FEATURE.md — `side-panel` (the docked side panel)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-27`

---

## Purpose

THE panel docked to one edge of a layout: it **slides** open and closed (never a jump), the person **drags its
inner edge** to any width between its min and max, and that width is **remembered** per panel. Arman,
2026-09-27: *"opening and closing … animated with a nice smooth slide instead of being jumpy"* and *"all side
panels … adjustable, with a sensible default, min and max"*.

**Which primitive:** a panel docked to an edge that opens and closes → this. Split panes that share a route's
space (percent layouts, header toggles) → `features/resizable-panels` (react-resizable-panels v4 — its collapse
is a layout change, not a slide).

---

## Entry points

- `DockedSidePanel.tsx` — props: `panelId` (cookie key), `edge` (`left` | `right`; the handle is on the inner
  edge), `open`, `sizes` (`{ defaultPx, minPx, maxPx }`), `initialWidth?` (server-read), `overlay?` (lay it over
  the page — a hover preview), `maxShare?` (largest share of the parent the panel may take, 0.6), `resizable?`,
  `publishWidthAs?` (a CSS custom property set on the parent to the width the panel takes now — written to the
  DOM, no re-render), `onWidthChange?`, `onPointerEnter/Leave?` (the whole panel, handle included; not reported
  while dragging), `aria-label`, `className` (the body), `outerClassName` (the panel box — e.g. `max-lg:hidden`).
- `ListDetailSplit.tsx` — a list with its record's detail docked right: desktop = this panel (slide, resize,
  remembered width, closed = mounted + `inert`), and it HOLDS the last detail while closing so a host that clears
  its selection on close still slides its content out; each opening starts the detail fresh (`key` per opening).
  Phone = list → detail full-screen (navigation, not a panel). Props: `panelId`, `open`, `list`, `detail`,
  `aria-label`, `sizes?` (default 640 / 380 / 1100), `maxShare?`, `initialWidth?`, `onCollapse?`, class slots.
- `side-panel-width.ts` — `SidePanelSizes`, `clampSidePanelWidth`, `parseSidePanelWidth`, `writeSidePanelWidth`,
  cookie `side-panel:<panelId>:width`.
- `side-panel-width.server.ts` — `readSidePanelWidth(panelId, sizes)` for the first paint.

**Consumers:** `../aidream/apps/shared/chat/src/canvas/workspace/ShellChatDock.tsx` (the docked chat) and
`ChatCanvasWorkspace.tsx` (properties);
`features/pdf-extractor/studio/PdfStudioShell.tsx` (sidebar + inspector rails). Via `ListDetailSplit`: the
ai-models Providers, Settings, Offerings, Endpoints and APIs screens, and the podcasts admin list.

---

## Invariants & gotchas

- **The slide animates the panel's WIDTH while its content keeps its own width** — content slides out of view,
  never reflows mid-animation. Pace: `SIDE_PANEL_SLIDE_CLASS` = `transition-[width]` + `PANEL_MOTION_CLASS` — THE panel motion
  (`../common-docs/policies/motion-standard.md`; 600ms even ease-in-out)
  (Arman, 2026-09-27: 200ms was "far too fast"). Off while dragging so the edge follows the pointer exactly.
- **`onCollapse`: drag past the minimum and keep going (80px) and the panel closes** — it slides shut while the
  pointer is still down; dragging back out undoes it; the width it had is kept for reopening.
- **A closed panel stays mounted and is `inert` + `aria-hidden`.** A host that must not keep something alive
  while closed (a second copy of a chat column) renders it conditionally inside.
- **The width shown is always clamped to the space the panel has NOW** — `sizes` and `maxShare` of the parent,
  re-measured on every parent resize (derived at render). The person's chosen width is kept, not overwritten,
  and comes back when there is room.
- **A drag listens on the window** from pointerdown to pointerup/cancel/blur: it ends cleanly even if the panel
  closes or its handle unmounts mid-drag (the page's cursor and text selection always come back), and the saved
  width is the one the pointer reached. Guard: `__tests__/docked-side-panel.test.tsx`.
- **Handle:** drag · double-click = default · focused ← / → (Shift = ×4), Home / End = min / max. It is a real
  `role="separator"` with `aria-valuenow`.
- **Hosts that care about first paint pass `initialWidth`** from `readSidePanelWidth` (or a host reader that
  wraps it, e.g. `readCanvasWorkspaceLayout`); otherwise the first paint is the default.

---

## Change Log

- **2026-09-27** — Created for the canvas workspace's three panels and the shell chat dock.
- **2026-09-27** — Review fixes: window-level drag, parent-share clamp re-checked on resize, `publishWidthAs`,
  hover reported for the whole panel.
- **2026-09-27** — 600ms shell-sidebar pace; `onCollapse` (drag past the minimum closes). The shell chat dock was
  removed (Arman rejected a right-side dock under the app header).
- **2026-10-02** — `ListDetailSplit` added; the six list|detail splits that squeezed their content
  (`w-1/2` ↔ `w-full`) and the PDF studio rails that unmounted on close moved onto this panel.
- **2026-10-02** — Pace reads the motion-standard tokens (`PANEL_MOTION_CLASS`, `lib/motion/panel-motion.ts`) instead of literal 600ms / cubic-bezier.
