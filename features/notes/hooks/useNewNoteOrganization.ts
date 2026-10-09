"use client";

// useNewNoteOrganization — THE organization a new note is filed under.
//
// Every new-note entry point (sidebar "+", tab-bar "+", the folder quick
// pick) used to call `requireOrganizationContext(activeOrgId)` on the click.
// That kernel fails closed, which is right on the wire and wrong on a button:
// on a fresh sign-in the active organization is still being resolved for a
// second or two, so the "+" answered "Select an organization before sending
// this request." (a sentence for a programmer) and looked like an auth
// failure. It never asked the store to finish.
//
// This resolver asks. It returns the active organization the moment one is
// set; while boot is still resolving it WAITS (bounded); and once boot has
// settled with nothing selected it opens the picker and waits for the person
// to SET one.
//
// 🚨 IT NO LONGER PICKS (Arman, 2026-09-19). Between those last two steps it
// used to apply a rung order — stated default-org preference, then the
// person's own own organization — and dispatch that selection itself, so a
// note could be filed in an organization nobody named. Both rungs are gone: a
// "preselected organization" is at most a per-client display preference that only
// the picker may read, and nothing may choose an organization for the person
// from a preference or their own org.
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// The write still carries an explicit organization id: nothing here
// substitutes one per request, it waits for the SELECTION to exist — and now
// asks for it when it does not.

import { useCallback } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  OrganizationContextError,
  requireOrganizationContext,
} from "@/lib/api/organization-context";
import {
  selectOrganizationId,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How long a click waits for boot to name the organization before refusing. */
export const NEW_NOTE_ORGANIZATION_WAIT_MS = 8_000;

/** The two store methods the resolver needs. Loose on purpose so a test can
 *  hand it a plain object; the real caller passes the `AppStore`. */
export type NewNoteOrganizationStore = {
  getState: () => unknown;
  /** Absent inside a thunk (which has no subscribe); the wait then ticks. */
  subscribe?: (listener: () => void) => () => unknown;
  /** Present on the real store; a test store may omit it (then a nameable
   *  organization is only waited for, never selected here). */
  dispatch?: (action: unknown) => unknown;
};

/** Minimum spacing between two looks at the store: a busy store must not turn
 *  the wait into a busy-loop. */
const WAIT_TICK_MS = 50;

function waitForStoreChange(store: NewNoteOrganizationStore, maxMs: number): Promise<void> {
  if (!store.subscribe) return sleep(maxMs);
  const subscribe = store.subscribe;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    const unsubscribe = subscribe(finish);
    const timer = setTimeout(finish, maxMs);
  });
}

/**
 * Resolve the organization a new note belongs to, waiting (bounded) for the
 * active-organization boot to finish. Throws `OrganizationContextError` when
 * boot has settled and nothing can be named, or when the wait runs out.
 */
export async function resolveNewNoteOrganization(
  store: NewNoteOrganizationStore,
  options: { timeoutMs?: number; now?: () => number } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? NEW_NOTE_ORGANIZATION_WAIT_MS;
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;

  for (;;) {
    const state = store.getState() as RootState;
    const active = selectOrganizationId(state);
    if (active) return requireOrganizationContext(active);

    const resolved = selectOrgBootstrapResolved(state);
    if (resolved) {
      // The load ladder has answered: the note acts in the active organization (or
      // `ensureOrgId` states the honest reason there is none).
      return ensureOrgId(null);
    }

    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new OrganizationContextError(
        "organization_context_required",
        "Your organization is still loading. Choose one to start the note.",
      );
    }
    await waitForStoreChange(store, Math.min(remaining, 250));
    await sleep(WAIT_TICK_MS);
  }
}

export function useNewNoteOrganization(): () => Promise<string> {
  const store = useAppStore();
  return useCallback(() => resolveNewNoteOrganization(store), [store]);
}
