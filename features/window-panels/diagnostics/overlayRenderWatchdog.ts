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
 *  2. DETECT — after the open, inspect actual Redux + viewport state and
 *     confirm a *visible* panel is on screen. If not, SCREAM (console.error)
 *     and surface a self-healing toast. This is the loud recovery layer
 *     mandated by CLAUDE.md: a recovery firing means a real bug got past the
 *     proactive layer.
 *
 * The one state a fixed timer cannot distinguish is "lazy chunk still loading"
 * vs "never mounted" — every window component enters through `next/dynamic`,
 * and a cold dev compile (or a slow network fetch in prod) can take far longer
 * than any polite delay. The watchdog therefore treats the WindowPanel mount
 * acknowledgement (`ackOverlayRender`, called from WindowPanel's mount effect,
 * i.e. strictly after the dynamic import settled) as the chunk-settle signal:
 * while no ack exists it WAITS for one (bounded by a hard no-mount deadline)
 * instead of screaming, and diagnoses geometry only once the ack arrives. A
 * false scream trains people to ignore the real ones.
 *
 * If a scream does fire and the panel becomes visible afterwards anyway, the
 * toast is auto-dismissed and a recovery note is logged — the loud layer never
 * lingers past the failure it reported.
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

/** First look after an open. If the panel already acked (warm chunk), this is
 *  the whole geometry check; if not, we switch to waiting for the ack. */
const CHECK_DELAY_MS = 2500;
/** After the mount ack arrives, how long to let `registerWindow` geometry land
 *  in Redux before diagnosing (registration runs in an earlier effect than the
 *  ack, so this is belt-and-braces, not load-bearing). */
const ACK_SETTLE_MS = 300;
/** One extra look if geometry is somehow still absent right after the ack. */
const ACK_SETTLE_RETRY_MS = 700;
/** Hard ceiling on waiting for a lazy chunk: no WindowPanel ack by this long
 *  after open means the panel genuinely never mounted. Dev chunk compiles are
 *  the slow case; prod chunk fetches are network-bound but far quicker. */
const NO_MOUNT_DEADLINE_MS =
  process.env.NODE_ENV === "production" ? 12_000 : 45_000;
/** How long the failure toast stays up, and how often the post-scream watcher
 *  re-checks so it can auto-dismiss if the panel shows up after the fact. */
const TOAST_DURATION_MS = 8000;
const RECOVERY_POLL_MS = 500;

// ── Render acknowledgement registry ─────────────────────────────────────────
// WindowPanel reports the real window-manager id it rendered under, keyed by
// overlayId, from a mount effect — which only runs once the dynamic import has
// settled. The watchdog uses it two ways: to resolve the geometry entry even
// when a window's `id` prop differs from its registry slug, and as the
// chunk-settle signal that gates the "no window registered" verdict.

const renderAcks = new Map<string, string>();
const ackWaiters = new Map<string, () => void>();

