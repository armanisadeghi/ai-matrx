"use client";

/**
 * Dig Here results — one local-mode MatrxDataTable over the rows
 * `seo.gsc_perf_dig` returned for the active rule (the RPC already
 * filtered/sorted/limited; search, re-sort, and paging within the result
 * set are client-side). Columns come from the shared builders in
 * `lib/columns.tsx` plus the dig-only Δ% columns; rows carry the same
 * right-click drills and Copy / Copy-as-JSON / Copy-for-AI as every other
 * Search Console table.
 */

import { useRef } from "react";
import { Eye, Filter, PanelTop, Pickaxe } from "lucide-react";
import { toast } from "@/lib/toast";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import {
  GscDeltaSpan,
  buildGscKeyColumn,
  buildGscMetricColumns,
  gscMetricCopyLines,
} from "@/features/marketing/search-console/lib/columns";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import { describeGscWindow } from "@/features/marketing/search-console/lib/format";
import { panelDrillFor } from "@/features/marketing/search-console/lib/drills";
import { useRowWatch } from "@/features/marketing/search-console/hooks/useWatchState";
import { ClassChip } from "@/features/marketing/search-console/components/insights/ClassInsights";
import { WatchButton } from "@/features/marketing/search-console/components/watch/WatchButton";
import type {
  GscBreakdownRow,
  GscCompareMode,
  GscDigResultRow,
  GscFilters,
  GscRangeKey,
  GscResolvedPeriods,
} from "@/features/marketing/search-console/types";

function toBreakdownShape(row: GscDigResultRow): GscBreakdownRow {
  return {
    key: row.key,
    page_id: row.page_id,
    keyword_id: row.keyword_id,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    avg_position: row.avg_position,
    cmp_clicks: row.cmp_clicks,
    cmp_impressions: row.cmp_impressions,
    cmp_ctr: row.cmp_ctr,
    cmp_avg_position: row.cmp_avg_position,
    total_count: row.total_count,
  };
}

