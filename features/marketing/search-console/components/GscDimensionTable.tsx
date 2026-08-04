"use client";

/**
 * The generic dimension table — ONE MatrxDataTable (controlled mode) that
 * backs every Search Console tab AND every drill-down panel, parameterized by
 * dimension. Sorting, pagination, and the search box push down to the
 * `seo.gsc_perf_breakdown` RPC; compare-period delta columns appear whenever
 * a comparison is active; the full copy config gives every row and the
 * visible view Copy / Copy-as-JSON / Copy-for-AI + CSV export for free.
 *
 * Row click = the surface's drill action (cross-filter / open panel) via
 * `onDrill`. Right-click wiring lives in GscTableContextMenu (the region
 * wrapper), which resolves rows through the table's `data-row-id` stamps.
 */

import { useRef, useState } from "react";
import { Columns2, Filter, PanelTop, SearchX } from "lucide-react";
import { toast } from "@/lib/toast";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import {
  buildGscKeyColumn,
  buildGscMetricColumns,
  gscKeyCell,
  gscMetricCopyLines,
} from "@/features/marketing/search-console/lib/columns";
import { useGscBreakdown } from "@/features/marketing/search-console/hooks/useGscQuery";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import { panelDrillFor } from "@/features/marketing/search-console/lib/drills";
import type {
  GscBreakdownRow,
  GscCompareMode,
  GscDimension,
  GscFilters,
  GscRangeKey,
  GscResolvedPeriods,
  GscSortKey,
} from "@/features/marketing/search-console/types";

const DIMENSION_LABELS: Record<GscDimension, { column: string; noun: string }> =
  {
    query: { column: "Query", noun: "query" },
    page: { column: "Page", noun: "page" },
    country: { column: "Country", noun: "country" },
    device: { column: "Device", noun: "device" },
    search_appearance: { column: "Appearance", noun: "search appearance" },
  };

const SORTABLE: ReadonlySet<string> = new Set([
  "key",
  "clicks",
  "impressions",
  "ctr",
  "position",
  "delta_clicks",
]);

