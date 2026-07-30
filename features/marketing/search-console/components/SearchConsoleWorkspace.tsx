"use client";

/**
 * `/marketing/search-console` — the Search Console data dashboard.
 *
 * Two states on one route: no `?site` → cross-site portfolio landing;
 * `?site=<id>` → the deep per-site dashboard (KPI band + performance chart +
 * dimension tabs with GSC-parity drill-downs). ALL view state lives in the
 * URL (`lib/url-state.ts`) so every drill-down is a shareable link.
 *
 * This file is the inside of the route's single dynamic edge
 * (SearchConsoleGate) — recharts and every sub-component import statically
 * here (Fragmentation Law).
 */

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  buildSearchConsoleUrl,
  parseSearchConsoleUrl,
  resolvePeriods,
  type SearchConsoleUrlState,
} from "@/features/marketing/search-console/lib/url-state";
import {
  useGscFreshness,
  useGscSummary,
  useGscTimeseries,
} from "@/features/marketing/search-console/hooks/useGscQuery";
import { syncGscSearchPerformance } from "@/features/marketing/search-console/sync";
import type {
  GscBreakdownRow,
  GscDimension,
  GscFilters,
  GscMetric,
  GscTab,
} from "@/features/marketing/search-console/types";
import {
  GSC_TABS,
  TAB_DIMENSION,
} from "@/features/marketing/search-console/types";
import { FilterBar } from "@/features/marketing/search-console/components/FilterBar";
import { GscDimensionTable } from "@/features/marketing/search-console/components/GscDimensionTable";
import { KpiBand } from "@/features/marketing/search-console/components/KpiBand";
import { PerformanceChart } from "@/features/marketing/search-console/components/PerformanceChart";
import { RangeCompareControl } from "@/features/marketing/search-console/components/RangeCompareControl";
import { SearchConsolePortfolio } from "@/features/marketing/search-console/components/SearchConsolePortfolio";
import {
  SiteSwitcher,
  siteHasGscBinding,
  useSiteOptions,
} from "@/features/marketing/search-console/components/SiteSwitcher";

const DEFAULT_VISIBLE: readonly GscMetric[] = ["clicks", "impressions"];

/** GSC-parity cross-filter: which drill each dimension row click performs. */
function drillFor(
  dimension: GscDimension,
  row: GscBreakdownRow,
): { filters: Partial<GscFilters>; tab: GscTab } | null {
  switch (dimension) {
    case "query":
      return { filters: { query_eq: row.key }, tab: "pages" };
    case "page":
      return { filters: { page_eq: row.key }, tab: "queries" };
    case "country":
      return { filters: { country: row.key }, tab: "countries" };
    case "device":
      return { filters: { device: row.key }, tab: "devices" };
    case "search_appearance":
      return { filters: { search_appearance: row.key }, tab: "appearance" };
  }
}

const DRILL_HINTS: Record<GscDimension, string> = {
  query: "Click a query to see the pages it lands on",
  page: "Click a page to see its queries",
  country: "Click a country to filter the dashboard to it",
  device: "Click a device to filter the dashboard to it",
  search_appearance: "Click an appearance type to filter to it",
};

