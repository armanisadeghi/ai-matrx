"use client";

/**
 * The no-site landing — every site the caller administers as a KPI card
 * (28-day clicks/impressions/position from `web.v_site_kpis`, GSC binding
 * state, data freshness). Click a card → that site's deep dashboard.
 */

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Plug, SearchCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { listSites } from "@/features/marketing/data/service";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { SiteListRow } from "@/features/marketing/types";
import {
  formatCount,
  formatPosition,
} from "@/features/marketing/search-console/types";

function trendPercent(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export function SearchConsolePortfolio({
  onSelectSite,
}: {
  onSelectSite: (siteId: string) => void;
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
  const withData = rows.filter((r) => (r.gsc_clicks_28d ?? null) !== null);
  const withoutData = rows.filter((r) => (r.gsc_clicks_28d ?? null) === null);

  const card = (site: SiteListRow) => {
    const clicksTrend =
      site.gsc_prev_days >= 21
        ? trendPercent(site.gsc_clicks_28d, site.gsc_clicks_prev_28d)
        : null;
    return (
      <div
        key={site.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelectSite(site.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelectSite(site.id);
        }}
        className="group flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {site.name ?? site.domain ?? site.id}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {site.domain ?? "—"}
            </p>
          </div>
          <span
            onClick={(e) => e.stopPropagation()}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          >
            <CopyButtons
              size="xs"
              label={`Site search KPIs — ${site.name ?? site.domain ?? site.id}`}
              human={() =>
                humanLines([
                  ["Site", site.name ?? site.domain],
                  ["Clicks (28d)", formatCount(site.gsc_clicks_28d)],
                  ["Impressions (28d)", formatCount(site.gsc_impressions_28d)],
                  ["Position (28d)", formatPosition(site.gsc_position_28d)],
                  [
                    "Data through",
                    site.gsc_latest_date
                      ? formatCompactDate(site.gsc_latest_date)
                      : "never",
                  ],
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
        <p className="text-[11px] text-muted-foreground">
          {site.gsc_latest_date
            ? `Data through ${formatCompactDate(site.gsc_latest_date)}`
            : "No Search Console data yet"}
          <ArrowUpRight className="ml-1 inline h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </p>
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
