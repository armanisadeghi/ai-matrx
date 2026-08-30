"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { MatrxDataTableMobileCardControls } from "@/components/official/matrx-data-table/types";
import {
  SiteConnectionChips,
  SiteIdentityMark,
} from "@/features/marketing/components/shared/SiteConnectionChips";
import { StatusBadge } from "@/features/marketing/components/shared/MarketingUi";
import {
  formatMetric,
  formatPosition,
  GscMetricPeek,
  PagesPeek,
  TrendDelta,
  trendPercent,
} from "@/features/marketing/components/sites/SiteKpiPeeks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { SiteListRow } from "@/features/marketing/types";
import type { EntityColumnSpec } from "@/lib/entity-list/columns";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "error", label: "Error" },
];

/**
 * The eight presentations from the managed-sites portfolio, expressed once for
 * the canonical entity-list shell. Only name and status declare filters: those
 * are the two visible columns the existing server path actually filters.
 */
export const SITE_LIST_COLUMNS: EntityColumnSpec<SiteListRow>[] = [
  {
    id: "name",
    label: "Site",
    locked: true,
    column: {
      id: "name",
      accessorKey: "name",
      header: "Site",
      filter: "text",
      cellKind: "text",
      entityToken: "web_site",
      entityId: (row) => row.id,
      // Preserve the brand-first workspace destination; the flat registry
      // route remains the fallback for callers that only know the site id.
      href: (row) => marketingRoutes.site(row.brand_id, row.id),
      cell: (row) => (
        <div className="flex min-w-52 items-center gap-2.5">
          <SiteIdentityMark site={row} size={30} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {row.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.domain}
            </p>
          </div>
        </div>
      ),
    },
  },
  {
    id: "page_count",
    label: "Pages",
    column: {
      id: "page_count",
      accessorKey: "page_count",
      header: "Pages",
      filter: false,
      align: "right",
      cell: (row) => (
        <PagesPeek site={row}>
          <span className="block text-right">
            <span className="block text-sm font-medium tabular-nums text-foreground">
              {formatMetric(row.page_count)}
            </span>
            <span className="block text-[10px] tabular-nums text-muted-foreground">
              {formatMetric(row.pages_in_gsc)} in Google
            </span>
            {row.resource_count > 0 ? (
              <span className="block text-[10px] tabular-nums text-muted-foreground">
                +{formatMetric(row.resource_count)} resources
              </span>
            ) : null}
          </span>
        </PagesPeek>
      ),
    },
  },
  {
    id: "gsc_clicks_28d",
    label: "Clicks · 28d",
    column: {
      id: "gsc_clicks_28d",
      accessorKey: "gsc_clicks_28d",
      header: "Clicks · 28d",
      filter: false,
      align: "right",
      cell: (row) => (
        <GscMetricPeek site={row} metric="clicks">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatMetric(row.gsc_clicks_28d)}
            </span>
            <TrendDelta
              percent={trendPercent(
                row.gsc_clicks_28d,
                row.gsc_clicks_prev_28d,
                row.gsc_prev_days,
              )}
            />
          </span>
        </GscMetricPeek>
      ),
    },
  },
  {
    id: "gsc_impressions_28d",
    label: "Impressions · 28d",
    column: {
      id: "gsc_impressions_28d",
      accessorKey: "gsc_impressions_28d",
      header: "Impressions · 28d",
      filter: false,
      align: "right",
      cell: (row) => (
        <GscMetricPeek site={row} metric="impressions">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatMetric(row.gsc_impressions_28d)}
            </span>
            <TrendDelta
              percent={trendPercent(
                row.gsc_impressions_28d,
                row.gsc_impressions_prev_28d,
                row.gsc_prev_days,
              )}
            />
          </span>
        </GscMetricPeek>
      ),
    },
  },
  {
    id: "gsc_position_28d",
    label: "Position",
    column: {
      id: "gsc_position_28d",
      accessorKey: "gsc_position_28d",
      header: "Pos.",
      filter: false,
      align: "right",
      cell: (row) => (
        <GscMetricPeek site={row} metric="position">
          <span className="text-sm tabular-nums text-foreground">
            {formatPosition(row.gsc_position_28d)}
          </span>
        </GscMetricPeek>
      ),
    },
  },
  {
    id: "health_score",
    label: "Health",
    column: {
      id: "health_score",
      accessorKey: "health_score",
      header: "Health",
      filter: false,
      align: "right",
      cell: (row) => (
        <span className="block text-right">
          <span
            className={cn(
              "block text-sm font-medium tabular-nums",
              row.health_score === null
                ? "text-muted-foreground"
                : row.health_score >= 90
                  ? "text-success"
                  : row.health_score >= 70
                    ? "text-warning"
                    : "text-destructive",
            )}
          >
            {row.health_score === null ? "—" : row.health_score.toFixed(1)}
          </span>
          <span className="block text-[10px] tabular-nums text-muted-foreground">
            {row.scored_pages
              ? `${formatMetric(row.scored_pages)} scored`
              : "not analyzed"}
          </span>
        </span>
      ),
    },
  },
  {
    id: "connections",
    label: "Connections",
    column: {
      id: "connections",
      accessorKey: "id",
      header: "Connections",
      filter: false,
      sortable: false,
      cell: (row) => <SiteConnectionChips site={row} />,
    },
  },
  {
    id: "status",
    label: "Status",
    column: {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: STATUS_OPTIONS,
      cell: (row) => <StatusBadge value={row.status} />,
    },
  },
];

