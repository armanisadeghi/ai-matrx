"use client";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  DATE_FILTER_OPTIONS,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import type { CrossSiteRankRow } from "./cross-site-data";

export const POSITION_FILTER_OPTIONS = [
  { value: "top10", label: "Top 10" },
  { value: "11-20", label: "Positions 11–20" },
  { value: "21-50", label: "Positions 21–50" },
  { value: "51+", label: "Position 51+" },
  { value: "unranked", label: "Not ranked" },
];

const MOVEMENT_FILTER_OPTIONS = [
  { value: "improved", label: "Improved" },
  { value: "unchanged", label: "Unchanged" },
  { value: "declined", label: "Declined" },
  { value: "unknown", label: "Not enough history" },
];

const LAST_CHECKED_FILTER_OPTIONS = [
  ...DATE_FILTER_OPTIONS,
  { value: "never", label: "Never checked" },
];

export function positionText(row: CrossSiteRankRow): string {
  return row.latest_position == null ? "—" : `#${row.latest_position}`;
}

export function movementText(row: CrossSiteRankRow): string {
  if (row.movement == null) return "—";
  if (row.movement === 0) return "0";
  return row.movement > 0 ? `+${row.movement}` : `${row.movement}`;
}

export const CROSS_SITE_RANK_COLUMNS: EntityColumnSpec<CrossSiteRankRow>[] = [
  {
    id: "keyword",
    label: "Keyword",
    locked: true,
    column: {
      id: "keyword",
      accessorKey: "keyword",
      header: "Keyword",
      filter: "text",
      href: (row) =>
        row.site_id
          ? marketingRoutes.site(row.brand_id, row.site_id, "/ranks")
          : undefined,
      cell: (row) => (
        <span className="text-xs font-medium text-foreground">
          {row.keyword}
        </span>
      ),
    },
  },
  {
    id: "site_name",
    label: "Site",
    locked: true,
    column: {
      id: "site_name",
      accessorKey: "site_name",
      header: "Site",
      filter: "text",
      width: 220,
      cell: (row) =>
        row.site_id && row.site_name ? (
          <div className="min-w-0">
            <EntityRef
              token="web_site"
              id={row.site_id}
              name={row.site_name}
              href={marketingRoutes.site(row.brand_id, row.site_id)}
            />
            {row.site_domain ? (
              <p className="truncate text-[11px] text-muted-foreground">
                {row.site_domain}
              </p>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            Site unavailable
          </span>
        ),
    },
  },
  {
    id: "tracking_label",
    label: "Tracked in",
    facet: "tracking_label",
    column: {
      id: "tracking_label",
      accessorKey: "tracking_label",
      header: "Tracked in",
      filter: "select",
    },
  },
  {
    id: "device",
    label: "Device",
    facet: "device",
    column: {
      id: "device",
      accessorKey: "device",
      header: "Device",
      filter: "select",
    },
  },
  {
    id: "latest_position",
    label: "Position",
    column: {
      id: "latest_position",
      accessorKey: "latest_position",
      header: "Position",
      filter: "select",
      filterOptions: POSITION_FILTER_OPTIONS,
      align: "right",
      cell: (row) => (
        <span className="text-xs font-semibold">{positionText(row)}</span>
      ),
    },
  },
  {
    id: "movement",
    label: "Change",
    column: {
      id: "movement",
      accessorKey: "movement",
      header: "Change",
      filter: "select",
      filterOptions: MOVEMENT_FILTER_OPTIONS,
      align: "right",
      cell: (row) => (
        <span
          className={
            row.movement == null || row.movement === 0
              ? "text-xs text-muted-foreground"
              : row.movement > 0
                ? "text-xs font-medium text-success"
                : "text-xs font-medium text-destructive"
          }
        >
          {movementText(row)}
        </span>
      ),
    },
  },
  {
    id: "best_position",
    label: "Best",
    column: {
      id: "best_position",
      accessorKey: "best_position",
      header: "Best",
      filter: "select",
      filterOptions: POSITION_FILTER_OPTIONS,
      align: "right",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.best_position == null ? "—" : `#${row.best_position}`}
        </span>
      ),
    },
  },
  {
    id: "last_checked_at",
    label: "Last checked",
    column: {
      id: "last_checked_at",
      accessorKey: "last_checked_at",
      header: "Last checked",
      filter: "select",
      filterOptions: LAST_CHECKED_FILTER_OPTIONS,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {row.last_checked_at
            ? formatCompactDate(row.last_checked_at)
            : "Never"}
        </span>
      ),
    },
  },
  {
    id: "is_active",
    label: "Active",
    column: {
      id: "is_active",
      accessorKey: "is_active",
      header: "Active",
      filter: "boolean",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.is_active ? "Yes" : "No"}
        </span>
      ),
    },
  },
  {
    id: "created_at",
    label: "Created",
    defaultHidden: true,
    column: {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatCompactDate(row.created_at)}
        </span>
      ),
    },
  },
];
