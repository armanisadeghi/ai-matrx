/**
 * catalogReload — tell the aidream brain to reload its in-memory AI catalog.
 *
 * ai.api.rules / ai.offering.override / ai.setting are read by the Python
 * translation layer at startup and cached; any admin edit to rule data MUST be
 * followed by POST /admin/ai-catalog/reload or the live server keeps routing
 * with stale rules. Every rule-editing save path in features/ai-models
 * dispatches this thunk after a successful write.
 *
 * Uses the canonical callApi thunk (auth, base-URL env selection, scope) —
 * never a raw fetch to the backend.
 */

import type { ThunkAction } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import { toast } from "@/lib/toast";

import { callApi } from "@/lib/api/call-api";
import type { RootState } from "@/lib/redux/store";

/**
 * Reload the backend AI catalog. Returns true on success.
 * Failures surface loudly (toast + console) — a stale catalog after a rule
 * edit is a real defect, never something to swallow.
 */
export const reloadAiCatalog = (): ThunkAction<
  Promise<boolean>,
  RootState,
  unknown,
  UnknownAction
> => {
  return async (dispatch) => {
    // 🚨 NO scopeOverrides — see providerModelsRefresh.ts for the full story.
    // `/admin/ai-catalog/reload` is PLATFORM-scoped: it reads no organization,
    // and an administrator carries their own organization exactly like any
    // other caller. Pinning the request context to the Matrx System org made
    // this 400 `organization_forbidden` on every rule save since it shipped —
    // an admin holds no iam.memberships row in the system org, and the
    // admission gate proves membership on every request, never infers it.
    const result = await dispatch(
      callApi({
        path: "/admin/ai-catalog/reload",
        method: "POST",
      }),
    );
    if (result.error) {
      console.error("[reloadAiCatalog] backend catalog reload failed", result.error);
      toast.error(
        "Saved to the database, but the backend catalog reload FAILED — the live server is still using the old rules.",
        { description: result.error.message },
      );
      return false;
    }
    toast.success("Backend AI catalog reloaded");
    return true;
  };
};
