# Window Panels — the tray and the Window Manager slice

Companion to the `window-panels` skill. Read when the task touches the minimized-window dock (`WindowTray` / `WindowTraySync`) or `lib/redux/slices/windowManagerSlice.ts` (registration, reveal, arrange, `windowsHidden`, pop-out state, the silent-render guard).

## The tray (WindowTray)

The bottom-right minimized-window dock. Mount **exactly one** `<WindowTray />` high in the tree (root layout / shell, outside any `transform`/`overflow` ancestor). It reads minimized entries from `windowManagerSlice` and renders a draggable chip per window:

- Stacked right→left (newest right); single-click restores (drag suppresses the click); chips reorder via drag (`moveTraySlot`).
- **`<WindowTraySync />`** mounts once alongside it — a single debounced (500 ms) resize listener that recomputes tray slot positions and clamps every docked window back into a shrunken viewport. Fire-and-forget, zero re-renders.
- Chip dimensions + responsive helpers live in `constants/tray.ts`; minimize-time thumbnails flow through `WindowTray/traySnapshotMap.ts`. Capture precedence: `captureTraySnapshot` prop → registry entry → `WindowTray/defaultTraySnapshotCapture.ts` (the fleet-wide default for windows without a semantic `renderTrayPreview`). Double-click anywhere on a minimized card restores it.

## Window Manager slice (`lib/redux/slices/windowManagerSlice.ts`)

Runtime registry of mounted windows — geometry, z-index, tray slots, popout state. A window joins on mount (`registerWindow`) and leaves on unmount (`unregisterWindow`).

- **`arrangeActiveWindows({ layout, viewportWidth, viewportHeight })`** — tile math for the Arrange-All grids/stacks.
- **`revealWindow(id, viewport)`** — the single "bring this window into view" primitive: un-minimizes, clamps an off-screen rect back in, raises z-index, clears the global `windowsHidden` flag. Re-triggering an already-open window is never a no-op.
- **Hardening invariant:** `registerWindow` clears `windowsHidden` (a newly opened window is always shown); `unregisterWindow` resets `windowsHidden` at zero windows (the global hide-all can't strand `true` and silently hide the next open). Don't reintroduce a path that can leave `windowsHidden` stuck on.
- **Pop-out state** lives here too: `popOutWindow` / `dockWindow` / `setPopoutCandidate`; selectors `selectPopoutMode(id)`, `selectIsPoppedOut(id)`, `selectActivePipWindowId`. `arrangeActiveWindows` / `minimizeAll` skip popped-out windows.

**Silent-render guard.** A triggered window must never silently fail to appear. Reveal-on-open (above) is the proactive layer; `overlayRenderWatchdogMiddleware` is the loud-recovery layer — ~2.5 s after an open it checks live Redux + viewport and, if no visible panel exists, `console.error`s + shows a self-healing toast. `WindowPanel` calls `ackOverlayRender(overlayId, id)` so the watchdog resolves the real window id even when it differs from the slug. Details in `FEATURE.md` → "Silent-render guard".
