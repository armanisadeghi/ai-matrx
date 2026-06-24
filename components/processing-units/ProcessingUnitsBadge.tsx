/**
 * components/processing-units/ProcessingUnitsBadge.tsx
 *
 * The canonical "what will this cost" chip. Pass `units` directly or a `costUsd`
 * we convert. Tier-colored so a large run reads as a warning at a glance, with a
 * native-title explanation (no Tooltip provider dependency — works anywhere).
 *
 * This is the single platform-wide way to surface Processing Units in the UI.
 * Drop it next to any expensive action; never hand-roll a cost chip.
 */

import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  costToUnits,
  formatUnits,
  unitTier,
  type UnitTier,
} from "@/lib/processing-units/units";

const TIER_CLASS: Record<UnitTier, string> = {
  free: "text-muted-foreground border-border bg-muted/40",
  low: "text-emerald-700 dark:text-emerald-400 border-emerald-300/50 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30",
  moderate:
    "text-sky-700 dark:text-sky-400 border-sky-300/50 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30",
  high: "text-amber-700 dark:text-amber-400 border-amber-400/60 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30",
  very_high:
    "text-red-700 dark:text-red-400 border-red-400/60 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30",
};

const TIER_HINT: Record<UnitTier, string> = {
  free: "No AI cost — deterministic or read-only.",
  low: "Small AI job.",
  moderate: "Moderate AI job.",
  high: "Large AI job — consider running a sample first.",
  very_high: "Very large AI job — strongly consider a sample first.",
};

export interface ProcessingUnitsBadgeProps {
  /** Provide units directly… */
  units?: number;
  /** …or a USD cost we convert for you. */
  costUsd?: number;
  className?: string;
  /** Hide the leading gauge icon (for tight inline contexts). */
  hideIcon?: boolean;
  /** "1,234 PU" instead of "1,234 units". */
  short?: boolean;
}

export function ProcessingUnitsBadge({
  units,
  costUsd,
  className,
  hideIcon,
  short,
}: ProcessingUnitsBadgeProps) {
  const value = typeof units === "number" ? units : costToUnits(costUsd);
  const tier = unitTier(value);
  return (
    <span
      title={`Processing Units — an estimate of the AI work this step consumes. ${TIER_HINT[tier]}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none",
        TIER_CLASS[tier],
        className,
      )}
    >
      {!hideIcon && <Gauge className="h-3 w-3 shrink-0" />}
      {formatUnits(value, { short })}
    </span>
  );
}
