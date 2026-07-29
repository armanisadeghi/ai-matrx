"use client";

// Non-blocking "quick view" for one managed site, as a draggable WindowPanel
// (mirrors AgentPeekWindow — never a blocking modal). Opened from the sites
// portfolio row menu; reached ONLY via dynamic() in SitesPortfolio so
// WindowPanel stays behind the lazy boundary (window-panels + code-splitting
// skills).

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  useSiteGscDaily,
  useSiteGscTopPages,
} from "@/features/marketing/data/hooks";
import type { SiteListRow } from "@/features/marketing/types";
import {
  formatCompactDate,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  SiteConnectionChips,
  SiteIdentityMark,
} from "@/features/marketing/components/shared/SiteConnectionChips";
import {
  formatMetric,
  formatPosition,
  formatStatDate,
  MiniTrendChart,
  TrendDelta,
  trendPercent,
  type GscPeekMetric,
} from "@/features/marketing/components/sites/SiteKpiPeeks";

const CHART_METRICS: Array<{ key: GscPeekMetric; label: string }> = [
  { key: "clicks", label: "Clicks" },
  { key: "impressions", label: "Impressions" },
  { key: "position", label: "Position" },
];

export default function SitePeekWindow({
  site,
  onClose,
}: {
  site: SiteListRow;
  onClose: () => void;
}) {
  const [metric, setMetric] = useState<GscPeekMetric>("clicks");
  const daily = useSiteGscDaily(site.id, 90);
  const topPages = useSiteGscTopPages(site.id, 90, 10);

  const clicksDelta = trendPercent(
    site.gsc_clicks_28d,
    site.gsc_clicks_prev_28d,
    site.gsc_prev_days,
  );
  const impressionsDelta = trendPercent(
    site.gsc_impressions_28d,
    site.gsc_impressions_prev_28d,
    site.gsc_prev_days,
  );

  const tiles = [
    {
      label: "Pages",
      value: formatMetric(site.page_count),
      sub: `${formatMetric(site.pages_in_gsc)} in Google`,
    },
    {
      label: "Clicks 28d",
      value: formatMetric(site.gsc_clicks_28d),
      delta: clicksDelta,
    },
    {
      label: "Impressions 28d",
      value: formatMetric(site.gsc_impressions_28d),
      delta: impressionsDelta,
    },
    {
      label: "Avg position",
      value: formatPosition(site.gsc_position_28d),
    },
    {
      label: "Health",
      value:
        site.health_score !== null ? `${site.health_score.toFixed(1)}/3` : "—",
      sub:
        site.scored_pages > 0
          ? `${formatMetric(site.scored_pages)} scored`
          : undefined,
    },
    {
      label: "GSC data through",
      value: site.gsc_latest_date ? formatStatDate(site.gsc_latest_date) : "—",
    },
  ];

  return (
    <WindowPanel
      id={`site-peek-${site.id}`}
      onClose={onClose}
      title={site.name}
      width={460}
      height={620}
      minWidth={380}
      minHeight={400}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex items-center gap-2.5">
          <SiteIdentityMark site={site} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {site.name}
            </p>
            <a
              href={site.root_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {site.domain}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
          <StatusBadge value={site.status} />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5"
            >
              <p className="flex items-baseline gap-1 text-sm font-semibold tabular-nums text-foreground">
                {tile.value}
                {"delta" in tile ? (
                  <TrendDelta percent={tile.delta ?? null} />
                ) : null}
              </p>
              <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </p>
              {tile.sub ? (
                <p className="truncate text-[10px] text-muted-foreground">
                  {tile.sub}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Last 90 days
            </p>
            <div className="flex overflow-hidden rounded-md border border-border">
              {CHART_METRICS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMetric(option.key)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-medium transition-colors",
                    option.key === metric
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {daily.isLoading ? (
            <div className="h-[72px] animate-pulse rounded-md bg-muted" />
          ) : (
            <MiniTrendChart points={daily.data ?? []} metric={metric} />
          )}
        </div>

        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Top pages by clicks · 90d
          </p>
          {(topPages.data?.length ?? 0) === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {topPages.isLoading
                ? "Loading…"
                : "Google reports no page data yet."}
            </p>
          ) : (
            <div className="space-y-px">
              {(topPages.data ?? []).map((page) => (
                <div
                  key={page.page_id}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 rounded px-1 py-0.5 text-[11px] tabular-nums hover:bg-muted/50"
                  title={page.url}
                >
                  <span className="truncate text-foreground">
                    {page.path || "/"}
                  </span>
                  <span className="w-10 text-right font-medium">
                    {formatMetric(page.clicks)}
                  </span>
                  <span className="w-11 text-right text-muted-foreground">
                    {formatMetric(page.impressions)}
                  </span>
                  <span className="w-8 text-right text-muted-foreground">
                    {formatPosition(page.avg_position)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <SiteConnectionChips site={site} />

        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
          <span className="capitalize">
            {site.visibility} · updated {formatCompactDate(site.updated_at)}
          </span>
          <Button asChild size="sm" variant="outline" className="h-6 text-[11px]">
            <Link href={marketingRoutes.site(site.brand_id, site.id)}>
              Open workspace
            </Link>
          </Button>
        </div>
      </div>
    </WindowPanel>
  );
}
