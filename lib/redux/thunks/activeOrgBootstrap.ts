// lib/redux/thunks/activeOrgBootstrap.ts
//
// The single sanctioned UI write path for SWITCHING the active org, plus a
// back-compat bootstrap wrapper.
//
// ⚠️ Active-org HYDRATION is no longer owned here. It is now a first-class
// citizen of the unified sync engine via `appContextPolicy`
// (lib/redux/slices/appContextSlice.ts, registered in lib/sync/registry.ts):
// the engine rehydrates the org from IDB→localStorage before first paint and
// reconciles via `remote.fetch` → `resolveActiveOrgContext`. The old
// `ActiveOrgBootstrap` island that called `bootstrapActiveOrganization()` on
// every launch (and paid ~4 round-trips each time) has been RETIRED.
//
// `bootstrapActiveOrganization()` is kept as a thin, idempotent back-compat
// wrapper over the same shared resolver — for any legacy caller that still
// wants to force a resolve imperatively. New code should NOT call it; the
// policy already keeps the org present and fresh.
//
// Why the eslint-disable below: setOrganization / setPersonalOrganization are
// appContextSlice WRITE actions, gated to Surface-A active-context components
// (eslint.config.mjs `appContextWriteSyntaxRestrictions`). This module is a
// legitimate Surface-A writer — switching the global active org IS its job.

// eslint-disable-next-line no-restricted-syntax -- Surface A: canonical active-org switcher + back-compat bootstrap
import {
  setOrganization,
  setPersonalOrganization,
  setOrgBootstrapResolved,
  setOrgBootstrapFailure,
} from "@/lib/redux/slices/appContextSlice";
import { resolveActiveOrgContext } from "@/lib/organizations/resolveActiveOrgContext";
import { getUserId } from "@/utils/auth/getUserId";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { markOrgBootstrapResolved } from "@/lib/organizations/orgBootstrapGate";

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
      const resolved = await resolveActiveOrgContext(userId);
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

      if (resolved.personal_organization_id) {
        dispatch(setPersonalOrganization(resolved.personal_organization_id));
      }
      // Respect an org already actively selected (deep-link / restored context).
      if (!getState().appContext.organization_id && resolved.organization_id) {
        dispatch(
          setOrganization({
            id: resolved.organization_id,
            name: resolved.organization_name,
          }),
        );
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
 * Switch the active organization from a UI surface. Just dispatches — the
 * active org is the global working context; durable cross-session restore is
 * the job of the default-org preference, not this switcher.
 */
export const chooseActiveOrganization =
  (org: { id: string | null; name?: string | null }) =>
  (dispatch: AppDispatch) => {
    dispatch(setOrganization({ id: org.id, name: org.name ?? null }));
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
