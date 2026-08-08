"use client";

/**
 * THE AMBASSADOR COMPONENT — GSC's traffic-class decomposition, embeddable
 * anywhere a site is in scope.
 *
 * Canvas doctrine, rung 6: "A page workspace showing raw GSC numbers while the
 * traffic-class system sits one route away is the exact failure this rung
 * kills." This is the fix. Drop `<GscClassBar siteId=… />` on any surface and
 * it renders the money/educational/brand/mismatch split with period-over-period
 * deltas, every segment drilling into the existing `GscDrilldownWindow`, and a
 * link back to the full dashboard.
 *
 * Rung 1 (table stakes) is non-negotiable here and is why this component owns
 * the labelling rather than its hosts:
 *   • the window is printed AT the data ("Jul 9 – Aug 5"), never three scrolls
 *     away, because every host would otherwise forget it;
 *   • deltas carry units and a compare basis ("vs prev 28 days");
 *   • the empty state names WHAT and WHICH WINDOW, per the ban list;
 *   • every segment is clickable and says so.
 *
 * Reuse note: all data comes from `useGscClassRollup` → `gsc_perf_class_summary`
 * (server-side accuracy contract). Class metadata, tones, and labels come from
 * `GSC_TRAFFIC_CLASSES`. Nothing here re-derives a class or re-aggregates a fact.
 */

import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { formatGscWindow } from "@/features/marketing/search-console/lib/format";
import { buildSearchConsoleUrl } from "@/features/marketing/search-console/lib/url-state";
import {
  formatCount,
  type GscRangeKey,
} from "@/features/marketing/search-console/types";
import {
  useGscClassRollup,
  type GscClassRollupEntry,
} from "./useGscClassRollup";

interface GscClassBarProps {
  siteId: string | null;
  siteName?: string | null;
  range?: GscRangeKey;
  /** `bar` = stacked share bar + legend (default). `tiles` = one card per class. */
  variant?: "bar" | "tiles";
  /** Show the "Search performance" heading + dashboard link. */
  heading?: boolean;
  className?: string;
}

function DeltaText({ entry }: { entry: GscClassRollupEntry }) {
  if (entry.deltaPct === null) {
    // A new class with no prior traffic — "+100%" would be a lie.
    return (
      <span className="text-muted-foreground">
        {entry.cmpClicks === 0 && entry.clicks > 0 ? "new" : "—"}
      </span>
    );
  }
  const up = entry.deltaClicks > 0;
  const flat = entry.deltaClicks === 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        flat && "text-muted-foreground",
        up && "text-success",
        !up && !flat && "text-destructive",
      )}
    >
      {up ? "+" : ""}
      {(entry.deltaPct * 100).toFixed(0)}%
    </span>
  );
}

export function GscClassBar({
  siteId,
  siteName,
  range = "28d",
  variant = "bar",
  heading = true,
  className,
}: GscClassBarProps) {
  const { rollup, isLoading, error } = useGscClassRollup(siteId, range);
  const openDrilldown = useOpenGscDrilldownWindow();

  if (!siteId) return null;

  if (isLoading) {
    return (
      <div
        className={cn("rounded-lg border border-border bg-card p-3", className)}
      >
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-2 w-full animate-pulse rounded bg-muted" />
        <div className="mt-3 flex gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 w-16 animate-pulse rounded bg-muted" />
          ))}
        </div>
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

  // Ban list: an empty state must say WHAT and WHICH WINDOW.
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
            No Search Console clicks or impressions for this site
            {windowLabel ? ` between ${windowLabel}` : ""}.
          </span>
        </div>
      </div>
    );
  }

  const drill = (entry: GscClassRollupEntry) => {
    openDrilldown({
      siteId,
      siteName: siteName ?? null,
      dimension: "query",
      range,
      compare: "prev",
      title: `${entry.label} queries${siteName ? ` — ${siteName}` : ""}`,
    });
  };

  const dashboardHref = buildSearchConsoleUrl({
    siteId,
    tab: "insights",
    range,
    customFrom: null,
    customTo: null,
    compare: "prev",
    filters: {},
    ruleId: null,
    insight: "quality",
  });

  const visible = rollup.classes.filter((c) => c.clicks > 0);
  const shown = visible.length > 0 ? visible : rollup.classes;

  return (
    <div
      className={cn("rounded-lg border border-border bg-card p-3", className)}
    >
      {heading ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-medium text-foreground">
              Search performance by traffic class
            </h3>
            {/* Rung 1: the period lives AT the data. */}
            <p className="truncate text-[11px] text-muted-foreground">
              {formatCount(rollup.totalClicks)} clicks · {windowLabel} · vs prev{" "}
              {rollup.periods.compare
                ? formatGscWindow(rollup.periods.compare)
                : "period"}
            </p>
          </div>
          <Link
            href={dashboardHref}
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            Search Console
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      ) : null}

      {variant === "bar" ? (
        <>
          <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`Traffic class share: ${shown
              .map((c) => `${c.label} ${(c.share * 100).toFixed(0)}%`)
              .join(", ")}`}
          >
            {shown.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => drill(c)}
                title={`${c.label}: ${formatCount(c.clicks)} clicks (${(
                  c.share * 100
                ).toFixed(0)}%) — click to drill`}
                aria-label={`Drill into ${c.label} queries`}
                className={cn(
                  "h-full transition-opacity hover:opacity-70",
                  CLASS_BG[c.key] ?? "bg-muted-foreground",
                )}
                style={{ width: `${Math.max(c.share * 100, c.clicks > 0 ? 2 : 0)}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {shown.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => drill(c)}
                title={`${c.description} — click to drill into ${c.label} queries`}
                className="group flex items-center gap-1.5 text-[11px] hover:underline"
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    CLASS_BG[c.key] ?? "bg-muted-foreground",
                  )}
                />
                <span className="text-muted-foreground group-hover:text-foreground">
                  {c.label}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatCount(c.clicks)}
                </span>
                <DeltaText entry={c} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {shown.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => drill(c)}
              title={`${c.description} — click to drill`}
              className="rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-primary/50"
            >
              <div className={cn("text-[11px] font-medium", c.tone)}>
                {c.label}
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                {formatCount(c.clicks)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                <DeltaText entry={c} /> · {(c.share * 100).toFixed(0)}% of clicks
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Background tokens per class. `GSC_TRAFFIC_CLASSES.tone` carries the TEXT
 * class; a fill needs its own token, and semantic classes are mandatory
 * (CLAUDE.md § UI standards) so this maps rather than inlining hex.
 */
const CLASS_BG: Record<string, string> = {
  money: "bg-success",
  educational: "bg-primary",
  brand: "bg-chart-4",
  mismatch: "bg-destructive",
  unclassified: "bg-muted-foreground/40",
};
