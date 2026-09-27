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
- `side-panel-width.ts` — `SidePanelSizes`, `clampSidePanelWidth`, `parseSidePanelWidth`, `writeSidePanelWidth`,
  cookie `side-panel:<panelId>:width`.
- `side-panel-width.server.ts` — `readSidePanelWidth(panelId, sizes)` for the first paint.

**Consumers:** `features/canvas/workspace/ChatCanvasWorkspace.tsx` (nav, docked chat, properties),
`features/shell/chat-dock/ShellChatDock.tsx` (the shell's chat dock).

---

## Invariants & gotchas

- **The slide animates the panel's WIDTH while its content keeps its own width** — content slides out of view,
  never reflows mid-animation. The transition is off while dragging so the edge follows the pointer exactly.
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
  wraps it, e.g. `readCanvasWorkspaceLayout`, `readChatDockInitial`); otherwise the first paint is the default.

---

## Change Log

- **2026-09-27** — Created for the canvas workspace's three panels and the shell chat dock.
- **2026-09-27** — Review fixes: window-level drag, parent-share clamp re-checked on resize, `publishWidthAs`,
  hover reported for the whole panel.
