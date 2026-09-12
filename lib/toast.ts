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
 * 2. THE RECORD-AWARE TOAST (`recordToast`) — see the law below.
 *
 * 🚨 A TOAST THAT NAMES A RECORD MUST NOT OUTLIVE THAT RECORD ON SCREEN
 * (FIX-R17 / FIX-Q12). Sonner PAUSES a toast's dismiss timer while the
 * document is hidden — and an agent browser pane, a background tab, or a
 * second window all count as hidden. So a toast reading «Saved "Acme intake"»
 * can still be on screen minutes later, after the SPA has navigated to a
 * different record, after that record was renamed, or after it was deleted.
 * The sentence is then simply false, and a screen that lies is forbidden
 * outright. `components/ui/sonner.tsx` sweeps the whole backlog when a hidden
 * tab returns, but that sweep is record-BLIND: it cannot dismiss A's toast
 * when the user client-side-navigates from A to B in a tab that never went
 * hidden.
 *
 * THE RULE: any toast whose text names a record is raised through
 * `recordToast.*` with that record's identity (the `CONTEXT_MENU_ENTITY_KEY`
 * shape — `{ type, id, title }` — is the platform's record reference, and it
 * is the shape used here). Such a toast:
 *   - runs its dismiss timer on the WALL CLOCK, so a hidden document cannot
 *     freeze it (hovering the toaster still defers, because a person reading
 *     a toast is not a stale toast);
 *   - is dismissed when the record is deleted or renamed — call
 *     `dismissRecordToasts(ref)` from the mutation that does it;
 *   - is dismissed when the record leaves the screen — the app-wide Toaster
 *     calls `dismissRecordToastsOffRoute(pathname)` on every route change.
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

export const { toast, toastErrorAlreadyCaptured } = createMatrxToast({
  toast: sonnerToast,
  capture: captureError,
});

// ---------------------------------------------------------------------------
// Record-aware toasts
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
 * Sonner's own default. A record toast uses the same visible lifetime — the
 * only difference is WHOSE clock runs it.
 */
const DEFAULT_RECORD_TOAST_MS = 4000;

/** A person reading a toast is not a stale toast: re-check this often. */
const HOVER_DEFER_MS = 800;

interface LiveRecordToast {
  toastId: ToastId;
  record: ToastRecordRef;
  /** Wall-clock instant the toast is due to go. */
  expiresAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const liveRecordToasts = new Map<ToastId, LiveRecordToast>();

const recordKey = (record: Pick<ToastRecordRef, "type" | "id">) =>
  `${record.type}::${record.id}`;

function forget(toastId: ToastId) {
  const entry = liveRecordToasts.get(toastId);
  if (entry?.timer) clearTimeout(entry.timer);
  liveRecordToasts.delete(toastId);
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

function arm(entry: LiveRecordToast) {
  const remaining = Math.max(0, entry.expiresAt - Date.now());
  entry.timer = setTimeout(() => {
    entry.timer = null;
    if (toasterIsHovered()) {
      entry.expiresAt = Date.now() + HOVER_DEFER_MS;
      arm(entry);
      return;
    }
    forget(entry.toastId);
    sonnerToast.dismiss(entry.toastId);
  }, remaining);
  // A background tab throttles timers to ~1/minute but never stops them, and
  // `sweepExpiredRecordToasts()` (called by the Toaster on visibilitychange)
  // closes that gap the instant anyone looks.
}

/**
 * Dismiss every record toast whose wall-clock lifetime has already run out.
 * Called by the app-wide Toaster when the document becomes visible, because a
 * throttled background timer may be up to a minute late.
 */
export function sweepExpiredRecordToasts(now: number = Date.now()): number {
  let dismissed = 0;
  for (const entry of [...liveRecordToasts.values()]) {
    if (entry.expiresAt > now) continue;
    forget(entry.toastId);
    sonnerToast.dismiss(entry.toastId);
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
  for (const entry of [...liveRecordToasts.values()]) {
    if (recordKey(entry.record) !== key) continue;
    forget(entry.toastId);
    sonnerToast.dismiss(entry.toastId);
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
  for (const entry of [...liveRecordToasts.values()]) {
    if (routeStillShows(entry.record, pathname)) continue;
    forget(entry.toastId);
    sonnerToast.dismiss(entry.toastId);
    dismissed += 1;
  }
  return dismissed;
}

/**
 * Drop every record toast at once. The Toaster's hidden-tab backlog sweep
 * calls `toast.dismiss()`, which clears sonner but would otherwise leave this
 * registry holding records whose toasts are already off screen — so the sweep
 * calls this in the same breath.
 */
export function dismissAllRecordToasts(): number {
  let dismissed = 0;
  for (const entry of [...liveRecordToasts.values()]) {
    forget(entry.toastId);
    sonnerToast.dismiss(entry.toastId);
    dismissed += 1;
  }
  return dismissed;
}

/** Test/debug seam: the records that currently have a live toast. */
export function liveRecordToastRefs(): ToastRecordRef[] {
  return [...liveRecordToasts.values()].map((e) => e.record);
}

type RecordToastKind = "success" | "error" | "info" | "warning" | "message";

function raise(
  kind: RecordToastKind,
  record: ToastRecordRef,
  message: string,
  options?: RecordToastOptions,
): ToastId {
  const requested = options?.duration;
  // `duration: Infinity` from a caller means "this one stays until something
  // withdraws it" — it must not then be swept by wall-clock expiry, so the
  // instant it is due is Infinity too, not the default.
  const lifetimeMs =
    requested === Infinity
      ? Infinity
      : typeof requested === "number" && Number.isFinite(requested)
        ? requested
        : DEFAULT_RECORD_TOAST_MS;

  // Sonner's own timer is the thing that freezes while the document is
  // hidden, so it is taken out of the loop entirely and replaced by ours.
  // `Infinity` here means "sonner, don't you time this" — not "forever".
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

  const emit =
    kind === "success"
      ? toast.success
      : kind === "error"
        ? toast.error
        : kind === "info"
          ? toast.info
          : kind === "warning"
            ? toast.warning
            : toast.message;
  toastId = emit(message, passthrough);

  const entry: LiveRecordToast = {
    toastId,
    record,
    expiresAt: Date.now() + lifetimeMs,
    timer: null,
  };
  liveRecordToasts.set(toastId, entry);
  if (requested !== Infinity) arm(entry);
  return toastId;
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
