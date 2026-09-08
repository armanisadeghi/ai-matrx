/**
 * mandates / org-switch cache middleware
 *
 * DROP EVERY CACHED MANDATE RESOLUTION WHEN THE ACTIVE ORGANIZATION CHANGES.
 *
 * Under the one-resolution ruling (D-R1, Arman 2026-09-01) the middle rung of
 * the ladder is the ACTIVE organization: "If there is no user-level setting, but
 * there is one at the level of THE ACTIVE ORG they are in, then that one is
 * used." So a resolved verdict is true for one person **in one workspace**, and
 * the moment the workspace changes every cached verdict is a potential lie.
 *
 * Keying the cache on the org (`features/mandates/service.ts`) is necessary and
 * not sufficient: without this middleware a user toggling between two orgs
 * accumulates two live entries per job and each keeps answering from whichever
 * five-minute window it was written in. Review §12 named exactly this —
 * "adding the org to the key is necessary but the switch must also drop stale
 * entries".
 *
 * WHY A MIDDLEWARE AND NOT A REDUCER: dropping a module-level cache is a side
 * effect, and reducers are pure. This mirrors `agentCacheBustMiddleware`
 * (`features/agents/redux/agent-definition/cache-bust-middleware.ts`) — the
 * repo's existing pattern for "a Redux write invalidates a non-Redux cache".
 *
 * WHY IT COMPARES BEFORE/AFTER RATHER THAN MATCHING ACTION NAMES ALONE:
 * `setOrganization` is dispatched on rehydration and on cross-tab broadcast with
 * the SAME id the store already holds. Evicting on those would throw away a
 * valid cache and re-fetch every mounted mandate on every tab focus. Only a real
 * change of identity evicts.
 *
 * `clearContext` / sign-out is included: the next signed-in user must never be
 * served the previous one's verdicts out of a module-level Map.
 */

import type { Middleware } from "@reduxjs/toolkit";

import { REHYDRATE_ACTION_TYPE } from "@/lib/sync/engine/rehydrate";
import { dropMandateCacheForOrgSwitch } from "@/features/mandates/service";

/**
 * Actions that can change `appContext.organization_id`. Listed explicitly so an
 * unrelated action never pays the state read; the before/after comparison below
 * is what actually decides.
 */
const ORG_CHANGING_ACTION_TYPES = new Set<string>([
  "appContext/setOrganization",
  "appContext/resolveOrganizationForBlockedAction",
  "appContext/setFullContext",
  "appContext/clearContext",
  // The sync engine's rehydrate/reconcile path (`appContextPolicy`) writes the
  // org identity fields when the durable default-org preference disagrees with
  // the local cache — the exact boot-window swap review §6b describes, and the
  // one a name-only match on `appContext/*` would miss.
  REHYDRATE_ACTION_TYPE,
]);

function organizationIdOf(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const appContext = (state as { appContext?: { organization_id?: unknown } })
    .appContext;
  const id = appContext?.organization_id;
  return typeof id === "string" ? id : null;
}

export const mandateOrgSwitchCacheMiddleware: Middleware =
  (storeApi) => (next) => (action) => {
    const type =
      action && typeof action === "object"
        ? (action as { type?: unknown }).type
        : undefined;
    if (typeof type !== "string" || !ORG_CHANGING_ACTION_TYPES.has(type)) {
      return next(action);
    }

    const before = organizationIdOf(storeApi.getState());
    const result = next(action);
    const after = organizationIdOf(storeApi.getState());

    if (before !== after) dropMandateCacheForOrgSwitch();
    return result;
  };
