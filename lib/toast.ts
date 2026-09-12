/**
 * lib/toast.ts — THE canonical toast module for this app.
 *
 * Two things live here:
 *
 * 1. HOST WIRING for @ai-matrx/kit/toast. The captured-sonner mechanics live
 *    in the package (`createMatrxToast`); this module wires it ONCE to the
 *    app's sonner and error-capture store. Import `toast` from HERE instead of
 *    "sonner" — a bare sonner import is INVISIBLE to the admin Error Inspector
 *    (the exact hole found in the marketing feature, 2026-07-20). The API is
 *    identical: `error` and `warning` additionally feed `captureError` (source
 *    "user-toast"); everything else passes straight through.
 *
 * 2. THE WALL CLOCK, and 3. THE RECORD-AWARE TOAST (`recordToast`) — the
 *    two halves of one law, below.
 *
 * 🚨 A TOAST MUST NOT OUTLIVE ITS MOMENT ON SCREEN (FIX-11b / FIX-R17 /
 * FIX-Q12, ruled at the shared layer 2026-09-11). Sonner (2.0.8, no opt-out)
 * PAUSES every toast's dismiss timer while the document is hidden — and an
 * agent browser pane, a background tab, or a second window all count as
 * hidden. So a toast reading «Saved "Acme intake"» can still be on screen
 * minutes later, after the SPA has navigated to a different record, after
 * that record was renamed, or after it was deleted. The sentence is then
 * simply false, and a screen that lies is forbidden outright. Verifiers walk
 * this app in a pane that is hidden the whole time, so on sonner's clock NO
 * toast they see would ever expire.
 *
 * THE RULE, in two tiers:
 *
 *   (b) EVERY toast raised through this module runs its dismiss timer on the
 *       WALL CLOCK. Sonner is handed `duration: Infinity` so its
 *       visibility-paused timer is out of the loop; ours fires at the
 *       requested duration (sonner's own 4 s default otherwise) whether the
 *       document is hidden or not. Hovering the toaster still defers, because
 *       a person reading a toast is not a stale toast. `toast.loading`,
 *       `toast.promise`, `toast.custom` and any caller passing
 *       `duration: Infinity` are untouched: they end when their caller says.
 *       This is what closes the class for the hundreds of existing call
 *       sites that name a record without an identity in scope.
 *
 *   (a) A toast whose text names a record is raised through `recordToast.*`
 *       with that record's identity (the `CONTEXT_MENU_ENTITY_KEY` shape —
 *       `{ type, id, title }` — is the platform's record reference, and it is
 *       the shape used here). On top of (b) such a toast:
 *       - is dismissed when the record is deleted or renamed — call
 *         `dismissRecordToasts(ref)` from the mutation that does it;
 *       - is dismissed the instant the record leaves the screen — the
 *         app-wide Toaster calls `dismissRecordToastsOffRoute(pathname)` on
 *         every route change, so «Created "A"» never sits on B's page even
 *         for the seconds its clock has left.
 *
 * Law 4 still holds (FIX-R16/R17): a failure with NO inline home keeps its
 * toast; a sentence that already has an inline home is never also toasted.
 * `recordToast.error` exists for exactly the first case.
 *
 * Guard: `pnpm check:record-toasts` (scripts/check-record-toasts.ts) fails on
 * any NEW template-literal `toast.success|error|info|warning` that names a
 * record outside this helper.
 *
 * Migration is opportunistic (boy-scout rule): when you touch a file that
 * imports toast from "sonner", switch it to `@/lib/toast`.
 */

import { toast as sonnerToast } from "sonner";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { createMatrxToast } from "@ai-matrx/kit/toast";

const captured = createMatrxToast({
  toast: sonnerToast,
  capture: captureError,
});

// ---------------------------------------------------------------------------
// The wall clock — shared by every toast this module raises
// ---------------------------------------------------------------------------

/**
 * The identity a record-naming toast carries. Deliberately the same shape as
 * `ContextMenuEntityRef` (`features/context-menu-v3/types.ts`,
 * `CONTEXT_MENU_ENTITY_KEY`) so a surface that already resolves a row's entity
 * for its context menu passes the SAME object here — one record reference for
 * the platform, not two.
 */
