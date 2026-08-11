"use client";

/**
 * The no-site landing — every site the caller administers as a KPI card
 * (28-day clicks/impressions/position from `web.v_site_kpis`, GSC binding
 * state, data freshness). Metrics open the deep dashboard; any reported
 * problem carries its own Sync or Connect action.
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2, Plug, RefreshCw, SearchCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { listSites } from "@/features/marketing/data/service";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
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

function trendPercent(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

// GSC finalizes ~2 days back; anything older than that plus two missed
// nights is stale. Kept in step with `seo.gsc_ingestion_health`'s thresholds.
const GSC_LAG_DAYS = 2;
const GSC_STALE_AFTER_DAYS = 2;

/** Days the freshest data day is behind where it should be, or null. */
function daysBehind(latest: string | null | undefined): number | null {
  if (!latest) return null;
  const expected = new Date();
  expected.setUTCDate(expected.getUTCDate() - GSC_LAG_DAYS);
  const diff = Math.floor(
    (Date.parse(`${expected.toISOString().slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${latest.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
  return Number.isFinite(diff) ? diff : null;
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

  if (sites.isLoading) return <LoadingSurface label="Loading sites…" />;
  if (sites.isError) {
    return (
      <QueryError error={sites.error} onRetry={() => void sites.refetch()} />
    );
  }
  const rows = sites.data?.rows ?? [];
  // A zero-click property still has real Search Console data. Freshness, not
  // clicks, decides which section owns the card.
  const withData = rows.filter((r) => r.gsc_latest_date !== null);
  const withoutData = rows.filter((r) => r.gsc_latest_date === null);

  const card = (site: SiteListRow) => {
    const clicksTrend =
      site.gsc_prev_days >= 21
        ? trendPercent(site.gsc_clicks_28d, site.gsc_clicks_prev_28d)
        : null;
    const behind = daysBehind(site.gsc_latest_date);
    const stale = behind !== null && behind >= GSC_STALE_AFTER_DAYS;
    const hasBinding = siteHasGscBinding(site);
    const needsAction = stale || site.gsc_latest_date === null;
    const dashboardHref = marketingRoutes.searchConsole(site.id);
    const integrationsHref = `${marketingRoutes.site(site.brand_id, site.id)}/integrations`;
    const siteLabel = site.name ?? site.domain ?? site.id;
    return (
      <div
        key={site.id}
        className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
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
          className="rounded-sm outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[11px] text-muted-foreground">Clicks 28d</p>
              <p className="text-base font-semibold tabular-nums text-foreground">
                {formatCount(site.gsc_clicks_28d)}
              </p>
              {clicksTrend !== null ? (
                <p
                  className={
                    clicksTrend >= 0
                      ? "text-[11px] tabular-nums text-success"
                      : "text-[11px] tabular-nums text-destructive"
                  }
                >
                  {clicksTrend >= 0 ? "+" : ""}
                  {clicksTrend.toFixed(0)}%
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Impressions</p>
              <p className="text-base font-semibold tabular-nums text-foreground">
                {formatCount(site.gsc_impressions_28d)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Position</p>
              <p className="text-base font-semibold tabular-nums text-foreground">
                {formatPosition(site.gsc_position_28d)}
              </p>
            </div>
          </div>
        </Link>
        <div className="flex min-h-6 items-center justify-between gap-2">
          <p
            className={
              stale
                ? "text-[11px] font-medium text-destructive"
                : "text-[11px] text-muted-foreground"
            }
          >
            {site.gsc_latest_date
              ? stale
                ? `Stale — data only through ${formatGscDate(site.gsc_latest_date)} (${behind} days behind)`
                : `Up to date — data through ${formatGscDate(site.gsc_latest_date)}`
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
      <div className="mx-auto max-w-6xl space-y-4 py-1">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card/60 p-10 text-center">
            <SearchCheck className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                No sites yet
              </p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Add a website under Marketing → Websites, connect Google in
                Data Connections, and bind its Search Console property to
                start collecting search data.
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
