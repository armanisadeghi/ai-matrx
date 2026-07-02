import {
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  computeGlobalArrangement,
  GlobalLayoutType,
} from "@/features/window-panels/utils/windowArrangements";
import { clampRectToViewport } from "@/features/window-panels/utils/rectClamp";
// WindowRect lives in the shared types file so that windowArrangements.ts
// (a feature utility) can import it without pulling in this Redux slice,
// which would create a cycle. Re-exported here for backward compatibility.
export type { WindowRect } from "@/features/window-panels/window-panel.types";
import type { WindowRect } from "@/features/window-panels/window-panel.types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WindowState = "windowed" | "maximized" | "minimized";

/**
 * Pop-out mode for windows that have been detached into a separate browser
 * window. Orthogonal to `WindowState` — a popped-out window still has a
 * "logical" docked state remembered on `prePopoutRect` for the dock-back path.
 *
 * - `"pip"`: Document Picture-in-Picture (Chromium) — frameless, always-on-top.
 *   Subject to the single-PiP-per-origin constraint enforced via
 *   `activePipWindowId`.
 * - `"popup"`: `window.open()` fallback for browsers without DPiP support
 *   (Safari, Firefox). Shows browser chrome.
 * - `null`: Window is docked inside the parent viewport (the default).
 */
export type PopoutMode = "pip" | "popup" | null;

export interface WindowEntry {
  id: string;
  title: string;
  state: WindowState;
  /** Last windowed size/position — restored when coming back from max/min */
  windowed: WindowRect;
  /** Saved rect before minimize so restore can return to the original size */
  preMinimizedRect: WindowRect | null;
  /** z-index order — higher = on top */
  zIndex: number;
  /** Order in the minimized tray (0-based, kept for compat but unused in chip-less mode) */
  traySlot: number | null;
  /**
   * Pop-out mode. `null` while docked. When set, the window is rendered into
   * a separate browser window via Document PiP or `window.open()` fallback.
   * Never persisted to the DB — always coerced back to `null` on hydration
   * (see `restoreWindowState`).
   */
  popoutMode: PopoutMode;
  /**
   * Saved windowed rect at popout time. Restored to `windowed` on dock-back
   * via `dockWindow`. `null` while docked (matches `preMinimizedRect` pattern).
   */
  prePopoutRect: WindowRect | null;
}

export interface WindowManagerState {
  windows: Record<string, WindowEntry>;
  /** Next z-index to assign when a window is focused */
  nextZIndex: number;
  /** How many slots are currently occupied in the tray */
  trayCount: number;
  /** Global visibility toggle — windows stay mounted but are visually hidden */
  windowsHidden: boolean;
  /**
   * The id of the window currently occupying the single Document PiP slot
   * (Chromium allows only one DPiP window per origin at a time). `null` when
   * the slot is free. Windows in `"popup"` mode do NOT count toward this slot.
   */
  activePipWindowId: string | null;
  /**
   * The id of the window currently being dragged outside the viewport beyond
   * the popout threshold. Used purely for visual feedback ("Release to pop
   * out" outline + ghost label). Cleared on every `pointerup`.
   */
  popoutCandidateId: string | null;
}

// ─── Tray layout constants ────────────────────────────────────────────────────
//
// All minimized-chip placement math derives from these values.
// Change them here and every calculation updates automatically.
//
//  ┌─────────────────────────────── viewport ────────────────────────────────┐
//  │                                                                         │
//  │   [chip 4]  [chip 3]  [chip 2]  [chip 1]  [chip 0]  ← MARGIN_RIGHT    │
//  │                                                   ↕ MARGIN_BOTTOM      │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  Row 0 starts at the bottom-right. Once a row is full, row 1 opens directly
//  above it (separated by GAP_Y). Rows keep growing upward as needed.

export const TRAY_CHIP_W = 270; // px — minimized chip width
export const TRAY_CHIP_H = 100; // px — minimized chip height
export const TRAY_GAP_X = 8; // px — horizontal gap between chips
export const TRAY_GAP_Y = 8; // px — vertical gap between rows
export const TRAY_MARGIN_R = 20; // px — gap from right viewport edge
export const TRAY_MARGIN_B = 20; // px — gap from bottom viewport edge
export const TRAY_MARGIN_L = 8; // px — left boundary: don't go further left

