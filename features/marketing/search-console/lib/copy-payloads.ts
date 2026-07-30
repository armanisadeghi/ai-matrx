/**
 * Copy / Copy-for-AI payload builders for the Search Console dashboard —
 * thin composition over `features/marketing/lib/copy-payloads.ts` (the ONE
 * marketing copy primitive). Every payload names the site, period, compare
 * period, and active filters so an agent always knows exactly what slice of
 * search data it received.
 */

import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type {
  GscFilters,
  GscResolvedPeriods,
  GscSummaryRow,
  GscTimeseriesRow,
} from "@/features/marketing/search-console/types";
import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/features/marketing/search-console/types";

export function gscScopeAttributes(
  siteId: string,
  siteName: string | null,
  periods: GscResolvedPeriods,
  filters: GscFilters,
): Record<string, string> {
  const attrs: Record<string, string> = {
    site_id: siteId,
    period: `${periods.current.start}..${periods.current.end}`,
  };
  if (siteName) attrs.site = siteName;
  if (periods.compare) {
    attrs.compare_period = `${periods.compare.start}..${periods.compare.end}`;
  }
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.trim() !== "") {
      attrs[`filter_${key}`] = value;
    }
  }
  return attrs;
}

export function gscSummaryCopy(input: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  filters: GscFilters;
  summary: GscSummaryRow | null;
}) {
  const { summary } = input;
  return webCopy({
    kind: "web-gsc-summary",
    label: "Search performance summary",
    description:
      "Google Search Console totals for one site over the selected period (clicks, impressions, CTR, position), with compare-period values when a comparison is active.",
    surface: "Search Console",
    data: summary,
    lines: [
      ["Site", input.siteName ?? input.siteId],
      ["Period", `${input.periods.current.start} → ${input.periods.current.end}`],
      [
        "Compare",
        input.periods.compare
          ? `${input.periods.compare.start} → ${input.periods.compare.end}`
          : null,
      ],
      ["Clicks", formatCount(summary?.clicks)],
      ["Impressions", formatCount(summary?.impressions)],
      ["CTR", formatCtr(summary?.ctr)],
      ["Position", formatPosition(summary?.avg_position)],
      [
        "Prev clicks",
        summary?.cmp_clicks != null ? formatCount(summary.cmp_clicks) : null,
      ],
      [
        "Prev impressions",
        summary?.cmp_impressions != null
          ? formatCount(summary.cmp_impressions)
          : null,
      ],
    ],
    attributes: gscScopeAttributes(
      input.siteId,
      input.siteName,
      input.periods,
      input.filters,
    ),
  });
}

export function gscTimeseriesCopy(input: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  filters: GscFilters;
  rows: GscTimeseriesRow[];
}) {
  const currentDays = input.rows.filter((r) => r.period === "current").length;
  const compareDays = input.rows.filter((r) => r.period === "compare").length;
  return webCopy({
    kind: "web-gsc-timeseries",
    label: "Search performance chart data",
    description:
      "Daily Google Search Console series (clicks, impressions, CTR, position per day) behind the performance chart, including the compare-period series when active.",
    surface: "Search Console",
    data: input.rows,
    lines: [
      ["Site", input.siteName ?? input.siteId],
      ["Period", `${input.periods.current.start} → ${input.periods.current.end}`],
      ["Days", currentDays],
      ["Compare days", compareDays > 0 ? compareDays : null],
    ],
    attributes: gscScopeAttributes(
      input.siteId,
      input.siteName,
      input.periods,
      input.filters,
    ),
  });
}
