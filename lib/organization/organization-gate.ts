/**
 * The organization gate — "you have no organization selected" stops being a
 * dead end and becomes a question with an answer.
 *
 * THE PROBLEM THIS EXISTS FOR
 * ---------------------------
 * Every write in this platform is organization-scoped, and there are exactly
 * two ways a client can behave when no organization is selected:
 *
 *   1. **Refuse.** `requireOrganizationContext` throws
 *      `organization_context_required`. Correct, and useless on its own: the
 *      person is told to go do something else, somewhere else, and come back.
 *   2. **Guess.** Fall back to the own organization. Silent, convenient, and
 *      the source of the 2026-08-30 incident — an upload landed in a personal
 *      workspace nobody had chosen, then collided with the team organization
 *      the person actually picked a minute later.
 *
 * Both are wrong because both answer a question only the PERSON can answer.
 * This module adds the third option: **ask, then continue.** The blocked action
 * is not abandoned and not guessed at — it waits, the person chooses, the
 * choice becomes the active organization globally, and the original action
 * proceeds with it, stamped exactly where it would have been stamped anyway.
 * Cancelling puts them back precisely where they were, with nothing written.
 *
 * WHERE IT RUNS
 * -------------
 * At the ASYNC action boundaries, never scattered through feature code:
 *
 *   * `callApi` — every REST call in the app: a WRITE the person just pressed
 *     (a click/tap, Enter/Space on a control, or a modifier shortcut —
 *     `personJustActed`; never plain typing) asks; a background write and
 *     every read do not (2026-09-26; before that it never asked).
 *   * `cloudUpload` — every file upload, both transports.
 *   * the AI execution thunks — the one path that does not go through callApi.
 *
 * The synchronous kernel (`requireOrganizationContext`) is untouched and stays
 * the fail-closed last line: this resolves the value BEFORE the assert runs, so
 * the assert still has nothing to be lenient about.
 *
 * WHAT IT IS NOT
 * --------------
 * Not a fallback ladder. It never picks an organization on the person's behalf
 * — not personal, not "the first one", not "the last used". If it cannot ask
 * (no browser, no store, no picker mounted) it re-throws the original
 * fail-closed error, exactly as before.
 */

import { adminLaneOrganizationId } from "@/lib/api/admin-lane";
import {
  OrganizationContextError,
  requireOrganizationContext,
} from "@/lib/api/organization-context";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import type { RootState } from "@/lib/redux/store";
import type { OrganizationRequiredWireMembership } from "@/lib/organizations/organizationRequiredError";

// The person closed the picker without choosing: an answer ("not now"), never
// a failure. Defined once in ./selection-cancelled (dependency-free, so the
// toast layer can recognise and drop it at the boundary) and re-exported here
// so every existing import keeps working.
import {
  markWorkspaceNeededAnnounced,
  organizationSelectionCancelledWithin,
  OrganizationSelectionCancelled,
  isOrganizationSelectionCancelled,
} from "./selection-cancelled";
export { OrganizationSelectionCancelled, isOrganizationSelectionCancelled };

// ---------------------------------------------------------------------------
// The bridge between an imperative `await` and a declarative overlay
// ---------------------------------------------------------------------------
//
// The picker is a normal Redux-driven overlay: something dispatches
// `openOverlay`, `OverlaySurface` renders it. But the caller here needs a
// PROMISE. This registry is the seam — the opener parks a resolver, the picker
// component calls `settleOrganizationSelection` when the person acts.
//
// One pending request at a time, deliberately: two blocked actions racing must
// ask ONE question and both continue on the single answer, never stack two
// dialogs on top of each other.

type Settle = (organizationId: string | null) => void;

let pending: { promise: Promise<string | null>; settle: Settle } | null = null;

/**
 * The choices the CALLER's own refusal already carried
 * (`details.organizations` — see `organizationRequiredError.ts`'s
 * `extractOrganizationHoldMemberships`), for the pending request only. `null`
 * means "no refusal handed us a list" — the dialog falls back to its own
 * membership fetch exactly as it always has. Cleared the instant the request
 * settles so a later, list-less request never inherits a stale one.
 */