export interface ToastRecordRef {
  /** Entity type, e.g. "mandate", "note", "agent". */
  type: string;
  /** The record's id. */
  id: string;
  /** Human label, only for display/debugging. Never part of identity. */
  title?: string | null;
}

/** Sonner's returned handle. */
type ToastId = string | number;

/** The options bag callers may pass through to sonner. */
export type RecordToastOptions = Record<string, unknown> & {
  duration?: number;
};

/**
 * Sonner's own default. A toast keeps the same visible lifetime it always
 * had — the only difference is WHOSE clock runs it.
 */
const DEFAULT_TOAST_MS = 4000;

/** A person reading a toast is not a stale toast: re-check this often. */
const HOVER_DEFER_MS = 800;

interface LiveToast {
  toastId: ToastId;
  /** The record this toast names, or null for a toast that names none. */
  record: ToastRecordRef | null;
  /** Wall-clock instant the toast is due to go. */
  expiresAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Every toast this module raised that is (or may still be) on screen. */
const liveToasts = new Map<ToastId, LiveToast>();

const recordKey = (record: Pick<ToastRecordRef, "type" | "id">) =>
  `${record.type}::${record.id}`;

/**
 * 🚨 SONNER DEFERS EVERY DISMISSAL THROUGH requestAnimationFrame — TWICE
 * (`ToastState.dismiss` queues a frame, and the Toaster's subscriber queues a
 * second one before it marks the toast deleted; sonner 2.0.8
 * `dist/index.mjs`). A hidden document never runs an animation frame, so in a
 * background tab or an agent browser pane `toast.dismiss(id)` is accepted and
 * then simply never lands: the wall clock fired, and the toast stayed.
 * Measured live 2026-09-12 — a «Pinned Code» toast outlived a client-side
 * navigation by minutes with `document.hidden === true` and a frame callback
 * that never ran in 3 s. jsdom runs frames regardless of visibility, which is
 * why no unit test saw it until the double was made faithful.
 *
 * While the document is hidden there is nothing to animate and no batching to
 * protect, so the frames sonner asks for during a dismissal are run on the
 * spot. The shim is scoped to the dismiss call — every frame sonner requests
 * inside it runs synchronously, which is exactly the chain of two — and the
 * real `requestAnimationFrame` is back before the call returns. When the
 * document is visible sonner's own frames run and nothing here is touched.
 */
function dismissInSonner(toastId?: ToastId): void {
  const hidden = typeof document !== "undefined" && document.hidden;
  if (!hidden || typeof window === "undefined") {
    sonnerToast.dismiss(toastId);
    return;
  }
  const realRaf = window.requestAnimationFrame;
  const realCaf = window.cancelAnimationFrame;
  // Ids handed out for frames we ran on the spot; cancelling one is a no-op.
  let immediateFrameId = -1;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(performance.now());
    return immediateFrameId--;
  };
  window.cancelAnimationFrame = (id: number) => {
    if (id >= 0) realCaf.call(window, id);
  };
  try {
    sonnerToast.dismiss(toastId);
  } finally {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCaf;
  }
}

function forget(toastId: ToastId) {
  const entry = liveToasts.get(toastId);
  if (entry?.timer) clearTimeout(entry.timer);
  liveToasts.delete(toastId);
}

/** True while the pointer is over the toaster, so dismissal would be rude. */
function toasterIsHovered(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return !!document.querySelector("[data-sonner-toaster]:hover");
  } catch {
    return false;
  }
}

function arm(entry: LiveToast) {
  const remaining = Math.max(0, entry.expiresAt - Date.now());
  entry.timer = setTimeout(() => {
    entry.timer = null;
    if (toasterIsHovered()) {
      entry.expiresAt = Date.now() + HOVER_DEFER_MS;
      arm(entry);
      return;
    }
    forget(entry.toastId);
    dismissInSonner(entry.toastId);
  }, remaining);
  // A background tab throttles timers to ~1/minute but never stops them, and
  // `sweepExpiredToasts()` (called by the Toaster on visibilitychange)
  // closes that gap the instant anyone looks.
}

