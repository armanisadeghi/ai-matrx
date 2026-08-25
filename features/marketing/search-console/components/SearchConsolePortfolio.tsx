"use client";

/**
 * The no-site landing — every site the caller administers as a KPI card
 * (28-day clicks/impressions/position from `web.v_site_kpis`, GSC binding
 * state, data freshness). Metrics open the deep dashboard; any reported
 * problem carries its own Sync or Connect action.
 *
 * MSR-13 (Arman, 2026-08-25): "these cards look dead… floating text in a
 * card." Real visual hierarchy (Clicks leads, is largest, carries the
 * trend), a real trend line (not just a percentage), and a live/stale
 * status rendered as color + icon rather than a sentence you have to read.
 * The sparkline is `KeywordTrendSparkline` (`keyword-research/components/
 * KeywordMetrics.tsx`) — reused, not forked; its `tooltipLabel` prop
 * (added here) lets a caller plotting daily clicks describe each bar
 * honestly instead of the component's keyword-volume "YYYY-MM" default.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  MousePointerClick,
  Plug,
  RefreshCw,
  SearchCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import { listSites } from "@/features/marketing/data/service";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import {
  gscDayDiff,
  gscToday,
  shiftGscDay,
} from "@/features/marketing/search-console/lib/gsc-day";
import { getGscTimeseries } from "@/features/marketing/search-console/data";
import { resolvePeriods } from "@/features/marketing/search-console/lib/url-state";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { SiteListRow } from "@/features/marketing/types";
import { siteHasGscBinding } from "@/features/marketing/search-console/components/SiteSwitcher";
import {
  formatCount,
  formatPosition,
} from "@/features/marketing/search-console/types";
import { KeywordTrendSparkline } from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import type { MonthlySearchPoint } from "@/features/marketing/seo/keyword-research/types";

/** Cards that can plausibly show a live trend line without firing an unbounded burst of RPCs. */
const MAX_SPARKLINE_CARDS = 24;

interface SiteClicksTrend {
  points: MonthlySearchPoint[];
  /** Real ISO dates, index-aligned with `points` — the tooltip's source of truth. */
  days: string[];
}

