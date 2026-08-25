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

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Columns2,
  Eye,
  Filter,
  Info,
  PanelTop,
  Rocket,
  SearchX,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { trackPage } from "@/features/marketing/search-console/data-launch";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  CellEditsMap,
  ColumnFilterValue,
} from "@/components/official/matrx-data-table/types";
import {
  setGscKeywordClass,
  type GscClassRuling,
} from "@/features/marketing/search-console/data-classification";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
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
  buildGscValueColumns,
  gscKeyCell,
  gscMetricCopyLines,
} from "@/features/marketing/search-console/lib/columns";
import { useGscBreakdown } from "@/features/marketing/search-console/hooks/useGscQuery";
import { getGscKeywordValueFor } from "@/features/marketing/search-console/data-insights";
import { getValueVocabulary } from "@/features/marketing/seo/value-system/data";
import { useRowWatch } from "@/features/marketing/search-console/hooks/useWatchState";
import { WatchButton } from "@/features/marketing/search-console/components/watch/WatchButton";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import {
  panelDrillFor,
  rowScopeDrillFor,
} from "@/features/marketing/search-console/lib/drills";
import { useOpenGscWhyScoreWindow } from "@/features/overlays/openers/gscWhyScoreWindow";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  keywordEntityRef,
  useKeywordAssignSurfaces,
  useKeywordMenuSection,
  type KeywordMenuRow,
} from "@/features/marketing/seo/keyword/keyword-actions";
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
  // MSR-03/04 — server-side sort added to `gsc_perf_breakdown`
  // (`seo_gsc_breakdown_value_sort_filter.sql`), query dimension only.
  "traffic_class",
  "value_score",
  "value_band",
]);

/** MSR-03/04 — this table's column-header filters, translated into the RPC's
 * `GscFilters` bag. Kept ONE place so the mapping can never drift from what
 * the server actually understands. */
function numberFilterRange(
  cf: ColumnFilterValue | undefined,
): { min?: number; max?: number } | null {
  if (!cf || cf.kind !== "number") return null;
  if (cf.min === undefined && cf.max === undefined) return null;
  return { min: cf.min, max: cf.max };
}

