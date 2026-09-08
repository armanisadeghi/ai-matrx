/**
 * activeOrgCookieMiddleware — MIRROR EVERY REAL CHANGE OF THE ACTIVE
 * ORGANIZATION INTO THE SHARED APEX COOKIE.
 *
 * The sync engine already persists `appContext.organization_id` to this
 * origin's IndexedDB/localStorage. That memory is invisible to Workflow Studio
 * (workflows.aimatrx.com), which is why a person who had worked in one
 * organization here for weeks was refused on every Studio request until they
 * chose again. The cookie (`lib/organizations/activeOrgCookie.ts`) is the
 * cross-origin memory; this middleware is its writer.
 *
 * WHY A MIDDLEWARE AND NOT A REDUCER: `document.cookie` is a side effect, and
 * reducers are pure. Mirrors `mandateOrgSwitchCacheMiddleware` — the repo's
 * pattern for "a Redux write has a non-Redux consequence".
 *
 * WHY BEFORE/AFTER AND NOT ACTION NAMES: `setOrganization` also fires on
 * cross-tab broadcast and rehydration with the id the store already holds.
 * Only a real change writes, so the cookie is not rewritten on every tab focus.
 *
 * WHY NULL TRANSITIONS DO NOT CLEAR: `clearContext` is dispatched for UI
 * resets (agent-context hierarchy) as well as sign-out. Forgetting the
 * person's workspace because a picker was emptied would be wrong; the cookie
 * is identity-keyed, so leaving it is safe. Explicit sign-out clears it
 * directly (SignOutMenuItem / AuthSessionWatcher).
 *
 * The user id comes from `userAuth.id` in the SAME state snapshot. No id → no
 * write (a keyless cookie would leak to the next person).
 */

import type { Middleware } from "@reduxjs/toolkit";

import { REHYDRATE_ACTION_TYPE } from "@/lib/sync/engine/rehydrate";
import { activeOrgCookie } from "@/lib/organizations/activeOrgCookie";

const ORG_CHANGING_ACTION_TYPES = new Set<string>([
  "appContext/setOrganization",
  "appContext/resolveOrganizationForBlockedAction",
  "appContext/setFullContext",
  REHYDRATE_ACTION_TYPE,
]);

interface OrgStateShape {
  appContext?: { organization_id?: unknown };
  userAuth?: { id?: unknown };
}

function organizationIdOf(state: unknown): string | null {
  const id = (state as OrgStateShape | null)?.appContext?.organization_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function userIdOf(state: unknown): string | null {
  const id = (state as OrgStateShape | null)?.userAuth?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export const activeOrgCookieMiddleware: Middleware =
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
    const state = storeApi.getState();
    const after = organizationIdOf(state);

    if (after && after !== before) {
      const userId = userIdOf(state);
      if (userId) {
        try {
          activeOrgCookie.write({ userId, organizationId: after });
        } catch (err) {
          // A malformed id (not a UUID) is refused by the package; the Redux
          // write itself has already happened, so say so rather than throw
          // into the dispatch chain.
          console.warn("[activeOrgCookie] could not mirror the active org", err);
        }
      }
    }
    return result;
  };
