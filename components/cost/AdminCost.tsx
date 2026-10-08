"use client";

/**
 * components/cost/AdminCost.tsx — admin costs as elements that SUBSCRIBE to the points rate (lane
 * DRILL-CLOSE, VERIFY-DRILL-FINAL L-b): for table cells and column definitions written outside a
 * component, where a hook cannot be called. A cell drawn before the `billing.points_per_usd` knob
 * snapshot lands fills in its points when it does, never stuck on "—".
 */

import { formatAdminPoints, formatAdminUsd } from "./formatAdminCost";
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

/** "$0.0204" — the USD half of an admin cost, for a labelled figure or tile. */
export function AdminUsd({ usd }: { usd: number | null | undefined }) {
  return <>{formatAdminUsd(usd)}</>;
}

/**
 * A toolbar line of labelled money figures, dollars and points apart (owner, 2026-10-08:
 * never "$x · y points" in one value). Each item becomes "<label> $" and "<pointsLabel>".
 */
export function CostFigures({ items }: { items: { usdLabel: string; pointsLabel: string; usd: number | null | undefined }[] }) {
  return (
    <span className="flex items-center gap-3 whitespace-nowrap text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.usdLabel} className="flex items-center gap-3">
          <span>
            {it.usdLabel} <span className="font-medium tabular-nums text-foreground"><AdminUsd usd={it.usd} /></span>
          </span>
          <span>
            {it.pointsLabel} <span className="font-medium tabular-nums text-foreground"><AdminPoints usd={it.usd} /></span>
          </span>
        </span>
      ))}
    </span>
  );
}
