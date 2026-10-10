"use client";

/**
 * components/cost/Cost.tsx
 *
 * THE way a cost reaches the screen. Pass the USD figure the server gave you;
 * administration sees dollars and points; other pages follow the viewer's
 * selected unit.
 * An unmeasured cost (`null`) renders "—", never a confident zero.
 *
 * Use `<CostBadge>` for the tier-coloured "this will cost you" chip beside an
 * expensive action; use `useCostDisplay().format` where only a string fits.
 */

import { cn } from "@/lib/utils";
import { formatAdminPoints, formatSpendUsd } from "./formatAdminCost";
import { useCostDisplay } from "./useCostDisplay";

export interface CostProps {
  /** The cost in USD, exactly as the server reported it. */
  usd: number | null | undefined;
  className?: string;
  /** `"1,234 pts"` instead of `"1,234 points"` (dense tables, chips). */
  short?: boolean;
  /** Prefix such as `"~"` for an estimate. */
  prefix?: string;
  /** Dim the value (a zero / not-applicable row) without hiding it. */
  muted?: boolean;
  /** Replaces the "—" shown for an unmeasured cost. */
  unknown?: string;
}

export function Cost({
  usd,
  className,
  short,
  prefix,
  muted,
  unknown,
}: CostProps) {
  const { unit, canToggle, format, rate } = useCostDisplay();
  const text = format(usd, { short, unknown });
  const known = typeof usd === "number" && Number.isFinite(usd);
  // The title remains useful outside administration, where the admin can
  // still choose a single display unit from the header switch.
  const title =
    canToggle && known
      ? unit === "usd"
        ? formatAdminPoints(usd, rate)
        : formatSpendUsd(usd)
      : undefined;
  return (
    <span
      className={cn("tabular-nums", muted && "opacity-50", className)}
      title={title}
    >
      {known && prefix ? prefix : null}
      {text}
    </span>
  );
}