function trendPercent(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

// GSC finalizes ~2 days back; anything older than that plus two missed
// nights is stale. Kept in step with `seo.gsc_ingestion_health`'s thresholds
// (v_lag_days / v_stale_threshold in migrations/seo_gsc_ingestion_health_v5.sql).
const GSC_LAG_DAYS = 2;
const GSC_STALE_AFTER_DAYS = 2;

/**
 * Days the freshest data day is behind where it should be, or null.
 *
 * "Where it should be" is counted in GOOGLE'S day, not UTC's — see
 * `gsc-day.ts`. Counting from UTC overstated every site by one day for the
 * 7-8 hours after UTC midnight, because "UTC today" names a day Search
 * Console has not begun yet — enough, at a 2-day threshold, to badge a site
 * stale that was merely one day behind.
 */
function daysBehind(latest: string | null | undefined): number | null {
  if (!latest) return null;
  const expected = shiftGscDay(gscToday(), -GSC_LAG_DAYS);
  return gscDayDiff(latest.slice(0, 10), expected);
}

export function SearchConsolePortfolio({
  onSyncSite,
  syncingSiteId,
}: {
  onSyncSite: (siteId: string, organizationId: string | null) => void;
  syncingSiteId: string | null;
}) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const sites = useQuery({
    queryKey: ["marketing", "gsc", "portfolio"],
    queryFn: ({ signal }) =>
      listSites(
        {
          page: 1,
          pageSize: 100,
          search: "",
          anyOf: "",
          columnFilters: {},
          sort: { id: "gsc_clicks_28d", direction: "desc" },
        },
        signal,
      ),
    staleTime: 5 * 60 * 1000,
  });

  const rows = sites.data?.rows ?? [];
  // A zero-click property still has real Search Console data. Freshness, not
  // clicks, decides which section owns the card.
  const withData = rows.filter((r) => r.gsc_latest_date !== null);
  const withoutData = rows.filter((r) => r.gsc_latest_date === null);

  // Daily clicks for the trend line — bounded to the cards that can show one
  // (real data, capped count), one RPC per card in parallel. The portfolio is
  // a fixed small set (an org's own sites), never a 1000-row table, so this
  // stays well inside the "one batched read, never per-row" spirit without
  // needing a `gsc_perf_timeseries_multi` RPC that doesn't exist yet.
  const sparklineSiteIds = withData
    .slice(0, MAX_SPARKLINE_CARDS)
    .map((site) => site.id)
    .join(",");
  const sparklines = useQuery({
    queryKey: ["marketing", "gsc", "portfolio", "sparklines", sparklineSiteIds],
    queryFn: async ({ signal }) => {
      const targets = withData.slice(0, MAX_SPARKLINE_CARDS);
      const entries = await Promise.all(
        targets.map(async (site) => {
          const periods = resolvePeriods(
            { range: "28d", customFrom: null, customTo: null, compare: "none" },
            new Date(),
            site.gsc_latest_date,
          );
          const timeseries = await getGscTimeseries(site.id, periods, {}, signal);
          const daily = timeseries
            .filter((row) => row.period === "current")
            .sort((a, b) => a.day.localeCompare(b.day));
          const trend: SiteClicksTrend = {
            points: daily.map((row, index) => ({
              // `KeywordTrendSparkline` only needs a stable key + a value to
              // plot here — the real date rides `days` for the tooltip.
              year: Number(row.day.slice(0, 4)),
              month: index + 1,
              search_volume: row.clicks,
            })),
            days: daily.map((row) => row.day),
          };
          return [site.id, trend] as const;
        }),
      );
      return new Map(entries);
    },
    enabled: sparklineSiteIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (sites.isLoading) return <LoadingSurface label="Loading sites…" />;
  if (sites.isError) {
    return (
      <QueryError error={sites.error} onRetry={() => void sites.refetch()} />
    );
  }

  const card = (site: SiteListRow) => {
    const clicksTrend =
      site.gsc_prev_days >= 21
        ? trendPercent(site.gsc_clicks_28d, site.gsc_clicks_prev_28d)
        : null;
    const impressionsTrend =
      site.gsc_prev_days >= 21
        ? trendPercent(site.gsc_impressions_28d, site.gsc_impressions_prev_28d)
        : null;
    const behind = daysBehind(site.gsc_latest_date);
    const stale = behind !== null && behind >= GSC_STALE_AFTER_DAYS;
    const hasBinding = siteHasGscBinding(site);
    const needsAction = stale || site.gsc_latest_date === null;
    const dashboardHref = marketingRoutes.searchConsole(site.id);
    const integrationsHref = marketingRoutes.siteSettings(
      site.brand_id,
      site.id,
      "integrations",
    );
    const siteLabel = site.name ?? site.domain ?? site.id;
    const trend = sparklines.data?.get(site.id);
    return (
      <div
        key={site.id}
        className={cn(
          "group flex flex-col gap-2.5 rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
          stale
            ? "border-l-2 border-l-destructive border-y-border border-r-border"
            : "border-l-2 border-l-success/70 border-y-border border-r-border hover:border-primary/40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <EntityRef
              token="web_site"
              id={site.id}
              name={siteLabel}
              href={dashboardHref}
              showIcon={false}
              labelClassName="text-sm font-medium text-foreground"
            />
            <p className="truncate text-xs text-muted-foreground">
              {site.domain ?? "—"}
            </p>
          </div>
          <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <CopyButtons
              size="xs"
              label={`Site search KPIs — ${siteLabel}`}
              human={() =>
                humanLines([
                  ["Site", site.name ?? site.domain],
                  ["Clicks (28d)", formatCount(site.gsc_clicks_28d)],
                  ["Impressions (28d)", formatCount(site.gsc_impressions_28d)],
                  ["Position (28d)", formatPosition(site.gsc_position_28d)],
                  [
                    "Data through",
                    site.gsc_latest_date
                      ? formatGscDate(site.gsc_latest_date)
                      : "never",
                  ],
                  ["Days behind", behind ?? "unknown"],
                ])
              }
              agent={() => ({
                kind: "web-gsc-site-kpis",
                location: webLocation("Search Console — Portfolio"),
                description:
                  "One site's 28-day Search Console KPI rollup from the cross-site portfolio.",
                data: site,
                attributes: { site_id: site.id, domain: site.domain ?? "" },
              })}
              json={() => site}
            />
          </span>
        </div>
        <Link
          href={dashboardHref}
          aria-label={`Open Search Console dashboard for ${siteLabel}`}
          className="-mx-1 rounded-md px-1 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Clicks leads — largest number, its own row, the trend line
              directly under it so the shape of the last 28 days reads at a
              glance instead of a lone percentage. */}
          <div className="flex items-end justify-between gap-2 pt-0.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MousePointerClick className="h-3 w-3" />
                Clicks · 28d
              </p>
              <p className="text-xl font-semibold leading-tight tabular-nums text-foreground">
                {formatCount(site.gsc_clicks_28d)}
              </p>
            </div>
            <TrendPill percent={clicksTrend} />
          </div>
          {trend && trend.points.length >= 2 ? (
            <KeywordTrendSparkline
              points={trend.points}
              className="mt-1 h-6"
              tooltipLabel={(point, index) =>
                `${formatGscDate(trend.days[index] ?? "")}: ${point.search_volume.toLocaleString()} clicks`
              }
            />
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2">
            <div>
              <p className="text-[11px] text-muted-foreground">Impressions</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatCount(site.gsc_impressions_28d)}
                </p>
                <TrendPill percent={impressionsTrend} compact />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Avg. position</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatPosition(site.gsc_position_28d)}
              </p>
            </div>
          </div>
        </Link>
        <div className="flex min-h-6 items-center justify-between gap-2 border-t border-border pt-2">
          <p
            className={cn(
              "flex items-center gap-1 text-[11px]",
              stale
                ? "font-medium text-destructive"
                : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                site.gsc_latest_date === null
                  ? "bg-muted-foreground/40"
                  : stale
                    ? "bg-destructive"
                    : "bg-success",
              )}
            />
            {site.gsc_latest_date
              ? stale
                ? `Stale — through ${formatGscDate(site.gsc_latest_date)} (${behind}d behind)`
                : `Up to date — through ${formatGscDate(site.gsc_latest_date)}`
              : "No Search Console data yet"}
          </p>
          {needsAction ? (
            hasBinding ? (
              <Button
                size="sm"
                variant="outline"
                className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                disabled={syncingSiteId !== null}
                onClick={() => onSyncSite(site.id, site.organization_id)}
              >
                {syncingSiteId === site.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Sync now
              </Button>
            ) : (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-6 shrink-0 gap-1 px-2 text-[11px]"
              >
                <Link href={integrationsHref}>
                  <Plug className="h-3 w-3" />
                  Connect
                </Link>
              </Button>
            )
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 py-1">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card/60 p-10 text-center">
            <SearchCheck className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                No sites yet
              </p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Add a website under Marketing → Websites, connect Google in Data
                Connections, and bind its Search Console property to start
                collecting search data.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  startNavigation(() => router.push(marketingRoutes.sites()))
                }
              >
                Websites
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  startNavigation(() =>
                    router.push(marketingRoutes.connectionsGoogle()),
                  )
                }
              >
                <Plug className="h-3 w-3" />
                Connect Google
              </Button>
            </div>
          </div>
        ) : (
          <>
            {withData.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {withData.map(card)}
              </div>
            ) : null}
            {withoutData.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  No search data yet
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {withoutData.map(card)}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
