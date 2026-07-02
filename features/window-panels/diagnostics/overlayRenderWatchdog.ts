"use client";

/**
 * overlayRenderWatchdog
 *
 * Makes "a panel was triggered but silently never appeared" structurally
 * impossible to ship unnoticed. Two responsibilities, one middleware:
 *
 *  1. REVEAL — on every open of a window-kind overlay, dispatch `revealWindow`
 *     so an already-registered window that is minimized, dragged off-screen, or
 *     suppressed by the global hide-all is brought back into view. Re-opening a
 *     window must never be a silent no-op.
 *
 *  2. DETECT — a short time after the open, inspect actual Redux + viewport
 *     state and confirm a *visible* panel is on screen. If not, SCREAM
 *     (console.error) and surface a self-healing toast. This is the loud
 *     recovery layer mandated by CLAUDE.md: a recovery firing means a real
 *     bug got past the proactive layer.
 *
 * The detector is intentionally scoped to SINGLETON window-kind overlays — the
 * surfaces that render through `WindowPanel` and join the window manager. Non-
 * window overlays (dialogs/sheets/toasts) don't register geometry and would
 * false-positive, so they're skipped. Multi-instance windows carry per-instance
 * ids we don't track here and are skipped too.
 *
 * The pure decision (`diagnoseOverlayRender`) is exported separately so it can
 * be unit-tested without a store, a DOM, or timers.
 */

import type { Middleware, MiddlewareAPI, Dispatch } from "@reduxjs/toolkit";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import {
  revealWindow,
  type WindowEntry,
  type WindowManagerState,
} from "@/lib/redux/slices/windowManagerSlice";
import type { OverlayState } from "@/lib/redux/slices/overlaySlice";
import { getStaticEntryByOverlayId } from "@/features/window-panels/registry/windowRegistryMetadata";
import type { WindowRect } from "@/features/window-panels/window-panel.types";
import { toast } from "sonner";

// Action types emitted by overlaySlice (createSlice name: "overlays"). The
// public `openOverlay` / `toggleOverlay` creators wrap the raw reducers, so we
// match on the dispatched action's resolved type string rather than a creator.
const OPEN_TYPE = "overlays/openOverlay";
const TOGGLE_TYPE = "overlays/toggleOverlay";
const DEFAULT_INSTANCE_ID = "default";

/** Narrow a dispatched action's `payload` (declared `unknown`) to a plain object. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** How long after an open we wait before declaring the panel a no-show. Must
 *  exceed worst-case lazy-chunk load for a first-time open. */
const CHECK_DELAY_MS = 2500;
/** For the "no window registered yet" case only, allow one extra grace period
 *  before screaming — covers an unusually slow cold chunk load. */
const NO_MOUNT_RETRY_MS = 2000;

// ── Render acknowledgement registry ─────────────────────────────────────────
// WindowPanel reports the real window-manager id it rendered under, keyed by
// overlayId. This lets the watchdog resolve the geometry entry even when a
// window's `id` prop differs from its registry slug, eliminating false
// "no-window-registered" reports.

const renderAcks = new Map<string, string>();

export function ackOverlayRender(overlayId: string, windowId: string): void {
  renderAcks.set(overlayId, windowId);
}

export function clearOverlayRender(overlayId: string, windowId: string): void {
  if (renderAcks.get(overlayId) === windowId) renderAcks.delete(overlayId);
}

// ── Pure visibility diagnosis ───────────────────────────────────────────────

export type RenderFailureReason =
  | "no-window-registered"
  | "all-windows-hidden"
  | "zero-size"
  | "off-screen";

export type RenderDiagnosis =
  | { ok: true; reason: null }
  | { ok: false; reason: RenderFailureReason };

/** A window counts as on-screen if a usable strip of it intersects the
 *  viewport (matches the spirit of `clampRectToViewport`'s safe margin). */
export function rectOnScreen(
  rect: WindowRect,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const MARGIN = 24;
  const intersectsX =
    rect.x < viewportWidth - MARGIN && rect.x + rect.width > MARGIN;
  const intersectsY =
    rect.y < viewportHeight - MARGIN && rect.y + rect.height > MARGIN;
  return intersectsX && intersectsY;
}

/**
 * Given the window's geometry entry and global state, decide whether a visible
 * panel is actually on screen. Pure — no store, DOM, or timers.
 */
export function diagnoseOverlayRender(args: {
  entry: WindowEntry | undefined;
  windowsHidden: boolean;
  viewportWidth: number;
  viewportHeight: number;
}): RenderDiagnosis {
  const { entry, windowsHidden, viewportWidth, viewportHeight } = args;
  if (!entry) return { ok: false, reason: "no-window-registered" };
  // Popped-out windows live in a separate OS-managed browser window; the
  // global hide-all doesn't apply and there's nothing to verify on our canvas.
  if (entry.popoutMode !== null) return { ok: true, reason: null };
  if (windowsHidden) return { ok: false, reason: "all-windows-hidden" };
  // Minimized is a legitimate parked state (reachable via the tray), and the
  // persistence layer can restore a window minimized on purpose. A *user* open
  // is un-minimized by `revealWindow` before this check runs, so a minimized
  // window here is intentional, not a silent failure — don't flag it.
  if (entry.state === "minimized") return { ok: true, reason: null };
  if (entry.state === "maximized") return { ok: true, reason: null };
  if (entry.windowed.width <= 1 || entry.windowed.height <= 1) {
    return { ok: false, reason: "zero-size" };
  }
  if (!rectOnScreen(entry.windowed, viewportWidth, viewportHeight)) {
    return { ok: false, reason: "off-screen" };
  }
  return { ok: true, reason: null };
}

