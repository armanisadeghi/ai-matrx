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
// The pure leaf, deliberately — the fourth organization state is read without
// adding a member to the app-context slice stand-ins every notes test carries.
import { selectOrgBootstrapFailure } from "@/lib/organizations/orgBootstrapFailure";
import { ORGANIZATION_UNAVAILABLE_DESCRIPTION } from "@/features/organizations/useOrganizationRequired";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import { pickActiveOrganization } from "@/features/organizations/hooks/useActiveOrganizationAutoSelect";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The scope tree and preference slices are not mounted in every store this
 *  resolver can meet (a notes-only test store, an embedded host); an absent
 *  slice reads as "nothing to name from", never as a crash. */
function memberships(state: RootState): ReturnType<typeof selectOrganizationsList> {
  return (state as { scopesTree?: unknown }).scopesTree ? selectOrganizationsList(state) : [];
}
function defaultOrganizationId(state: RootState): string | null {
  return (state as { userPreferences?: unknown }).userPreferences
    ? selectDefaultOrganizationId(state)
    : null;
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
      // Boot settled with nothing selected. Apply the canonical rung order
      // (stated default → own personal org → sole membership) to what Redux
      // holds and SELECT it — the same choice `useActiveOrganizationAutoSelect`
      // makes, made here because on /notes that hook is mounted only inside
      // the header's picker popover, which nothing has opened.
      const nameable = pickActiveOrganization(
        memberships(state),
        defaultOrganizationId(state),
        selectPersonalOrganizationId(state),
      );
      if (nameable && store.dispatch) {
        console.warn(
          "[notes] No active organization after boot while one could be named — selecting it for the new note.",
          { selected: nameable.id },
        );
        store.dispatch(chooseActiveOrganization({ id: nameable.id, name: nameable.name }));
        continue;
      }
      if (!nameable) {
        // Nothing can be named from Redux. Refuse with the kernel's error so
        // the surface renders the ONE honest screen for it — the organization
        // notice with the picker inside. (Not the modal chooser: its
        // registration is module-global and outlives the surface that mounted
        // it, so a later click could wait forever on a chooser nobody sees.)
        // 🚨 AND THE FOURTH STATE IS NOT THE REFUSAL (R37). `resolved` is TRUE
        // when the organization read FAILED too, and then nothing at all is
        // known about this person's memberships — "choose one" would be a
        // claim nobody verified. Say what actually happened instead.
        throw new OrganizationContextError(
          "organization_context_required",
          selectOrgBootstrapFailure(state)
            ? ORGANIZATION_UNAVAILABLE_DESCRIPTION
            : "Choose the organization this note belongs to.",
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
    await sleep(WAIT_TICK_MS);
  }
}

export function useNewNoteOrganization(): () => Promise<string> {
  const store = useAppStore();
  return useCallback(() => resolveNewNoteOrganization(store), [store]);
}
