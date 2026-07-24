"use client";

/**
 * components/processing-units/CostValue.tsx
 *
 * Renders one cost figure the way the platform is allowed to show it:
 * Processing Units for everyone, with the raw USD appended for admins only.
 * Backed by `useCostDisplay`, so the admin rule lives in exactly one place.
 *
 * Use this inside tables and stat tiles. Use `<ProcessingUnitsBadge>` when you
 * want the tier-colored "this will cost you" chip next to an action button.
 */

import { cn } from "@/lib/utils";
import { useCostDisplay } from "./useCostDisplay";

export interface CostValueProps {
  costUsd: number | null | undefined;
  className?: string;
  /** Stack the USD under the units instead of appending it inline. */
  stacked?: boolean;
  /** "1,234 PU" instead of "1,234 units". */
  short?: boolean;
  /**
   * Dim the whole value (for a zero / not-applicable row) without hiding it,
   * so an empty phase still lines up in a table.
   */
  muted?: boolean;
}

export function CostValue({
  costUsd,
  className,
  stacked,
  short,
  muted,
}: CostValueProps) {
  const { showUsd, units, usd } = useCostDisplay();
  const unpriced = costUsd == null;

  if (stacked) {
    return (
      <span
        className={cn(
          "inline-flex flex-col items-end leading-tight tabular-nums",
          muted && "opacity-50",
          className,
        )}
      >
        <span>{unpriced ? "—" : units(costUsd, { short })}</span>
        {showUsd && (
          <span className="text-[10px] text-muted-foreground">
            {usd(costUsd)}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn("tabular-nums", muted && "opacity-50", className)}
    >
      {unpriced ? "—" : units(costUsd, { short })}
      {showUsd && (
        <span className="ml-1.5 text-[10px] text-muted-foreground">
          {usd(costUsd)}
        </span>
      )}
    </span>
  );
}
