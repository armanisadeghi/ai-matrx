// features/entitlements/state/selectors.ts
//
// Every property has its own memoized selector (Redux doctrine). The
// entitlement verdict per capability is DERIVED from the boot-hydrated snapshot
// so the hook is a thin wrapper and the UI can render `remaining` without a
// round-trip. The resolver RPC (server truth) computed the windows; the client
// only presents the most-restrictive one. `check()` is authoritative at spend.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { type Capability } from "../registry";
import type {
  EntitlementResult,
  EntitlementTier,
  EntitlementWindow,
} from "../types";

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
 * The most-restrictive (binding) window. Compares raw `limit - used` (which can
 * go negative when over-cap) to match the server resolver's ordering exactly, so
 * the reactive meter and the `check()` verdict never disagree on the binding
 * window at a tie.
 */
function bindingWindow(windows: EntitlementWindow[]): EntitlementWindow | null {
  if (windows.length === 0) return null;
  const slack = (w: EntitlementWindow) => w.limit - w.used;
  return windows.reduce((a, b) => (slack(b) < slack(a) ? b : a));
}

/**
 * The verdict for one capability, derived from the hydrated snapshot.
 *
 * The snapshot only carries usage for ENFORCED, metered capabilities. Absence =
 * unenforced or unlimited → allowed with no cap. Presence → the binding window
 * decides `allowed`. Cache one selector instance per capability for referential
 * stability.
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
      const isLoading = e.isLoading;
      const usage = e.usage[capability];

      // No metered usage entry → unenforced or unlimited. Allowed, uncapped.
      if (!usage || usage.windows.length === 0) {
        return {
          capability,
          allowed: true,
          remaining: null,
          limit: null,
          used: 0,
          tier: e.tier,
          reason: "allowed",
          period: null,
          windows: [],
          isLoading,
        };
      }

      const binding = bindingWindow(usage.windows)!;
      const allowed = usage.windows.every((w) => w.remaining > 0);
      return {
        capability,
        allowed,
        remaining: binding.remaining,
        limit: binding.limit,
        used: binding.used,
        tier: e.tier,
        reason: allowed ? "allowed" : "cap_reached",
        period: binding.period,
        windows: usage.windows,
        isLoading,
      };
    },
  );

  verdictSelectorCache.set(capability, selector);
  return selector;
}
