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
 *       document is hidden or not. A HELD toast never closes (pointer over
 *       the toaster, focus inside it, or its copy menu open) and its full
 *       lifetime restarts when the hold ends — see `toasterIsHeld`. Error and
 *       warning toasts last at least `MIN_ERROR_TOAST_MS`. `toast.loading`,
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
import {
  isOrganizationSelectionCancelled,
  organizationSelectionCancelledWithin,
  WORKSPACE_REFUSAL_PATTERN,
  workspaceNeededAnnouncedWithin,
} from "@/lib/organization/selection-cancelled";
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

/**
 * 🚨 AN ERROR STAYS LONG ENOUGH TO READ (Arman, 2026-09-28: "errors aren't
 * like positive things. They need to remain for 5 seconds min."). Error and
 * warning toasts never leave sooner than this, whatever the caller asked.
 */
export const MIN_ERROR_TOAST_MS = 5000;

/** A person reading a toast is not a stale toast: re-check this often. */
const HOVER_DEFER_MS = 800;

interface LiveToast {
  toastId: ToastId;
  /** The record this toast names, or null for a toast that names none. */
  record: ToastRecordRef | null;
  /** Wall-clock instant the toast is due to go. */
  expiresAt: number;
  /** The full lifetime — what the clock restarts at after a hold ends. */
  lifetimeMs: number;
  /** A hold (hover, focus, an open copy menu) was seen and has not yet ended. */
  held: boolean;
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
 * that never ran in 3 s. jsdom runs frames whether or not the page is shown, which is
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

/**
 * 🚨 A DISMISSAL NEVER OVERTAKES THE TOAST IT DISMISSES. Sonner 2.0.8's Toaster
 * ADDS a toast on a `setTimeout(0)` but REMOVES it through requestAnimationFrame
 * (two of them). When a frame runs before that timer — a busy page, a fast
 * `const id = toast.loading(…); await quickWork(); toast.dismiss(id)` — the
 * removal finds nothing, the add lands after it, and the toast stays on screen
 * forever over whatever it covers (measured live 2026-09-28: the note editor's
 * "Preparing the latest note for editing…" sat over the Publish HTML dialog's
 * Save button). A dismissal of a known id is therefore queued behind every add
 * already scheduled (timers run in order); a toast created again with the same
 * id before it lands cancels it, as sonner itself does.
 */
const queuedDismissals = new Map<ToastId, ReturnType<typeof setTimeout>>();

function cancelQueuedDismissal(toastId: ToastId | undefined): void {
  if (toastId === undefined) return;
  const timer = queuedDismissals.get(toastId);
  if (timer === undefined) return;
  clearTimeout(timer);
  queuedDismissals.delete(toastId);
}

function queueDismissal(toastId: ToastId): void {
  cancelQueuedDismissal(toastId);
  queuedDismissals.set(
    toastId,
    setTimeout(() => {
      queuedDismissals.delete(toastId);
      dismissInSonner(toastId);
    }, 0),
  );
}

function forget(toastId: ToastId) {
  const entry = liveToasts.get(toastId);
  if (entry?.timer) clearTimeout(entry.timer);
  liveToasts.delete(toastId);
}

/**
 * 🚨 A TOAST SOMEONE IS HOLDING NEVER CLOSES (Arman, 2026-09-28: "if you hover
 * it, it cannot close while you're hovering, and in fact, the timer to close
 * must restart back each time you hover it again"). Held means: the pointer is
 * over the toaster, keyboard focus is inside it, or a menu opened from a toast
 * is still open — the Alchemy copy menu renders in a portal OUTSIDE the
 * toaster, so a pointer inside that menu is not over the toaster, and without
 * this the toast (and the menu with it) vanished mid-copy.
 */
/** Set by the Toaster's pointer/focus listeners — the hold as the events saw it. */
let heldByPointer = false;

/** True while the Toaster's listeners hold the toasts. */
export function toastsHeldByPointer(): boolean {
  return heldByPointer;
}

export function toasterIsHeld(): boolean {
  if (heldByPointer) return true;
  if (typeof document === "undefined") return false;
  try {
    // Sonner draws one stack per screen position — every one of them counts.
    for (const toaster of document.querySelectorAll("[data-sonner-toaster]")) {
      if (toaster.matches(":hover") || toaster.querySelector(":hover")) return true;
      // KEYBOARD focus only: a mouse click leaves focus on the clicked button
      // (and a closing menu hands it back to its trigger), which would hold
      // every toast until the person clicked somewhere else.
      if (toaster.querySelector(":focus-visible")) return true;
      // A menu opened from a toast (a popup trigger reporting itself open) —
      // never a mere collapsible, which is content, not a hold.
      if (toaster.querySelector('[aria-haspopup]:not([aria-haspopup="false"])[aria-expanded="true"]')) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Restart one toast's clock at its FULL lifetime. */
function restart(entry: LiveToast) {
  if (entry.lifetimeMs === Infinity) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.held = false;
  entry.expiresAt = Date.now() + entry.lifetimeMs;
  arm(entry);
}

/** The pointer (or focus) arrived on the toaster: every live toast is held. */
export function holdTrackedToasts(): void {
  heldByPointer = true;
  for (const entry of liveToasts.values()) {
    if (entry.lifetimeMs === Infinity) continue;
    entry.held = true;
    entry.expiresAt = Infinity;
  }
}

/**
 * The pointer left the toaster. If nothing else still holds it (an open copy
 * menu, focus inside), every held toast starts its full lifetime again.
 */
export function releaseTrackedToasts(): void {
  heldByPointer = false;
  if (toasterIsHeld()) return;
  for (const entry of [...liveToasts.values()]) {
    if (entry.held) restart(entry);
  }
}

function arm(entry: LiveToast) {
  const remaining = Math.max(0, entry.expiresAt - Date.now());
  entry.timer = setTimeout(
    () => {
      entry.timer = null;
      if (entry.held || toasterIsHeld()) {
        if (toasterIsHeld()) {
          // Still held: look again shortly, never close.
          entry.held = true;
          entry.expiresAt = Infinity;
          entry.timer = setTimeout(() => {
            entry.timer = null;
            arm(entry);
          }, HOVER_DEFER_MS);
          return;
        }
        // The hold ended without a pointerleave (a menu closed, focus moved):
        // the full lifetime starts again.
        restart(entry);
        return;
      }
      forget(entry.toastId);
      dismissInSonner(entry.toastId);
    },
    Number.isFinite(remaining) ? remaining : HOVER_DEFER_MS,
  );
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
    if (entry.expiresAt > now || entry.held) continue;
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
 * human key on the ones that route by key (`/administration/intelligence/mandates/
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
  heldByPointer = false;
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

/** Where a toast that stays until dismissed is raised — clear of action rows. */
export const PERSISTENT_TOAST_POSITION = "top-center" as const;

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
  minimumMs = 0,
): ToastId {
  const requested = options?.duration;
  const asked =
    requested === Infinity
      ? Infinity
      : typeof requested === "number" && Number.isFinite(requested)
        ? requested
        : DEFAULT_TOAST_MS;
  const lifetimeMs = minimumMs > 0 ? Math.max(asked, minimumMs) : asked;

  // "Sonner, don't you time this" — not "forever".
  const passthrough: RecordToastOptions = { ...options, duration: Infinity };
  // 🚨 A TOAST THAT STAYS UNTIL DISMISSED NEVER PARKS OVER AN ACTION ROW
  // (cold walk 22, friction). The duplicate-name notice stays until she closes
  // it, and at the Toaster's bottom-right it sat for as long as it stayed over
  // the interview drawer's footer — "Start the interview" and the sentence
  // beside it. Bottom-right is where every docked panel, sticky footer and
  // phone action bar puts its primary control, so a toast that will not leave
  // on its own is raised at the top instead. A caller that names a position
  // keeps it; timed toasts are untouched (they leave on their own).
  if (requested === Infinity && options?.position === undefined) {
    passthrough.position = PERSISTENT_TOAST_POSITION;
  }

  const previousDismiss = options?.onDismiss as ((t: unknown) => void) | undefined;
  const previousAutoClose = options?.onAutoClose as
    | ((t: unknown) => void)
    | undefined;

  cancelQueuedDismissal(options?.id as ToastId | undefined);
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
  // Re-raised under the same id: the old entry's timer must not later dismiss
  // (or keep re-arming for) the refreshed toast.
  const previous = liveToasts.get(toastId);
  if (previous?.timer) clearTimeout(previous.timer);

  const entry: LiveToast = {
    toastId,
    record,
    expiresAt: Date.now() + lifetimeMs,
    lifetimeMs,
    held: false,
    timer: null,
  };
  liveToasts.set(toastId, entry);
  if (requested !== Infinity) arm(entry);
  return toastId;
}

/**
 * 🚨 CLOSING THE ORGANIZATION PICKER IS NOT AN ERROR (ORG-GATE-AUDIT). The
 * gate rejects the held action with `OrganizationSelectionCancelled` so the
 * action stops — and every caller's ordinary catch then toasts what it caught.
 * This is the ONE boundary that turns that into "nothing happened": an
 * error/warning toast whose title or description IS the cancellation, or whose
 * title is empty (the cancellation carries no text, so `toast.error(err.message)`
 * arrives here as ""), is never raised and never filed in the Error Inspector.
 * An error toast with no words is never an honest toast anyway.
 */
function isSilentNotice(message: unknown, options?: RecordToastOptions): boolean {
  // The backstop already said it, with the remedy: a caller repeating the
  // transport's "Select an organization…" sentence adds nothing.
  if (workspaceNeededAnnouncedWithin(5_000)) {
    const text = `${typeof message === "string" ? message : ""} ${typeof options?.description === "string" ? options.description : ""}`;
    if (WORKSPACE_REFUSAL_PATTERN.test(text)) return true;
  }
  if (isOrganizationSelectionCancelled(message)) return true;
  if (isOrganizationSelectionCancelled(options?.description)) return true;
  if (typeof message === "string" && message.trim() === "") return true;
  // A caller's own title over the cancellation's empty text, raised in the
  // same breath as the cancellation. Never read without both conditions.
  return (
    options?.description === "" && organizationSelectionCancelledWithin(5_000)
  );
}

/** Wrap one sonner method onto the wall clock; leave a missing one missing. */
function onWallClock(emit: Emit | undefined, dropsSilentNotices = false, minimumMs = 0) {
  if (typeof emit !== "function") return undefined;
  return (message: unknown, options?: RecordToastOptions) =>
    dropsSilentNotices && isSilentNotice(message, options)
      ? ("" as ToastId)
      : track(emit, message, options, null, minimumMs);
}

type MatrxToast = typeof captured.toast;

/**
 * 🚨 EVERY ERROR TOAST CARRIES THE ALCHEMY MENU. An error toast is an error on
 * screen, and every error on screen hands an AI the sentence, the operation,
 * the page's surface and its declared values (`components/errors/`). The menu
 * is a React component and this module is imported by non-React code, so the
 * app-wide Toaster registers it here once (`components/ui/sonner.tsx`); until it
 * does (tests, a server import) error toasts are raised unchanged. A caller's
 * own `action` / `cancel` is never displaced: the menu takes the first free
 * slot, and a toast whose two slots are both taken keeps them.
 */
export type ErrorToastDecorator = (
  message: string,
  options: RecordToastOptions | undefined,
  record: ToastRecordRef | null,
) => RecordToastOptions | undefined;

let errorToastDecorator: ErrorToastDecorator | null = null;

export function setErrorToastDecorator(decorator: ErrorToastDecorator | null): void {
  errorToastDecorator = decorator;
}

function decorateError(
  message: unknown,
  options: RecordToastOptions | undefined,
  record: ToastRecordRef | null,
): RecordToastOptions | undefined {
  if (!errorToastDecorator || typeof message !== "string") return options;
  try {
    return errorToastDecorator(message, options, record);
  } catch {
    return options;
  }
}

/** The error twin of `onWallClock`: silent notices dropped, Alchemy attached. */
function errorOnWallClock(emit: Emit | undefined) {
  if (typeof emit !== "function") return undefined;
  return (message: unknown, options?: RecordToastOptions) =>
    isSilentNotice(message, options)
      ? ("" as ToastId)
      : track(emit, message, decorateError(message, options, null), null, MIN_ERROR_TOAST_MS);
}

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
    error: errorOnWallClock(captured.toast.error as unknown as Emit),
    info: onWallClock(captured.toast.info as unknown as Emit),
    warning: onWallClock(captured.toast.warning as unknown as Emit, true, MIN_ERROR_TOAST_MS),
    message: onWallClock(captured.toast.message as unknown as Emit),
    // A loading toast re-created under the same id replaces the queued removal.
    loading: ((message: unknown, options?: RecordToastOptions) => {
      cancelQueuedDismissal(options?.id as ToastId | undefined);
      return (captured.toast.loading as unknown as Emit)(message, options);
    }) as typeof captured.toast.loading,
    dismiss: (id?: ToastId) => {
      if (id === undefined) {
        for (const entry of [...liveToasts.values()]) forget(entry.toastId);
        for (const pending of [...queuedDismissals.keys()]) cancelQueuedDismissal(pending);
        dismissInSonner(undefined);
        return id;
      }
      forget(id);
      queueDismissal(id);
      return id;
    },
  },
);

/** An error toast whose error was already captured upstream — same clock. */
export const toastErrorAlreadyCaptured: typeof captured.toastErrorAlreadyCaptured = (
  message,
  options,
) =>
  isSilentNotice(message, options as RecordToastOptions | undefined)
    ? ("" as ToastId)
    : track(
    captured.toastErrorAlreadyCaptured as unknown as Emit,
    message,
    decorateError(message, options as RecordToastOptions | undefined, null),
    null,
    MIN_ERROR_TOAST_MS,
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
  return track(
    emit,
    message,
    kind === "error" ? decorateError(message, options, record) : options,
    record,
    kind === "error" || kind === "warning" ? MIN_ERROR_TOAST_MS : 0,
  );
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