/**
 * Dismiss every toast whose wall-clock lifetime has already run out. Called by
 * the app-wide Toaster when the document becomes visible, because a throttled
 * background timer may be up to a minute late.
 */
export function sweepExpiredToasts(now: number = Date.now()): number {
  let dismissed = 0;
  for (const entry of [...liveToasts.values()]) {
    if (entry.expiresAt > now) continue;
    forget(entry.toastId);
    dismissInSonner(entry.toastId);
    dismissed += 1;
  }
  return dismissed;
}

/**
 * Dismiss every live toast naming this record. Call it from the mutation that
 * DELETES or RENAMES the record — the old sentence stops being true at that
 * instant, and a toast is the courtesy, never the record.
 *
 * Returns how many toasts went, so a caller can assert it.
 */
export function dismissRecordToasts(
  record: Pick<ToastRecordRef, "type" | "id">,
): number {
  const key = recordKey(record);
  let dismissed = 0;
  for (const entry of [...liveToasts.values()]) {
    if (!entry.record || recordKey(entry.record) !== key) continue;
    forget(entry.toastId);
    dismissInSonner(entry.toastId);
    dismissed += 1;
  }
  return dismissed;
}

/**
 * Is this record what the new route is showing?
 *
 * A record's route names it in a path SEGMENT — by id on most surfaces, by a
 * human key on the ones that route by key (`/administration/mandates/
 * matrx.demo.intake`). So both are accepted, and only as a whole decoded
 * segment: a substring test would keep a toast alive on any URL that merely
 * contained the word, which is the false sentence this whole mechanism exists
 * to prevent.
 */
function routeStillShows(record: ToastRecordRef, pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  if (record.id && segments.includes(record.id)) return true;
  return !!record.title && segments.includes(record.title);
}

/**
 * Dismiss every record toast whose record is not on the route we just landed
 * on. Navigating deeper into A keeps A's toast; navigating to B (or back to a
 * list) drops it. No per-feature wiring: the URL already names the record.
 *
 * Called by the app-wide Toaster on every pathname change.
 */
export function dismissRecordToastsOffRoute(pathname: string): number {
  let dismissed = 0;
  for (const entry of [...liveToasts.values()]) {
    if (!entry.record || routeStillShows(entry.record, pathname)) continue;
    forget(entry.toastId);
    dismissInSonner(entry.toastId);
    dismissed += 1;
  }
  return dismissed;
}

/**
 * Drop every tracked toast at once. The Toaster's hidden-tab backlog sweep
 * calls this: it clears sonner AND this registry in the same breath, so no
 * entry outlives a toast that is already off screen.
 */
export function dismissAllTrackedToasts(): number {
  let dismissed = 0;
  for (const entry of [...liveToasts.values()]) {
    forget(entry.toastId);
    dismissInSonner(entry.toastId);
    dismissed += 1;
  }
  return dismissed;
}

/** Test/debug seam: the records that currently have a live toast. */
export function liveRecordToastRefs(): ToastRecordRef[] {
  return [...liveToasts.values()].flatMap((e) => (e.record ? [e.record] : []));
}

/** Test/debug seam: how many toasts of any kind this module is timing. */
export function liveTrackedToastCount(): number {
  return liveToasts.size;
}

/** Sonner's emitting signature — what every wrapped method looks like. */
type Emit = (message: unknown, options?: RecordToastOptions) => ToastId;

/**
 * Raise a toast through `emit` on OUR clock. Sonner is told `Infinity` so its
 * visibility-paused timer never runs; ours fires at the requested lifetime
 * (or sonner's 4 s default). `duration: Infinity` from the caller means "this
 * one stays until something withdraws it" — then no timer is armed and the
 * instant it is due is Infinity too, so no sweep ever takes it.
 */