export function SearchConsoleWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [isNavigating, startNavigation] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [visibleMetrics, setVisibleMetrics] =
    useState<readonly GscMetric[]>(DEFAULT_VISIBLE);

  const state = useMemo(
    () => parseSearchConsoleUrl(searchParams),
    [searchParams],
  );
  const periods = useMemo(() => resolvePeriods(state), [state]);

  const siteOptions = useSiteOptions();
  const site =
    siteOptions.data?.find((s) => s.id === state.siteId) ?? null;
  const siteName = site ? (site.name ?? site.domain) : null;
  const gscBound = site ? siteHasGscBinding(site) : false;

  const summary = useGscSummary(state.siteId, periods, state.filters);
  const timeseries = useGscTimeseries(state.siteId, periods, state.filters);
  const freshness = useGscFreshness(state.siteId);

  const dataThrough = useMemo(() => {
    const rows = freshness.data ?? [];
    const dates = rows
      .filter((r) => r.dimension_profile !== "search_appearance")
      .map((r) => r.max_date);
    return dates.length > 0 ? dates.sort().at(-1)! : null;
  }, [freshness.data]);
  const hasAnyData = (freshness.data ?? []).length > 0;

  const applyState = (next: SearchConsoleUrlState) => {
    startNavigation(() => {
      router.replace(buildSearchConsoleUrl(next), { scroll: false });
    });
  };

  const onDrill = (dimension: GscDimension) => (row: GscBreakdownRow) => {
    const drill = drillFor(dimension, row);
    if (!drill) return;
    applyState({
      ...state,
      tab: drill.tab,
      filters: { ...state.filters, ...drill.filters },
    });
  };

  const runSync = async () => {
    if (!state.siteId || syncing) return;
    setSyncing(true);
    try {
      const result = await syncGscSearchPerformance(
        dispatch,
        state.siteId,
        site?.organization_id ?? null,
      );
      toast.success(
        result.runId
          ? "Search Console sync completed."
          : "Search Console sync finished.",
      );
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "gsc"],
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Search Console sync failed.",
      );
    } finally {
      setSyncing(false);
    }
  };

  const tabDimension =
    state.tab === "overview" ? null : TAB_DIMENSION[state.tab];

  return (
    <>
      <RouteHeader
        left={
          <div className="ml-2 flex min-w-0 items-center gap-2">
            <h1 className="whitespace-nowrap text-sm font-medium text-foreground">
              Search Console
            </h1>
            {siteOptions.data ? (
              <SiteSwitcher
                sites={siteOptions.data}
                selectedSiteId={state.siteId}
                onSelect={(siteId) =>
                  applyState({ ...state, siteId, filters: {} })
                }
              />
            ) : null}
          </div>
        }
        center={<MarketingWorkspaceNav />}
        right={
          state.siteId ? (
            <div className="flex items-center gap-1.5">
              <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground md:inline">
                {dataThrough
                  ? `Data through ${formatCompactDate(dataThrough)}`
                  : hasAnyData
                    ? null
                    : "Never synced"}
              </span>
              <RangeCompareControl
                value={{
                  range: state.range,
                  customFrom: state.customFrom,
                  customTo: state.customTo,
                  compare: state.compare,
                }}
                onChange={(next) => applyState({ ...state, ...next })}
                disabled={isNavigating}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => void runSync()}
                disabled={syncing || !gscBound}
                title={
                  gscBound
                    ? "Pull the latest Search Console data for this site"
                    : "Bind a Search Console property on the site's Integrations tab first"
                }
              >
                {syncing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Sync
              </Button>
            </div>
          ) : undefined
        }
      />
      <main className="h-full overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        {!state.siteId ? (
          <SearchConsolePortfolio
            onSelectSite={(siteId) =>
              applyState({ ...state, siteId, filters: {} })
            }
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
                {GSC_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={cn(
                      "rounded px-2 py-1 text-xs transition-colors",
                      state.tab === tab.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    onClick={() => applyState({ ...state, tab: tab.key })}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <FilterBar
                filters={state.filters}
                onChange={(filters) => applyState({ ...state, filters })}
              />
            </div>

            {!hasAnyData && !freshness.isLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/60 p-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  No Search Console data for this site yet
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {gscBound
                    ? "Run a sync to pull search performance from Google. The first sync backfills 90 days; the nightly job keeps extending history to Google's full 16 months."
                    : "Bind this site to a Search Console property (site → Integrations) after connecting Google in Data Connections, then sync."}
                </p>
                {gscBound ? (
                  <Button
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void runSync()}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Sync now
                  </Button>
                ) : null}
              </div>
            ) : state.tab === "overview" ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
                <KpiBand
                  siteId={state.siteId}
                  siteName={siteName}
                  periods={periods}
                  filters={state.filters}
                  summary={summary.data}
                  isLoading={summary.isLoading}
                  visibleMetrics={visibleMetrics}
                  onToggleMetric={(metric) =>
                    setVisibleMetrics((prev) => {
                      if (prev.includes(metric)) {
                        const next = prev.filter((m) => m !== metric);
                        return next.length > 0 ? next : prev;
                      }
                      return [...prev, metric];
                    })
                  }
                />
                <PerformanceChart
                  siteId={state.siteId}
                  siteName={siteName}
                  periods={periods}
                  filters={state.filters}
                  rows={timeseries.data ?? []}
                  visibleMetrics={visibleMetrics}
                />
                <div className="grid min-h-[22rem] grid-cols-1 gap-2 xl:grid-cols-2">
                  <div className="flex min-h-[22rem] flex-col overflow-hidden rounded-md">
                    <GscDimensionTable
                      siteId={state.siteId}
                      siteName={siteName}
                      dimension="query"
                      periods={periods}
                      filters={state.filters}
                      surfaceLabel="Search Console — Overview top queries"
                      onDrill={onDrill("query")}
                      pageSize={10}
                      compactHeight
                    />
                  </div>
                  <div className="flex min-h-[22rem] flex-col overflow-hidden rounded-md">
                    <GscDimensionTable
                      siteId={state.siteId}
                      siteName={siteName}
                      dimension="page"
                      periods={periods}
                      filters={state.filters}
                      surfaceLabel="Search Console — Overview top pages"
                      onDrill={onDrill("page")}
                      pageSize={10}
                      compactHeight
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <KpiBand
                  siteId={state.siteId}
                  siteName={siteName}
                  periods={periods}
                  filters={state.filters}
                  summary={summary.data}
                  isLoading={summary.isLoading}
                  visibleMetrics={visibleMetrics}
                  onToggleMetric={(metric) =>
                    setVisibleMetrics((prev) => {
                      if (prev.includes(metric)) {
                        const next = prev.filter((m) => m !== metric);
                        return next.length > 0 ? next : prev;
                      }
                      return [...prev, metric];
                    })
                  }
                  compact
                />
                <div className="min-h-0 flex-1">
                  {tabDimension ? (
                    <GscDimensionTable
                      key={tabDimension}
                      siteId={state.siteId}
                      siteName={siteName}
                      dimension={tabDimension}
                      periods={periods}
                      filters={state.filters}
                      surfaceLabel={`Search Console — ${
                        GSC_TABS.find((t) => t.key === state.tab)?.label ??
                        state.tab
                      }`}
                      onDrill={onDrill(tabDimension)}
                      drillHint={DRILL_HINTS[tabDimension]}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
