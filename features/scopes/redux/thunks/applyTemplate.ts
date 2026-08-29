// features/scopes/redux/thunks/applyTemplate.ts
//
// Apply a whole template into an org through the sanctioned `apply_template`
// SECURITY DEFINER RPC (org-explicit; org-access checked inside). The RPC
// creates scope types + context items server-side, so the one honest cache
// update afterwards is a tree refresh (the created rows aren't individually
// echoed in a patchable shape).
//
// Never throws — returns the service's ScopesRpcResult envelope.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  ApplyTemplateResult,
  ScopesRpcResult,
} from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export function applyTemplate(params: {
  template_id: string;
  org_id: string;
}): AppThunk<Promise<ScopesRpcResult<ApplyTemplateResult>>> {
  return async (dispatch) => {
    const res = await scopesService.applyTemplate(params);
    if (!isScopesRpcErr(res)) {
      await dispatch(ensureScopeTree({ refresh: true }));
    }
    return res;
  };
}
