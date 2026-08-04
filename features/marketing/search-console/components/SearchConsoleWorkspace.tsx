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
import { toast } from "@/lib/toast";
import { describeBackendFailure } from "@/lib/api/errors";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import {
  formatCompactDate,
  InlineQueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  allowedFilterKeysForTab,
  buildSearchConsoleUrl,
  parseSearchConsoleUrl,
  pruneFiltersForTab,
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
  GscDigResultRow,
  GscDimension,
  GscFilters,
  GscMetric,
  GscTab,
  GscWatchRow,
} from "@/features/marketing/search-console/types";
import {
  GSC_TABS,
  TAB_DIMENSION,
  isDimensionTab,
} from "@/features/marketing/search-console/types";
import { DigTab } from "@/features/marketing/search-console/components/dig/DigTab";
import { FilterBar } from "@/features/marketing/search-console/components/FilterBar";
import { GscDimensionTable } from "@/features/marketing/search-console/components/GscDimensionTable";
import { NewPagesTab } from "@/features/marketing/search-console/components/new-pages/NewPagesTab";
import { WatchlistTab } from "@/features/marketing/search-console/components/watch/WatchlistTab";
import { KpiBand } from "@/features/marketing/search-console/components/KpiBand";
import { PerformanceChart } from "@/features/marketing/search-console/components/PerformanceChart";
import { RangeCompareControl } from "@/features/marketing/search-console/components/RangeCompareControl";
import { IngestionHealthBanner } from "@/features/marketing/search-console/components/IngestionHealthBanner";
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
  // Render-safe filters: a shared/hand-edited URL can carry filters the
  // active tab's dimension cannot serve — prune instead of letting the RPC
  // raise gsc_filter_combination_unsupported into the UI.
  const filters = useMemo(
    () => pruneFiltersForTab(state.tab, state.filters),
    [state.tab, state.filters],
  );

  const siteOptions = useSiteOptions();
  const site =
    siteOptions.data?.find((s) => s.id === state.siteId) ?? null;
  const siteName = site ? (site.name ?? site.domain) : null;
  // THREE states, not two. Collapsing them is what produced the original bug:
  //   bound / not bound   — the list loaded and we can see the answer.
  //   binding UNKNOWN     — the list failed to load. "Unknown" must never be
  //                         rendered as "not bound"; that disabled Sync and
  //                         told the user to bind an already-bound property.
  //                         Let them try; the backend gives the real reason.
  //   site NOT FOUND      — the list loaded fine and this ?site= isn't in it
  //                         (stale or hand-edited URL). Say exactly that
  //                         rather than laundering it into "unknown".
  const siteMissing = site === null && siteOptions.isSuccess;
  const bindingUnknown = site === null && siteOptions.isError;
  const gscBound = site ? siteHasGscBinding(site) : bindingUnknown;

  const freshness = useGscFreshness(state.siteId);
  const dataThrough = useMemo(() => {
    const rows = freshness.data ?? [];
    const dates = rows
      .filter((r) => r.dimension_profile !== "search_appearance")
      .map((r) => r.max_date);
    return dates.length > 0 ? [...dates].sort().at(-1) ?? null : null;
  }, [freshness.data]);
  // ONLY a SUCCESSFUL empty read means "no data". While loading, or after a
  // failed read, we know nothing — and the empty state below asserts a fact
  // ("this site has never synced") that would then be false.
  const freshnessKnown = freshness.isSuccess;
  const hasAnyData = (freshness.data ?? []).length > 0;
  const knownEmpty = freshnessKnown && !hasAnyData;

  // GSC parity: preset windows end at the freshest data day, not the wall
  // clock — a lagging sync must not read as a traffic collapse.
  const periods = useMemo(
    () => resolvePeriods(state, new Date(), dataThrough),
    [state, dataThrough],
  );

  // The KPI band + chart render only on overview and dimension tabs — the
  // digs/watchlist/new-pages tabs must not pay for two dead RPCs.
  const showsKpis = state.tab === "overview" || isDimensionTab(state.tab);
  const summary = useGscSummary(state.siteId, periods, filters, {
    enabled: showsKpis,
  });
  const timeseries = useGscTimeseries(state.siteId, periods, filters, {
    enabled: state.tab === "overview",
  });

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
      filters: pruneFiltersForTab(drill.tab, { ...filters, ...drill.filters }),
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
      // Report what ACTUALLY landed. A blanket "completed" on a run that
      // persisted nothing (or stopped short of today) is exactly how a
      // five-day ingestion outage stayed invisible.
      if (result.createdObservations === 0) {
        toast.warning(
          "Sync finished but stored no new rows — Google returned nothing for this window. If this repeats, the connection or property binding needs a look.",
        );
      } else if (!result.reachedLatest) {
        // Keyed on reachedLatest ALONE. Keying it on daysBehind too meant a
        // receipt that said "not current" but omitted the day count fell
        // through to the success toast — a short-of-latest sync reporting as
        // clean. daysBehind only shapes the wording.
        toast.warning(
          result.daysBehind !== null
            ? `Synced ${result.createdObservations.toLocaleString()} rows through ${result.coveredThrough} — still ${result.daysBehind} days behind. Sync again to keep catching up.`
            : `Synced ${result.createdObservations.toLocaleString()} rows but did not reach the latest available day. Sync again to keep catching up.`,
        );
      } else {
        toast.success(
          `Search Console sync completed — ${result.createdObservations.toLocaleString()} rows through ${result.coveredThrough ?? "latest"}.`,
        );
      }
    } catch (error) {
      // describeBackendFailure surfaces the REAL cause (expired Google
      // credential, quota, permission) instead of the generic
      // "failed unexpectedly" template — the same helper the other
      // marketing surfaces already use.
      const described = describeBackendFailure(error);
      toast.error(described.headline, {
        description:
          described.cause !== described.headline ? described.cause : undefined,
      });
    } finally {
      // In `finally`, not the success arm: a sync that persisted rows and
      // THEN threw would otherwise leave every cache stale behind an error
      // toast, with the health banner still reporting the old staleness it
      // had just fixed.
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "gsc"],
      });
      setSyncing(false);
    }
  };

  const tabDimension = isDimensionTab(state.tab)
    ? TAB_DIMENSION[state.tab]
    : null;

  const panelRange = {
    range: state.range,
    customFrom: state.customFrom,
    customTo: state.customTo,
    compare: state.compare,
  };

  // Remount tables when the slice changes so page/search/sort never leak
  // across sites, filters, or periods (GSC resets to page 1 on scope change).
  const sliceKey = [
    periods.current.start,
    periods.current.end,
    periods.compare?.start ?? "",
    Object.entries(filters)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("&"),
  ].join("|");

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
              {/* The RESOLVED window, always — preset windows clamp to the
                  freshest data day, so without this a range change can look
                  like nothing happened when it merely ended on the same day. */}
              <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground md:inline">
                {periods.current.start === periods.current.end
                  ? formatCompactDate(periods.current.start)
                  : `${formatCompactDate(periods.current.start)} – ${formatCompactDate(periods.current.end)}`}
                {dataThrough
                  ? ` · data through ${formatCompactDate(dataThrough)}`
                  : knownEmpty
                    ? " · never synced"
                    : null}
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
                  siteMissing
                    ? "This site is not in your site list — the link may be stale"
                    : bindingUnknown
                      ? "Could not load this site's settings — sync will still try"
                      : gscBound
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
            <IngestionHealthBanner
              siteId={state.siteId}
              onSync={() => void runSync()}
              syncing={syncing}
              canSync={gscBound}
              suppressed={knownEmpty}
            />
            {/* Every read that can fail says so. Before 2026-08-04 these four
                had no rendered error state at all, so a failed fetch showed
                as an empty table, "—" tiles, a flat chart, or a disabled
                Sync button — every one of them indistinguishable from a
                truthful answer. */}
            {siteMissing ? (
              <InlineQueryError
                what="this site"
                error={
                  new Error(
                    "This site is not in your site list. The link may be stale, or access may have changed.",
                  )
                }
              />
            ) : null}
            {siteOptions.isError ? (
              <InlineQueryError
                what="the site list"
                error={siteOptions.error}
                onRetry={() => void siteOptions.refetch()}
              />
            ) : null}
            {freshness.isError ? (
              <InlineQueryError
                what="this site's data coverage — the window below may be wrong"
                error={freshness.error}
                onRetry={() => void freshness.refetch()}
              />
            ) : null}
            {summary.isError ? (
              <InlineQueryError
                what="the metric totals — any numbers shown are from an earlier period"
                error={summary.error}
                onRetry={() => void summary.refetch()}
              />
            ) : null}
            {timeseries.isError ? (
              <InlineQueryError
                what="the chart data"
                error={timeseries.error}
                onRetry={() => void timeseries.refetch()}
              />
            ) : null}
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
                    onClick={() =>
                      applyState({
                        ...state,
                        tab: tab.key,
                        filters: pruneFiltersForTab(tab.key, filters),
                      })
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {allowedFilterKeysForTab(state.tab).length > 0 ? (
                <FilterBar
                  filters={filters}
                  allowedKeys={allowedFilterKeysForTab(state.tab)}
                  onChange={(next) => applyState({ ...state, filters: next })}
                />
              ) : null}
            </div>

            {knownEmpty ? (
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
                  filters={filters}
                  summary={summary.data}
                  isLoading={summary.isLoading}
                  isFetching={summary.isFetching}
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
                  filters={filters}
                  rows={timeseries.data ?? []}
                  visibleMetrics={visibleMetrics}
                />
                <div className="grid min-h-[22rem] grid-cols-1 gap-2 xl:grid-cols-2">
                  <div className="flex min-h-[22rem] flex-col overflow-hidden rounded-md">
                    <GscDimensionTable
                      key={`q|${state.siteId}|${sliceKey}`}
                      siteId={state.siteId}
                      siteName={siteName}
                      dimension="query"
                      periods={periods}
                      filters={filters}
                      copySurface="Search Console — Overview top queries"
                      onDrill={onDrill("query")}
                      panelRange={panelRange}
                      watch
                      pageSize={10}
                      compactHeight
                    />
                  </div>
                  <div className="flex min-h-[22rem] flex-col overflow-hidden rounded-md">
                    <GscDimensionTable
                      key={`p|${state.siteId}|${sliceKey}`}
                      siteId={state.siteId}
                      siteName={siteName}
                      dimension="page"
                      periods={periods}
                      filters={filters}
                      copySurface="Search Console — Overview top pages"
                      onDrill={onDrill("page")}
                      panelRange={panelRange}
                      watch
                      pageSize={10}
                      compactHeight
                    />
                  </div>
                </div>
              </div>
            ) : state.tab === "digs" ? (
              <div className="min-h-0 flex-1">
                <DigTab
                  siteId={state.siteId}
                  siteName={siteName}
                  organizationId={site?.organization_id ?? null}
                  periods={periods}
                  panelRange={panelRange}
                  ruleId={state.ruleId}
                  onSelectRule={(ruleId) => applyState({ ...state, ruleId })}
                  onDrill={(dimension: "query" | "page", row: GscDigResultRow) =>
                    applyState({
                      ...state,
                      tab: dimension === "query" ? "pages" : "queries",
                      filters:
                        dimension === "query"
                          ? { query_eq: row.key }
                          : { page_eq: row.key },
                    })
                  }
                />
              </div>
            ) : state.tab === "watchlist" ? (
              <div className="min-h-0 flex-1">
                <WatchlistTab
                  siteId={state.siteId}
                  siteName={siteName}
                  periods={periods}
                  panelRange={panelRange}
                  onDrill={(row: GscWatchRow) =>
                    applyState({
                      ...state,
                      tab: row.kind === "query" ? "pages" : "queries",
                      filters:
                        row.kind === "query"
                          ? { query_eq: row.key }
                          : { page_eq: row.entity_id },
                    })
                  }
                />
              </div>
            ) : state.tab === "new-pages" ? (
              <div className="min-h-0 flex-1">
                <NewPagesTab
                  siteId={state.siteId}
                  siteName={siteName}
                  organizationId={site?.organization_id ?? null}
                  periods={periods}
                  panelRange={panelRange}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <KpiBand
                  siteId={state.siteId}
                  siteName={siteName}
                  periods={periods}
                  filters={filters}
                  summary={summary.data}
                  isLoading={summary.isLoading}
                  isFetching={summary.isFetching}
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
                      key={`${tabDimension}|${state.siteId}|${sliceKey}`}
                      siteId={state.siteId}
                      siteName={siteName}
                      dimension={tabDimension}
                      periods={periods}
                      filters={filters}
                      copySurface={`Search Console — ${
                        GSC_TABS.find((t) => t.key === state.tab)?.label ??
                        state.tab
                      }`}
                      onDrill={onDrill(tabDimension)}
                      drillHint={DRILL_HINTS[tabDimension]}
                      panelRange={panelRange}
                      watch
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
