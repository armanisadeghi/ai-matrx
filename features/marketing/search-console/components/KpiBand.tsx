"use client";

/**
 * The four GSC metric tiles — each one is ALSO the visibility toggle for its
 * chart series (GSC parity: click a tile to show/hide the line). Compare
 * deltas render under each value when a compare period is active. The band
 * carries its own CopyButtons (human summary / JSON / Copy-for-AI).
 */

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import type {
  GscFilters,
  GscMetric,
  GscResolvedPeriods,
  GscSummaryRow,
} from "@/features/marketing/search-console/types";
import {
  GSC_METRICS,
  formatCount,
  formatCtr,
  formatPosition,
} from "@/features/marketing/search-console/types";
import { gscSummaryCopy } from "@/features/marketing/search-console/lib/copy-payloads";

function metricValue(
  summary: GscSummaryRow | null | undefined,
  metric: GscMetric,
  compare: boolean,
): number | null {
  if (!summary) return null;
  switch (metric) {
    case "clicks":
      return compare ? summary.cmp_clicks : summary.clicks;
    case "impressions":
      return compare ? summary.cmp_impressions : summary.impressions;
    case "ctr":
      return compare ? summary.cmp_ctr : summary.ctr;
    case "position":
      return compare ? summary.cmp_avg_position : summary.avg_position;
  }
}

function formatMetric(metric: GscMetric, value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (metric === "ctr") return formatCtr(value);
  if (metric === "position") return formatPosition(value);
  return formatCount(value);
}

/** For position, LOWER is better — the delta color flips. */
function deltaTone(metric: GscMetric, delta: number): "up" | "down" | "flat" {
  if (delta === 0) return "flat";
  const improved = metric === "position" ? delta < 0 : delta > 0;
  return improved ? "up" : "down";
}

function deltaText(metric: GscMetric, cur: number, prev: number): string {
  const delta = cur - prev;
  if (metric === "ctr") {
    const pts = (delta * 100).toFixed(2);
    return `${delta >= 0 ? "+" : ""}${pts}pp`;
  }
  if (metric === "position") {
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;
  }
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${Math.round(delta).toLocaleString()}`;
}

export function KpiBand({
  siteId,
  siteName,
  periods,
  filters,
  summary,
  isLoading,
  visibleMetrics,
  onToggleMetric,
  compact = false,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  filters: GscFilters;
  summary: GscSummaryRow | null | undefined;
  isLoading: boolean;
  visibleMetrics: readonly GscMetric[];
  onToggleMetric: (metric: GscMetric) => void;
  compact?: boolean;
}) {
  const copy = gscSummaryCopy({
    siteId,
    siteName,
    periods,
    filters,
    summary: summary ?? null,
  });
  return (
    <div className="group/kpi relative">
      <div className="pointer-events-none absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover/kpi:pointer-events-auto group-hover/kpi:opacity-100">
        <CopyButtons
          size="xs"
          label={copy.label}
          human={copy.human}
          agent={copy.agent}
          json={() => summary ?? null}
        />
      </div>
      <div
        className={cn(
          "grid grid-cols-2 gap-1.5 sm:grid-cols-4",
          compact ? "gap-1" : "sm:gap-2",
        )}
      >
        {GSC_METRICS.map((metric) => {
          const active = visibleMetrics.includes(metric.key);
          const cur = metricValue(summary, metric.key, false);
          const prev = periods.compare
            ? metricValue(summary, metric.key, true)
            : null;
          const tone =
            cur !== null && prev !== null
              ? deltaTone(metric.key, cur - prev)
              : null;
          return (
            <button
              key={metric.key}
              type="button"
              aria-pressed={active}
              onClick={() => onToggleMetric(metric.key)}
              className={cn(
                "rounded-md border px-2.5 text-left transition-colors",
                compact ? "py-1.5" : "py-2",
                active
                  ? "border-transparent text-white"
                  : "border-border bg-card text-foreground hover:bg-accent",
              )}
              style={active ? { backgroundColor: metric.color } : undefined}
            >
              <span
                className={cn(
                  "block text-[11px] leading-tight",
                  active ? "text-white/80" : "text-muted-foreground",
                )}
              >
                {metric.label}
              </span>
              <span
                className={cn(
                  "block font-semibold tabular-nums",
                  compact ? "text-base" : "text-lg",
                )}
              >
                {isLoading && cur === null ? "…" : formatMetric(metric.key, cur)}
              </span>
              {cur !== null && prev !== null ? (
                <span
                  className={cn(
                    "block text-[11px] tabular-nums",
                    active
                      ? "text-white/80"
                      : tone === "up"
                        ? "text-success"
                        : tone === "down"
                          ? "text-destructive"
                          : "text-muted-foreground",
                  )}
                >
                  {deltaText(metric.key, cur, prev)} vs{" "}
                  {formatMetric(metric.key, prev)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
