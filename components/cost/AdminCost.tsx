"use client";

/**
 * components/cost/AdminCost.tsx — admin costs as elements that SUBSCRIBE to the points rate (lane
 * DRILL-CLOSE, VERIFY-DRILL-FINAL L-b): for table cells and column definitions written outside a
 * component, where a hook cannot be called. A cell drawn before the `billing.points_per_usd` knob
 * snapshot lands fills in its points when it does, never stuck on "—".
 */

import { formatAdminPoints } from "./formatAdminCost";
import { usePointsRate } from "./pointsRate.client";
import { useAdminCost } from "./useAdminCost";

/** "$0.0204 · 408 points". */
export function AdminCost({ usd, unknown }: { usd: number | null | undefined; unknown?: string }) {
  const format = useAdminCost();
  return <>{format(usd, { unknown })}</>;
}

/** "408 points". */
export function AdminPoints({ usd }: { usd: number | null | undefined }) {
  const rate = usePointsRate();
  return <>{formatAdminPoints(usd, rate)}</>;
}