/** Phone summary for the canonical sites table's loaded row. */
export function renderSiteListMobileCard(
  row: SiteListRow,
  _index: number,
  controls: MatrxDataTableMobileCardControls,
): ReactNode {
  const siteHref = marketingRoutes.site(row.brand_id, row.id);
  return (
    <article className="shrink-0 rounded-lg border border-border/80 bg-background p-3 shadow-sm">
      <header className="flex items-start gap-2">
        <Link
          href={siteHref}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SiteIdentityMark site={row} size={34} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {row.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.domain}
            </span>
          </span>
        </Link>
        <div className="flex min-h-11 shrink-0 items-center">
          {controls.actions}
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/60 py-3">
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Pages
          </dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
            {formatMetric(row.page_count)}
          </dd>
          <dd className="text-[10px] tabular-nums text-muted-foreground">
            {formatMetric(row.pages_in_gsc)} in Google
            {row.resource_count > 0
              ? ` · +${formatMetric(row.resource_count)} resources`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Clicks · 28d
          </dt>
          <dd className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground">
            {formatMetric(row.gsc_clicks_28d)}
            <TrendDelta
              percent={trendPercent(
                row.gsc_clicks_28d,
                row.gsc_clicks_prev_28d,
                row.gsc_prev_days,
              )}
            />
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Impressions · 28d
          </dt>
          <dd className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground">
            {formatMetric(row.gsc_impressions_28d)}
            <TrendDelta
              percent={trendPercent(
                row.gsc_impressions_28d,
                row.gsc_impressions_prev_28d,
                row.gsc_prev_days,
              )}
            />
          </dd>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Position
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {formatPosition(row.gsc_position_28d)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Health
            </dt>
            <dd
              className={cn(
                "mt-0.5 text-sm font-semibold tabular-nums",
                row.health_score === null
                  ? "text-muted-foreground"
                  : row.health_score >= 90
                    ? "text-success"
                    : row.health_score >= 70
                      ? "text-warning"
                      : "text-destructive",
              )}
            >
              {row.health_score === null ? "—" : row.health_score.toFixed(1)}
            </dd>
          </div>
        </div>
      </dl>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <StatusBadge value={row.status} />
        <SiteConnectionChips site={row} />
      </footer>
    </article>
  );
}
