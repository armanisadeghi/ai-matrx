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

export type AdminCostFormat = (
  usd: number | null | undefined,
  options?: { short?: boolean; unknown?: string },
) => string;

export function useAdminCost(): AdminCostFormat {
  const rate = usePointsRate();
  return useCallback<AdminCostFormat>((usd, options) => formatAdminCost(usd, { ...options, rate }), [rate]);
}

export { usePointsRate as useAdminRate };
