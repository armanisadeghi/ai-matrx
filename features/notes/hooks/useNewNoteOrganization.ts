"use client";

// useNewNoteOrganization — THE organization a new note is filed under.
//
// Every new-note entry point (sidebar "+", tab-bar "+", the folder quick
// pick) used to call `requireOrganizationContext(activeOrgId)` on the click.
// That kernel fails closed, which is right on the wire and wrong on a button:
// on a fresh sign-in the active organization is still being resolved for a
// second or two, and a user with several memberships and no stated default
// can sit with no selection at all — so the "+" answered "Select an
// organization before sending this request." (a sentence for a programmer)
// and looked like an auth failure. It never asked the store to finish.
//
// This resolver asks. It returns the active organization the moment one is
// set; while boot is still resolving it WAITS (bounded); once boot has settled
// with nothing selected it lets the auto-select layer name one from what
// Redux already holds (stated default → own personal org → sole membership,
// the canonical rung order), and only when nothing can be named does it
// refuse — with the same `OrganizationContextError` the kernel throws, so the
// surface can render the ONE honest screen for it (`OrganizationRequiredNotice`
// with the picker) instead of a red sentence.
//
// The write still carries an explicit organization id: nothing here
// substitutes one per request, it waits for the SELECTION to exist.

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
  selectPersonalOrganizationId,
} from "@/lib/redux/slices/appContextSlice";
import { selectDefaultOrganizationId } from "@/lib/redux/preferences/userPreferenceSelectors";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import { pickActiveOrganization } from "@/features/organizations/hooks/useActiveOrganizationAutoSelect";

/** How long a click waits for boot to name the organization before refusing. */
export const NEW_NOTE_ORGANIZATION_WAIT_MS = 8_000;

/** The two store methods the resolver needs. Loose on purpose so a test can
 *  hand it a plain object; the real caller passes the `AppStore`. */
type StoreLike = {
  getState: () => unknown;
  subscribe: (listener: () => void) => () => unknown;
};

function waitForStoreChange(store: StoreLike, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    const unsubscribe = store.subscribe(finish);
    const timer = setTimeout(finish, maxMs);
  });
}

/**
 * Resolve the organization a new note belongs to, waiting (bounded) for the
 * active-organization boot to finish. Throws `OrganizationContextError` when
 * boot has settled and nothing can be named, or when the wait runs out.
 */
export async function resolveNewNoteOrganization(
  store: StoreLike,
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
      // Boot settled with nothing selected. The auto-select layer fills this
      // in (after its own short grace) whenever Redux holds enough to name an
      // organization; if it holds nothing, no amount of waiting helps.
      const nameable = pickActiveOrganization(
        selectOrganizationsList(state),
        selectDefaultOrganizationId(state),
        selectPersonalOrganizationId(state),
      );
      if (!nameable) {
        throw new OrganizationContextError(
          "organization_context_required",
          "Choose the organization this note belongs to.",
        );
      }
    }

    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new OrganizationContextError(
        "organization_context_required",
        "Your organization is still loading. Choose one to start the note.",
      );
    }
    await waitForStoreChange(store, Math.min(remaining, 250));
  }
}

export function useNewNoteOrganization(): () => Promise<string> {
  const store = useAppStore();
  return useCallback(() => resolveNewNoteOrganization(store), [store]);
}