// Chips per row given a viewport width
export function trayChipsPerRow(viewportWidth: number): number {
  const usable = viewportWidth - TRAY_MARGIN_R - TRAY_MARGIN_L;
  return Math.max(
    1,
    Math.floor((usable + TRAY_GAP_X) / (TRAY_CHIP_W + TRAY_GAP_X)),
  );
}

// Compute (x, y) for a given tray slot index and viewport dimensions
export function traySlotRect(
  slot: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number; width: number; height: number } {
  const perRow = trayChipsPerRow(viewportWidth);
  const col = slot % perRow; // 0 = rightmost
  const row = Math.floor(slot / perRow); // 0 = bottom row

  const x =
    viewportWidth -
    TRAY_MARGIN_R -
    TRAY_CHIP_W -
    col * (TRAY_CHIP_W + TRAY_GAP_X);

  const y =
    viewportHeight -
    TRAY_MARGIN_B -
    TRAY_CHIP_H -
    row * (TRAY_CHIP_H + TRAY_GAP_Y);

  return { x, y, width: TRAY_CHIP_W, height: TRAY_CHIP_H };
}

// ─── Base constants ───────────────────────────────────────────────────────────

const BASE_Z = 1000;
const TRAY_SLOT_WIDTH = TRAY_CHIP_W; // kept for selector compat

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: WindowManagerState = {
  windows: {},
  nextZIndex: BASE_Z,
  trayCount: 0,
  windowsHidden: false,
  activePipWindowId: null,
  popoutCandidateId: null,
};

// ─── Slice ────────────────────────────────────────────────────────────────────

