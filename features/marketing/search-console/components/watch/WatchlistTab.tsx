"use client";

/**
 * Watchlist — ONE mixed table of every watched query and page for the
 * active site (kind chip per row, All / Queries / Pages toggle). Rows come
 * from `seo.gsc_perf_watch`, anchored on the watched id sets so an item
 * with no impressions in the period still shows as a real zero row (that
 * "still nothing" signal is the point of watching it). Unwatch inline;
 * row click drills GSC-style; right-click opens floating panels.
 */

import { useRef, useState } from "react";
import { Eye, PanelTop } from "lucide-react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import {
  buildGscMetricColumns,
  gscMetricCopyLines,
} from "@/features/marketing/search-console/lib/columns";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import { getGscWatch } from "@/features/marketing/search-console/data-watch";
import {
  useToggleWatch,
  useWatchedIds,
} from "@/features/marketing/search-console/hooks/useWatchState";
import { WatchButton } from "@/features/marketing/search-console/components/watch/WatchButton";
import type {
  GscCompareMode,
  GscRangeKey,
  GscResolvedPeriods,
  GscWatchRow,
} from "@/features/marketing/search-console/types";

export function WatchlistTab({
  siteId,
  siteName,
  periods,
  panelRange,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  panelRange: {
    range: GscRangeKey;
    customFrom: string | null;
    customTo: string | null;
    compare: GscCompareMode;
  };
  onDrill: (row: GscWatchRow) => void;
}) {
  const hasCompare = periods.compare !== null;
  const [kindFilter, setKindFilter] = useState<"all" | "query" | "page">("all");
  const watched = useWatchedIds();
  const toggle = useToggleWatch();
  const openDrilldown = useOpenGscDrilldownWindow();

  const pageIds = watched.data?.pageIds ?? [];
  const keywordIds = watched.data?.keywordIds ?? [];

  const rowsQuery = useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "watch-rows",
      siteId,
      periods.current.start,
      periods.current.end,
      periods.compare?.start ?? "",
      periods.compare?.end ?? "",
      [...pageIds].sort().join(","),
      [...keywordIds].sort().join(","),
    ],
    queryFn: ({ signal }) =>
      getGscWatch(siteId, periods, pageIds, keywordIds, signal),
    enabled: !!watched.data,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const allRows = rowsQuery.data ?? [];
  const rows =
    kindFilter === "all"
      ? allRows
      : allRows.filter((r) => r.kind === kindFilter);

  const clickedRowRef = useRef<GscWatchRow | null>(null);
  const rowId = (row: GscWatchRow) => `${row.kind}:${row.entity_id}`;
  const resolveRowContext = (target: HTMLElement | null) => {
    const id = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
    const row = id ? (rows.find((r) => rowId(r) === id) ?? null) : null;
    clickedRowRef.current = row;
    if (!row) return null;
    return {
      content: humanLines(
        gscMetricCopyLines(
          row.kind === "query" ? "Query" : "Page",
          row.kind === "query" ? "query" : "page",
          row,
        ),
      ),
    };
  };

  const openRowDrillPanel = () => {
    const row = clickedRowRef.current;
    if (!row) {
      toast.error("Right-click a data row to drill into it.");
      return;
    }
    openDrilldown({
      siteId,
      siteName,
      dimension: row.kind === "query" ? "page" : "query",
      filters:
        row.kind === "query"
          ? { query_eq: row.key }
          : { page_eq: row.entity_id },
      range: panelRange.range,
      customFrom: panelRange.customFrom,
      customTo: panelRange.customTo,
      compare: panelRange.compare,
      title:
        row.kind === "query"
          ? `Pages for “${row.key}”`
          : `Queries for ${row.key}`,
    });
  };

  const columns: MatrxColumnDef<GscWatchRow>[] = [
    {
      id: "unwatch",
      header: "",
      sortable: false,
      filter: false,
      width: 36,
      cell: (row) => (
        <WatchButton
          watched
          pending={toggle.isPending && toggle.variables?.target.entityId === row.entity_id}
          noun={row.kind === "query" ? "query" : "page"}
          onToggle={() =>
            toggle.mutate({
              target: {
                kind: row.kind === "query" ? "query" : "page",
                entityId: row.entity_id,
                rowKey: row.key,
              },
              watched: false,
            })
          }
        />
      ),
    },
    {
      id: "kind",
      accessorKey: "kind",
      header: "Type",
      width: 70,
      // The All/Queries/Pages toggle above owns kind filtering — a second,
      // independent column filter could contradict it.
      filter: false,
      cell: (row) => (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            row.kind === "query"
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {row.kind}
        </span>
      ),
    },
    {
      id: "key",
      accessorKey: "key",
      header: "Watched item",
      filter: false,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "block max-w-[24rem] truncate text-xs font-medium sm:max-w-[32rem]",
              row.impressions === 0 ? "text-muted-foreground" : "text-foreground",
            )}
            title={row.key}
          >
            {row.key}
          </span>
          {row.impressions === 0 ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              no impressions in period
            </span>
          ) : null}
        </span>
      ),
    },
    ...buildGscMetricColumns<GscWatchRow>(hasCompare, "all"),
  ];

  const error = watched.isError
    ? watched.error
    : rowsQuery.isError
      ? rowsQuery.error
      : null;

  if (error) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <p className="max-w-lg text-center text-xs text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  const empty = !watched.isLoading && pageIds.length + keywordIds.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-0.5 self-start rounded-md border border-border bg-card p-0.5">
        {(["all", "query", "page"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={cn(
              "rounded px-2 py-0.5 text-[11px] transition-colors",
              kindFilter === kind
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            onClick={() => setKindFilter(kind)}
          >
            {kind === "all" ? "All" : kind === "query" ? "Queries" : "Pages"}
          </button>
        ))}
      </div>
      {pageIds.length > 200 || keywordIds.length > 200 ? (
        <p className="text-[11px] text-warning">
          Showing metrics for the first 200 watched pages and 200 watched
          queries — unwatch items you no longer need to see the rest.
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/60 p-8 text-center">
            <Eye className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Nothing watched yet
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Use the eye button (or right-click → Watch) on any query or page
              row — watched items appear here with their live numbers, even
              when they have zero impressions in the period.
            </p>
          </div>
        ) : (
          <NonEditableContextMenu
            sourceFeature="marketing"
            contextData={{ content: "" }}
            resolveContextOnOpen={resolveRowContext}
            extraSections={[
              {
                id: "gsc-watch-drill",
                label: "Search Console",
                anchor: "after-compare",
                items: [
                  {
                    kind: "item",
                    id: "gsc-watch-drill-panel",
                    label: "Drill into this row — floating panel",
                    icon: PanelTop,
                    description:
                      "Queries for a watched page / pages for a watched query, in a floating panel",
                    onSelect: openRowDrillPanel,
                  },
                ],
              },
            ]}
          >
            <div className="flex h-full min-h-0 flex-col">
              <MatrxDataTable<GscWatchRow>
                data={rows}
                columns={columns}
                getRowId={rowId}
                isLoading={watched.isLoading || rowsQuery.isLoading}
                isFetching={rowsQuery.isFetching}
                toolbar={{ searchPlaceholder: "Search watchlist…" }}
                copy={{
                  label: "Watched item",
                  listLabel: "Search Console watchlist",
                  location: webLocation("Search Console — Watchlist"),
                  rowKind: "web-gsc-watch-item",
                  listKind: "web-gsc-watchlist",
                  rowDescription:
                    "One watched query or page with its search performance for the selected site and period.",
                  listDescription:
                    "Every watched query/page for this site, including zero-impression rows.",
                  humanRow: (row) =>
                    humanLines(
                      gscMetricCopyLines(
                        row.kind === "query" ? "Query" : "Page",
                        row.kind === "query" ? "query" : "page",
                        row,
                      ),
                    ),
                  rowAttributes: (row) => ({
                    ...gscScopeAttributes(siteId, siteName, periods, {}),
                    kind: row.kind,
                    entity_id: row.entity_id,
                    key: row.key,
                  }),
                  listAttributes: (visible) => ({
                    ...gscScopeAttributes(siteId, siteName, periods, {}),
                    visible_rows: visible.length,
                    watched_pages: pageIds.length,
                    watched_queries: keywordIds.length,
                  }),
                }}
                detail={{ enabled: false }}
                window={{ enabled: false }}
                onRowOpen={onDrill}
                pageSize={50}
                emptyState={{
                  icon: <Eye className="h-8 w-8 text-muted-foreground" />,
                  title: "No watched items of this type",
                  description:
                    "Switch the filter above, or watch more queries and pages from any table.",
                }}
                className="flex-1"
              />
            </div>
          </NonEditableContextMenu>
        )}
      </div>
    </div>
  );
}
