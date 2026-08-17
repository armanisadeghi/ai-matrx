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
// It fires loudly (`reportRecoveredDefaultOrg`) because reaching this layer
// means the primary path did not do its job — a recovery that fires silently
// is a bug that never gets fixed.

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { selectDefaultOrganizationId } from "@/lib/redux/preferences/userPreferenceSelectors";
import type { OrgNode } from "@/features/scopes/types";

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

    console.warn(
      "[organizations] Active org was empty while a default organization is set — selecting it. " +
        "The appContextPolicy resolve should have done this; if you are seeing this line, that path failed.",
      { defaultOrganizationId },
    );
    dispatch(chooseActiveOrganization({ id: match.id, name: match.name }));
  }, [
    dispatch,
    activeOrgId,
    bootstrapResolved,
    defaultOrganizationId,
    organizations,
  ]);
}