const windowManagerSlice = createSlice({
  name: "windowManager",
  initialState,
  reducers: {
    /** Register a new window. Idempotent — ignored if id already exists. */
    registerWindow(
      state,
      action: PayloadAction<{
        id: string;
        title?: string;
        initial: WindowRect;
      }>,
    ) {
      const { id, title, initial } = action.payload;
      if (state.windows[id]) return;
      state.windows[id] = {
        id,
        title: title ?? id,
        state: "windowed",
        windowed: initial,
        preMinimizedRect: null,
        zIndex: state.nextZIndex++,
        traySlot: null,
        popoutMode: null,
        prePopoutRect: null,
      };
      // Opening a brand-new window is an explicit "show me" intent. Never let a
      // stale global hide-all (windowsHidden) silently render it invisible —
      // that is the silent-failure class this slice must structurally prevent.
      if (state.windowsHidden) state.windowsHidden = false;
    },

    /** Update just the title (e.g. when prop changes). */
    updateWindowTitle(
      state,
      action: PayloadAction<{ id: string; title: string }>,
    ) {
      const win = state.windows[action.payload.id];
      if (win) win.title = action.payload.title;
    },

    /** Remove a window from tracking entirely. */
    unregisterWindow(state, action: PayloadAction<string>) {
      const win = state.windows[action.payload];
      if (!win) return;
      // Free tray slot
      const freedTraySlot = win.traySlot;
      if (freedTraySlot !== null) {
        state.trayCount = Math.max(0, state.trayCount - 1);
        // Compact remaining tray slots
        Object.values(state.windows).forEach((w) => {
          if (w.traySlot !== null && w.traySlot > freedTraySlot) {
            w.traySlot -= 1;
          }
        });
      }
      // Free the PiP slot if this window held it
      if (state.activePipWindowId === action.payload) {
        state.activePipWindowId = null;
      }
      // Clear popout-candidate flag if this window was being dragged out
      if (state.popoutCandidateId === action.payload) {
        state.popoutCandidateId = null;
      }
      delete state.windows[action.payload];
      // A global hide-all flag is meaningless with zero windows and otherwise
      // strands `true` (the sidebar "Show All" control is disabled when there
      // are no windows), which would silently hide the NEXT window the user
      // opens. Reset it so the flag can never outlive the windows it governs.
      if (Object.keys(state.windows).length === 0) {
        state.windowsHidden = false;
      }
    },

    /** Bring a window to the top of the z stack. */
    focusWindow(state, action: PayloadAction<string>) {
      const win = state.windows[action.payload];
      if (!win) return;
      win.zIndex = state.nextZIndex++;
    },

    /** Switch to windowed (restore) state. */
    restoreWindow(state, action: PayloadAction<string>) {
      const win = state.windows[action.payload];
      if (!win) return;
      const restoredTraySlot = win.traySlot;
      if (restoredTraySlot !== null) {
        state.trayCount = Math.max(0, state.trayCount - 1);
        Object.values(state.windows).forEach((w) => {
          if (w.traySlot !== null && w.traySlot > restoredTraySlot) {
            w.traySlot -= 1;
          }
        });
        win.traySlot = null;
      }
      // Recover the rect we had before minimizing (if any)
      if (win.preMinimizedRect) {
        win.windowed = win.preMinimizedRect;
        win.preMinimizedRect = null;
      }
      win.state = "windowed";
      win.zIndex = state.nextZIndex++;
    },

    /**
     * Bring an already-registered window unconditionally into view — the
     * single "show me this panel" primitive used by the open path.
     *
     * Re-triggering a menu/opener for a window that is already open must never
     * be a silent no-op. Before this existed, an open dispatch only updated
     * overlay-slice data; if the window was minimized, dragged off-screen, or
     * suppressed by `windowsHidden`, the user saw nothing. `revealWindow`:
     *   - restores a minimized window to its pre-minimized rect,
     *   - clamps the rect back into the current viewport (off-screen rescue),
     *   - raises it to the top of the z-stack,
     *   - clears the global hide-all flag.
     *
     * No-op when the window isn't registered yet (first open — `registerWindow`
     * handles that). Popped-out windows keep their OS-managed frame; we only
     * clear the global hide so the rest of the desktop is visible.
     *
     * Caller supplies viewport dimensions (reducers can't read `window`).
     */
    revealWindow(
      state,
      action: PayloadAction<{
        id: string;
        viewportWidth: number;
        viewportHeight: number;
      }>,
    ) {
      const { id, viewportWidth, viewportHeight } = action.payload;
      const win = state.windows[id];
      if (!win) return;
      if (state.windowsHidden) state.windowsHidden = false;
      if (win.popoutMode !== null) return; // OS frame owns popout visibility
      const revealedTraySlot = win.traySlot;
      if (revealedTraySlot !== null) {
        state.trayCount = Math.max(0, state.trayCount - 1);
        Object.values(state.windows).forEach((w) => {
          if (w.traySlot !== null && w.traySlot > revealedTraySlot) {
            w.traySlot -= 1;
          }
        });
        win.traySlot = null;
      }
      if (win.state === "minimized") {
        if (win.preMinimizedRect) {
          win.windowed = win.preMinimizedRect;
          win.preMinimizedRect = null;
        }
        win.state = "windowed";
      }
      if (win.state === "windowed") {
        win.windowed = clampRectToViewport(win.windowed, {
          width: viewportWidth,
          height: viewportHeight,
        });
      }
      win.zIndex = state.nextZIndex++;
    },

    /** Switch to maximized state. */
    maximizeWindow(state, action: PayloadAction<string>) {
      const win = state.windows[action.payload];
      if (!win) return;
      const maximizedTraySlot = win.traySlot;
      if (maximizedTraySlot !== null) {
        state.trayCount = Math.max(0, state.trayCount - 1);
        Object.values(state.windows).forEach((w) => {
          if (w.traySlot !== null && w.traySlot > maximizedTraySlot) {
            w.traySlot -= 1;
          }
        });
        win.traySlot = null;
      }
      win.state = "maximized";
      win.zIndex = state.nextZIndex++;
    },

    /**
     * Minimize a window — parks it in the tray grid at the bottom of the
     * viewport. Caller must supply current viewport dimensions so the reducer
     * can compute the exact position without touching window/document.
     */
    minimizeWindow(
      state,
      action: PayloadAction<{
        id: string;
        viewportWidth: number;
        viewportHeight: number;
      }>,
    ) {
      const { id, viewportWidth, viewportHeight } = action.payload;
      const win = state.windows[id];
      if (!win || win.state === "minimized") return;
      // Popped-out windows live in a separate browser window — minimize is a
      // no-op for them. The OS PiP frame provides its own minimize behavior.
      if (win.popoutMode !== null) return;

      // Save full-size rect so restore can return to it
      win.preMinimizedRect = { ...win.windowed };

      // Assign the next available tray slot and compute its position
      const slot = state.trayCount;
      win.traySlot = slot;
      state.trayCount += 1;

      win.windowed = traySlotRect(slot, viewportWidth, viewportHeight);
      win.state = "minimized";
    },

    /**
     * Minimize ALL non-minimized, non-maximized windows in one shot.
     * Use for a "collapse all" button. Caller supplies viewport dimensions.
     */
    minimizeAll(
      state,
      action: PayloadAction<{ viewportWidth: number; viewportHeight: number }>,
    ) {
      const { viewportWidth, viewportHeight } = action.payload;
      Object.values(state.windows).forEach((win) => {
        if (win.state !== "windowed") return;
        // Skip popped-out windows — they live in separate browser windows
        // and aren't part of the parent tray model.
        if (win.popoutMode !== null) return;
        win.preMinimizedRect = { ...win.windowed };
        const slot = state.trayCount;
        win.traySlot = slot;
        state.trayCount += 1;
        win.windowed = traySlotRect(slot, viewportWidth, viewportHeight);
        win.state = "minimized";
      });
    },

    /** Update the windowed rect (called during drag or resize). */
    updateWindowRect(
      state,
      action: PayloadAction<{ id: string; rect: Partial<WindowRect> }>,
    ) {
      const win = state.windows[action.payload.id];
      if (!win) return;
      win.windowed = { ...win.windowed, ...action.payload.rect };
    },

    /**
     * Clamp a window's `windowed` rect into the current viewport so at least
     * the standard MIN_VISIBLE_PX strip of the header stays grabbable.
     *
     * **Why this exists:** drag-and-release outside the viewport (without a
     * popout firing), restore-from-minimize where `preMinimizedRect` was
     * captured at a larger viewport, and dock-from-popout where the docked
     * rect was off-screen all leave the window in a position the user can't
     * reach. We clamp at the boundary where the user expects to "see" the
     * window again.
     *
     * **Skips popped-out windows** — their rect is OS-managed, not our
     * concern. Skips minimized + maximized windows — those have their own
     * rect logic that owners shouldn't fight.
     *
     * Caller passes viewport dimensions because reducers can't read
     * `window.innerWidth` (consistent with `minimizeWindow` /
     * `arrangeActiveWindows` patterns).
     */
    clampWindowRect(
      state,
      action: PayloadAction<{
        id: string;
        viewportWidth: number;
        viewportHeight: number;
      }>,
    ) {
      const { id, viewportWidth, viewportHeight } = action.payload;
      const win = state.windows[id];
      if (!win) return;
      if (win.state !== "windowed") return; // skip min/max
      if (win.popoutMode !== null) return; // skip popped-out
      win.windowed = clampRectToViewport(win.windowed, {
        width: viewportWidth,
        height: viewportHeight,
      });
    },

    /**
     * Clamp every docked windowed window into the viewport. Dispatched by
     * a global resize listener so windows that were positioned for a larger
     * viewport get nudged back into reach.
     *
     * Mirrors `recomputeTrayPositions`'s coverage for minimized chips.
     */
    clampAllWindowRects(
      state,
      action: PayloadAction<{ viewportWidth: number; viewportHeight: number }>,
    ) {
      const { viewportWidth, viewportHeight } = action.payload;
      Object.values(state.windows).forEach((win) => {
        if (win.state !== "windowed") return;
        if (win.popoutMode !== null) return;
        win.windowed = clampRectToViewport(win.windowed, {
          width: viewportWidth,
          height: viewportHeight,
        });
      });
    },

    /** Arranges all non-minimized windows globally */
    arrangeActiveWindows(
      state,
      action: PayloadAction<{
        layout: GlobalLayoutType;
        viewportWidth: number;
        viewportHeight: number;
        dirX?: "ltr" | "rtl";
        dirY?: "ttb" | "btt";
        primary?: "horizontal" | "vertical";
      }>,
    ) {
      const { layout, viewportWidth, viewportHeight, dirX, dirY, primary } =
        action.payload;

      // Get all non-minimized, non-popped-out windows, sorted by zIndex newest first.
      // Popped-out windows live in separate browser windows and shouldn't get
      // assigned a slot in a parent-viewport arrangement.
      const eligibleWindows = Object.values(state.windows)
        .filter((w) => w.state === "windowed" && w.popoutMode === null)
        .sort((a, b) => b.zIndex - a.zIndex)
        .map((w) => w.id);

      if (eligibleWindows.length === 0) return;

      const updates = computeGlobalArrangement(
        layout,
        eligibleWindows,
        viewportWidth,
        viewportHeight,
        dirX,
        dirY,
        primary,
      );

      updates.forEach(({ id, rect }) => {
        if (state.windows[id]) {
          state.windows[id].windowed = {
            ...state.windows[id].windowed,
            ...rect,
          };
        }
      });
    },

    /**
     * Recompute tray positions for all minimized windows after a viewport
     * resize. Each window keeps its existing traySlot number — only x/y/w/h
     * are recalculated. No-op if nothing is minimized.
     */
    recomputeTrayPositions(
      state,
      action: PayloadAction<{ viewportWidth: number; viewportHeight: number }>,
    ) {
      const { viewportWidth, viewportHeight } = action.payload;
      const minimized = Object.values(state.windows).filter(
        (w) => w.state === "minimized" && w.traySlot !== null,
      );
      if (minimized.length === 0) return;
      minimized.forEach((win) => {
        if (win.traySlot === null) return;
        win.windowed = traySlotRect(
          win.traySlot,
          viewportWidth,
          viewportHeight,
        );
      });
    },

    /**
     * Restore ALL minimized windows to their pre-minimized rects in one shot.
     * Maximized windows are left alone — only minimized ones are affected.
     */
    restoreAll(state) {
      Object.values(state.windows).forEach((win) => {
        if (win.state !== "minimized") return;
        if (win.preMinimizedRect) {
          win.windowed = win.preMinimizedRect;
          win.preMinimizedRect = null;
        }
        win.traySlot = null;
        win.state = "windowed";
        win.zIndex = state.nextZIndex++;
      });
      state.trayCount = 0;
    },

    /** Toggle global visibility of all windows (they stay mounted). */
    toggleWindowsHidden(state) {
      state.windowsHidden = !state.windowsHidden;
    },

    /** Move a minimized chip to a new tray slot (drag-within-tray). */
    moveTraySlot(state, action: PayloadAction<{ id: string; toSlot: number }>) {
      const { id, toSlot } = action.payload;
      const win = state.windows[id];
      if (!win || win.traySlot === null) return;
      const fromSlot = win.traySlot;
      // Shift other windows
      Object.values(state.windows).forEach((w) => {
        if (w.id === id || w.traySlot === null) return;
        if (
          fromSlot < toSlot &&
          w.traySlot > fromSlot &&
          w.traySlot <= toSlot
        ) {
          w.traySlot -= 1;
        } else if (
          fromSlot > toSlot &&
          w.traySlot >= toSlot &&
          w.traySlot < fromSlot
        ) {
          w.traySlot += 1;
        }
      });
      win.traySlot = toSlot;
    },

    /**
     * Transition a window into popped-out mode.
     *
     * Caller is responsible for actually opening the Document PiP / popup
     * window FIRST (it requires a synchronous user gesture). This reducer is
     * dispatched only after the window resolves successfully so Redux state
     * always matches reality.
     *
     * If the window is currently minimized, the tray slot is freed first
     * (same compaction logic as `restoreWindow`). The current `windowed`
     * rect is saved to `prePopoutRect` so dock-back returns to the original
     * dimensions.
     *
     * Single-PiP enforcement: callers MUST check `selectActivePipWindowId`
     * before requesting `mode: "pip"`. This reducer is defense-in-depth and
     * silently no-ops if a different window already holds the PiP slot.
     */
    popOutWindow(
      state,
      action: PayloadAction<{ id: string; mode: "pip" | "popup" }>,
    ) {
      const { id, mode } = action.payload;
      const win = state.windows[id];
      if (!win) return;
      // Defense-in-depth: refuse PiP if the slot is taken by a different window.
      if (
        mode === "pip" &&
        state.activePipWindowId !== null &&
        state.activePipWindowId !== id
      ) {
        return;
      }
      // Free the tray slot if the window was minimized — the popout is no
      // longer part of the parent tray model.
      if (win.traySlot !== null) {
        const fromSlot = win.traySlot;
        state.trayCount = Math.max(0, state.trayCount - 1);
        Object.values(state.windows).forEach((w) => {
          if (w.id === id) return;
          if (w.traySlot !== null && w.traySlot > fromSlot) {
            w.traySlot -= 1;
          }
        });
        win.traySlot = null;
        // Pop minimized windows back to the windowed state so dock-back has a
        // sensible target. Use preMinimizedRect if available.
        if (win.preMinimizedRect) {
          win.windowed = win.preMinimizedRect;
          win.preMinimizedRect = null;
        }
        win.state = "windowed";
      }
      // Save the current windowed rect for dock-back. Don't overwrite if
      // already set (idempotent: a re-dispatch shouldn't lose the original).
      if (win.prePopoutRect === null) {
        win.prePopoutRect = { ...win.windowed };
      }
      win.popoutMode = mode;
      if (mode === "pip") {
        state.activePipWindowId = id;
      }
      // Clear any popout-candidate flag — we're past the candidate phase.
      if (state.popoutCandidateId === id) {
        state.popoutCandidateId = null;
      }
    },

    /**
     * Transition a popped-out window back into the parent viewport.
     *
     * Restores `prePopoutRect → windowed`, clears `popoutMode`, releases
     * the PiP slot if held, and bumps z-index to bring the window to the top.
     * Caller is responsible for closing the actual browser popout window.
     */
    dockWindow(state, action: PayloadAction<string>) {
      const win = state.windows[action.payload];
      if (!win || win.popoutMode === null) return;
      if (state.activePipWindowId === win.id) {
        state.activePipWindowId = null;
      }
      if (win.prePopoutRect) {
        win.windowed = win.prePopoutRect;
        win.prePopoutRect = null;
      }
      win.popoutMode = null;
      // Bring back to top of the z-stack (mirrors restoreWindow behavior).
      win.zIndex = state.nextZIndex++;
    },

    /**
     * Set or clear the drag-out candidate window. Used purely for visual
     * feedback during a drag: when set, the WindowPanel renders a
     * "Release to pop out" outline. Cleared on every pointerup regardless
     * of whether popout actually fires.
     */
    setPopoutCandidate(state, action: PayloadAction<{ id: string | null }>) {
      state.popoutCandidateId = action.payload.id;
    },

    /** Restore window geometry and state from localStorage */
    restoreWindowState(
      state,
      action: PayloadAction<Record<string, WindowEntry>>,
    ) {
      const restored = action.payload;
      let maxZ = state.nextZIndex;

      Object.entries(restored).forEach(([id, win]) => {
        if (!state.windows[id]) {
          // Skip orphans: only restore geometry for windows that are already
          // registered (i.e. whose component is actually mounted). Creating
          // entries for unregistered ids produces phantom windows in the
          // Visibility tab and inflates trayCount, which pushes minimized
          // chips away from the bottom-right corner.
          return;
        }
        // Window is registered — overwrite with persisted geometry/state.
        // Force popoutMode/prePopoutRect to null on hydration: re-opening
        // a Document PiP requires a fresh user gesture, which we can't
        // produce programmatically. The window restores in the docked state.
        state.windows[id] = {
          ...state.windows[id],
          ...win,
          popoutMode: null,
          prePopoutRect: null,
        };
        if (win.zIndex >= maxZ) maxZ = win.zIndex + 1;
      });

      state.nextZIndex = Math.max(state.nextZIndex, maxZ);
      // Popout state is never restored from persistence — clear the slot.
      state.activePipWindowId = null;
      state.popoutCandidateId = null;
      // Recount from scratch to avoid stale counts from the persisted payload
      state.trayCount = Object.values(state.windows).filter(
        (w) => w.traySlot !== null,
      ).length;
    },
  },
});

