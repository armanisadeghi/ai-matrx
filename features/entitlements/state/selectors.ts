// features/entitlements/state/selectors.ts
//
// Every property has its own memoized selector (Redux doctrine). The
// entitlement verdict per capability is derived here so the hook is a thin
// wrapper and server/UI stay in agreement on the resolution logic.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { getCapability, type Capability } from "../registry";
import type { EntitlementResult, EntitlementTier } from "../types";

const selectEntitlementsState = (state: RootState) => state.entitlements;

export const selectEntitlementTier = createSelector(
  selectEntitlementsState,
  (e): EntitlementTier => e.tier,
);

export const selectIsSubscribed = createSelector(
  selectEntitlementsState,
  (e) => e.isSubscribed,
);

export const selectTrialEndsAt = createSelector(
  selectEntitlementsState,
  (e) => e.trialEndsAt,
);

export const selectEntitlementsLoading = createSelector(
  selectEntitlementsState,
  (e) => e.isLoading,
);

export const selectEntitlementsError = createSelector(
  selectEntitlementsState,
  (e) => e.error,
);

/**
 * The verdict for one capability, derived from the hydrated snapshot + the
 * registry. This mirrors the resolver RPC's logic so the client can render
 * `remaining` BEFORE an action without a round-trip; the server re-check is
 * still truth at spend time.
 *
 * Cache one selector instance per capability so referential identity is stable.
 */
const verdictSelectorCache = new Map<
  Capability,
  (state: RootState) => EntitlementResult
>();

export function makeSelectEntitlement(
  capability: Capability,
): (state: RootState) => EntitlementResult {
  const cached = verdictSelectorCache.get(capability);
  if (cached) return cached;

  const selector = createSelector(
    selectEntitlementsState,
    (e): EntitlementResult => {
      const dfn = getCapability(capability);
      const isLoading = e.isLoading;

      // Per-capability rollout switch: until enforcement flips, everyone is
      // allowed. Loud-in-dev happens in the hook (a UI concern), not here.
      if (!dfn.enforced) {
        const usage = e.usage[capability];
        return {
          capability,
          allowed: true,
          remaining: usage?.limit != null ? Math.max(usage.limit - usage.used, 0) : null,
          limit: usage?.limit ?? null,
          used: usage?.used ?? 0,
          tier: e.tier,
          reason: "permissive_stub",
          period: dfn.period,
          isLoading,
        };
      }

      // Premium (paid or trialing): unlimited across metered capabilities.
      if (e.tier === "premium" || e.tier === "trial") {
        return {
          capability,
          allowed: true,
          remaining: null,
          limit: null,
          used: e.usage[capability]?.used ?? 0,
          tier: e.tier,
          reason: "allowed",
          period: dfn.period,
          isLoading,
        };
      }

      // Free tier: apply the snapshot's per-capability cap (resolver-provided,
      // falling back to the registry's design default).
      const usage = e.usage[capability];
      const limit = usage?.limit ?? dfn.defaultFreeLimit;
      const used = usage?.used ?? 0;

      if (limit == null) {
        return {
          capability,
          allowed: true,
          remaining: null,
          limit: null,
          used,
          tier: e.tier,
          reason: "allowed",
          period: dfn.period,
          isLoading,
        };
      }

      const remaining = Math.max(limit - used, 0);
      return {
        capability,
        allowed: remaining > 0,
        remaining,
        limit,
        used,
        tier: e.tier,
        reason: remaining > 0 ? "allowed" : "cap_reached",
        period: dfn.period,
        isLoading,
      };
    },
  );

  verdictSelectorCache.set(capability, selector);
  return selector;
}
