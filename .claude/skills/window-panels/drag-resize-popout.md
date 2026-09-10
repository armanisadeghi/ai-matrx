# Window Panels — drag / resize / minimize / maximize / pop-out

Companion to the `window-panels` skill. Read when the task is about a window's frame behavior: drag, resize, traffic lights, snap, full screen, off-screen rescue, or pop-out.

## Drag / resize / minimize / maximize / pop-out

All behavior lives in `WindowPanel.tsx` + `hooks/useWindowPanel.ts` (pointer-driven move/resize, Redux window registration). You get it for free by rendering `<WindowPanel>` — no opt-in:

- **Header drag** moves; **8 edge/corner handles** resize; **min/max** respect `minWidth`/`minHeight` (defaults 180/80).
- **Traffic lights** (top-left, macOS-style): red = close, yellow = minimize/restore, **green hover-dropdown** = snap (left/right/top/bottom/centre), Arrange All (grid/stack layouts), Enter/Exit Full Screen, Pop out, and "Save window state" (only when `overlayId` is set).
- **Minimized / maximized** states render via `createPortal(document.body)` so they escape any parent stacking context or `overflow:hidden`.
- **`fitContent`** sizes the shell to its content via a `ResizeObserver` syncing measured size back to Redux.
- **Off-screen rescue:** transitioning back to `windowed` from min/max/popout clamps a stranded rect back into the viewport.

**Pop-out (Document Picture-in-Picture).** Any window pops out — no per-window opt-in. Trigger via the green-dropdown "Pop out" or by dragging the header ≥80 px past the viewport edge and holding ≥250 ms. Content renders into a separate browser window via `createPortal`, keeping the React tree attached (shared Redux, callbacks, theme, providers). DPiP where supported (Chrome/Edge 116+), `window.open` fallback elsewhere; single-PiP-per-origin enforced (second+ popouts fall back to popup). Hard-disabled on mobile. Full details + `usePopoutControl` API in `FEATURE.md` → "Pop-out windows".