export const {
  registerWindow,
  unregisterWindow,
  focusWindow,
  restoreWindow,
  revealWindow,
  maximizeWindow,
  minimizeWindow,
  minimizeAll,
  restoreAll,
  recomputeTrayPositions,
  updateWindowRect,
  updateWindowTitle,
  toggleWindowsHidden,
  moveTraySlot,
  arrangeActiveWindows,
  popOutWindow,
  dockWindow,
  setPopoutCandidate,
  clampWindowRect,
  clampAllWindowRects,
  restoreWindowState,
} = windowManagerSlice.actions;

// ─── Selectors ────────────────────────────────────────────────────────────────

type StateWithWM = { windowManager: WindowManagerState };

// Raw slice accessor — used as input selector for derived selectors
const selectWindowsMap = (state: StateWithWM) => state.windowManager.windows;

export const selectWindow = (id: string) => (state: StateWithWM) =>
  state.windowManager.windows[id];

export const selectWindowState = (id: string) => (state: StateWithWM) =>
  state.windowManager.windows[id]?.state;

export const selectWindowRect = (id: string) => (state: StateWithWM) =>
  state.windowManager.windows[id]?.windowed;

export const selectWindowZIndex = (id: string) => (state: StateWithWM) =>
  state.windowManager.windows[id]?.zIndex ?? BASE_Z;

