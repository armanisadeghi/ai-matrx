"use client";

/**
 * THE AMBASSADOR HOOK — one call, one `siteId`, class-decomposed GSC.
 *
 * Canvas doctrine rung 6 (outbound / ambassador): once a feature is rich, its
 * best data belongs on every surface that could benefit, not only on its own
 * route. Before this hook, class decomposition lived exclusively on
 * `/marketing/search-console`; every other marketing surface showed raw
 * clicks/impressions — the exact "raw totals lie" failure the doctrine names.
 *
 * Embedding surfaces must NOT have to know about GSC's period/compare
 * machinery, so this hook owns all of it:
 *   • resolves the range against the site's freshest day (`useGscFreshness`),
 *     so the window is real data, never a wall-clock guess;
 *   • forces a previous-period compare — `gsc_perf_class_summary` REJECTS a
 *     null compare (`requireCompare`), and every ambassador read wants deltas;
 *   • returns classes in canonical `GSC_TRAFFIC_CLASSES` order with zero-fill,
 *     so a site missing a class renders a real 0 rather than a hole.
 *
 * Never re-aggregate GSC facts client-side (accuracy contract lives in
 * `seo.gsc_perf_*`). This hook only shapes what the RPC already computed.
 */

import { useMemo } from "react";
import {
  useGscClassSummary,
  useGscFreshness,
} from "@/features/marketing/search-console/hooks/useGscQuery";
import {
  resolveGscDataThrough,
  resolvePeriods,
  withPrevCompare,
} from "@/features/marketing/search-console/lib/url-state";
import {
  GSC_TRAFFIC_CLASSES,
  type GscClassSummaryRow,
  type GscRangeKey,
  type GscResolvedPeriods,
  type GscTrafficClass,
} from "@/features/marketing/search-console/types";

export interface GscClassRollupEntry {
  key: GscTrafficClass;
  label: string;
  tone: string;
  description: string;
  clicks: number;
  cmpClicks: number;
  impressions: number;
  cmpImpressions: number;
  queries: number;
  /** Signed click delta vs the previous period of equal length. */
  deltaClicks: number;
  /** Percent change vs previous period; null when the compare period was 0. */
  deltaPct: number | null;
  /** Share of this period's total clicks, 0–1. */
  share: number;
}

export interface GscClassRollup {
  classes: GscClassRollupEntry[];
  totalClicks: number;
  totalCmpClicks: number;
  totalImpressions: number;
  totalDeltaPct: number | null;
  /** The resolved window actually queried — surfaces MUST label with this. */
  periods: GscResolvedPeriods;
  /** True once at least one class carries a non-zero current-period click. */
  hasData: boolean;
}

function pct(current: number, compare: number): number | null {
  if (compare <= 0) return null;
  return (current - compare) / compare;
}

/**
 * Pure core: shape `gsc_perf_class_summary` rows into render-ready classes.
 * Exported separately from the hook so the arithmetic that decides what a user
 * reads as "money is down 12%" is unit-testable without React or Supabase.
 */
export function shapeGscClassRollup(
  rows: readonly GscClassSummaryRow[],
  periods: GscResolvedPeriods,
): GscClassRollup {
  const byClass = new Map(rows.map((r) => [r.traffic_class, r]));
  const totalClicks = rows.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
  const totalCmpClicks = rows.reduce((sum, r) => sum + (r.cmp_clicks ?? 0), 0);
  const totalImpressions = rows.reduce((sum, r) => sum + (r.impressions ?? 0), 0);

  // Canonical order + zero-fill: a missing class is a real zero, not a gap.
  const classes = GSC_TRAFFIC_CLASSES.map((meta) => {
    const row = byClass.get(meta.key);
    const clicks = row?.clicks ?? 0;
    const cmpClicks = row?.cmp_clicks ?? 0;
    return {
      key: meta.key,
      label: meta.label,
      tone: meta.tone,
      description: meta.description,
      clicks,
      cmpClicks,
      impressions: row?.impressions ?? 0,
      cmpImpressions: row?.cmp_impressions ?? 0,
      queries: row?.queries ?? 0,
      deltaClicks: clicks - cmpClicks,
      deltaPct: pct(clicks, cmpClicks),
      share: totalClicks > 0 ? clicks / totalClicks : 0,
    };
  });

  return {
    classes,
    totalClicks,
    totalCmpClicks,
    totalImpressions,
    totalDeltaPct: pct(totalClicks, totalCmpClicks),
    periods,
    hasData: totalClicks > 0 || totalImpressions > 0,
  };
}

/**
 * Class-decomposed GSC for one site, ready to render.
 *
 * @param siteId  Site to roll up. `null` disables every query (safe for
 *                surfaces that render before a site is chosen).
 * @param range   Any GSC range preset. Defaults to 28 days, the window the
 *                dashboard and the industry both treat as standard.
 */
export function useGscClassRollup(
  siteId: string | null,
  range: GscRangeKey = "28d",
) {
  // Clamp to the site's freshest day so the label never promises data that
  // GSC has not delivered yet (their pipeline runs ~2 days behind).
  const freshness = useGscFreshness(siteId);
  // 'query' ONLY: gsc_perf_class_summary reads that profile, and a fresher
  // `page` import would otherwise push the window past the last day of query
  // data — a phantom decline on every class.
  const dataEnd = resolveGscDataThrough(freshness.data, ["query"]);

  const periods = useMemo(
    () =>
      withPrevCompare(
        resolvePeriods(
          { range, customFrom: null, customTo: null, compare: "none" },
          new Date(),
          dataEnd,
        ),
      ),
    [range, dataEnd],
  );

  const summary = useGscClassSummary(siteId, periods, {
    // Wait for freshness so we resolve the window once, not twice.
    enabled: !!siteId && !freshness.isLoading,
  });

  const rollup = useMemo<GscClassRollup | null>(
    () => (summary.data ? shapeGscClassRollup(summary.data, periods) : null),
    [summary.data, periods],
  );

  return {
    rollup,
    periods,
    isLoading: freshness.isLoading || summary.isLoading,
    isFetching: summary.isFetching,
    error: summary.error,
  };
}
