// features/scopes/redux/thunks/ensureScopeSkeleton.ts
//
// THE FIRST PAINT OF THE SCOPE TREE (lane SCOPES-TREE-PAGED).
//
//   ensureScopeSkeleton()        organizations + projects + scope types (no scopes)
//   ensureTypeScopes(typeId)     one type's first page of scopes (more with loadMoreTypeScopes)
//   searchScopes(query)          a server-side search over every scope of her organizations
//
// The skeleton is the store's `custom.context_tree_types` (no counts), and the WHOLE tree still loads for the readers that need it — whenever one calls `ensureScopeTree`, and
// otherwise at idle after boot (`DeferredSingletonCore`), so no reader of the whole tree ever loses a
// scope it had before. Same no-refetch policy as ensureScopeTree: each call dedups and caches.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { forgetSharedScopeBootRead, scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { TYPE_SCOPES_PAGE } from "@ai-matrx/records/scopes";
import { scopeDoors } from "@/features/scopes/service/scopeDoors";
import { getUserId } from "@/utils/auth/getUserId";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

// No host in-flight state: a second ask while a read is out runs the same door call, which the
// records client sends once (its in-flight dedupe), and every reducer here is idempotent (a page is
// merged by scope id), so each caller simply awaits its own answer.

export function ensureScopeSkeleton(opts: { refresh?: boolean } = {}): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    if (!getUserId()) return;
    const s = getState().scopesTree;
    if (!opts.refresh && (s.skeletonStatus === "ready" || s.treeStatus === "ready")) return;
    // A refresh asks for her organizations and projects again (lane PAGE-BUNDLE-2).
    if (opts.refresh) forgetSharedScopeBootRead();
    dispatch(scopesActions.skeletonFetchPending());
    const res = await scopesService.getScopeTree({ shape: "skeleton" });
    if (!res.ok) {
      dispatch(scopesActions.skeletonFetchRejected(res.error.message));
      return;
    }
    dispatch(scopesActions.skeletonFetchFulfilled(res.data));
    // No separate counts call: a count asks the one ladder of every Table — the same work as the
    // whole tree, which loads right behind the first paint (DeferredSingletonCore) and fills every
    // count. A count is an honest dash until then. `readScopeTypes(orgs, true)` stays for a screen
    // that needs counts without the whole tree.
  };
}

function findType(state: RootState, scopeTypeId: string) {
  const s = state.scopesTree;
  for (const id of s.skeletonOrganizationIds) {
    const t = s.skeletonOrganizations[id]?.scope_types.find((x) => x.id === scopeTypeId);
    if (t) return t;
  }
  return null;
}

/** One type's scopes: the first page (`more: true` for the next one). Whole tree loaded = no-op. */
export function ensureTypeScopes(
  scopeTypeId: string,
  opts: { more?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    if (!getUserId() || !scopeTypeId) return;
    const state = getState();
    if (state.scopesTree.treeStatus === "ready") return;
    const entry = state.scopesTree.typeScopes[scopeTypeId];
    if (entry?.status === "complete") return;
    if (entry?.status === "partial" && !opts.more) return;
    const offset = entry?.status === "partial" ? (entry.nextOffset ?? 0) : 0;
    dispatch(scopesActions.typeScopesPending({ scopeTypeId }));
    const res = await scopeDoors().typeScopesPage(scopeTypeId, offset, TYPE_SCOPES_PAGE);
    if (!res.ok) {
      dispatch(scopesActions.typeScopesRejected({ scopeTypeId, error: res.error.message }));
      return;
    }
    const type = findType(getState(), scopeTypeId);
    dispatch(
      scopesActions.typeScopesPageFulfilled({
        organizationId: type?.organization_id ?? res.data.scopes[0]?.organization_id ?? "",
        scopeTypeId,
        offset,
        scopes: res.data.scopes,
        total: res.data.total,
        nextOffset: res.data.next_offset,
      }),
    );
  };
}

/** The search key the slice files an answer under. */
export function scopeSearchKey(query: string): string {
  return query.trim().toLowerCase();
}

/** Every scope of her organizations whose name holds `query`, asked of the server. */
export function searchScopes(query: string, limit = 100): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const key = scopeSearchKey(query);
    if (!getUserId() || key === "") return;
    if (getState().scopesTree.treeStatus === "ready") return;
    const prev = getState().scopesTree.scopeSearch[key];
    if (prev?.status === "ready") return;
    dispatch(scopesActions.scopeSearchPending({ key }));
    const st = getState().scopesTree;
    const orgIds = st.treeStatus === "ready" ? st.organizationIds : st.skeletonOrganizationIds;
    const res = await scopeDoors().search(orgIds, query, limit);
    if (!res.ok) {
      dispatch(scopesActions.scopeSearchRejected({ key, error: res.error.message }));
      return;
    }
    dispatch(scopesActions.scopeSearchFulfilled({ key, scopes: res.data.scopes, total: res.data.total }));
  };
}
