// features/organizations/hooks/useDefaultOrganizationAutoSelect.ts
//
// THE STATED DEFAULT IS HONORED, ALWAYS. If the user has told us which
// organization they work in, no boot may end with "you have no organization
// selected — pick one" while that org sits in their list with a star on it.
//
// The primary path is `resolveActiveOrgContext` inside the appContextPolicy
// sync fetch (it reads the same preference straight from `user_preferences`).
// This hook is the second, independent layer: it needs no network and no sync
// engine — the moment Redux holds BOTH a default-org preference and a
// membership list containing it, an unset active org is filled in.
//
// It warns loudly when it fires, because reaching this layer means the primary
// path did not do its job — a recovery that fires silently is a bug that never
// gets fixed.

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { selectDefaultOrganizationId } from "@/lib/redux/preferences/userPreferenceSelectors";
import type { OrgNode } from "@/features/scopes/types";

/**
 * How long to let the primary path finish before recovering.
 *
 * `orgBootstrapResolved` goes true on ANY appContext rehydrate — including a
 * hollow cached record whose `cacheSatisfies` miss has just kicked off the
 * cold-boot fetch. Firing the instant that flag flips would race the resolver
 * and print a "resolve failed" warning that is simply early. A short grace
 * makes the warning mean what it says: after this long with a stated default
 * and no active org, the primary path really did not deliver.
 */
const PRIMARY_RESOLVE_GRACE_MS = 2000;

/**
 * Auto-select the user's default organization when nothing is active yet.
 *
 * @param organizations the user's memberships (scope tree). An empty list means
 *   "not loaded / no memberships" — nothing is selected from it.
 */
export function useDefaultOrganizationAutoSelect(
  organizations: readonly OrgNode[],
): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const activeOrgId = useAppSelector(selectOrganizationId);
  const bootstrapResolved = useAppSelector(selectOrgBootstrapResolved);
  const defaultOrganizationId = useAppSelector(selectDefaultOrganizationId);

  useEffect(() => {
    if (activeOrgId) return;
    if (!defaultOrganizationId) return;
    // Before bootstrap resolves, the sync engine may still be about to deliver
    // the org — let the primary path win rather than racing it.
    if (!bootstrapResolved) return;
    const match = organizations.find((o) => o.id === defaultOrganizationId);
    if (!match) return;

    // Give the primary resolve its grace period, then re-check the LIVE store
    // before writing. Effect cleanup cancels the timer in the ordinary case,
    // but that runs a render later — and `setOrganization` also clears scope /
    // project / task / conversation, so a stale fire would not merely be
    // redundant, it would throw away the working context of whoever selected
    // in the meantime (the resolver, another tab's broadcast, or the user).
    const timer = setTimeout(() => {
      const live = store.getState().appContext;
      if (live.organization_id) return;
      console.warn(
        "[organizations] Active org was empty while a default organization is set — selecting it. " +
          "The appContextPolicy resolve should have done this; if you are seeing this line, that path failed.",
        { defaultOrganizationId },
      );
      dispatch(chooseActiveOrganization({ id: match.id, name: match.name }));
    }, PRIMARY_RESOLVE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [
    dispatch,
    store,
    activeOrgId,
    bootstrapResolved,
    defaultOrganizationId,
    organizations,
  ]);
}