const REASON_HINT: Record<RenderFailureReason, string> = {
  "no-window-registered":
    "no <WindowPanel> mounted for this overlay — check the OverlayController block, the lazy import, and that the component returns a <WindowPanel> when open",
  "all-windows-hidden":
    "the global 'Hide all windows' flag is on — opening should have cleared it (revealWindow)",
  "zero-size": "the window rect collapsed to zero size",
  "off-screen": "the window rect is outside the viewport — opening should have clamped it",
};

// ── Watchdog scheduling ─────────────────────────────────────────────────────

// Minimal slice of app state this watchdog reads. Used to type the middleware
// (and `scheduleCheck`) without casting the store.
type WMState = { overlays: OverlayState; windowManager: WindowManagerState };
type WMApi = MiddlewareAPI<Dispatch, WMState>;

// Dedupe in-flight checks per overlayId so rapid re-opens don't stack timers
// (and can't double-scream).
const pending = new Set<string>();

function scheduleCheck(
  store: WMApi,
  overlayId: string,
  slug: string,
  label: string,
  delay: number,
  isRetry: boolean,
): void {
  if (pending.has(overlayId)) return;
  pending.add(overlayId);
  window.setTimeout(() => {
    pending.delete(overlayId);
    const state = store.getState();
    // Closed in the meantime — nothing to verify.
    if (!selectIsOverlayOpen(state, overlayId, DEFAULT_INSTANCE_ID)) return;

    const windowId = renderAcks.get(overlayId) ?? slug;
    const entry = state.windowManager.windows[windowId];
    const diag = diagnoseOverlayRender({
      entry,
      windowsHidden: state.windowManager.windowsHidden,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (diag.ok) return;

    // A still-loading lazy chunk looks identical to a genuine no-mount. Give
    // the slow-cold-load case exactly one more grace window before screaming.
    if (diag.reason === "no-window-registered" && !isRetry) {
      scheduleCheck(store, overlayId, slug, label, NO_MOUNT_RETRY_MS, true);
      return;
    }

    // LOUD recovery — screams in prod and dev (cheap, and makes the failure
    // auditable from any user's DevTools), with a one-click self-heal.
    console.error(
      `[window-panels] SILENT RENDER FAILURE — overlay "${overlayId}" was ` +
        `opened but no visible panel is on screen after ${delay}ms ` +
        `(reason: ${diag.reason}). ${REASON_HINT[diag.reason]}.`,
      { overlayId, windowId, entry, windowsHidden: state.windowManager.windowsHidden },
    );

    toast.error(`"${label}" didn't appear`, {
      description: "The panel was opened but isn't visible. Click to show it.",
      duration: 8000,
      action: {
        label: "Show it",
        onClick: () =>
          store.dispatch(
            revealWindow({
              id: windowId,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
            }),
          ),
      },
    });
  }, delay);
}

// ── Middleware ──────────────────────────────────────────────────────────────

export const overlayRenderWatchdogMiddleware: Middleware<object, WMState> =
  (store) => (next) => (action) => {
    const result = next(action);

    // Browser-only: no viewport / timers during SSR.
    if (typeof window === "undefined") return result;

    const typed = action as { type?: string; payload?: unknown };
    if (typed.type !== OPEN_TYPE && typed.type !== TOGGLE_TYPE) return result;

    const payload = typed.payload;
    const overlayId =
      isPlainRecord(payload) && typeof payload.overlayId === "string"
        ? payload.overlayId
        : undefined;
    if (!overlayId) return result;
    const instanceIdRaw =
      isPlainRecord(payload) && typeof payload.instanceId === "string"
        ? payload.instanceId
        : undefined;

    // Only windows participate in the geometry/visibility model.
    const meta = getStaticEntryByOverlayId(overlayId);
    if (!meta || meta.kind !== "window") return result;

    // Multi-instance windows use per-instance ids we don't track here.
    const instanceId = instanceIdRaw ?? DEFAULT_INSTANCE_ID;
    if (instanceId !== DEFAULT_INSTANCE_ID) return result;

    const state = store.getState();
    // `toggleOverlay` may have just CLOSED it — only act when it ended up open.
    if (!selectIsOverlayOpen(state, overlayId, DEFAULT_INSTANCE_ID)) {
      return result;
    }

    // 1) Reveal: bring an already-registered window into view immediately
    //    (no-op on a first open, where the component hasn't mounted yet —
    //    `registerWindow` shows it). This dispatch re-enters the middleware
    //    but `revealWindow`'s type is ignored above, so there's no loop.
    store.dispatch(
      revealWindow({
        id: renderAcks.get(overlayId) ?? meta.slug,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );

    // 2) Detect: verify a visible panel actually appears.
    scheduleCheck(
      store,
      overlayId,
      meta.slug,
      meta.label ?? overlayId,
      CHECK_DELAY_MS,
      false,
    );

    return result;
  };