export function DigResultsTable({
  siteId,
  siteName,
  dimension,
  periods,
  baseFilters,
  ruleLabel,
  rows,
  isLoading,
  isFetching,
  error,
  onDrill,
  panelRange,
}: {
  siteId: string;
  siteName: string | null;
  dimension: "query" | "page";
  periods: GscResolvedPeriods;
  baseFilters: GscFilters;
  ruleLabel: string;
  rows: GscDigResultRow[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onDrill?: (row: GscDigResultRow) => void;
  panelRange: {
    range: GscRangeKey;
    customFrom: string | null;
    customTo: string | null;
    compare: GscCompareMode;
  };
}) {
  const hasCompare = periods.compare !== null;
  const columnLabel = dimension === "query" ? "Query" : "Page";
  const openDrilldown = useOpenGscDrilldownWindow();
  const rowWatch = useRowWatch(dimension);
  const clickedRowRef = useRef<GscDigResultRow | null>(null);

  const resolveRowContext = (target: HTMLElement | null) => {
    const key = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
    const row = key ? (rows.find((r) => r.key === key) ?? null) : null;
    clickedRowRef.current = row;
    if (!row) return null;
    return {
      content: humanLines(gscMetricCopyLines(columnLabel, dimension, row)),
    };
  };

  const openRowDrillPanel = () => {
    const row = clickedRowRef.current;
    if (!row) {
      toast.error("Right-click a data row to drill into it.");
      return;
    }
    const drill = panelDrillFor(dimension, toBreakdownShape(row));
    openDrilldown({
      siteId,
      siteName,
      dimension: drill.dimension,
      filters: { ...baseFilters, ...drill.filters },
      range: panelRange.range,
      customFrom: panelRange.customFrom,
      customTo: panelRange.customTo,
      compare: panelRange.compare,
      title: drill.label,
    });
  };

  const columns: MatrxColumnDef<GscDigResultRow>[] = [
    {
      id: "watch",
      header: "",
      sortable: false,
      filter: false,
      width: 36,
      cell: (row) => (
        <WatchButton
          watched={rowWatch.isWatched(row)}
          pending={rowWatch.isRowPending(row)}
          onToggle={() => rowWatch.toggleRow(row)}
          noun={dimension}
        />
      ),
    },
    buildGscKeyColumn<GscDigResultRow>(dimension, columnLabel),
    // Class column only when the server attributed classes (query digs and
    // class-pinned page digs) — an all-null column is noise.
    ...(rows.some((r) => r.traffic_class !== null)
      ? [
          {
            id: "traffic_class",
            header: "Class",
            sortable: false,
            filter: false,
            accessorFn: (row) => row.traffic_class,
            cell: (row) => <ClassChip trafficClass={row.traffic_class} />,
          } satisfies MatrxColumnDef<GscDigResultRow>,
        ]
      : []),
    ...buildGscMetricColumns<GscDigResultRow>(hasCompare, "all"),
    ...(hasCompare
      ? [
          {
            id: "delta_clicks_pct",
            header: "Δ Clicks %",
            align: "right",
            filter: false,
            accessorFn: (row) => row.delta_clicks_pct,
            cell: (row) => (
              <GscDeltaSpan
                value={
                  row.delta_clicks_pct === null
                    ? null
                    : {
                        text: `${row.delta_clicks_pct > 0 ? "+" : ""}${row.delta_clicks_pct.toFixed(0)}%`,
                        tone:
                          row.delta_clicks_pct === 0
                            ? "flat"
                            : row.delta_clicks_pct > 0
                              ? "up"
                              : "down",
                      }
                }
              />
            ),
          } satisfies MatrxColumnDef<GscDigResultRow>,
          {
            id: "delta_impressions_pct",
            header: "Δ Impr. %",
            align: "right",
            filter: false,
            accessorFn: (row) => row.delta_impressions_pct,
            cell: (row) => (
              <GscDeltaSpan
                value={
                  row.delta_impressions_pct === null
                    ? null
                    : {
                        text: `${row.delta_impressions_pct > 0 ? "+" : ""}${row.delta_impressions_pct.toFixed(0)}%`,
                        tone:
                          row.delta_impressions_pct === 0
                            ? "flat"
                            : row.delta_impressions_pct > 0
                              ? "up"
                              : "down",
                      }
                }
              />
            ),
          } satisfies MatrxColumnDef<GscDigResultRow>,
        ]
      : []),
  ];

  if (error) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <p className="max-w-lg text-center text-xs text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  return (
    <NonEditableContextMenu
      sourceFeature="marketing"
      contextData={{ content: "" }}
      resolveContextOnOpen={resolveRowContext}
      extraSections={[
        {
          id: "gsc-dig-drill",
          label: "Search Console",
          anchor: "after-compare",
          items: [
            {
              kind: "item",
              id: "gsc-dig-drill-panel",
              label:
                dimension === "query"
                  ? "Pages for this query — floating panel"
                  : "Queries for this page — floating panel",
              icon: PanelTop,
              description:
                "Open this row's breakdown in a floating panel you can keep beside others",
              onSelect: openRowDrillPanel,
            },
            {
              kind: "item" as const,
              id: "gsc-dig-watch-row",
              label: `Watch / unwatch this ${dimension}`,
              icon: Eye,
              description:
                "Toggle this row on your Watchlist tab (per-user, cross-site)",
              onSelect: () => {
                const row = clickedRowRef.current;
                if (!row) {
                  toast.error("Right-click a data row to watch it.");
                  return;
                }
                rowWatch.toggleRow(row);
              },
            },
            ...(onDrill
              ? [
                  {
                    kind: "item" as const,
                    id: "gsc-dig-filter-row",
                    label: "Drill into this row here",
                    icon: Filter,
                    description:
                      "Jump to the matching tab filtered to this row (same as clicking it)",
                    onSelect: () => {
                      const row = clickedRowRef.current;
                      if (!row) {
                        toast.error("Right-click a data row to drill into it.");
                        return;
                      }
                      onDrill(row);
                    },
                  },
                ]
              : []),
          ],
        },
      ]}
    >
      <div className="flex h-full min-h-0 flex-col">
        <MatrxDataTable<GscDigResultRow>
          data={rows}
          columns={columns}
          getRowId={(row) => row.key}
          isLoading={isLoading}
          isFetching={isFetching}
          toolbar={{
            searchPlaceholder: `Search results…`,
          }}
          copy={{
            label: "Dig result",
            listLabel: `Dig Here — ${ruleLabel}`,
            location: webLocation("Search Console — Dig Here"),
            rowKind: `web-gsc-dig-${dimension}`,
            listKind: "web-gsc-dig-results",
            rowDescription: `One ${dimension} surfaced by the "${ruleLabel}" dig rule for the selected site and period.`,
            listDescription: `The rows the "${ruleLabel}" dig rule surfaced (rule conditions already applied server-side).`,
            humanRow: (row) =>
              humanLines(gscMetricCopyLines(columnLabel, dimension, row)),
            rowAttributes: (row) => ({
              ...gscScopeAttributes(siteId, siteName, periods, baseFilters),
              dig_rule: ruleLabel,
              dimension,
              key: row.key,
              page_id: row.page_id ?? "",
              keyword_id: row.keyword_id ?? "",
            }),
            listAttributes: (visible) => ({
              ...gscScopeAttributes(siteId, siteName, periods, baseFilters),
              dig_rule: ruleLabel,
              dimension,
              visible_rows: visible.length,
              total_rows: rows.length,
            }),
          }}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          onRowOpen={onDrill}
          pageSize={50}
          emptyState={{
            icon: <Pickaxe className="h-8 w-8 text-muted-foreground" />,
            title: "Nothing matches this rule",
            description: `No rows pass every condition ${describeGscWindow(periods.current)}. Loosen a threshold, widen the range, or try another rule.`,
          }}
          className="flex-1"
        />
      </div>
    </NonEditableContextMenu>
  );
}
