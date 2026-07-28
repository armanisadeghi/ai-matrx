"use client";

/**
 * `/marketing/ranks` — cross-site rank tracking hub.
 *
 * Every rank target the caller can see, across every brand and site, in one
 * MatrxDataTable (local mode — the read is bounded, see cross-site-data.ts).
 * Adding/checking targets stays on the per-site Ranks workspace, which owns
 * the aidream command lane; every row links there.
 */

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  formatCompactDate,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import {
  listCrossSiteRankPortfolio,
  type CrossSiteRankRow,
} from "@/features/marketing/components/ranks/cross-site-data";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";

function positionText(row: CrossSiteRankRow): string {
  return row.latest_position === null ? "—" : `#${row.latest_position}`;
}

function movementText(row: CrossSiteRankRow): string {
  if (row.movement === null) return "—";
  if (row.movement === 0) return "0";
  return row.movement > 0 ? `+${row.movement}` : `${row.movement}`;
}

export function CrossSiteRanksHub() {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const portfolio = useQuery({
    queryKey: ["marketing", "ranks", "cross-site-portfolio"],
    queryFn: ({ signal }) => listCrossSiteRankPortfolio(signal),
  });
  const rows = useMemo(() => portfolio.data ?? [], [portfolio.data]);

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.is_active);
    return {
      targets: rows.length,
      sites: new Set(rows.map((r) => r.site_id).filter(Boolean)).size,
      improved: active.filter((r) => (r.movement ?? 0) > 0).length,
      declined: active.filter((r) => (r.movement ?? 0) < 0).length,
    };
  }, [rows]);

  const openSiteRanks = (row: CrossSiteRankRow) => {
    if (!row.site_id) return;
    const href = marketingRoutes.site(row.brand_id, row.site_id, "/ranks");
    startNavigation(() => {
      router.push(href);
    });
  };

  const columns: MatrxColumnDef<CrossSiteRankRow>[] = [
    {
      id: "keyword",
      accessorKey: "keyword",
      header: "Keyword",
      cell: (row) => (
        <span className="text-xs font-medium text-foreground">
          {row.keyword}
        </span>
      ),
    },
    {
      id: "site_name",
      accessorKey: "site_name",
      header: "Site",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">
            {row.site_name ?? row.site_id ?? "—"}
          </p>
          {row.site_domain ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {row.site_domain}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "tracking_label",
      accessorKey: "tracking_label",
      header: "Tracked in",
      filter: "select",
    },
    {
      id: "device",
      accessorKey: "device",
      header: "Device",
      filter: "select",
    },
    {
      id: "latest_position",
      accessorKey: "latest_position",
      header: "Position",
      cell: (row) => (
        <span className="text-xs font-semibold">{positionText(row)}</span>
      ),
    },
    {
      id: "movement",
      accessorKey: "movement",
      header: "Change",
      cell: (row) => (
        <span
          className={
            row.movement === null || row.movement === 0
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
    {
      id: "best_position",
      accessorKey: "best_position",
      header: "Best",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.best_position === null ? "—" : `#${row.best_position}`}
        </span>
      ),
    },
    {
      id: "last_checked_at",
      accessorKey: "last_checked_at",
      header: "Last checked",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {row.last_checked_at
            ? formatCompactDate(row.last_checked_at)
            : "Never"}
        </span>
      ),
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: "Active",
      filter: "select",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.is_active ? "Yes" : "No"}
        </span>
      ),
    },
  ];

  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Rank Tracking
          </h1>
        }
        center={<MarketingWorkspaceNav />}
        right={
          <RefreshCwTapButton
            ariaLabel="Refresh rank portfolio"
            onClick={() => void portfolio.refetch()}
            disabled={portfolio.isFetching || isNavigating}
            className={portfolio.isFetching ? "animate-spin" : undefined}
          />
        }
      />
      <main className="h-full overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        {portfolio.isError ? (
          <QueryError
            error={portfolio.error}
            onRetry={() => void portfolio.refetch()}
          />
        ) : (
          <MatrxDataTable<CrossSiteRankRow>
            data={rows}
            columns={columns}
            getRowId={(row) => row.target_id}
            isLoading={portfolio.isLoading}
            isFetching={portfolio.isFetching || isNavigating}
            toolbar={{
              searchPlaceholder: "Search keywords, sites, domains…",
              anyOf: { columnIds: ["keyword", "site_name"] },
              leading: (
                <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                  {isNavigating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  {summary.targets.toLocaleString()} keywords ·{" "}
                  {summary.sites.toLocaleString()} sites ·{" "}
                  <span className="text-success">
                    {summary.improved} improved
                  </span>{" "}
                  ·{" "}
                  <span className="text-destructive">
                    {summary.declined} declined
                  </span>
                </span>
              ),
            }}
            copy={{
              label: "Rank target",
              listLabel: "Cross-site rank portfolio",
              location: webLocation("Rank tracking (cross-site)"),
              rowKind: "web-rank-target",
              listKind: "web-rank-portfolio",
              rowDescription:
                "One tracked keyword's rank state on one site (latest, movement, best).",
              listDescription:
                "The currently loaded cross-site rank portfolio (respecting search, filters, and sort).",
              humanRow: (row) =>
                humanLines([
                  ["Keyword", row.keyword],
                  ["Site", row.site_name ?? row.site_id],
                  ["Domain", row.site_domain],
                  ["Tracked in", row.tracking_label],
                  ["Device", row.device],
                  ["Position", positionText(row)],
                  ["Change", movementText(row)],
                  [
                    "Best",
                    row.best_position === null ? "—" : `#${row.best_position}`,
                  ],
                  [
                    "Last checked",
                    row.last_checked_at
                      ? formatCompactDate(row.last_checked_at)
                      : "Never",
                  ],
                  ["Active", row.is_active ? "yes" : "no"],
                ]),
              rowAttributes: (row) => ({
                rank_target_id: row.target_id,
                site_id: row.site_id ?? "",
                keyword: row.keyword,
              }),
              listAttributes: () => ({
                total_targets: summary.targets,
                sites: summary.sites,
              }),
            }}
            detail={{ enabled: false }}
            onRowOpen={openSiteRanks}
            emptyState={{
              icon: <TrendingUp className="h-8 w-8 text-muted-foreground" />,
              title: "No keywords tracked yet",
              description:
                "Track keywords from a site's Ranks tab (open a site under Brands, then Ranks). Every tracked keyword across every brand shows up here.",
            }}
          />
        )}
      </main>
    </>
  );
}
