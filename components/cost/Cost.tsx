"use client";

/**
 * components/cost/Cost.tsx
 *
 * THE way a cost reaches the screen. Pass the USD figure the server gave you;
 * everyone sees points, a system admin who flipped the switch sees dollars.
 * An unmeasured cost (`null`) renders "—", never a confident zero.
 *
 * Use `<CostBadge>` for the tier-coloured "this will cost you" chip beside an
 * expensive action; use `useCostDisplay().format` where only a string fits.
 */

import { cn } from "@/lib/utils";
import { formatCost } from "@ai-matrx/kit/format";
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
  const { unit, canToggle, format } = useCostDisplay();
  const text = format(usd, { short, unknown });
  const known = typeof usd === "number" && Number.isFinite(usd);
  // An admin sees the other unit on hover — reconciliation without a toggle
  // round-trip. Nobody else gets a title that could carry money.
  const title =
    canToggle && known
      ? formatCost(usd, { unit: unit === "usd" ? "points" : "usd" })
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
