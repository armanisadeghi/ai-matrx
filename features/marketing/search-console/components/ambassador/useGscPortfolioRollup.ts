"use client";

/**
 * Portfolio/brand-level traffic-class rollup — the multi-site sibling of
 * `useGscClassRollup`.
 *
 * A brand owns many sites and the hub owns many brands, so "is our money
 * traffic up?" is a portfolio question. `seo.gsc_perf_class_summary_multi`
 * answers it in ONE round trip by delegating to the per-site function, which
 * keeps the winning-run/class-resolver accuracy contract in a single place and
 * preserves each site's access assert.
 *
 * Window resolution differs from the single-site hook on purpose: there is no
 * one "freshest day" across a portfolio, so this uses the wall clock minus
 * GSC's publishing lag. Individual sites lagging further simply contribute less
 * to the newest days — the same thing the vendor dashboards do.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import {
  resolvePeriods,
  withPrevCompare,
} from "@/features/marketing/search-console/lib/url-state";
import {
  GSC_TRAFFIC_CLASSES,
  type GscRangeKey,
  type GscResolvedPeriods,
  type GscTrafficClass,
} from "@/features/marketing/search-console/types";

export interface GscPortfolioClassEntry {
  key: GscTrafficClass;
  label: string;
  tone: string;
  description: string;
  clicks: number;
  cmpClicks: number;
  impressions: number;
  deltaClicks: number;
  deltaPct: number | null;
  share: number;
}

export interface GscPortfolioRollup {
  classes: GscPortfolioClassEntry[];
  totalClicks: number;
  totalDeltaPct: number | null;
  totalImpressions: number;
  periods: GscResolvedPeriods;
  /** How many sites actually contributed — surfaces should say so. */
  contributingSites: number;
  hasData: boolean;
}

function pct(current: number, compare: number): number | null {
  if (compare <= 0) return null;
  return (current - compare) / compare;
}

interface MultiRow {
  traffic_class: string;
  clicks: number;
  cmp_clicks: number;
  impressions: number;
  cmp_impressions: number;
  sites: number;
}

/** Pure core — same reason as `shapeGscClassRollup`: testable arithmetic. */
export function shapeGscPortfolioRollup(
  rows: readonly MultiRow[],
  periods: GscResolvedPeriods,
): GscPortfolioRollup {
  const byClass = new Map(rows.map((r) => [r.traffic_class, r]));
  const totalClicks = rows.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
  const totalCmpClicks = rows.reduce((sum, r) => sum + (r.cmp_clicks ?? 0), 0);
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);

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
      deltaClicks: clicks - cmpClicks,
      deltaPct: pct(clicks, cmpClicks),
      share: totalClicks > 0 ? clicks / totalClicks : 0,
    };
  });

  return {
    classes,
    totalClicks,
    totalDeltaPct: pct(totalClicks, totalCmpClicks),
    totalImpressions,
    periods,
    // Every row carries the same site count; 0 rows means nothing contributed.
    contributingSites: rows.length > 0 ? Math.max(...rows.map((r) => r.sites)) : 0,
    hasData: totalClicks > 0 || totalImpressions > 0,
  };
}

export function useGscPortfolioRollup(
  siteIds: readonly string[],
  range: GscRangeKey = "28d",
) {
  const periods = useMemo(
    () =>
      withPrevCompare(
        resolvePeriods({
          range,
          customFrom: null,
          customTo: null,
          compare: "none",
        }),
      ),
    [range],
  );

  // Sorted + joined so two surfaces passing the same sites in different order
  // share one cache entry instead of fetching twice.
  const key = useMemo(() => [...siteIds].sort().join(","), [siteIds]);

  const query = useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "portfolio-class-summary",
      key,
      periods.current.start,
      periods.current.end,
    ],
    queryFn: async ({ signal }) => {
      await requireAuthenticatedSupabaseSession(supabase);
      const response = await supabase
        .schema("seo")
        .rpc("gsc_perf_class_summary_multi", {
          p_site_ids: [...siteIds],
          p_start: periods.current.start,
          p_end: periods.current.end,
          p_compare_start: periods.compare?.start,
          p_compare_end: periods.compare?.end,
        })
        .abortSignal(signal ?? new AbortController().signal);
      if (response.error) throw new Error(response.error.message);
      return (response.data ?? []) as MultiRow[];
    },
    enabled: siteIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const rollup = useMemo(
    () => (query.data ? shapeGscPortfolioRollup(query.data, periods) : null),
    [query.data, periods],
  );

  return {
    rollup,
    periods,
    isLoading: query.isLoading,
    error: query.error,
  };
}
