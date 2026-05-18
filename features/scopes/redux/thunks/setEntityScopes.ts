// features/scopes/redux/thunks/setEntityScopes.ts
//
// The M2M tagging mutation used by Surface B pickers (EntityScopeTagger).
//
// CRITICAL: this thunk only writes to ctx_scope_assignments via the
// scopesService chokepoint. It NEVER dispatches setOrganization,
// setScopeSelections, setProject, setTask, or any other appContextSlice
// action — that path is reserved for Surface A. The global-vs-local
// invariant in features/scopes/FEATURE.md depends on this being true.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { entityScopesKey } from "@/features/scopes/redux/thunks/ensureEntityScopes";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";
import type { ScopeAssignmentEntityType } from "@/features/scopes/types";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export interface SetEntityScopesArgs {
  entityType: ScopeAssignmentEntityType;
  entityId: string;
  scopeIds: string[];
  /** Optional org id — used to patch the cached `projects[].scope_ids` array. */
  organizationId?: string;
}

export interface SetEntityScopesResult {
  ok: boolean;
  scope_ids: string[];
  error?: string;
}

export function setEntityScopes(
  args: SetEntityScopesArgs,
): AppThunk<Promise<SetEntityScopesResult>> {
  return async (dispatch) => {
    const res = await scopesService.setEntityScopes(
      args.entityType,
      args.entityId,
      args.scopeIds,
    );

    if (isScopesRpcErr(res)) {
      return { ok: false, scope_ids: [], error: res.error.message };
    }

    // Authoritatively populate the per-entity assignment cache so
    // EntityScopeTagger and the resolver see the new state immediately.
    dispatch(
      scopesActions.entityScopesUpdated({
        key: entityScopesKey(args.entityType, args.entityId),
        scope_ids: res.data.scope_ids,
      }),
    );

    // Patch the canonical tree slice for project assignments so consumers
    // that filter on `project.scope_ids` see the update without a refetch.
    if (args.entityType === "project" && args.organizationId) {
      dispatch(
        scopesActions.projectScopesUpdated({
          organizationId: args.organizationId,
          projectId: args.entityId,
          scopeIds: res.data.scope_ids,
        }),
      );
    }

    return { ok: true, scope_ids: res.data.scope_ids };
  };
}