export function GscDimensionTable({
  siteId,
  siteName,
  dimension,
  periods,
  filters,
  copySurface,
  onDrill,
  drillHint,
  pageSize = 50,
  compactHeight = false,
  panelRange,
}: {
  siteId: string;
  siteName: string | null;
  dimension: GscDimension;
  periods: GscResolvedPeriods;
  filters: GscFilters;
  /** Where this table lives, for copy payloads — e.g. "Search Console — Queries". */
  copySurface: string;
  /** Row click. GSC parity: queries↔pages cross-filter; panels re-drill. */
  onDrill?: (row: GscBreakdownRow) => void;
  /** One line under the toolbar naming what a row click does. */
  drillHint?: string;
  pageSize?: number;
  compactHeight?: boolean;
  /**
   * The unresolved range state. When present, rows gain a right-click menu
   * with "open in floating panel" drill actions (the panel needs the range
   * to resolve its own periods).
   */
  panelRange?: {
    range: GscRangeKey;
    customFrom: string | null;
    customTo: string | null;
    compare: GscCompareMode;
  };
}) {
  const hasCompare = periods.compare !== null;
  const labels = DIMENSION_LABELS[dimension];
  const [query, setQuery] = useState<MatrxDataTableQueryState>({
    page: 1,
    pageSize,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: { id: "clicks", direction: "desc" },
  });

  const sortId = query.sort?.id && SORTABLE.has(query.sort.id)
    ? (query.sort.id as GscSortKey)
    : "clicks";
  const breakdown = useGscBreakdown(siteId, periods, filters, {
    dimension,
    search: query.search,
    sort: sortId,
    sortDir: query.sort?.direction ?? "desc",
    page: query.page,
    pageSize: query.pageSize,
  });

  const rows = breakdown.data?.rows ?? [];
  const total = breakdown.data?.total ?? 0;

  // Right-click drills: one NonEditableContextMenu serves every row via
  // resolveContextOnOpen + the table's data-row-id stamps; extraSections
  // items read the row captured at open time.
  const openDrilldown = useOpenGscDrilldownWindow();
  const clickedRowRef = useRef<GscBreakdownRow | null>(null);
  const resolveRowContext = (target: HTMLElement | null) => {
    const key = target
      ?.closest("[data-row-id]")
      ?.getAttribute("data-row-id");
    const row = key ? (rows.find((r) => r.key === key) ?? null) : null;
    clickedRowRef.current = row;
    if (!row) return null;
    return {
      content: humanLines(gscMetricCopyLines(labels.column, dimension, row)),
    };
  };
  const openViewPanel = () => {
    if (!panelRange) return;
    openDrilldown({
      siteId,
      siteName,
      dimension,
      filters: { ...filters },
      range: panelRange.range,
      customFrom: panelRange.customFrom,
      customTo: panelRange.customTo,
      compare: panelRange.compare,
      title: `${labels.column} — ${siteName ?? "Search Console"}`,
    });
  };
  const openRowDrillPanel = () => {
    const row = clickedRowRef.current;
    if (!panelRange) return;
    if (!row) {
      toast.error("Right-click a data row to drill into it.");
      return;
    }
    const drill = panelDrillFor(dimension, row);
    openDrilldown({
      siteId,
      siteName,
      dimension: drill.dimension,
      filters: { ...filters, ...drill.filters },
      range: panelRange.range,
      customFrom: panelRange.customFrom,
      customTo: panelRange.customTo,
      compare: panelRange.compare,
      title: drill.label,
    });
  };

  const columns: MatrxColumnDef<GscBreakdownRow>[] = [
    buildGscKeyColumn<GscBreakdownRow>(dimension, labels.column),
    ...buildGscMetricColumns<GscBreakdownRow>(hasCompare, "clicks-only"),
  ];

  const PANEL_DRILL_LABELS: Record<GscDimension, string> = {
    query: "Pages for this query — floating panel",
    page: "Queries for this page — floating panel",
    country: "Devices in this country — floating panel",
    device: "Countries on this device — floating panel",
    search_appearance: "This appearance type — floating panel",
  };

  const table = (
    <div className="flex h-full min-h-0 flex-col">
      {breakdown.isError ? (
        <div className="flex h-full items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="max-w-lg text-center text-xs text-destructive">
            {breakdown.error instanceof Error
              ? breakdown.error.message
              : String(breakdown.error)}
          </p>
        </div>
      ) : (
        <MatrxDataTable<GscBreakdownRow>
          data={rows}
          columns={columns}
          getRowId={(row) => row.key}
          isLoading={breakdown.isLoading}
          isFetching={breakdown.isFetching}
          query={{
            mode: "controlled",
            totalItems: total,
            state: query,
            onStateChange: (next) =>
              setQuery(
                next.sort
                  ? next
                  : // A third header click clears the sort, but the RPC has no
                    // unsorted mode — normalize so the header shows what the
                    // server actually does.
                    { ...next, sort: { id: "clicks", direction: "desc" } },
              ),
          }}
          toolbar={{
            searchPlaceholder: `Search ${labels.noun}s…`,
            leading: drillHint ? (
              <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground lg:inline">
                {drillHint}
              </span>
            ) : undefined,
          }}
          copy={{
            label: `Search ${labels.noun}`,
            listLabel: `Search Console ${labels.noun} table`,
            location: webLocation(copySurface),
            rowKind: `web-gsc-${dimension.replace(/_/g, "-")}`,
            listKind: `web-gsc-${dimension.replace(/_/g, "-")}-table`,
            rowDescription: `One ${labels.noun}'s search performance for the selected site, period, and filters.`,
            listDescription: `The currently visible Search Console ${labels.noun} rows (respecting search, sort, filters, and pagination).`,
            humanRow: (row) =>
              humanLines(gscMetricCopyLines(labels.column, dimension, row)),
            rowAttributes: (row) => ({
              ...gscScopeAttributes(siteId, siteName, periods, filters),
              dimension,
              key: row.key,
              page_id: row.page_id ?? "",
              keyword_id: row.keyword_id ?? "",
            }),
            listAttributes: (visible) => ({
              ...gscScopeAttributes(siteId, siteName, periods, filters),
              dimension,
              visible_rows: visible.length,
              total_rows: total,
            }),
          }}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          onRowOpen={onDrill}
          pageSize={pageSize}
          emptyState={{
            icon: <SearchX className="h-8 w-8 text-muted-foreground" />,
            title: `No ${labels.noun} data`,
            description:
              "No Search Console rows match this period and filter set. Widen the range, clear filters, or sync the site.",
          }}
          className={compactHeight ? undefined : "flex-1"}
        />
      )}
    </div>
  );

  if (!panelRange) return table;

  return (
    <NonEditableContextMenu
      sourceFeature="marketing"
      contextData={{ content: "" }}
      resolveContextOnOpen={resolveRowContext}
      extraSections={[
        {
          id: "gsc-drill",
          label: "Search Console",
          anchor: "after-compare",
          items: [
            {
              kind: "item",
              id: "gsc-drill-panel",
              label: PANEL_DRILL_LABELS[dimension],
              icon: PanelTop,
              description:
                "Open this row's breakdown in a floating panel you can keep beside others",
              onSelect: openRowDrillPanel,
            },
            {
              kind: "item",
              id: "gsc-view-panel",
              label: "This view — floating panel",
              icon: Columns2,
              description:
                "Float this whole table (current filters and period) for side-by-side comparison",
              onSelect: openViewPanel,
            },
            ...(onDrill
              ? [
                  {
                    kind: "item" as const,
                    id: "gsc-filter-row",
                    label: "Drill into this row here",
                    icon: Filter,
                    description:
                      "Apply this row as a dashboard filter (same as clicking it)",
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
      {table}
    </NonEditableContextMenu>
  );
}