function selectFilterValues(cf: ColumnFilterValue | undefined): string[] {
  if (!cf || cf.kind !== "select") return [];
  if (cf.values && cf.values.length > 0) return cf.values;
  return cf.value ? [cf.value] : [];
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
  watch = false,
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
  /** Show the watch column + context item (query/page dimensions only). */
  watch?: boolean;
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
  // MSR-03/04 — the Key column's own header filter drives the SAME search
  // the toolbar box does (one truth, two entry points); when it's set it
  // wins, so a column-level filter always does something real.
  const keyColumnFilterText =
    query.columnFilters.key?.kind === "text"
      ? query.columnFilters.key.value
      : "";
  const debouncedSearch = useDebounce(
    keyColumnFilterText || query.search,
    300,
  );

  // MSR-03/04 — every other column-header filter, translated into the RPC's
  // filter bag and merged over the surface's own filters (FilterBar chips /
  // URL state). Class/Score/Level only exist on the query dimension.
  const columnDerivedFilters = useMemo<Partial<GscFilters>>(() => {
    const cf = query.columnFilters;
    const out: Partial<GscFilters> = {};
    const clicks = numberFilterRange(cf.clicks);
    if (clicks) {
      if (clicks.min !== undefined) out.clicks_min = String(clicks.min);
      if (clicks.max !== undefined) out.clicks_max = String(clicks.max);
    }
    const impressions = numberFilterRange(cf.impressions);
    if (impressions) {
      if (impressions.min !== undefined)
        out.impressions_min = String(impressions.min);
      if (impressions.max !== undefined)
        out.impressions_max = String(impressions.max);
    }
    const ctr = numberFilterRange(cf.ctr);
    if (ctr) {
      if (ctr.min !== undefined) out.ctr_min = String(ctr.min);
      if (ctr.max !== undefined) out.ctr_max = String(ctr.max);
    }
    const position = numberFilterRange(cf.position);
    if (position) {
      if (position.min !== undefined) out.position_min = String(position.min);
      if (position.max !== undefined) out.position_max = String(position.max);
    }
    if (dimension === "query") {
      const classValues = selectFilterValues(cf.traffic_class);
      if (classValues.length > 0)
        out.traffic_classes = classValues.join("|");
      const bandValues = selectFilterValues(cf.value_band);
      if (bandValues.length > 0) out.levels = bandValues.join("|");
      const score = numberFilterRange(cf.value_score);
      if (score) {
        if (score.min !== undefined) out.value_score_min = String(score.min);
        if (score.max !== undefined) out.value_score_max = String(score.max);
      }
    }
    return out;
  }, [query.columnFilters, dimension]);
  const effectiveFilters = useMemo<GscFilters>(
    () => ({ ...filters, ...columnDerivedFilters }),
    [filters, columnDerivedFilters],
  );

  const breakdown = useGscBreakdown(siteId, periods, effectiveFilters, {
    dimension,
    search: debouncedSearch,
    sort: sortId,
    sortDir: query.sort?.direction ?? "desc",
    page: query.page,
    pageSize: query.pageSize,
  });

  const rows = breakdown.data?.rows ?? [];
  const total = breakdown.data?.total ?? 0;

  // C6 — the spreadsheet columns: Class · Score · Level for the rows on screen.
  const rowKeywordIds = dimension === "query"
    ? rows.map((r) => r.keyword_id).filter((id): id is string => !!id).sort()
    : [];
  const keywordValues = useQuery({
    queryKey: ["marketing", "gsc", "keyword-value-for", siteId, rowKeywordIds],
    queryFn: ({ signal }) => getGscKeywordValueFor(siteId, rowKeywordIds, signal),
    enabled: dimension === "query" && rowKeywordIds.length > 0,
    staleTime: 60_000,
  });
  const valueFor = (row: GscBreakdownRow) =>
    row.keyword_id ? keywordValues.data?.get(row.keyword_id) : undefined;

  const queryClient = useQueryClient();

  /**
   * Save the inline Class edits — one RPC per ruling, batched by class so
   * twenty rows set to Money cost one call. The provenance is `manual` and
   * `confirmed`, because a human just typed it into the cell.
   */
  const saveClassEdits = async (
    edits: CellEditsMap,
    currentRows: GscBreakdownRow[],
  ) => {
    const rowsById = new Map(currentRows.map((row) => [row.key, row]));
    const byRuling = new Map<GscClassRuling, string[]>();
    for (const [rowId, fields] of Object.entries(edits)) {
      if (!Object.hasOwn(fields, "traffic_class")) continue;
      const row = rowsById.get(rowId);
      if (!row?.keyword_id) {
        throw new Error(
          "This search query is not mapped to the keyword library yet, so its class cannot be set here.",
        );
      }
      const next = fields.traffic_class;
      if (
        next !== "money" &&
        next !== "educational" &&
        next !== "brand" &&
        next !== "clear"
      ) {
        throw new Error("Choose a supported class and try again.");
      }
      byRuling.set(next, [...(byRuling.get(next) ?? []), row.keyword_id]);
    }
    for (const [ruling, keywordIds] of byRuling) {
      await setGscKeywordClass(siteId, keywordIds, ruling, null, {
        origin: "manual",
        confirmed: true,
      });
    }
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "gsc", "keyword-value-for", siteId],
    });
  };

  // Watch column wiring (query/page only; hook order stays stable).
  const watchKind = dimension === "page" ? "page" : "query";
  const rowWatch = useRowWatch(watchKind);
  const watchable =
    watch && (dimension === "query" || dimension === "page");

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
  /**
   * THE PANEL RULE (P25): every one of these opens a NEW floating panel and
   * leaves this table untouched — its filters, its sort and its scroll survive.
   * Panels are keyed on their slice by the opener, so the same drill twice
   * focuses the panel already open and two different rows float side by side.
   */
  const openPanelFor = (
    drill: { dimension: GscDimension; filters: Partial<GscFilters>; label: string },
  ) => {
    if (!panelRange) return;
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
  /** The clicked row, or a sentence saying what to right-click instead. */
  const clickedRow = (what: string): GscBreakdownRow | null => {
    const row = clickedRowRef.current;
    if (!row) {
      toast.error(`Right-click a data row to ${what}.`);
      return null;
    }
    return row;
  };
  const openRowDrillPanel = () => {
    const row = clickedRow("drill into it");
    if (!row) return;
    openPanelFor(panelDrillFor(dimension, row));
  };
  const openRowScopePanel = () => {
    const row = clickedRow("see its Search Console data");
    if (!row) return;
    openPanelFor(rowScopeDrillFor(dimension, row));
  };
  const openWhyScore = useOpenGscWhyScoreWindow();
  const openRowWhyScore = () => {
    const row = clickedRow("see why it scores what it does");
    if (!row) return;
    if (!row.keyword_id) {
      toast.error(
        "This row has no keyword record yet, so there is no score to explain.",
      );
      return;
    }
    openWhyScore({
      siteId,
      siteName,
      keywordId: row.keyword_id,
      keyword: row.key,
    });
  };

  const columns: MatrxColumnDef<GscBreakdownRow>[] = [
    ...(watchable
      ? [
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
                noun={labels.noun}
              />
            ),
          } satisfies MatrxColumnDef<GscBreakdownRow>,
        ]
      : []),
    // THE DOOR LAW: a page-dimension row names a canonical page the breakdown
    // already resolved (`page_id`) — so it gets a door to that page's
    // workspace. Query/country/device rows name no record we own.
    buildGscKeyColumn<GscBreakdownRow>(dimension, labels.column, (row) =>
      dimension === "page" && row.page_id
        ? marketingRoutes.sitePage(null, siteId, row.page_id)
        : null,
    ),
    ...(dimension === "query"
      ? buildGscValueColumns<GscBreakdownRow>(
          valueFor,
          {
            siteId,
            keywordOf: (row) => row.key,
          },
          { keywordIdOf: (row) => row.keyword_id ?? null },
        )
      : []),
    ...buildGscMetricColumns<GscBreakdownRow>(hasCompare, "clicks-only"),
  ];

  // The right-click vocabulary, in the reader's words. Each opens a panel;
  // none of them re-filters the table underneath.
  const PANEL_DRILL_LABELS: Record<GscDimension, string> = {
    query: "See pages for this keyword",
    page: "See queries for this page",
    country: "See devices in this country",
    device: "See countries on this device",
    search_appearance: "See this appearance type",
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
          {...(dimension === "query"
            ? { edit: { enabled: true, onSave: saveClassEdits } }
            : {})}
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
                "Opens a floating panel beside this table — your filters, sort and scroll stay exactly as they are",
              onSelect: openRowDrillPanel,
            },
            {
              kind: "item",
              id: "gsc-row-scope-panel",
              label: "See this row's Search Console data",
              icon: BarChart3,
              description:
                "Clicks, impressions and the trend chart for this one row, in its own panel",
              onSelect: openRowScopePanel,
            },
            ...(dimension === "query"
              ? [
                  {
                    kind: "item" as const,
                    id: "gsc-why-score",
                    label: "Why this score",
                    icon: Info,
                    description:
                      "The receipt behind this keyword's level — every step links to where you change it",
                    onSelect: openRowWhyScore,
                  },
                ]
              : []),
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
            ...(dimension === "page"
              ? [
                  {
                    kind: "item" as const,
                    id: "gsc-track-launch",
                    label: "Track as new page",
                    icon: Rocket,
                    description:
                      "Add to the New Pages launch tracker (first-impression watch)",
                    onSelect: () => {
                      const row = clickedRowRef.current;
                      if (!row) {
                        toast.error("Right-click a data row to track it.");
                        return;
                      }
                      if (!row.page_id) {
                        toast.error(
                          "This page has no canonical page record yet — add it from the New Pages tab instead.",
                        );
                        return;
                      }
                      void trackPage(row.page_id, { indexingRequested: false })
                        .then(() => {
                          toast.success(
                            "Tracked — it's on the New Pages tab now.",
                          );
                          void queryClient.invalidateQueries({
                            queryKey: ["marketing", "gsc", "launch-pages"],
                          });
                        })
                        .catch((error: unknown) => {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not track the page.",
                          );
                        });
                    },
                  },
                ]
              : []),
            ...(watchable
              ? [
                  {
                    kind: "item" as const,
                    id: "gsc-watch-row",
                    label: `Watch / unwatch this ${labels.noun}`,
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
