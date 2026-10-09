"use client";

/**
 * components/cost/useAdminCost.ts
 *
 * THE RENDER FACE OF THE ADMIN COST FORMATTER (lane DRILL-CLOSE, VERIFY-DRILL-FINAL L-b). Returns
 * `formatAdminCost` bound to the SUBSCRIBED points rate (`usePointsRate`), so a cost drawn before the
 * `billing.points_per_usd` knob snapshot lands fills in its points the moment it does, instead of
 * reading "$0.0204 · —" until something else happens to re-render the screen.
 */

import { useCallback } from "react";
import { formatAdminCost } from "./formatAdminCost";
import { usePointsRate } from "./pointsRate.client";
import { formatAdminPoints } from "./formatAdminCost";
import { useSeesDollars } from "./useCostDisplay";

export type AdminCostFormat = (
  usd: number | null | undefined,
  options?: { short?: boolean; unknown?: string },
) => string;

export function useAdminCost(): AdminCostFormat {
  const rate = usePointsRate();
  const sees = useSeesDollars();
  // A user (an organization admin included) gets points alone, never "$x · y points".
  return useCallback<AdminCostFormat>(
    (usd, options) =>
      sees
        ? formatAdminCost(usd, { ...options, rate })
        : usd == null || !Number.isFinite(usd)
          ? (options?.unknown ?? "—")
          : formatAdminPoints(usd, rate),
    [rate, sees],
  );
}

export { usePointsRate as useAdminRate };
