"use client";

/**
 * The ONE freshness line. Every surface that prints Google numbers — the
 * Search Console dashboard header, the site card, the GA4 panel — renders this
 * component, so the wording, the thresholds and the warning state cannot drift
 * per screen (`features/marketing/google/freshness.ts` holds the rule).
 */

import { AlertTriangle, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  describeFreshness,
  useFreshnessWarningHours,
  type FreshnessProvider,
} from "@/features/marketing/google/freshness";

export interface DataFreshnessLineProps {
  provider: FreshnessProvider;
  dataThrough: string | null;
  pulledAt: string | null;
  /** The property's own timezone, when the provider reports one (GA4 does). */
  timezone?: string | null;
  /** `inline` for a header strip, `block` for a panel row. */
  variant?: "inline" | "block";
  className?: string;
}

export function DataFreshnessLine({
  provider,
  dataThrough,
  pulledAt,
  timezone,
  variant = "block",
  className,
}: DataFreshnessLineProps) {
  const knob = useFreshnessWarningHours();
  const freshness = describeFreshness({
    provider,
    dataThrough,
    pulledAt,
    warningAfterHours: knob.hours,
  });
  // A clock ahead of the reader's and a data day from the future are BOTH
  // conditions the line must wear, not just mention (round-2 verdict NEW-B7).
  const warn =
    freshness.stale ||
    freshness.neverPulled ||
    freshness.clockAhead ||
    freshness.dataThroughInFuture;
  const Icon = warn ? AlertTriangle : Clock;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        variant === "inline" && "flex-row items-center gap-1.5",
        className,
      )}
    >
      <p
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-[11px] leading-4",
          warn ? "text-warning" : "text-muted-foreground",
        )}
      >
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        <span className="min-w-0">
          {freshness.sentence}
          {timezone ? ` · times in ${timezone}` : ""}
        </span>
      </p>
      {freshness.stale ? (
        <p className="text-[11px] leading-4 text-warning">
          {`This is older than the ${knob.hours} hours your organization allows before a number is called stale — run a sync to refresh it.`}
        </p>
      ) : null}
      {freshness.thresholdUnavailable ? (
        // Law 4: a stand-in announces itself with its remedy. The line still
        // tells the truth about the data; only the WARNING is unenforced.
        <p className="text-[11px] leading-4 text-muted-foreground">
          {freshness.thresholdUnavailable}
        </p>
      ) : null}
    </div>
  );
}
