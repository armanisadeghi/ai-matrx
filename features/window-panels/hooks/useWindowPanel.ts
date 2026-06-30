"use client";

/**
 * useWindowPanel
 *
 * Connects a single WindowPanel instance to the Redux window-manager slice.
 * Handles:
 *  - Registration / cleanup on mount/unmount
 *  - Drag-to-move (header pointerdown → document pointermove/pointerup)
 *  - Resize (edge/corner handles → document pointermove/pointerup)
 *  - Window state transitions (windowed / maximized / minimized)
 *  - Focus-on-click (brings panel to top of z stack)
 *
 * Uses pointer events (not mouse events) so drag/resize works on
 * touchscreens (iPad, Tesla, etc.) as well as mouse + pen input.
 *
 * Pure CSS resize via inline styles; no Tailwind width classes after mount.
 */

import { useEffect, useRef, useCallback, useId } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  registerWindow,
  unregisterWindow,
  focusWindow,
  restoreWindow,
  maximizeWindow,
  minimizeWindow,
  updateWindowRect,
  updateWindowTitle,
  setPopoutCandidate,
  clampWindowRect,
  selectWindow,
  type WindowRect,
} from "@/lib/redux/slices/windowManagerSlice";
import {
  evaluateDragOut,
  DEFAULT_DRAG_OUT_CONFIG,
  INITIAL_DRAG_OUT_STATE,
  type DragOutState,
} from "../popout/popoutDragDetector";

// ─── Config ────────────────────────────────────────────────────────────────────

const MIN_WIDTH = 180;
const MIN_HEIGHT = 80;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 400;

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ResizeEdge =
  | "e" // right
  | "s" // bottom
  | "se" // bottom-right corner
  | "w" // left
  | "sw" // bottom-left
  | "n" // top
  | "ne" // top-right
  | "nw"; // top-left

/** Where to place the window when it first opens. */
export type WindowPosition =
  "center" | "top-right" | "top-left" | "bottom-right" | "bottom-left";

/**
 * Resolve a dimension value to pixels.
 * - number → pixels as-is
 * - string ending in "vh" → percentage of viewport height
 * - string ending in "vw" → percentage of viewport width
 */
function resolveSize(
  value: number | string | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value === "number") return value;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  if (value.endsWith("vh")) return Math.round((parseFloat(value) / 100) * vh);
  if (value.endsWith("vw")) return Math.round((parseFloat(value) / 100) * vw);
  return parseFloat(value) || fallback;
}

function resolvePosition(
  pos: WindowPosition | undefined,
  w: number,
  h: number,
): { x: number; y: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const pad = 40;
  switch (pos) {
    case "top-left":
      return { x: pad, y: pad };
    case "top-right":
      return { x: Math.max(0, vw - w - pad), y: pad };
    case "bottom-left":
      return { x: pad, y: Math.max(0, vh - h - pad) };
    case "bottom-right":
      return { x: Math.max(0, vw - w - pad), y: Math.max(0, vh - h - pad) };
    case "center":
    default:
      return {
        x: Math.max(0, (vw - w) / 2),
        y: Math.max(0, (vh - h) / 4),
      };
  }
}

export interface UseWindowPanelOptions {
  /** Stable, unique id. If omitted a React useId-based id is used. */
  id?: string;
  /** Title shown in the header and tray chip. */
  title?: string;
  /**
   * Initial width. Accepts pixels (number) or viewport strings ("60vw").
   * Default: 320.
   */
  width?: number | string;
  /**
   * Initial height. Accepts pixels (number) or viewport strings ("60dvh").
   * Default: 400.
   */
  height?: number | string;
  /** Where to place the window initially. Default: "center". */
  position?: WindowPosition;
  /**
   * @deprecated Pass `width`, `height`, and `position` instead.
   * Low-level initial rect — overrides width/height/position when provided.
   */
  initialRect?: Partial<WindowRect>;
  /** Maximum width the user can resize to. */
  maxWidth?: number;
  /** Maximum height the user can resize to. */
  maxHeight?: number;
  /**
   * Optional callback fired when the user drags the window outside the
   * viewport long enough to count as a pop-out gesture. Caller is expected
   * to open the popout window synchronously inside the user-gesture stack
   * (i.e. without `await` before the open call).
   *
   * Pass the current rect at the time of release — the popout uses it for
   * sizing.
   *
   * `undefined` disables drag-out detection entirely. Use `undefined` for
   * popouts that aren't supported (mobile, no-capability browsers, etc.)
   * so we don't waste cycles on the per-move evaluation.
   */
  onTriggerPopout?: (rect: WindowRect) => void;
}

