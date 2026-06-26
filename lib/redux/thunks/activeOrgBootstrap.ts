// lib/redux/thunks/activeOrgBootstrap.ts
//
// Active-organization bootstrap + the single sanctioned UI write path for
// switching the active org. This is the front line of the org-enforcement
// rollout (CLAUDE.md "enforcing organization_id"): every user always has a
// valid org riding along on API calls, even before they explicitly pick one.
//
// Two pieces:
//   1. bootstrapActiveOrganization() — run once at shell hydration
//      (DeferredShellData). Loads the user's orgs, records their PERSONAL org
//      id (the soft-enforcement fallback), and restores the LAST org they used
//      (from localStorage) if they're still a member. It does NOT auto-select
//      the personal org — leaving organization_id null is the signal the UI
//      uses to nudge the user (red ring on the avatar) to choose one.
//   2. chooseActiveOrganization({id,name}) — the compliant wrapper UI surfaces
//      call to switch orgs. Persistence to localStorage is handled centrally
//      by the StoreProvider subscription, so this only dispatches.
//
// Why the eslint-disable below: setOrganization / setPersonalOrganization are
// appContextSlice WRITE actions, gated to Surface-A active-context components
// (eslint.config.mjs `appContextWriteSyntaxRestrictions`). This module is a
// legitimate Surface-A writer that lives outside active-context/** — the same
// sanctioned exception the canonical useHierarchyReduxBridge and the
// logout-reset watcher use. Setting the global active org IS the job here.

// eslint-disable-next-line no-restricted-syntax -- Surface A: canonical active-org bootstrap + switcher
import {
  setOrganization,
  setPersonalOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { getUserOrganizations } from "@/features/organizations/service";
import type { AppDispatch, RootState } from "@/lib/redux/store";

/** localStorage key for the last explicitly-selected active org. */
export const LAST_ORG_STORAGE_KEY = "matrx:lastOrg";

interface PersistedOrg {
  id: string;
  name: string | null;
}

/** Read the last-used org from localStorage. Never throws. */
export function readLastOrg(): PersistedOrg | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_ORG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedOrg>;
    if (parsed && typeof parsed.id === "string" && parsed.id.length > 0) {
      return {
        id: parsed.id,
        name: typeof parsed.name === "string" ? parsed.name : null,
      };
    }
  } catch {
    // Malformed persisted value — ignore, treat as no last org.
  }
  return null;
}

/** Persist (or clear) the last-used org. Never throws. */
export function writeLastOrg(org: PersistedOrg | null): void {
  if (typeof window === "undefined") return;
  try {
    if (org && org.id) {
      window.localStorage.setItem(LAST_ORG_STORAGE_KEY, JSON.stringify(org));
    } else {
      window.localStorage.removeItem(LAST_ORG_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable (private mode / quota) — non-fatal.
  }
}

/**
 * Hydrate active-org state. Records the personal org id (API fallback) and
 * restores the last-used org if still valid. Safe to call once per session
 * after auth resolves. Never throws — a failure leaves state at its defaults
 * (no org) and the soft-enforcement reminder shows.
 */
export const bootstrapActiveOrganization =
  () => async (dispatch: AppDispatch, getState: () => RootState) => {
    try {
      const orgs = await getUserOrganizations();
      if (!orgs || orgs.length === 0) return;

      // Personal-first sort guarantees the personal org is findable; fall back
      // to the first org if the flag is ever missing.
      const personal = orgs.find((o) => o.isPersonal) ?? orgs[0];
      dispatch(setPersonalOrganization(personal?.id ?? null));

      // Only restore a last org if nothing is already actively selected.
      const current = getState().appContext.organization_id;
      if (current) return;

      const last = readLastOrg();
      if (last) {
        const match = orgs.find((o) => o.id === last.id);
        if (match) {
          dispatch(setOrganization({ id: match.id, name: match.name }));
          return;
        }
        // User is no longer a member of the persisted org — clear it.
        writeLastOrg(null);
      }
      // No valid last org: leave organization_id null on purpose so the UI
      // nudges the user to choose one (personal org still rides along on API
      // calls via selectEffectiveOrganizationId).
    } catch (err) {
      console.error("[activeOrgBootstrap] failed to hydrate active org", err);
    }
  };

/**
 * Switch the active organization from a UI surface. The StoreProvider
 * subscription persists the change to localStorage, so this just dispatches.
 */
export const chooseActiveOrganization =
  (org: { id: string | null; name?: string | null }) =>
  (dispatch: AppDispatch) => {
    dispatch(setOrganization({ id: org.id, name: org.name ?? null }));
  };
