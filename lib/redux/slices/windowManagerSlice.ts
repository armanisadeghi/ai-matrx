import {
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  computeGlobalArrangement,
  GlobalLayoutType,
} from "@/features/window-panels/utils/windowArrangements";
import {
  centerRectInViewport,
  clampRectToViewport,
} from "@/features/window-panels/utils/rectClamp";
import type { DockWindowPayload } from "@/features/window-panels/popout/dockWindowPayload";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import {
  TRAY_CHIP_H_DESKTOP,
  TRAY_CHIP_W_DESKTOP,
  traySlotRect,
} from "@/features/window-panels/constants/tray";
// WindowRect lives in the shared types file so that windowArrangements.ts
// (a feature utility) can import it without pulling in this Redux slice,
// which would create a cycle. Re-exported here for backward compatibility.
export type { WindowRect } from "@/features/window-panels/window-panel.types";
import type { WindowRect } from "@/features/window-panels/window-panel.types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WindowState = "windowed" | "maximized" | "minimized";

export const WINDOW_SESSION_SCHEMA_VERSION = 1 as const;

/** Canonical persistence identity. Runtime window ids and registry slugs are not identities. */
export function windowSessionKey(
  overlayId: OverlayId,
  instanceId: string,
): string {
  return `${overlayId}:${instanceId}`;
}

export interface WindowPersistenceRegistration {
  overlayId: OverlayId;
  instanceId: string;
  data: Record<string, unknown>;
  sidebarOpen: boolean;
  sidebarSize: number | null;
}

export interface WindowPersistenceState extends WindowPersistenceRegistration {
  /** Explicit close suppresses every later snapshot/unmount path. */
  closing: boolean;
}

/** Compact, JSON-only record written to the local window workspace cache. */
export interface PersistedWindowSession {
  schemaVersion: typeof WINDOW_SESSION_SCHEMA_VERSION;
  sessionKey: string;
  overlayId: OverlayId;
  instanceId: string;
  /** Runtime id is diagnostic/matching metadata, never the canonical identity. */
  windowId: string;
  title: string;
  state: WindowState;
  /** Always the full windowed rect, never minimized-card geometry. */
  windowedRect: WindowRect;
  traySlot: number | null;
  zIndex: number;
  sidebarOpen: boolean;
  sidebarSize: number | null;
  data: Record<string, unknown>;
  savedAt: number;
}

/** Viewport-normalized session staged for a live WindowPanel registration. */
export interface HydratedWindowSession extends PersistedWindowSession {
  /** Current-viewport render rect; tray geometry is recomputed, never stored. */
  renderRect: WindowRect;
}

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
  /** Order in the minimized tray (0-based). */
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
  /** Present only for registry entries explicitly approved for preservation. */
  persistence?: WindowPersistenceState;
}