let prefetchedOrganizationsForPending: OrganizationRequiredWireMembership[] | null =
  null;

/** Set by the app shell once the picker overlay is mounted and reachable. */
let openPicker: (() => void) | null = null;

/**
 * Register the function that opens the picker overlay. Called once by the
 * gate's host component. Until this runs, the gate cannot ask, and therefore
 * refuses rather than guessing.
 */
export function registerOrganizationPicker(open: (() => void) | null): void {
  openPicker = open;
  if (open) {
    const waiting = pickerWaiters;
    pickerWaiters = [];
    for (const wake of waiting) wake();
  }
}

/**
 * THE PICKER IS ON ITS WAY, NOT ABSENT. The picker lives in the deferred singleton tree, which
 * mounts only once the page has gone idle — seconds after a heavy page hydrates. A press in that
 * window (Build on /applets/build, 2026-10-07, lane P) used to be refused outright with "Select an
 * organization before sending this request." while the picker was about to exist. The shell that
 * owns the deferred tree registers how to mount it NOW; the gate asks for that and waits for the
 * picker, bounded, instead of refusing.
 */
let mountPickerNow: (() => void) | null = null;
let pickerWaiters: Array<() => void> = [];

/** How long a press waits for the picker the shell is mounting before it refuses. */
const PICKER_MOUNT_WAIT_MS = 15_000;

/** Called by the shell that renders the deferred tree (`app/DeferredSingletonWrapper.tsx`). */
export function registerOrganizationPickerHost(mountNow: (() => void) | null): void {
  mountPickerNow = mountNow;
}

/** True once the picker can open — immediately, or after the shell mounted it within the bound. */
async function pickerReady(): Promise<boolean> {
  if (isOrganizationPickerAvailable()) return true;
  if (typeof window === "undefined" || !mountPickerNow) return false;
  return new Promise<boolean>((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      pickerWaiters = pickerWaiters.filter((w) => w !== wake);
      resolve(isOrganizationPickerAvailable());
    }, PICKER_MOUNT_WAIT_MS);
    pickerWaiters.push(wake);
    mountPickerNow?.();
  });
}

export function isOrganizationPickerAvailable(): boolean {
  return typeof openPicker === "function";
}

/** True while a selection is being awaited — the picker reads this to stay open. */
export function hasPendingOrganizationRequest(): boolean {
  return pending !== null;
}

/** The marker the workspace picker carries, so a layer beneath it can tell. */
export const ORGANIZATION_GATE_ATTRIBUTE = "data-organization-gate";

/**
 * HELD AND SET, for whatever is open beneath the picker. The picker opens on
 * top of the popover / dialog whose action asked for it; clicking or focusing
 * the picker is "outside" that layer, and closing it would abandon the very
 * action the choice is for. A layer's `onInteractOutside` / `onFocusOutside`
 * calls this and keeps itself open (`event.preventDefault()`) when it is true:
 * a choice is being awaited, or the event came from inside the picker.
 */
export function isOrganizationGateInteraction(event: { target: EventTarget | null }): boolean {
  if (pending !== null) return true;
  const target = event.target;
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    target.closest(`[${ORGANIZATION_GATE_ATTRIBUTE}]`) !== null
  );
}

/**
 * The pending request's prefetched choices, if its caller's refusal carried
 * any — the dialog reads this to render immediately instead of waiting on its
 * own membership fetch. `null` when none were handed in (falls back to the
 * dialog's own fetch, exactly as before this existed).
 */
export function getPrefetchedOrganizationsForPendingRequest(): OrganizationRequiredWireMembership[] | null {
  return prefetchedOrganizationsForPending;
}

/**
 * Answer the outstanding request. `null` = cancelled.
 *
 * Idempotent and safe to call when nothing is pending (an unmount racing a
 * click), so the picker never has to reason about lifecycle ordering.
 */
