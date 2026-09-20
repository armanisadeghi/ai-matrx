// features/organizations/hooks/useActiveOrganizationAutoSelect.ts
//
// THE SECOND BOOT LADDER, CUT DOWN TO THE ONE RUNG THAT IS NOT A CHOICE.
//
// 🚨 WHAT THIS USED TO DO, AND WHY IT IS GONE (Arman, 2026-09-19).
// This hook existed to make sure "boot ends with a selection". Two seconds
// after bootstrap resolved, if nothing was selected, it SILENTLY dispatched
// `chooseActiveOrganization` for whichever organization it could name —
// applying the stated default-org preference first, then the person's own
// personal workspace. It logged a warning nobody reads and moved on.
//
// That is precisely the thing the ruling forbids, and it is the worst-shaped
// version of it: a timer, in a hook, that picks the organization a person's
// work will be filed under, two seconds after they stopped looking. A default
// organization is at most a per-client DISPLAY preference; the org picker may
// show it, and nothing else may read it. Nothing may pick an organization for
// the user from a cookie, a saved preference, or their personal org.
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// Both rungs are deleted, and with them the grace timer, the warning, and the
// store re-read the timer needed. What remains is the ONE rung that decides
// nothing: a person who belongs to exactly one organization is put in it,
// because there was never a choice to make.
//
// WHAT HAPPENS INSTEAD WHEN THERE IS A CHOICE. Nothing, here — deliberately.
// The person belongs to several organizations and has not told this device
// which one they are working in. The header shows the picker
// (`selectShouldPromptForOrganization`), and the first action that actually
// needs an organization HOLDS and asks: `ensureOrgId` opens the picker, the
// person SETS one, and the action resumes with it. A boot that guesses to
// avoid a dead end is only needed while refusing is a dead end, and it is not
// one any more.

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import type { OrgNode } from "@/features/scopes/types";

/**
 * The organization this boot may select WITHOUT asking, or null.
 *
 * There is exactly one: the person's only membership. Every other case — a
 * stated default, their personal workspace, "the first one" — is a choice, and
 * a choice belongs to the person (2026-09-19 ruling). Kept as a named,
 * exported function so the rule is testable and so the guard
 * (`scripts/check-no-default-organization.ts`) has one place to watch for a
 * rung growing back.
 */
export function pickActiveOrganization(
  organizations: readonly OrgNode[],
): OrgNode | null {
  return organizations.length === 1 ? organizations[0] : null;
}

/**
 * Select the active organization when the person has exactly one and nothing
 * is selected yet.
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

  useEffect(() => {
    if (activeOrgId) return;
    // Before bootstrap resolves, the sync engine may still be about to deliver
    // the organization — and the membership list may still be partial, which
    // would make "exactly one" a lie. Let the primary path finish.
    if (!bootstrapResolved) return;
    const only = pickActiveOrganization(organizations);
    if (!only) return;
    // Re-read the LIVE store rather than trusting this render's selector: a
    // resolve, another tab's broadcast, or the person's own pick may have
    // landed since, and `setOrganization` also clears scope / project / task /
    // conversation, so a stale write would throw away real working context.
    if (store.getState().appContext.organization_id) return;
    dispatch(chooseActiveOrganization({ id: only.id, name: only.name }));
  }, [dispatch, store, activeOrgId, bootstrapResolved, organizations]);
}