export function ackOverlayRender(overlayId: string, windowId: string): void {
  renderAcks.set(overlayId, windowId);
  const notify = ackWaiters.get(overlayId);
  if (notify) {
    ackWaiters.delete(overlayId);
    notify();
  }
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
// (and the check helpers) without casting the store.
type WMState = { overlays: OverlayState; windowManager: WindowManagerState };
type WMApi = MiddlewareAPI<Dispatch, WMState>;

type Watch = {
  overlayId: string;
  slug: string;
  label: string;
  timer: number | null;
  deadlineTimer: number | null;
};

// Dedupe in-flight watches per overlayId so rapid re-opens don't stack timers
// (and can't double-scream).
const watches = new Map<string, Watch>();

function endWatch(watch: Watch): void {
  if (watch.timer !== null) window.clearTimeout(watch.timer);
  if (watch.deadlineTimer !== null) window.clearTimeout(watch.deadlineTimer);
  ackWaiters.delete(watch.overlayId);
  watches.delete(watch.overlayId);
}

type Evaluation = {
  diag: RenderDiagnosis;
  windowId: string;
  entry: WindowEntry | undefined;
  windowsHidden: boolean;
};

/** Snapshot state and diagnose. Returns null when the overlay has been closed
 *  in the meantime — nothing to verify. */
function evaluate(store: WMApi, watch: Watch): Evaluation | null {
  const state = store.getState();
  if (!selectIsOverlayOpen(state, watch.overlayId, DEFAULT_INSTANCE_ID)) {
    return null;
  }
  const windowId = renderAcks.get(watch.overlayId) ?? watch.slug;
  const entry = state.windowManager.windows[windowId];
  return {
    diag: diagnoseOverlayRender({
      entry,
      windowsHidden: state.windowManager.windowsHidden,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }),
    windowId,
    entry,
    windowsHidden: state.windowManager.windowsHidden,
  };
}

function startWatch(
  store: WMApi,
  overlayId: string,
  slug: string,
  label: string,
): void {
  if (watches.has(overlayId)) return;
  const watch: Watch = { overlayId, slug, label, timer: null, deadlineTimer: null };
  watches.set(overlayId, watch);

  watch.timer = window.setTimeout(() => {
    watch.timer = null;
    const res = evaluate(store, watch);
    if (!res) return endWatch(watch); // closed meanwhile
    if (res.diag.ok) return endWatch(watch);

    if (res.diag.reason === "no-window-registered" && !renderAcks.has(overlayId)) {
      // No WindowPanel has mounted yet — indistinguishable from a lazy chunk
      // still loading (dev compile / slow fetch). Don't scream on a guess:
      // wait for the mount ack, bounded by the hard no-mount deadline.
      waitForMount(store, watch);
      return;
    }

    // Geometry exists (or an acked panel has bad geometry) — a real failure.
    scream(store, watch, res);
    endWatch(watch);
  }, CHECK_DELAY_MS);
}

/** The chunk-settle wait: resolve on `ackOverlayRender` (dynamic import done,
 *  WindowPanel mounted), or scream when the no-mount deadline expires. */
function waitForMount(store: WMApi, watch: Watch): void {
  const checkAfterAck = (delay: number, isRetry: boolean) => {
    watch.timer = window.setTimeout(() => {
      watch.timer = null;
      const res = evaluate(store, watch);
      if (!res) return endWatch(watch);
      if (res.diag.ok) return endWatch(watch);
      if (res.diag.reason === "no-window-registered" && !isRetry) {
        // Ack landed but registration hasn't committed yet — one short retry.
        checkAfterAck(ACK_SETTLE_RETRY_MS, true);
        return;
      }
      scream(store, watch, res);
      endWatch(watch);
    }, delay);
  };

  ackWaiters.set(watch.overlayId, () => {
    if (watch.deadlineTimer !== null) {
      window.clearTimeout(watch.deadlineTimer);
      watch.deadlineTimer = null;
    }
    checkAfterAck(ACK_SETTLE_MS, false);
  });

  watch.deadlineTimer = window.setTimeout(() => {
    watch.deadlineTimer = null;
    ackWaiters.delete(watch.overlayId);
    const res = evaluate(store, watch);
    if (!res) return endWatch(watch);
    if (res.diag.ok) return endWatch(watch);
    scream(store, watch, res);
    endWatch(watch);
  }, NO_MOUNT_DEADLINE_MS);
}

// LOUD recovery — screams in prod and dev (cheap, and makes the failure
// auditable from any user's DevTools), with a one-click self-heal. If the
// panel turns visible while the toast is still up (e.g. a chunk that beat the
// deadline by seconds), the toast is withdrawn automatically — the scream must
// only outlive a failure that is still real.
function scream(store: WMApi, watch: Watch, res: Evaluation): void {
  const { overlayId, label } = watch;
  const reason = res.diag.ok ? null : res.diag.reason;
  if (reason === null) return;

  console.error(
    `[window-panels] SILENT RENDER FAILURE — overlay "${overlayId}" was ` +
      `opened but no visible panel is on screen ` +
      `(reason: ${reason}). ${REASON_HINT[reason]}.`,
    {
      overlayId,
      windowId: res.windowId,
      entry: res.entry,
      windowsHidden: res.windowsHidden,
    },
  );

  const toastId = `window-watchdog-${overlayId}`;
  toast.error(`"${label}" didn't appear`, {
    id: toastId,
    description: "The panel was opened but isn't visible. Click to show it.",
    duration: TOAST_DURATION_MS,
    action: {
      label: "Show it",
      onClick: () =>
        store.dispatch(
          revealWindow({
            id: renderAcks.get(overlayId) ?? watch.slug,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          }),
        ),
    },
  });

  // Post-scream watcher: for the toast's lifetime, re-check visibility and
  // withdraw the toast the moment the panel is actually on screen (or the
  // overlay was closed — nothing left to heal either way).
  let elapsed = 0;
  const interval = window.setInterval(() => {
    elapsed += RECOVERY_POLL_MS;
    const check = evaluate(store, watch);
    if (check === null || check.diag.ok) {
      window.clearInterval(interval);
      toast.dismiss(toastId);
      if (check?.diag.ok) {
        console.info(
          `[window-panels] overlay "${overlayId}" became visible after the ` +
            `recovery scream — toast withdrawn. If this recurs, the pre-scream ` +
            `wait is ending too early for this panel.`,
        );
      }
      return;
    }
    if (elapsed >= TOAST_DURATION_MS) window.clearInterval(interval);
  }, RECOVERY_POLL_MS);
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
    startWatch(store, overlayId, meta.slug, meta.label ?? overlayId);

    return result;
  };