function track(
  emit: Emit,
  message: unknown,
  options: RecordToastOptions | undefined,
  record: ToastRecordRef | null,
): ToastId {
  const requested = options?.duration;
  const lifetimeMs =
    requested === Infinity
      ? Infinity
      : typeof requested === "number" && Number.isFinite(requested)
        ? requested
        : DEFAULT_TOAST_MS;

  // "Sonner, don't you time this" — not "forever".
  const passthrough: RecordToastOptions = { ...options, duration: Infinity };

  const previousDismiss = options?.onDismiss as ((t: unknown) => void) | undefined;
  const previousAutoClose = options?.onAutoClose as
    | ((t: unknown) => void)
    | undefined;

  let toastId: ToastId = "";
  passthrough.onDismiss = (t: unknown) => {
    forget(toastId);
    previousDismiss?.(t);
  };
  passthrough.onAutoClose = (t: unknown) => {
    forget(toastId);
    previousAutoClose?.(t);
  };

  toastId = emit(message, passthrough);

  const entry: LiveToast = {
    toastId,
    record,
    expiresAt: Date.now() + lifetimeMs,
    timer: null,
  };
  liveToasts.set(toastId, entry);
  if (requested !== Infinity) arm(entry);
  return toastId;
}

/** Wrap one sonner method onto the wall clock; leave a missing one missing. */
function onWallClock(emit: Emit | undefined) {
  if (typeof emit !== "function") return undefined;
  return (message: unknown, options?: RecordToastOptions) =>
    track(emit, message, options, null);
}

type MatrxToast = typeof captured.toast;

/**
 * THE `toast` everyone imports. Identical API to sonner's, with three changes
 * that are the whole point of this module: error/warning reach the Error
 * Inspector (the kit wrapper), every timed toast runs on the wall clock (tier
 * (b) above), and `dismiss()` keeps this registry honest.
 */
export const toast: MatrxToast = Object.assign(
  ((message: unknown, options?: RecordToastOptions) =>
    track(captured.toast as unknown as Emit, message, options, null)) as unknown as MatrxToast,
  captured.toast,
  {
    success: onWallClock(captured.toast.success as unknown as Emit),
    error: onWallClock(captured.toast.error as unknown as Emit),
    info: onWallClock(captured.toast.info as unknown as Emit),
    warning: onWallClock(captured.toast.warning as unknown as Emit),
    message: onWallClock(captured.toast.message as unknown as Emit),
    dismiss: (id?: ToastId) => {
      if (id === undefined) {
        for (const entry of [...liveToasts.values()]) forget(entry.toastId);
      } else {
        forget(id);
      }
      dismissInSonner(id);
      return id;
    },
  },
);

/** An error toast whose error was already captured upstream — same clock. */
export const toastErrorAlreadyCaptured: typeof captured.toastErrorAlreadyCaptured = (
  message,
  options,
) =>
  track(
    captured.toastErrorAlreadyCaptured as unknown as Emit,
    message,
    options as RecordToastOptions | undefined,
    null,
  );

// ---------------------------------------------------------------------------
// Record-aware toasts — tier (a)
// ---------------------------------------------------------------------------

type RecordToastKind = "success" | "error" | "info" | "warning" | "message";

function raise(
  kind: RecordToastKind,
  record: ToastRecordRef,
  message: string,
  options?: RecordToastOptions,
): ToastId {
  const emit = (captured.toast as unknown as Record<RecordToastKind, Emit>)[kind];
  return track(emit, message, options, record);
}

/**
 * Raise a toast that NAMES a record. Every call carries the record's identity,
 * which is what lets the toast be withdrawn when the sentence stops being true.
 *
 * ```ts
 * recordToast.success(
 *   { type: "mandate", id: row.id, title: row.mandateKey },
 *   `Created "${row.mandateKey}"`,
 * );
 * ```
 */
export const recordToast = {
  success: (r: ToastRecordRef, m: string, o?: RecordToastOptions) =>
    raise("success", r, m, o),
  error: (r: ToastRecordRef, m: string, o?: RecordToastOptions) =>
    raise("error", r, m, o),
  info: (r: ToastRecordRef, m: string, o?: RecordToastOptions) =>
    raise("info", r, m, o),
  warning: (r: ToastRecordRef, m: string, o?: RecordToastOptions) =>
    raise("warning", r, m, o),
  message: (r: ToastRecordRef, m: string, o?: RecordToastOptions) =>
    raise("message", r, m, o),
};
