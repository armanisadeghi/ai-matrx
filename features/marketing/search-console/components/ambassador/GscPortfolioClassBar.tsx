"use client";

/**
 * Portfolio ambassador — the traffic-class split across MANY sites (a brand's
 * websites, or every site on the hub).
 *
 * Same doctrine as `GscClassBar`, one level up: rung 2 says the raw portfolio
 * total is never the headline, and rung 6 says this belongs wherever it helps
 * rather than only on the GSC route. Brand pages carried no search data at all
 * before this.
 *
 * Honesty rules this component owns:
 *   • states how many sites actually contributed, because a portfolio number
 *     that silently covers 3 of 9 sites is a lie of omission;
 *   • prints the window at the data;
 *   • empty state names what was looked for and where.
 */

import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { formatGscWindow } from "@/features/marketing/search-console/lib/format";
import {
  formatCount,
  type GscRangeKey,
} from "@/features/marketing/search-console/types";
import { useGscPortfolioRollup } from "./useGscPortfolioRollup";

const CLASS_BG: Record<string, string> = {
  money: "bg-success",
  educational: "bg-primary",
  brand: "bg-chart-4",
  mismatch: "bg-destructive",
  unclassified: "bg-muted-foreground/40",
};

interface GscPortfolioClassBarProps {
  siteIds: readonly string[];
  /** Total sites in scope — lets us say "3 of 9 have Search Console data". */
  totalSites?: number;
  range?: GscRangeKey;
  title?: string;
  className?: string;
}

export function GscPortfolioClassBar({
  siteIds,
  totalSites,
  range = "28d",
  title = "Search performance by traffic class",
  className,
}: GscPortfolioClassBarProps) {
  const { rollup, isLoading, error } = useGscPortfolioRollup(siteIds, range);

  if (siteIds.length === 0) return null;

  if (isLoading) {
    return (
      <div
        className={cn("rounded-lg border border-border bg-card p-3", className)}
      >
        <div className="h-3 w-44 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-2 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-lg border border-destructive/40 bg-destructive/5 p-3",
          className,
        )}
      >
        <p className="text-xs text-destructive">
          Search performance unavailable:{" "}
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  const windowLabel = rollup ? formatGscWindow(rollup.periods.current) : "";

  if (!rollup || !rollup.hasData) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border bg-muted/20 p-3",
          className,
        )}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span>
            No Search Console data across{" "}
            {siteIds.length === 1 ? "this site" : `these ${siteIds.length} sites`}
            {windowLabel ? ` between ${windowLabel}` : ""}. Connect Search
            Console on a site to populate this.
          </span>
        </div>
      </div>
    );
  }

  // Keep collapsed classes: money 500 -> 0 must still render its -100%.
  const shown = rollup.classes.filter((c) => c.clicks > 0 || c.cmpClicks > 0);
  const withClicks = shown.filter((c) => c.clicks > 0);
  const coverage =
    totalSites && totalSites > rollup.contributingSites
      ? `${rollup.contributingSites} of ${totalSites} sites`
      : `${rollup.contributingSites} site${rollup.contributingSites === 1 ? "" : "s"}`;

  if (shown.length === 0) {
    // Impressions but zero clicks across the whole portfolio: an empty bar with
    // an empty legend would say nothing. Say the actual thing.
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border bg-muted/20 p-3",
          className,
        )}
      >
        <p className="text-xs text-muted-foreground">
          {formatCount(rollup.totalImpressions)} impressions and no clicks
          across {coverage} · {windowLabel}.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-card p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-medium text-foreground">{title}</h3>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatCount(rollup.totalClicks)} clicks · {coverage} · {windowLabel}
          </p>
        </div>
        <Link
          href="/marketing/search-console"
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          Search Console
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Traffic class share: ${withClicks
          .map((c) => `${c.label} ${(c.share * 100).toFixed(0)}%`)
          .join(", ")}`}
      >
        {withClicks.map((c) => (
          <div
            key={c.key}
            title={`${c.label}: ${formatCount(c.clicks)} clicks (${(
              c.share * 100
            ).toFixed(0)}%)`}
            className={cn("h-full", CLASS_BG[c.key] ?? "bg-muted-foreground")}
            style={{ width: `${Math.max(c.share * 100, 2)}%` }}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((c) => (
          <span
            key={c.key}
            title={c.description}
            className="flex items-center gap-1.5 text-[11px]"
          >
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                CLASS_BG[c.key] ?? "bg-muted-foreground",
              )}
            />
            <span className="text-muted-foreground">{c.label}</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatCount(c.clicks)}
            </span>
            {c.deltaPct === null ? null : (
              <span
                className={cn(
                  "tabular-nums",
                  c.deltaClicks > 0 && "text-success",
                  c.deltaClicks < 0 && "text-destructive",
                  c.deltaClicks === 0 && "text-muted-foreground",
                )}
              >
                {c.deltaClicks > 0 ? "+" : ""}
                {Math.round(c.deltaPct * 100) === 0
                  ? 0
                  : Math.round(c.deltaPct * 100)}
                %
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
