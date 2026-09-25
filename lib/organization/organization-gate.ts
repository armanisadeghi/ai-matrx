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
 *   2. **Guess.** Fall back to the personal workspace. Silent, convenient, and
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
 *   * `callApi` — every REST call in the app.
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

function readSelectedOrganizationId(): string | null {
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
  const { organizationId, interactive = true, prefetchedOrganizations = null } =
    options;

  try {
    return requireOrganizationContext(
      readSelectedOrganizationId(),
      organizationId ?? undefined,
    );
  } catch (error) {
    if (
      !isMissingOrganization(error) ||
      !interactive ||
      typeof window === "undefined" ||
      !isOrganizationPickerAvailable()
    ) {
      throw error;
    }

    const chosen = await requestOrganizationSelection(prefetchedOrganizations);
    if (!chosen) throw new OrganizationSelectionCancelled();

    // Re-run the kernel rather than trusting the picker's payload: the chosen
    // value goes through the same validation every other organization does, so
    // the picker can never introduce a shape the transport would reject.
    return requireOrganizationContext(readSelectedOrganizationId(), chosen);
  }
}

/** Ask for an explicit destination; never reuse the active organization. */
export async function requestOrganizationContextChoice(): Promise<string> {
  if (typeof window === "undefined" || !isOrganizationPickerAvailable()) {
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
export function ensureOrganizationForRequest(options: {
  method?: string | null;
  organizationId?: string | null;
  interactive?: boolean;
  prefetchedOrganizations?: OrganizationRequiredWireMembership[] | null;
}): Promise<string> {
  const method = (options.method ?? "GET").toUpperCase();
  return ensureOrganizationContext({
    organizationId: options.organizationId,
    interactive: options.interactive ?? !READ_METHODS.has(method),
    prefetchedOrganizations: options.prefetchedOrganizations ?? null,
  });
}