export function settleOrganizationSelection(
  organizationId: string | null,
): void {
  const current = pending;
  pending = null;
  prefetchedOrganizationsForPending = null;
  current?.settle(organizationId);
  if (current) for (const listener of settledListeners) listener(organizationId);
}

// Whoever shows the picker hears every settle — including one made by the
// layer that ASKED (a window closing mid-question cancels its own request), so
// the picker never outlives the thing it was asked for (page-pass 2026-09-27:
// Feedback window → Tab Capture → Cancel left "Which workspace?" open over
// nothing).
const settledListeners = new Set<(organizationId: string | null) => void>();

/** Subscribe to settles; returns the unsubscribe. */
export function onOrganizationSelectionSettled(
  listener: (organizationId: string | null) => void,
): () => void {
  settledListeners.add(listener);
  return () => {
    settledListeners.delete(listener);
  };
}

/**
 * Withdraw the question the caller asked, if it is still open — for a layer
 * that closes while its own request waits. Settles as cancelled (the caller's
 * `OrganizationSelectionCancelled` path: nothing happened, no error).
 */
export function withdrawOrganizationRequest(): void {
  if (pending) settleOrganizationSelection(null);
}

function requestOrganizationSelection(
  prefetchedOrganizations: OrganizationRequiredWireMembership[] | null = null,
): Promise<string | null> {
  if (pending) return pending.promise;

  let settle: Settle = () => {};
  const promise = new Promise<string | null>((resolve) => {
    settle = resolve;
  });
  pending = { promise, settle };
  prefetchedOrganizationsForPending = prefetchedOrganizations;

  try {
    openPicker?.();
  } catch {
    // A picker that cannot open is the same as no picker: settle as cancelled
    // so the caller re-throws the original fail-closed error instead of hanging.
    settleOrganizationSelection(null);
  }
  return promise;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

function readSelectedOrganizationId(personWrite = false): string | null {
  // THE ADMIN SEAT: the admin section never asks the admin to choose a
  // workspace — its server work runs in the platform tenant (lib/api/admin-lane.ts).
  // A PERSON'S OWN WRITE is not seat work: it runs under their own row security
  // and lands where they chose (`personWrite`, below), even on an admin page.
  const adminLane = personWrite ? null : adminLaneOrganizationId();
  if (adminLane) return adminLane;
  const store = getStoreSingleton();
  if (!store) return null;
  const state = store.getState() as RootState;
  return state.appContext?.organization_id ?? null;
}

function isMissingOrganization(error: unknown): boolean {
  return (
    error instanceof OrganizationContextError &&
    error.code === "organization_context_required"
  );
}

export interface EnsureOrganizationOptions {
  /**
   * An organization the caller already resolved authoritatively (an
   * entity-bound launcher, a conversation's own durable org). Wins outright and
   * never opens the picker — the person is not being asked about something that
   * was already decided for them.
   */
  organizationId?: string | null;
  /**
   * Skip the picker and behave exactly like the bare kernel. For background /
   * non-interactive work (prefetch, polling, telemetry) where a dialog would
   * appear with no action behind it to explain why.
   */
  interactive?: boolean;
  /**
   * Choices the caller's OWN refusal already carried
   * (`extractOrganizationHoldMemberships(err)` — aidream's
   * `details.organizations` or this repo's identical Next envelope). Lets the
   * dialog render immediately instead of waiting on its own membership fetch.
   * `null`/omitted falls back to that fetch, unchanged from before this
   * existed.
   */
  prefetchedOrganizations?: OrganizationRequiredWireMembership[] | null;
  /**
   * The write runs AS THE PERSON, under their own row security (a Kind
   * Directive's Apply / Execute), so it lands in the organization THEY
   * selected — never the admin section's platform tenant, which is for seat
   * work. Nothing selected → the picker asks; the tenant is never substituted
   * (LANE-B, 2026-10-02: the Directive Builder wrote a person's task into
   * Matrx System while the switcher named their own workspace).
   */
  personWrite?: boolean;
}

/**
 * Resolve the organization for an action, asking the person if we must.
 *
 * Returns the organization id. Throws `OrganizationSelectionCancelled` when the
 * person declines — callers treat that as "nothing happened". Throws the
 * original `OrganizationContextError` when we could not ask at all, so the
 * fail-closed behaviour is never weakened, only deferred.
 */
export async function ensureOrganizationContext(
  options: EnsureOrganizationOptions = {},
): Promise<string> {
  const {
    organizationId,
    interactive = true,
    prefetchedOrganizations = null,
    personWrite = false,
  } = options;

  try {
    return requireOrganizationContext(
      readSelectedOrganizationId(personWrite),
      organizationId ?? undefined,
    );
  } catch (error) {
    if (
      !isMissingOrganization(error) ||
      !interactive ||
      typeof window === "undefined" ||
      // Synchronous when the picker is already there (a withdraw in the same tick must find the request).
      !(isOrganizationPickerAvailable() || (await pickerReady()))
    ) {
      throw error;
    }

    const chosen = await requestOrganizationSelection(prefetchedOrganizations);
    if (!chosen) throw new OrganizationSelectionCancelled();

    // Re-run the kernel rather than trusting the picker's payload: the chosen
    // value goes through the same validation every other organization does, so
    // the picker can never introduce a shape the transport would reject.
    return requireOrganizationContext(readSelectedOrganizationId(personWrite), chosen);
  }
}

/**
 * THE press of a "Choose organization" button that rides the gate: opens the
 * ONE picker and waits for the person. "Not now" (a dismissal) is nothing; any
 * OTHER failure (no picker mounted yet, a read that failed) is announced — a
 * button that answers a press with nothing is a dead end, so it is never
 * `.catch(() => undefined)`. Guard: organization-gate-press-never-silent.test.ts.
 */
export async function chooseOrganizationFromButton(): Promise<void> {
  try {
    await ensureOrganizationContext({ interactive: true });
  } catch (error) {
    if (isOrganizationSelectionCancelled(error)) return;
    console.error("[organization-gate] the organization picker could not be opened", error);
    const { toast } = await import("@/lib/toast");
    toast.error("The organization picker could not open", {
      description: "Try again in a moment, or choose one from the sidebar.",
    });
  }
}

/** Ask for an explicit destination; never reuse the active organization. */
export async function requestOrganizationContextChoice(): Promise<string> {
  if (typeof window === "undefined" || !(isOrganizationPickerAvailable() || (await pickerReady()))) {
    return requireOrganizationContext(undefined);
  }
  const chosen = await requestOrganizationSelection();
  if (!chosen) throw new OrganizationSelectionCancelled();
  return requireOrganizationContext(undefined, chosen);
}

// ---------------------------------------------------------------------------
// The per-request form (ORG-GATE-AUDIT, 2026-09-24)
// ---------------------------------------------------------------------------

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The gate, for a feature client that builds its own `fetch` headers.
 *
 * 🚨 A SERVICE NEVER FEEDS THE BARE KERNEL THE ACTIVE SELECTION. The class this
 * closes (SCHEDULE-PROMPT, then ORG-GATE-AUDIT): a client read
 * `requireOrganizationContext(selectOrganizationId(state))` itself, so a person
 * with no organization selected who pressed a WRITE got a raw
 * "Select an organization before sending this request." toast and
 * `OrganizationGateDialog` never opened. Guarded by
 * `scripts/check-org-gate-not-bare-kernel.ts` (in `pnpm check:organization-context`).
 *
 * The method decides whether to ASK — the same line `callApi` draws:
 *   - a write/action (POST, PUT, PATCH, DELETE) is something a person did, so
 *     with nothing selected it asks, waits, and continues with the answer;
 *   - a read (GET/HEAD/OPTIONS) is overwhelmingly background (fetch-on-mount,
 *     refocus refetch, polling), so it never opens a dialog with nothing behind
 *     it (4821555e98) and keeps the fail-closed refusal the screen already
 *     renders as `OrganizationRequiredNotice`.
 * An explicit `organizationId` the caller already resolved always wins and
 * never asks. `interactive` overrides the method for a background write.
 */
/**
 * Did the person just DO something on purpose? Only deliberate acts count:
 *   - a pointer press (click / tap) — except into a text field, which starts typing;
 *   - Enter or Space on a focused button, link or menu item;
 *   - a modifier shortcut (Cmd/Ctrl/Alt + a key, e.g. Cmd+S).
 * Plain character keys NEVER count: typing followed by a debounced autosave is
 * a background write, and a picker popping up mid-sentence is worse than the
 * refusal it replaces (chair ruling, 2026-09-26). The browser's own
 * `navigator.userActivation` is NOT used — it goes active on every keystroke.
 *
 * Recorded in the capture phase at the document, trusted events only, and read
 * as "within the last DELIBERATE_ACT_WINDOW_MS". SSR / no document = false.
 */
export const DELIBERATE_ACT_WINDOW_MS = 5_000;
let lastDeliberateActAt = 0;

const ACTIVATABLE =
  'button, a[href], summary, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="tab"], [role="link"]';

/**
 * Chords that EDIT text (paste, cut, copy, select-all, undo/redo, caret moves)
 * are typing, not acts: Cmd+V into a field followed by a debounced preview
 * write must not ask. Cmd+S, Cmd+Enter and the like still count.
 */
const EDITING_CHORD = /^(a|c|v|x|z|y|Backspace|Delete|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/i;

function isDeliberateKey(event: KeyboardEvent): boolean {
  const modifierKey = ["Meta", "Control", "Alt", "Shift"].includes(event.key);
  if ((event.metaKey || event.ctrlKey || event.altKey) && !modifierKey) {
    return !EDITING_CHORD.test(event.key);
  }
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return false;
  const target = event.target;
  return target instanceof Element && target.closest(ACTIVATABLE) !== null;
}

// A control pressed INSIDE an editable surface (a button, link or menu item in a
// page editor's block, a non-editable island) is a deliberate act, not typing:
// the editable root is only "text entry" when no control sits between it and
// the press (Spaces review 4: a table's "New" inside a page never asked).
const CONTROL = 'button, a[href], [role="button"], [role="menuitem"], [role="option"], [role="tab"], [contenteditable="false"]';

export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const editable = target.closest('[contenteditable=""], [contenteditable="true"]');
  const control = target.closest(CONTROL);
  if (control && (!editable || editable.contains(control))) return false;
  if (editable || target.closest("textarea, select")) return true;
  const input = target.closest("input");
  return input !== null && !["button", "submit", "reset", "checkbox", "radio", "file", "image", "range", "color"].includes(input.type);
}

function recordDeliberateAct(event: Event): void {
  // Script-dispatched events are not the person (jsdom marks every event
  // untrusted, so the test runner is the one exception).
  if (!event.isTrusted && process.env.NODE_ENV !== "test") return;
  if (event.type === "keydown" && !isDeliberateKey(event as KeyboardEvent)) return;
  // Pressing INTO a text field is the start of typing, not an act: click a
  // field, type, and the debounced autosave a second later must not ask.
  if (event.type === "pointerdown" && isTextEntry(event.target)) return;
  lastDeliberateActAt = Date.now();
}

let deliberateActListening = false;
function listenForDeliberateActs(): void {
  if (deliberateActListening || typeof document === "undefined") return;
  deliberateActListening = true;
  document.addEventListener("pointerdown", recordDeliberateAct, { capture: true, passive: true });
  document.addEventListener("keydown", recordDeliberateAct, { capture: true, passive: true });
}
// Installed as soon as the gate loads in a browser (the picker host registers
// at boot, so it is listening long before the first write).
listenForDeliberateActs();

/**
 * THE CLICK'S INTENT, CARRIED THROUGH ITS OWN WORK. A deliberate create that
 * reaches a write after a slow step (an upload, a capture, an AI pass) would be
 * outside the 5-second window by the time it asks. A shared action runner
 * wraps the work a click STARTS in `holdDeliberateIntent`: while that work is
 * pending, a write it makes still counts as the person's act — no wall clock.
 * A dismissal after the hold began ends it (one act, one question).
 */
const intentHolds = new Set<{ startedAt: number }>();
export function holdDeliberateIntent<T>(work: () => T | Promise<T>): Promise<T> {
  if (!personJustActed()) return Promise.resolve().then(work);
  const hold = { startedAt: Date.now() };
  intentHolds.add(hold);
  return Promise.resolve()
    .then(work)
    .finally(() => {
      intentHolds.delete(hold);
    });
}

export function personJustActed(now: number = Date.now()): boolean {
  listenForDeliberateActs();
  for (const hold of intentHolds) {
    if (!organizationSelectionCancelledWithin(now - hold.startedAt)) return true;
  }
  if (lastDeliberateActAt <= 0) return false;
  const since = now - lastDeliberateActAt;
  if (since > DELIBERATE_ACT_WINDOW_MS) return false;
  // One act, one question: if the person already dismissed the picker since
  // this act, a follow-up write (a retry, a rejoin a second later) does not
  // ask again — "not now" stands until they act again.
  return !organizationSelectionCancelledWithin(since);
}

/** Tests only. */
export function __resetDeliberateActsForTests(): void {
  lastDeliberateActAt = 0;
  intentHolds.clear();
}

/**
 * THE ONE ASK FOR A WRITE, whatever its transport — callApi, a direct-to-DB
 * service (`ensureOrgId`), an Alchemy destination. With nothing selected it
 * opens the canonical workspace picker ONLY after a deliberate act
 * (`personJustActed`: a click/tap, Enter/Space on a control, a modifier
 * shortcut — never typing), waits, and continues with the pick; otherwise it
 * refuses (fail-closed) without a dialog, so a debounced autosave can never
 * raise a picker mid-sentence. `interactive` overrides for a caller that
 * knows better. Never auto-picks.
 */
export async function ensureOrganizationForWrite(
  organizationId?: string | null,
  options: { interactive?: boolean } = {},
): Promise<string> {
  try {
    return await ensureOrganizationContext({
      organizationId,
      interactive: options.interactive ?? personJustActed(),
    });
  } catch (error) {
    // THE BACKSTOP: a write refused for want of a workspace — asked or not —
    // never refuses silently. One honest toast, with the remedy one click away.
    // (Not right after a dismissal: "not now" stays nothing-happened, even
    // when a retry of the same act lands here.)
    if (isMissingOrganization(error) && !organizationSelectionCancelledWithin(5_000)) {
      announceWorkspaceNeeded();
    }
    throw error;
  }
}

function announceWorkspaceNeeded(): void {
  markWorkspaceNeededAnnounced();
  void import("@/lib/toast").then(({ toast }) =>
    toast.warning("Choose an organization to save this", {
      id: "workspace-needed",
      description: "Nothing was saved because no organization is selected. Pick one, then do it again.",
      action: {
        label: "Choose organization",
        onClick: () => {
          void chooseOrganizationFromButton();
        },
      },
    }),
  );
}

export function ensureOrganizationForRequest(options: {
  method?: string | null;
  organizationId?: string | null;
  interactive?: boolean;
  prefetchedOrganizations?: OrganizationRequiredWireMembership[] | null;
  personWrite?: boolean;
}): Promise<string> {
  const method = (options.method ?? "GET").toUpperCase();
  return ensureOrganizationContext({
    organizationId: options.organizationId,
    interactive: options.interactive ?? !READ_METHODS.has(method),
    prefetchedOrganizations: options.prefetchedOrganizations ?? null,
    personWrite: options.personWrite ?? false,
  });
}