export interface WindowManagerState {
  windows: Record<string, WindowEntry>;
  /** Validated sessions waiting for their WindowPanel registration. */
  pendingRestores: Record<string, HydratedWindowSession>;
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

export const TRAY_CHIP_W = TRAY_CHIP_W_DESKTOP;
export const TRAY_CHIP_H = TRAY_CHIP_H_DESKTOP;

// ─── Base constants ───────────────────────────────────────────────────────────

const BASE_Z = 1000;
const TRAY_SLOT_WIDTH = TRAY_CHIP_W; // kept for selector compat

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: WindowManagerState = {
  windows: {},
  pendingRestores: {},
  nextZIndex: BASE_Z,
  trayCount: 0,
  windowsHidden: false,
  activePipWindowId: null,
  popoutCandidateId: null,
};

/**
 * Free a minimized slot and close the visual gap in the same reducer update.
 * Rectangles are mapped by their old slot so compaction does not need viewport
 * dimensions and cannot leave renumbered cards at stale coordinates.
 */
function compactReservedTraySlot(
  state: WindowManagerState,
  freedSlot: number,
  freedRect: WindowRect,
): void {
  const rectBySlot = new Map<number, WindowRect>();
  rectBySlot.set(freedSlot, freedRect);
  Object.values(state.windows).forEach((entry) => {
    if (entry.traySlot !== null) {
      rectBySlot.set(entry.traySlot, { ...entry.windowed });
    }
  });
  Object.values(state.pendingRestores).forEach((session) => {
    if (session.traySlot !== null) {
      rectBySlot.set(session.traySlot, { ...session.renderRect });
    }
  });

  state.trayCount = Math.max(0, state.trayCount - 1);
  Object.values(state.windows).forEach((entry) => {
    if (entry.traySlot === null || entry.traySlot <= freedSlot) return;
    const nextSlot = entry.traySlot - 1;
    entry.traySlot = nextSlot;
    const nextRect = rectBySlot.get(nextSlot);
    if (nextRect) entry.windowed = nextRect;
  });
  Object.values(state.pendingRestores).forEach((session) => {
    if (session.traySlot === null || session.traySlot <= freedSlot) return;
    const nextSlot = session.traySlot - 1;
    session.traySlot = nextSlot;
    const nextRect = rectBySlot.get(nextSlot);
    if (nextRect) session.renderRect = nextRect;
  });
}

function releaseTraySlot(state: WindowManagerState, win: WindowEntry): void {
  const freedSlot = win.traySlot;
  if (freedSlot === null) return;
  const freedRect = { ...win.windowed };
  win.traySlot = null;
  compactReservedTraySlot(state, freedSlot, freedRect);
}

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
        persistence?: WindowPersistenceRegistration;
        viewport?: { width: number; height: number };
      }>,
    ) {
      const { id, title, initial, persistence, viewport } = action.payload;
      if (state.windows[id]) return;

      const pending = persistence
        ? state.pendingRestores[
            windowSessionKey(persistence.overlayId, persistence.instanceId)
          ]
        : undefined;
      const pendingRenderRect = pending
        ? pending.state === "minimized" && pending.traySlot !== null && viewport
          ? traySlotRect(
              pending.traySlot,
              viewport.width,
              viewport.height,
            )
          : viewport
            ? clampRectToViewport(pending.windowedRect, viewport)
            : pending.renderRect
        : undefined;
      state.windows[id] = {
        id,
        title: title ?? pending?.title ?? id,
        state: pending?.state ?? "windowed",
        windowed: pendingRenderRect ?? initial,
        preMinimizedRect:
          pending?.state === "minimized" ? pending.windowedRect : null,
        zIndex: pending?.zIndex ?? state.nextZIndex++,
        traySlot: pending?.state === "minimized" ? pending.traySlot : null,
        popoutMode: null,
        prePopoutRect: null,
        ...(persistence
          ? {
              persistence: {
                ...persistence,
                data: { ...(pending?.data ?? {}), ...persistence.data },
                sidebarOpen: pending?.sidebarOpen ?? persistence.sidebarOpen,
                sidebarSize: pending?.sidebarSize ?? persistence.sidebarSize,
                closing: false,
              },
            }
          : {}),
      };

      if (pending?.state === "minimized" && pending.traySlot !== null) {
        state.trayCount = Math.max(state.trayCount, pending.traySlot + 1);
      }
      if (pending && pending.zIndex >= state.nextZIndex) {
        state.nextZIndex = pending.zIndex + 1;
      }
      // Opening a brand-new window is an explicit "show me" intent. Never let a
      // stale global hide-all (windowsHidden) silently render it invisible —
      // that is the silent-failure class this slice must structurally prevent.
      if (state.windowsHidden) state.windowsHidden = false;
    },

    /** Stage validated local sessions without creating phantom live windows. */
    hydrateWindowSessions(
      state,
      action: PayloadAction<{
        sessions: HydratedWindowSession[];
        viewportWidth: number;
        viewportHeight: number;
      }>,
    ) {
      const liveEntries = Object.values(state.windows).sort(
        (a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id),
      );
      const accepted: HydratedWindowSession[] = [];
      action.payload.sessions.forEach((session) => {
        const alreadyLive = Object.values(state.windows).some(
          (entry) =>
            entry.persistence?.overlayId === session.overlayId &&
            entry.persistence.instanceId === session.instanceId,
        );
        // Current URL/manual intent wins over a late local hydration.
        if (alreadyLive) return;
        accepted.push(session);
      });
      accepted
        .sort(
          (a, b) => a.zIndex - b.zIndex || a.sessionKey.localeCompare(b.sessionKey),
        )
        .forEach((session, index) => {
          const key = windowSessionKey(session.overlayId, session.instanceId);
          const traySlot =
            session.state === "minimized" ? state.trayCount++ : null;
          state.pendingRestores[key] = {
            ...session,
            sessionKey: key,
            traySlot,
            zIndex: BASE_Z + index,
            renderRect:
              traySlot !== null
                ? traySlotRect(
                    traySlot,
                    action.payload.viewportWidth,
                    action.payload.viewportHeight,
                  )
                : clampRectToViewport(session.windowedRect, {
                    width: action.payload.viewportWidth,
                    height: action.payload.viewportHeight,
                  }),
          };
        });
      liveEntries.forEach((entry, index) => {
        entry.zIndex = BASE_Z + accepted.length + index;
      });
      state.nextZIndex = BASE_Z + accepted.length + liveEntries.length;
    },

    /** StrictMode-safe: the first mount cleanup may run before the real mount settles. */
    confirmWindowRestored(state, action: PayloadAction<string>) {
      delete state.pendingRestores[action.payload];
    },

    discardPendingWindowSession(state, action: PayloadAction<string>) {
      const pending = state.pendingRestores[action.payload];
      if (pending?.traySlot !== null && pending?.traySlot !== undefined) {
        compactReservedTraySlot(state, pending.traySlot, pending.renderRect);
      }
      delete state.pendingRestores[action.payload];
    },

    updateWindowPersistence(
      state,
      action: PayloadAction<{
        id: string;
        data?: Record<string, unknown>;
        sidebarOpen?: boolean;
        sidebarSize?: number | null;
      }>,
    ) {
      const entry = state.windows[action.payload.id];
      if (!entry?.persistence || entry.persistence.closing) return;
      if (action.payload.data !== undefined) {
        entry.persistence.data = action.payload.data;
      }
      if (action.payload.sidebarOpen !== undefined) {
        entry.persistence.sidebarOpen = action.payload.sidebarOpen;
      }
      if (action.payload.sidebarSize !== undefined) {
        entry.persistence.sidebarSize = action.payload.sidebarSize;
      }
    },

    /** Synchronous tombstone: close can never be undone by an unmount snapshot. */
    markWindowClosing(
      state,
      action: PayloadAction<{ overlayId: OverlayId; instanceId: string }>,
    ) {
      const key = windowSessionKey(
        action.payload.overlayId,
        action.payload.instanceId,
      );
      const pending = state.pendingRestores[key];
      const hasMatchingLiveWindow = Object.values(state.windows).some(
        (entry) =>
          entry.persistence?.overlayId === action.payload.overlayId &&
          entry.persistence.instanceId === action.payload.instanceId,
      );
      if (
        !hasMatchingLiveWindow &&
        pending?.traySlot !== null &&
        pending?.traySlot !== undefined
      ) {
        compactReservedTraySlot(state, pending.traySlot, pending.renderRect);
      }
      delete state.pendingRestores[key];
      Object.values(state.windows).forEach((entry) => {
        if (
          entry.persistence?.overlayId === action.payload.overlayId &&
          entry.persistence.instanceId === action.payload.instanceId
        ) {
          entry.persistence.closing = true;
        }
      });
    },

    clearWindowPersistenceState(state) {
      Object.values(state.pendingRestores)
        .filter(
          (session) =>
            session.traySlot !== null && session.traySlot !== undefined,
        )
        .sort((a, b) => (b.traySlot ?? -1) - (a.traySlot ?? -1))
        .forEach((session) => {
          compactReservedTraySlot(
            state,
            session.traySlot as number,
            session.renderRect,
          );
        });
      state.pendingRestores = {};
      Object.values(state.windows).forEach((entry) => {
        if (entry.persistence) entry.persistence.closing = true;
      });
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
      const restoreStillPending = win.persistence
        ? Boolean(
            state.pendingRestores[
              windowSessionKey(
                win.persistence.overlayId,
                win.persistence.instanceId,
              )
            ],
          )
        : false;
      if (!restoreStillPending) releaseTraySlot(state, win);
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
      releaseTraySlot(state, win);
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
      releaseTraySlot(state, win);
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
      releaseTraySlot(state, win);
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
      const boundedSlot = Math.min(
        Math.max(0, Math.floor(toSlot)),
        Math.max(0, state.trayCount - 1),
      );
      if (fromSlot === boundedSlot) return;
      const rectBySlot = new Map<number, WindowRect>();
      Object.values(state.windows).forEach((entry) => {
        if (entry.traySlot !== null) {
          rectBySlot.set(entry.traySlot, { ...entry.windowed });
        }
      });
      // Shift other windows
      Object.values(state.windows).forEach((w) => {
        if (w.id === id || w.traySlot === null) return;
        if (
          fromSlot < boundedSlot &&
          w.traySlot > fromSlot &&
          w.traySlot <= boundedSlot
        ) {
          w.traySlot -= 1;
        } else if (
          fromSlot > boundedSlot &&
          w.traySlot >= boundedSlot &&
          w.traySlot < fromSlot
        ) {
          w.traySlot += 1;
        }
      });
      win.traySlot = boundedSlot;
      Object.values(state.windows).forEach((entry) => {
        if (entry.traySlot === null) return;
        const nextRect = rectBySlot.get(entry.traySlot);
        if (nextRect) entry.windowed = nextRect;
      });
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
        releaseTraySlot(state, win);
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
     * Centers the window in the parent viewport using `prePopoutRect`
     * width/height (falls back to current `windowed` size), clears
     * `popoutMode`, releases the PiP slot if held, and bumps z-index.
     * Caller is responsible for closing the actual browser popout window.
     */
    dockWindow(state, action: PayloadAction<DockWindowPayload>) {
      const { id, viewportWidth, viewportHeight } = action.payload;
      const win = state.windows[id];
      if (!win || win.popoutMode === null) return;
      if (state.activePipWindowId === win.id) {
        state.activePipWindowId = null;
      }

      const savedRect = win.prePopoutRect ?? win.windowed;
      const centered = centerRectInViewport(savedRect, {
        width: viewportWidth,
        height: viewportHeight,
      });

      win.windowed = centered;
      win.prePopoutRect = null;
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
  hydrateWindowSessions,
  confirmWindowRestored,
  discardPendingWindowSession,
  updateWindowPersistence,
  markWindowClosing,
  clearWindowPersistenceState,
} = windowManagerSlice.actions;

// ─── Selectors ────────────────────────────────────────────────────────────────

type StateWithWM = { windowManager: WindowManagerState };

// Raw slice accessor — used as input selector for derived selectors
const selectWindowsMap = (state: StateWithWM) => state.windowManager.windows;

export const selectPendingWindowRestores = (state: StateWithWM) =>
  state.windowManager.pendingRestores;

export const selectWindowPersistence = (id: string) => (state: StateWithWM) =>
  state.windowManager.windows[id]?.persistence;

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
