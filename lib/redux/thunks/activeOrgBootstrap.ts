// lib/redux/thunks/activeOrgBootstrap.ts
//
// The single sanctioned UI write path for SWITCHING the active organization,
// plus the imperative re-runs of the load ladder (retry after a failed read,
// re-check after a not-a-member refusal).
//
// The load itself is owned by `appContextPolicy` (lib/redux/slices/
// appContextSlice.ts): every load runs `remote.fetch` → `resolveActiveOrgContext`.
// The thunks below run that SAME resolver, never a second answer.
//
// Why the eslint-disable below: setOrganization is an appContextSlice WRITE
// action, gated to Surface-A active-context components (eslint.config.mjs
// `appContextWriteSyntaxRestrictions`). Switching the active org IS this
// module's job.

// eslint-disable-next-line no-restricted-syntax -- Surface A: canonical active-org switcher + back-compat bootstrap
import {
  setOrganization,
  setOrgBootstrapResolved,
  setOrgBootstrapFailure,
} from "@/lib/redux/slices/appContextSlice";
import { resolveActiveOrgContext } from "@/lib/organizations/resolveActiveOrgContext";
import { getUserId } from "@/utils/auth/getUserId";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { markOrgBootstrapResolved } from "@/lib/organizations/orgBootstrapGate";
import { writeLastActiveOrganization } from "@/lib/organizations/accountOrganizationChoices";
import { announceActiveOrganizationReplaced } from "@/lib/organizations/announceActiveOrganizationReplaced";
import { toast } from "@/lib/toast";
import { heldOrganizationForTab } from "@/lib/organizations/tabOrganization";

/**
 * Back-compat imperative bootstrap. Delegates to the shared resolver and
 * dispatches the result. Hydration is normally owned by `appContextPolicy`;
 * this exists only for legacy callers. Never throws — always marks the
 * bootstrap resolved so the UI's "no org" cues don't hang suppressed.
 *
 * `explicitUserId` lets a caller that already holds the authenticated user
 * start the bootstrap before `setUser` has reached Redux.
 */
export const bootstrapActiveOrganization =
  (explicitUserId?: string | null) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    try {
      // THE CALLER MAY KNOW WHO THIS IS BEFORE REDUX DOES. `DeferredShellData`
      // has the authenticated user in hand from `supabase.auth.getUser()`
      // several awaits before `setUser` is dispatched; without this parameter
      // the bootstrap could only run AFTER the shell fetch, which is exactly
      // how a failing shell fetch left the organization question unanswered
      // forever (2026-09-17).
      const userId = explicitUserId ?? getUserId();
      if (!userId) return;
      const tab = getState().appContext;
      // Redux's answered organization, else the one this tab held before it
      // reloaded — never the account's last active, which other sessions move.
      const held = heldOrganizationForTab(tab, userId);
      const resolved = await resolveActiveOrgContext(userId, {
        heldOrganizationId: held,
      });
      if (!resolved) {
        dispatch(setOrgBootstrapFailure(null));
        return;
      }
      // 🚨 THE FOURTH STATE (R37). This `finally` used to mark the bootstrap
      // resolved whatever happened, so a thrown membership read and a degraded
      // resolve both ended as "you have no organization — pick one". A read
      // that failed is recorded as unreadable instead, and the surfaces say so.
      if (resolved.unreadableReason && resolved.organization_id == null) {
        dispatch(setOrgBootstrapFailure(resolved.unreadableReason));
      } else {
        dispatch(setOrgBootstrapFailure(null));
      }

      // The account's answer wins over a painted cache; a tab that holds an
      // organization keeps it unless it is no longer theirs — then the
      // switch is announced.
      if (resolved.organization_id && resolved.organization_id !== held) {
        dispatch(
          setOrganization({
            id: resolved.organization_id,
            name: resolved.organization_name,
          }),
        );
        if (held) announceActiveOrganizationReplaced(tab.organization_name, resolved.organization_name);
      }
    } catch (err) {
      console.error("[activeOrgBootstrap] failed to hydrate active org", err);
      if (!getState().appContext.organization_id) {
        dispatch(
          setOrgBootstrapFailure(
            err instanceof Error && err.message
              ? `the organization read failed: ${err.message}`
              : "the organization read failed",
          ),
        );
      }
    } finally {
      dispatch(setOrgBootstrapResolved(true));
      // The same answer, for the non-React waiters (`ensureOrgId`). One
      // promise, settled by whoever answers first — never a second fetch.
      markOrgBootstrapResolved();
    }
  };

/**
 * Switch the active organization from a UI surface — the sidebar switcher and
 * every picker. It moves THIS tab only (nothing is broadcast) and saves the
 * choice as the account's last active organization, so the next load — on any
 * device — opens to it (`users.set_last_active_organization`).
 */
export const chooseActiveOrganization =
  (org: { id: string | null; name?: string | null }) =>
  (dispatch: AppDispatch) => {
    if (!org.id) return; // the active organization is never none
    dispatch(setOrganization({ id: org.id, name: org.name ?? null }));
    // The person's choice answers the question for this tab.
    markOrgBootstrapResolved();
    void writeLastActiveOrganization(org.id).catch((err: unknown) => {
      console.error("[activeOrgBootstrap] saving the last active organization failed", err);
      toast.error("Couldn't save this organization for your next visit");
    });
  };

/**
 * A request was refused because the person is not a member of the active
 * organization (removed while it was active). Re-run the ladder: a held
 * organization that is no longer a membership is replaced, and the switch is
 * announced. A refusal while the membership still reads true changes nothing.
 */
export const recheckActiveOrganizationAfterRefusal =
  () => async (dispatch: AppDispatch) => {
    await dispatch(bootstrapActiveOrganization());
  };

/**
 * RETRY the organization read after it failed — the one action behind every
 * "Try again" the fourth state offers (`useOrganizationRequired().retry`).
 *
 * It puts the surfaces back into the honest checking posture (failure cleared,
 * bootstrap un-resolved, so `organizationState` reads `resolving`) and re-runs
 * the same resolver the boot path runs. There is no second code path: a retry
 * that behaved differently from boot would be a second answer to one question.
 */
export const retryActiveOrgBootstrap =
  () => async (dispatch: AppDispatch) => {
    dispatch(setOrgBootstrapFailure(null));
    dispatch(setOrgBootstrapResolved(false));
    await dispatch(bootstrapActiveOrganization());
  };
