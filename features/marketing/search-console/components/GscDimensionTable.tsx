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
import {
  countryLabel,
  deviceLabel,
  formatCount,
  formatCtr,
  formatPosition,
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

function keyCell(dimension: GscDimension, row: GscBreakdownRow): string {
  if (dimension === "country") return countryLabel(row.key);
  if (dimension === "device") return deviceLabel(row.key);
  return row.key;
}

function deltaCell(
  cur: number | null | undefined,
  prev: number | null | undefined,
  format: (v: number) => string,
  lowerIsBetter = false,
): { text: string; tone: "up" | "down" | "flat" } | null {
  if (cur === null || cur === undefined || prev === null || prev === undefined)
    return null;
  const delta = cur - prev;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return {
    text: `${delta > 0 ? "+" : ""}${format(delta)}`,
    tone: delta === 0 ? "flat" : improved ? "up" : "down",
  };
}

function DeltaSpan({
  value,
}: {
  value: { text: string; tone: "up" | "down" | "flat" } | null;
}) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={
        value.tone === "flat"
          ? "text-xs tabular-nums text-muted-foreground"
          : value.tone === "up"
            ? "text-xs font-medium tabular-nums text-success"
            : "text-xs font-medium tabular-nums text-destructive"
      }
    >
      {value.text}
    </span>
  );
}

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
      content: humanLines([
        [labels.column, keyCell(dimension, row)],
        ["Clicks", formatCount(row.clicks)],
        ["Impressions", formatCount(row.impressions)],
        ["CTR", formatCtr(row.ctr)],
        ["Position", formatPosition(row.avg_position)],
      ]),
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
    {
      id: "key",
      accessorKey: "key",
      header: labels.column,
      filter: false,
      cell: (row) => (
        <span
          className="block max-w-[28rem] truncate text-xs font-medium text-foreground sm:max-w-[36rem]"
          title={row.key}
        >
          {keyCell(dimension, row)}
        </span>
      ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs font-semibold tabular-nums">
          {formatCount(row.clicks)}
        </span>
      ),
    },
    ...(hasCompare
      ? [
          {
            id: "delta_clicks",
            header: "Δ Clicks",
            align: "right",
            filter: false,
            accessorFn: (row) => row.clicks - (row.cmp_clicks ?? 0),
            cell: (row) => (
              <DeltaSpan
                value={deltaCell(row.clicks, row.cmp_clicks, (v) =>
                  Math.round(v).toLocaleString(),
                )}
              />
            ),
          } satisfies MatrxColumnDef<GscBreakdownRow>,
        ]
      : []),
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatCount(row.impressions)}
        </span>
      ),
    },
    ...(hasCompare
      ? [
          {
            id: "delta_impressions",
            header: "Δ Impr.",
            align: "right",
            sortable: false,
            filter: false,
            accessorFn: (row) => row.impressions - (row.cmp_impressions ?? 0),
            cell: (row) => (
              <DeltaSpan
                value={deltaCell(row.impressions, row.cmp_impressions, (v) =>
                  Math.round(v).toLocaleString(),
                )}
              />
            ),
          } satisfies MatrxColumnDef<GscBreakdownRow>,
        ]
      : []),
    {
      id: "ctr",
      accessorKey: "ctr",
      header: "CTR",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">{formatCtr(row.ctr)}</span>
      ),
    },
    ...(hasCompare
      ? [
          {
            id: "delta_ctr",
            header: "Δ CTR",
            align: "right",
            sortable: false,
            filter: false,
            accessorFn: (row) =>
              row.ctr !== null && row.cmp_ctr !== null
                ? row.ctr - row.cmp_ctr
                : null,
            cell: (row) => (
              <DeltaSpan
                value={deltaCell(
                  row.ctr,
                  row.cmp_ctr,
                  (v) => `${(v * 100).toFixed(2)}pp`,
                )}
              />
            ),
          } satisfies MatrxColumnDef<GscBreakdownRow>,
        ]
      : []),
    {
      id: "position",
      accessorKey: "avg_position",
      header: "Position",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatPosition(row.avg_position)}
        </span>
      ),
    },
    ...(hasCompare
      ? [
          {
            id: "delta_position",
            header: "Δ Pos.",
            align: "right",
            sortable: false,
            filter: false,
            accessorFn: (row) =>
              row.avg_position !== null && row.cmp_avg_position !== null
                ? row.avg_position - row.cmp_avg_position
                : null,
            cell: (row) => (
              <DeltaSpan
                value={deltaCell(
                  row.avg_position,
                  row.cmp_avg_position,
                  (v) => v.toFixed(1),
                  true,
                )}
              />
            ),
          } satisfies MatrxColumnDef<GscBreakdownRow>,
        ]
      : []),
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
              humanLines([
                [labels.column, keyCell(dimension, row)],
                ["Clicks", formatCount(row.clicks)],
                ["Impressions", formatCount(row.impressions)],
                ["CTR", formatCtr(row.ctr)],
                ["Position", formatPosition(row.avg_position)],
                [
                  "Prev clicks",
                  row.cmp_clicks != null ? formatCount(row.cmp_clicks) : null,
                ],
                [
                  "Prev position",
                  row.cmp_avg_position != null
                    ? formatPosition(row.cmp_avg_position)
                    : null,
                ],
              ]),
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
