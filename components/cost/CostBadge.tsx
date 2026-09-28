"use client";

/**
 * components/cost/CostBadge.tsx
 *
 * The canonical "what will this cost" chip beside an expensive action. Tier-
 * coloured so a large run reads as a warning at a glance. Renders through
 * `useCostDisplay`, so a member sees points and only an admin who flipped the
 * switch sees dollars. (Replaces the retired 2,000-per-dollar
 * "Processing Units" badge — points are the one unit.)
 */

import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCostDisplay } from "./useCostDisplay";
import { costTier, type CostTier } from "./costTier";

const TIER_CLASS: Record<CostTier, string> = {
  free: "text-muted-foreground border-border bg-muted/40",
  low: "text-emerald-700 dark:text-emerald-400 border-emerald-300/50 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30",
  moderate:
    "text-sky-700 dark:text-sky-400 border-sky-300/50 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30",
  high: "text-amber-700 dark:text-amber-400 border-amber-400/60 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30",
  very_high:
    "text-red-700 dark:text-red-400 border-red-400/60 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30",
};

const TIER_HINT: Record<CostTier, string> = {
  free: "No AI cost — deterministic or read-only.",
  low: "Small AI job.",
  moderate: "Moderate AI job.",
  high: "Large AI job — consider running a sample first.",
  very_high: "Very large AI job — strongly consider a sample first.",
};

export interface CostBadgeProps {
  /** The (estimated or actual) cost in USD. */
  usd: number | null | undefined;
  className?: string;
  /** Hide the leading gauge icon (tight inline contexts). */
  hideIcon?: boolean;
  short?: boolean;
}

export function CostBadge({ usd, className, hideIcon, short }: CostBadgeProps) {
  const { format, toPoints } = useCostDisplay();
  const tier = costTier(toPoints(usd) ?? 0);
  return (
    <span
      title={`An estimate of the AI work this step uses. ${TIER_HINT[tier]}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none",
        TIER_CLASS[tier],
        className,
      )}
    >
      {!hideIcon && <Gauge className="h-3 w-3 shrink-0" />}
      {format(usd, { short })}
    </span>
  );
}