export const selectWindowTitle = (id: string) => (state: StateWithWM) =>
  state.windowManager.windows[id]?.title ?? id;

export const selectTraySlotWidth = () => TRAY_SLOT_WIDTH;

export const selectWindowsHidden = (state: StateWithWM) =>
  state.windowManager.windowsHidden;

/**
 * Minimized windows sorted by tray slot ascending.
 * Memoized — only recalculates when the windows map reference changes.
 */
export const selectTrayWindows = createSelector([selectWindowsMap], (windows) =>
  Object.values(windows)
    .filter((w) => w.state === "minimized")
    .sort((a, b) => (a.traySlot ?? 0) - (b.traySlot ?? 0)),
);

/** All registered windows sorted by zIndex descending (most-recently-focused first). */
export const selectAllWindows = createSelector([selectWindowsMap], (windows) =>
  Object.values(windows).sort((a, b) => b.zIndex - a.zIndex),
);

/** True when every registered window is minimized (or there are none). */
export const selectAllMinimized = createSelector(
  [selectWindowsMap],
  (windows) => {
    const wins = Object.values(windows);
    return wins.length > 0 && wins.every((w) => w.state === "minimized");
  },
);

// ─── Popout selectors ─────────────────────────────────────────────────────────

/** Current popout mode for a window. Returns `null` if docked or unknown id. */
export const selectPopoutMode = (id: string) => (state: StateWithWM) =>
  state.windowManager.windows[id]?.popoutMode ?? null;

