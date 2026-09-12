// features/organizations/hooks/useActiveOrganizationAutoSelect.ts
//
// BOOT ENDS WITH A SELECTION. If the user belongs to any organization at all,
// no boot may end with "you have no organization selected" while every
// transport refuses to send a request. The primary path is
// `resolveActiveOrgContext` inside the appContextPolicy sync fetch; this hook
// is the second, independent layer — it needs no network and no sync engine:
// the moment Redux holds enough to name an org, an unset active org is filled
// in, applying the SAME canonical rung order as the resolver.
//
// Rungs applied here (the resolver's a → c; its rung 0, the shared apex
// cookie, is already folded into appContextPolicy.deserialize):
//   a. the stated default-org preference, if it is one of the memberships;
//   b. the user's OWN personal org, if it is one of the memberships — an
//      explicit, visible, changeable choice made ONCE at bootstrap. This is
//      not the forbidden personal-org fallback: transports still refuse an
//      unselected org (`requireSelectedOrgId`), and nothing per-request
//      substitutes anything;
//   c. exactly one membership → that one.
// No memberships at all → nothing is selected and the UI says so honestly
// (`OrganizationRequiredNotice`).
//
// It warns loudly when it fires, because reaching this layer means the primary
// path did not do its job — a recovery that fires silently is a bug that never
// gets fixed.
//
// History (2026-09-12): this layer used to require a stated default-org
// preference, exactly like the primary path — so a user with nine memberships
// and a null `defaultOrganizationId` had BOTH layers decline, and the app sat
// forever with no selection while the header rendered the personal org and
// every request threw "Select an organization before sending this request."

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectPersonalOrganizationId,
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
 * makes the warning mean what it says: after this long with memberships and no
 * active org, the primary path really did not deliver.
 */
const PRIMARY_RESOLVE_GRACE_MS = 2000;

/**
 * Pick the org this boot should end with, applying the canonical rung order to
 * what Redux already holds. Returns null only when nothing can be named.
 */
export function pickActiveOrganization(
  organizations: readonly OrgNode[],
  defaultOrganizationId: string | null | undefined,
  personalOrganizationId: string | null | undefined,
): OrgNode | null {
  if (organizations.length === 0) return null;
  if (defaultOrganizationId) {
    const stated = organizations.find((o) => o.id === defaultOrganizationId);
    if (stated) return stated;
  }
  if (personalOrganizationId) {
    const personal = organizations.find((o) => o.id === personalOrganizationId);
    if (personal) return personal;
  }
  if (organizations.length === 1) return organizations[0];
  return null;
}

/**
 * Auto-select the active organization when nothing is active yet.
 *
 * @param organizations the user's memberships (scope tree). An empty list means
 *   "not loaded / no memberships" — nothing is selected from it.
 */
export function useActiveOrganizationAutoSelect(
  organizations: readonly OrgNode[],
): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const activeOrgId = useAppSelector(selectOrganizationId);
  const bootstrapResolved = useAppSelector(selectOrgBootstrapResolved);
  const defaultOrganizationId = useAppSelector(selectDefaultOrganizationId);
  const personalOrganizationId = useAppSelector(selectPersonalOrganizationId);

  useEffect(() => {
    if (activeOrgId) return;
    // Before bootstrap resolves, the sync engine may still be about to deliver
    // the org — let the primary path win rather than racing it.
    if (!bootstrapResolved) return;
    const match = pickActiveOrganization(
      organizations,
      defaultOrganizationId,
      personalOrganizationId,
    );
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
        "[organizations] Boot ended with no active organization while one could be named — selecting it. " +
          "The appContextPolicy resolve should have done this; if you are seeing this line, that path failed.",
        {
          selected: match.id,
          defaultOrganizationId,
          personalOrganizationId,
          membershipCount: organizations.length,
        },
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
    personalOrganizationId,
    organizations,
  ]);
}
