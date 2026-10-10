// features/scopes/redux/thunks/ensureScopeTree.ts
//
// The boot fetch. Single source of truth for "do we have the scope tree?"
//
// No-refetch policy: this thunk is the ONLY allowed entry point for the
// tree boot fetch. It checks state before firing:
//   - `treeStatus: 'ready'` and `refresh: false` → return cached
//   - `treeStatus: 'loading'` → read again: the records client sends identical door reads once,
//     and the boot read of organizations/projects is shared (`sharedScopeBootRead`), so every
//     caller awaits a whole tree without a host in-flight map
//   - otherwise → fire a new fetch
//
// Refresh is an explicit user action (a "Refresh" button click). Route
// changes, app focus, render cycles, and component mounts do not trigger
// refetches. Period.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { forgetSharedScopeBootRead, scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { getUserId } from "@/utils/auth/getUserId";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export interface EnsureScopeTreeOptions {
  refresh?: boolean;
  /**
   * THE ADMIN LANE. Set ONLY by `/administration/**` routes (the
   * platform-admin scope console): additionally load THIS organization's tree
   * through the platform-admin read arm (`scopesService.getOrganizationTreeForAdmin`),
   * even when the admin is not a member. User-page routes never pass it — on a
   * user page the admin is an ordinary person, and the service refuses the
   * read off the admin section anyway. Release it with
   * `scopesActions.adminLaneOrganizationReleased(id)` when the console closes.
   */
  adminOrganizationId?: string | null;
}

export type AdminOrganizationTreeResult =
  | { status: "member" | "loaded" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * The admin-lane mode of the one tree loader (see EnsureScopeTreeOptions):
 * loads the membership tree, then — for an organization the admin is not a
 * member of — that organization's tree through the platform-admin read arm.
 * Answers what it found so the console can say "not found" / "could not
 * load" honestly instead of rendering an empty list.
 */
export function ensureAdminOrganizationTree(
  organizationId: string,
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<AdminOrganizationTreeResult>> {
  return async (dispatch, getState) => {
    const refresh = opts.refresh ?? false;
    await dispatch(ensureScopeTree({ refresh }));
    const state = getState().scopesTree;
    if (state.organizationIds.includes(organizationId)) {
      return { status: "member" };
    }
    if (!refresh && state.organizations[organizationId]?.admin_lane) {
      return { status: "loaded" };
    }
    const res = await scopesService.getOrganizationTreeForAdmin(organizationId);
    if (!res.ok) return { status: "error", message: res.error.message };
    if (!res.data.organization) return { status: "not_found" };
    dispatch(scopesActions.adminLaneOrganizationLoaded(res.data.organization));
    return { status: "loaded" };
  };
}

export function ensureScopeTree(
  opts: EnsureScopeTreeOptions = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false, adminOrganizationId } = opts;
    if (adminOrganizationId && getUserId()) {
      // The membership tree first (it decides whether this org is the
      // admin's own), then the admin-lane arm for a non-member org.
      await dispatch(ensureAdminOrganizationTree(adminOrganizationId, { refresh }));
      return;
    }
    const state = getState().scopesTree;

    // No user yet = expected state, NOT an error. Every product surface fires
    // this on mount (the org picker, context pickers, notes, …); firing before
    // auth hydrates — a genuine race on (public) routes where auth lands async,
    // or a real anonymous visitor — must NOT throw "Not authenticated" and
    // stamp treeStatus:'error'. No-op and stay 'idle'; the caller's auth-gated
    // effect re-fires this once a user id lands. Mirrors the canonical
    // getUserId()-null guard (activeOrgBootstrap.ts, audioChunkJournal.ts).
    if (!getUserId()) return;

    if (!refresh && state.treeStatus === "ready") return;

    // A refresh asks for her organizations and projects again (lane PAGE-BUNDLE-2).
    if (refresh) forgetSharedScopeBootRead();
    dispatch(scopesActions.treeFetchPending());

    const res = await scopesService.getScopeTree();
    if (!res.ok) {
      dispatch(scopesActions.treeFetchRejected(res.error.message));
    } else {
      dispatch(scopesActions.treeFetchFulfilled(res.data));
    }
  };
}