/** True if the window is currently popped out (either pip or popup mode). */
export const selectIsPoppedOut = (id: string) => (state: StateWithWM) =>
  (state.windowManager.windows[id]?.popoutMode ?? null) !== null;

/** The id of the window holding the single Document PiP slot, or `null`. */
export const selectActivePipWindowId = (state: StateWithWM) =>
  state.windowManager.activePipWindowId;

/**
 * The id of the window currently being dragged outside the viewport beyond
 * the popout threshold. Used by WindowPanel to render the "Release to pop
 * out" outline.
 */
export const selectPopoutCandidateId = (state: StateWithWM) =>
  state.windowManager.popoutCandidateId;

/** Saved rect to dock back to. `null` while docked or after dock-back. */
export const selectPrePopoutRect = (id: string) => (state: StateWithWM) =>
  state.windowManager.windows[id]?.prePopoutRect ?? null;

/**
 * All windows currently docked (popoutMode === null), sorted by zIndex
 * descending. Used by arrange/tray logic so popped-out windows don't get
 * assigned slots in parent-viewport layouts.
 */
export const selectDockedWindows = createSelector(
  [selectWindowsMap],
  (windows) =>
    Object.values(windows)
      .filter((w) => w.popoutMode === null)
      .sort((a, b) => b.zIndex - a.zIndex),
);

export default windowManagerSlice.reducer;