/** Shared subset of MouseEvent / PointerEvent / TouchEvent we need. */
type PointerLike = {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
};

export interface UseWindowPanelReturn {
  /** The stable window id. */
  id: string;
  /** Current window state from Redux. */
  windowState: "windowed" | "maximized" | "minimized";
  /** Current windowed rect from Redux. */
  rect: WindowRect;
  /** z-index from Redux. */
  zIndex: number;
  /** Pointerdown handler for the drag handle (header). Works with mouse + touch + pen. */
  onDragStart: (e: React.PointerEvent) => void;
  /** Pointerdown handler factory for resize handles. Works with mouse + touch + pen. */
  onResizeStart: (edge: ResizeEdge) => (e: React.PointerEvent) => void;
  /** Bring this window to the top. */
  onFocus: () => void;
  /** Transition to windowed state. */
  onRestore: () => void;
  /** Transition to maximized state. */
  onMaximize: () => void;
  /** Transition to minimized (tray) state. */
  onMinimize: () => void;
  /** Toggle maximized ↔ windowed. */
  onToggleMaximize: () => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useWindowPanel(
  opts: UseWindowPanelOptions = {},
): UseWindowPanelReturn {
  const reactId = useId();
  const id = opts.id ?? reactId;

  const dispatch = useAppDispatch();
  const entry = useAppSelector(selectWindow(id));

  const maxWidth = opts.maxWidth ?? Infinity;
  const maxHeight = opts.maxHeight ?? Infinity;

  // ── Registration ────────────────────────────────────────────────────────────
  useEffect(() => {
    const w = opts.initialRect?.width ?? resolveSize(opts.width, DEFAULT_WIDTH);
    const h =
      opts.initialRect?.height ?? resolveSize(opts.height, DEFAULT_HEIGHT);
    const pos =
      opts.initialRect?.x !== undefined || opts.initialRect?.y !== undefined
        ? {
            x: opts.initialRect?.x ?? Math.max(0, (window.innerWidth - w) / 2),
            y: opts.initialRect?.y ?? Math.max(0, (window.innerHeight - h) / 4),
          }
        : resolvePosition(opts.position, w, h);
    const initial: WindowRect = { ...pos, width: w, height: h };
    dispatch(registerWindow({ id, title: opts.title, initial }));
    // Bring the newly opened window to the top of the z-stack immediately.
    // registerWindow assigns the current nextZIndex, but existing windows may
    // have been focused after their registration, giving them higher z-values.
    dispatch(focusWindow(id));
    return () => {
      dispatch(unregisterWindow(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Keep title in sync if it changes after mount ─────────────────────────
  useEffect(() => {
    if (opts.title !== undefined) {
      dispatch(updateWindowTitle({ id, title: opts.title }));
    }
  }, [id, opts.title, dispatch]);

  // ── Drag-to-move (pointer events — works for mouse + touch + pen) ──────────
  const dragStart = useRef<{
    mx: number;
    my: number;
    wx: number;
    wy: number;
  } | null>(null);

  const onTriggerPopout = opts.onTriggerPopout;
  const onTriggerPopoutRef = useRef(onTriggerPopout);
  onTriggerPopoutRef.current = onTriggerPopout;

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dispatch(focusWindow(id));
      // Allow drag in windowed AND minimized states (maximized is handled by header)
      if (!entry || entry.state === "maximized") return;
      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        wx: entry.windowed.x,
        wy: entry.windowed.y,
      };

      // Per-drag local state for drag-out detection. Only allocated/used
      // when popout is enabled for this window.
      let dragOutState: DragOutState = INITIAL_DRAG_OUT_STATE;
      // Snapshot rect at release for the popout sizing — drag updates rect
      // continuously, so we capture x/y/w/h at gesture-end.
      let lastClientX = e.clientX;
      let lastClientY = e.clientY;
      const popoutEnabled = onTriggerPopoutRef.current !== undefined;

      const onMove = (ev: PointerEvent) => {
        if (!dragStart.current) return;
        const nx = dragStart.current.wx + (ev.clientX - dragStart.current.mx);
        const ny = dragStart.current.wy + (ev.clientY - dragStart.current.my);
        dispatch(updateWindowRect({ id, rect: { x: nx, y: ny } }));
        lastClientX = ev.clientX;
        lastClientY = ev.clientY;

        // Drag-out detection — only run the evaluator when popout is wired.
        if (!popoutEnabled) return;
        const result = evaluateDragOut(
          { clientX: ev.clientX, clientY: ev.clientY },
          dragOutState,
          DEFAULT_DRAG_OUT_CONFIG,
          window.innerWidth,
          window.innerHeight,
          performance.now(),
        );
        // Only dispatch on candidate-state changes to avoid spamming Redux
        // with identical actions every pointermove.
        if (result.state.isCandidate !== dragOutState.isCandidate) {
          dispatch(
            setPopoutCandidate({ id: result.state.isCandidate ? id : null }),
          );
        }
        dragOutState = result.state;
      };

      const onUp = () => {
        const wasCandidate = dragOutState.isCandidate;
        const dragOrigin = dragStart.current;
        dragStart.current = null;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);

        // Always clear candidate flag on release — even if popout fires,
        // the visual feedback should disappear immediately.
        if (popoutEnabled && dragOutState.isCandidate) {
          dispatch(setPopoutCandidate({ id: null }));
        }

        // Trigger popout if release happened in candidate state.
        // Run synchronously inside the pointerup user-gesture stack so the
        // browser accepts the requestWindow / window.open call.
        if (wasCandidate && onTriggerPopoutRef.current && entry) {
          // Use the LAST rect we computed during the drag — the user has
          // visually placed the window at that position, even though the
          // popout will appear at OS-controlled coordinates.
          const lastRect: WindowRect = {
            x: dragOrigin?.wx ?? entry.windowed.x,
            y: dragOrigin?.wy ?? entry.windowed.y,
            width: entry.windowed.width,
            height: entry.windowed.height,
          };
          onTriggerPopoutRef.current(lastRect);
        } else {
          // Off-screen rescue: if the user released the drag outside the
          // viewport without triggering a popout (e.g. they dragged past
          // the edge but not far enough / long enough to dwell, or popout
          // was unavailable), pull the window back so its header stays
          // grabbable. The clamp reducer is a no-op when rect is already
          // in bounds, so this is cheap to dispatch unconditionally.
          dispatch(
            clampWindowRect({
              id,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
            }),
          );
        }
        // Suppress unused-var lint on lastClientX/Y — they're tracked for
        // potential future telemetry (drag distance, exit edge, etc.)
        void lastClientX;
        void lastClientY;
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [dispatch, id, entry],
  );

  // ── Resize (pointer events — works for mouse + touch + pen) ────────────────
  const onResizeStart = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dispatch(focusWindow(id));
      if (!entry || entry.state !== "windowed") return;

      const startMx = e.clientX;
      const startMy = e.clientY;
      const { x, y, width, height } = entry.windowed;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startMx;
        const dy = ev.clientY - startMy;
        let nx = x,
          ny = y,
          nw = width,
          nh = height;

        if (edge.includes("e"))
          nw = Math.min(maxWidth, Math.max(MIN_WIDTH, width + dx));
        if (edge.includes("s"))
          nh = Math.min(maxHeight, Math.max(MIN_HEIGHT, height + dy));
        if (edge.includes("w")) {
          nw = Math.min(maxWidth, Math.max(MIN_WIDTH, width - dx));
          nx = x + (width - nw);
        }
        if (edge.includes("n")) {
          nh = Math.min(maxHeight, Math.max(MIN_HEIGHT, height - dy));
          ny = y + (height - nh);
        }

        dispatch(
          updateWindowRect({
            id,
            rect: { x: nx, y: ny, width: nw, height: nh },
          }),
        );
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [dispatch, id, entry, maxWidth, maxHeight],
  );

  // ── Window state transitions ───────────────────────────────────────────────
  const onFocus = useCallback(() => dispatch(focusWindow(id)), [dispatch, id]);
  const onRestore = useCallback(
    () => dispatch(restoreWindow(id)),
    [dispatch, id],
  );
  const onMaximize = useCallback(
    () => dispatch(maximizeWindow(id)),
    [dispatch, id],
  );
  const onMinimize = useCallback(() => {
    dispatch(
      minimizeWindow({
        id,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
  }, [dispatch, id]);
  const onToggleMaximize = useCallback(() => {
    if (entry?.state === "maximized") dispatch(restoreWindow(id));
    else dispatch(maximizeWindow(id));
  }, [dispatch, id, entry]);

  // ── Stable fallback rect before first render ───────────────────────────────
  const rect: WindowRect = entry?.windowed ?? {
    x: 0,
    y: 0,
    width: opts.initialRect?.width ?? resolveSize(opts.width, DEFAULT_WIDTH),
    height:
      opts.initialRect?.height ?? resolveSize(opts.height, DEFAULT_HEIGHT),
  };

  return {
    id,
    windowState: entry?.state ?? "windowed",
    rect,
    zIndex: entry?.zIndex ?? 1000,
    onDragStart,
    onResizeStart,
    onFocus,
    onRestore,
    onMaximize,
    onMinimize,
    onToggleMaximize,
  };
}
