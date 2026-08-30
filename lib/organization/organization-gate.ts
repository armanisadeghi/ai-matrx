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

/**
 * The person closed the picker without choosing.
 *
 * This is NOT an error condition — it is an answer, and the answer is "not
 * now". Every caller must treat it as "nothing happened": no toast, no error
 * banner, no cleared composer, no dropped draft. The rule is the one Arman set:
 * cancelling returns you exactly where you were.
 */
export class OrganizationSelectionCancelled extends Error {
  override name = "OrganizationSelectionCancelled" as const;
  constructor() {
    super("Organization selection was cancelled; nothing was sent.");
  }
}

export function isOrganizationSelectionCancelled(
  error: unknown,
): error is OrganizationSelectionCancelled {
  return (
    error instanceof OrganizationSelectionCancelled ||
    (error instanceof Error && error.name === "OrganizationSelectionCancelled")
  );
}

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
  current?.settle(organizationId);
}

function requestOrganizationSelection(): Promise<string | null> {
  if (pending) return pending.promise;

  let settle: Settle = () => {};
  const promise = new Promise<string | null>((resolve) => {
    settle = resolve;
  });
  pending = { promise, settle };

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
  const { organizationId, interactive = true } = options;

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

    const chosen = await requestOrganizationSelection();
    if (!chosen) throw new OrganizationSelectionCancelled();

    // Re-run the kernel rather than trusting the picker's payload: the chosen
    // value goes through the same validation every other organization does, so
    // the picker can never introduce a shape the transport would reject.
    return requireOrganizationContext(readSelectedOrganizationId(), chosen);
  }
}
