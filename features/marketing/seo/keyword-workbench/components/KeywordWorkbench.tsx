"use client";

/**
 * THE KEYWORD WORKBENCH (C14).
 *
 * One page where a subject-matter expert finds exactly the keywords they mean
 * and tells the system what those keywords ARE — with the reason, in their own
 * words, at the moment they decide.
 *
 * The four laws it exists to satisfy, all from Arman 2026-08-23:
 *  • P23 — every picker takes new input. The value picker adds what you type.
 *  • P24 — the WHY is captured at the moment of assignment, and stored on the
 *    stamp, because it is the training material an AI learns the pattern from.
 *  • P25 — never lose the view. Drilling opens a floating panel beside the
 *    table you built; it never replaces it.
 *  • P26 — the table is the user's. Any dimension can be a column; every
 *    column sorts and filters; the arrangement saves as a named tab; and a
 *    novel never lives in a cell — the why is an (i) and a right-click that
 *    links to where the rule can be edited.
 *
 * And one negative requirement that shapes the layout more than any of them:
 * "the current page is far too busy at the top with things that add no value…
 * I don't like pages where there are novels written." The top is ONE line of
 * context plus the controls. Everything else is table.
 */

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  Info,
  Loader2,
  PanelTop,
  SearchX,
  Tag,
} from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import FloatingSheet from "@/components/official/FloatingSheet";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { FilterBar } from "@/features/marketing/search-console/components/FilterBar";
import { useGscBreakdown, useGscFreshness } from "@/features/marketing/search-console/hooks/useGscQuery";
import { getGscKeywordValueFor } from "@/features/marketing/search-console/data-insights";
import {
  buildGscMetricColumns,
  gscMetricCopyLines,
} from "@/features/marketing/search-console/lib/columns";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import { panelDrillFor } from "@/features/marketing/search-console/lib/drills";
import {
  allowedFilterKeysForTab,
  resolveGscDataThrough,
  resolvePeriods,
} from "@/features/marketing/search-console/lib/url-state";
import type {
  GscBreakdownRow,
  GscFilters,
  GscSortKey,
} from "@/features/marketing/search-console/types";
import {
  GSC_RANGE_PRESETS,
  encodeStampFilter,
  formatCount,
  parseStampFilter,
} from "@/features/marketing/search-console/types";
import { getFacetDimensionCatalog } from "@/features/marketing/seo/value-system/dimensions/data";
import { humanizeSlug } from "@/features/marketing/seo/value-system/lib";
import {
  deleteSavedView,
  getKeywordStamps,
  getMatchingKeywordIds,
  listSavedViews,
  saveView,
  setKeywordStamps,
  type SavedView,
} from "@/features/marketing/seo/keyword-workbench/data";
import {
  parseWorkbenchState,
  stateFromViewState,
  viewStateFor,
  viewStateMatches,
  workbenchSearchParams,
  type WorkbenchState,
} from "@/features/marketing/seo/keyword-workbench/state";
import { AssignPanel, type AssignTarget } from "./AssignPanel";
import { ClassCell, RangePicker, StampCell } from "./cells";
import { ColumnChooser } from "./ColumnChooser";
import type { PickedValue } from "./DimensionValuePicker";
import { SavedViewTabs } from "./SavedViewTabs";
import { WhyBody, WhyPopover } from "./WhyPopover";

/** Server-sortable ids. Anything else sorts the rows on screen — and says so. */
const SERVER_SORTABLE = new Set(["key", "clicks", "impressions", "ctr", "position"]);

export function KeywordWorkbench() {
  const { site, brandId, sitePath } = useMarketingSite();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const openDrilldown = useOpenGscDrilldownWindow();

  const state = parseWorkbenchState(params);
  const push = (next: WorkbenchState) => {
    router.replace(`${sitePath}/keywords?${workbenchSearchParams(next).toString()}`, {
      scroll: false,
    });
  };
  const patch = (partial: Partial<WorkbenchState>) =>
    push({ ...state, page: 1, ...partial });

  /* ---------------------------------------------------------------- periods */
  const freshness = useGscFreshness(site.id);
  const dataThrough = resolveGscDataThrough(freshness.data, ["query", "query_page"]);
  const periods = resolvePeriods(state, new Date(), dataThrough);

  /* ------------------------------------------------------------------- data */
  const breakdown = useGscBreakdown(site.id, periods, state.filters, {
    dimension: "query",
    search: state.search,
    sort: SERVER_SORTABLE.has(state.sort) ? (state.sort as GscSortKey) : "clicks",
    sortDir: state.sortDir,
    page: state.page,
    pageSize: state.pageSize,
  });
  const rows = breakdown.data?.rows ?? [];
  const total = breakdown.data?.total ?? 0;
  const keywordIds = rows
    .map((r) => r.keyword_id)
    .filter((id): id is string => !!id);

  const catalog = useQuery({
    queryKey: ["marketing", "seo", "dimension-catalog", site.id],
    queryFn: ({ signal }) => getFacetDimensionCatalog(site.id, signal),
    staleTime: 5 * 60_000,
  });
  const dimensions = catalog.data ?? [];
  const classDimension = dimensions.find((d) => d.slug === "traffic_class");

  const values = useQuery({
    queryKey: ["marketing", "gsc", "keyword-value-for", site.id, keywordIds],
    queryFn: ({ signal }) => getGscKeywordValueFor(site.id, keywordIds, signal),
    enabled: keywordIds.length > 0,
    staleTime: 60_000,
  });

  const stamps = useQuery({
    queryKey: [
      "marketing",
      "seo",
      "keyword-stamps",
      site.id,
      keywordIds,
      state.dimensions,
    ],
    queryFn: ({ signal }) =>
      getKeywordStamps(site.id, keywordIds, state.dimensions, signal),
    enabled: keywordIds.length > 0 && state.dimensions.length > 0,
    staleTime: 60_000,
  });

  const views = useQuery({
    queryKey: ["marketing", "seo", "keyword-views", site.id],
    queryFn: ({ signal }) => listSavedViews(site.id, signal),
    staleTime: 60_000,
  });
  const activeView =
    (views.data ?? []).find((v) => v.id === state.viewId) ?? null;

  /* -------------------------------------------------------------- selection */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /**
   * A selection belongs to the result set it was made in. Changing the
   * filters, the window, or the saved view produces a DIFFERENT set of rows,
   * and carrying "7 keywords selected" across that boundary invites a bulk
   * assignment onto keywords the person can no longer see — the exact mistake
   * a bulk tool must never make. Reset-on-scope-change, the render-time way.
   */
  const selectionScope = `${JSON.stringify(state.filters)}|${state.search}|${state.range}|${state.customFrom}|${state.customTo}|${state.viewId}`;
  const [scopeAtSelection, setScopeAtSelection] = useState(selectionScope);
  if (scopeAtSelection !== selectionScope) {
    setScopeAtSelection(selectionScope);
    if (selectedIds.length > 0) setSelectedIds([]);
  }
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [lastUsed, setLastUsed] = useState<PickedValue | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);
  const [viewsBusy, setViewsBusy] = useState(false);
  const [renaming, setRenaming] = useState<SavedView | null>(null);
  /** The row whose receipt the right-click menu asked to see in full. */
  const [whyRow, setWhyRow] = useState<GscBreakdownRow | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const clickedRow = useRef<GscBreakdownRow | null>(null);

  const rowById = new Map(rows.map((r) => [r.key, r]));
  const selectedKeywordIds = selectedIds
    .map((key) => rowById.get(key)?.keyword_id)
    .filter((id): id is string => !!id);

  const refreshMeaning = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "keyword-stamps", site.id],
    });
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "gsc", "keyword-value-for", site.id],
    });
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "dimension-catalog", site.id],
    });
  };

  /** Quick-assign: one click, the value you last used, no dialog (P23 story). */
  const quickAssign = async (targetIds: string[], picked: PickedValue) => {
    try {
      const result = await setKeywordStamps({
        siteId: site.id,
        keywordIds: targetIds,
        valueId: picked.valueId,
      });
      await refreshMeaning();
      toast.success(
        `${picked.dimensionLabel}: ${picked.valueLabel} — ${result.written.toLocaleString()} keyword${result.written === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that.",
      );
    }
  };

  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const match = await getMatchingKeywordIds(
        site.id,
        periods,
        state.filters,
        state.search,
      );
      if (match.keywordIds.length === 0) {
        toast.info("Nothing matches these filters yet.");
        return;
      }
      setAssignTarget({
        keywordIds: match.keywordIds,
        label: `${match.keywordIds.length.toLocaleString()} keywords`,
        fromFilters: true,
        capped: match.capped,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not work out everything your filters match.",
      );
    } finally {
      setSelectingAll(false);
    }
  };

  /* ------------------------------------------------------------ saved views */
  const openView = (view: SavedView | null) => {
    if (!view) {
      push({ ...parseWorkbenchState(new URLSearchParams()), viewId: null });
      return;
    }
    push({ ...stateFromViewState(view.state, state), viewId: view.id });
  };
  const runViewWrite = async (fn: () => Promise<unknown>, done: string) => {
    setViewsBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "seo", "keyword-views", site.id],
      });
      toast.success(done);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that view.",
      );
    } finally {
      setViewsBusy(false);
    }
  };

  /* ---------------------------------------------------------------- columns */
  const stampFor = (row: GscBreakdownRow, slug: string) =>
    row.keyword_id ? stamps.data?.get(row.keyword_id)?.get(slug) : undefined;
  const valueFor = (row: GscBreakdownRow) =>
    row.keyword_id ? values.data?.get(row.keyword_id) : undefined;

  const stampPairs = parseStampFilter(state.filters.stamps);
  const filterByStamp = (dimensionSlug: string, valueKey: string) => {
    const pair = { dimension: dimensionSlug, value: valueKey };
    const exists = stampPairs.some(
      (p) => p.dimension === pair.dimension && p.value === pair.value,
    );
    const next = exists
      ? stampPairs.filter(
          (p) => !(p.dimension === pair.dimension && p.value === pair.value),
        )
      : [...stampPairs, pair];
    const filters: GscFilters = { ...state.filters };
    if (next.length === 0) delete filters.stamps;
    else filters.stamps = encodeStampFilter(next);
    patch({ filters });
  };

  const dimensionColumns: MatrxColumnDef<GscBreakdownRow>[] = state.dimensions.map(
    (slug) => {
      const dimension = dimensions.find((d) => d.slug === slug);
      const label = dimension?.label ?? humanizeSlug(slug);
      return {
        id: `dim:${slug}`,
        header: label,
        sortable: true,
        filter: "select",
        filterOptions: (dimension?.values ?? [])
          .filter((v) => !v.abstain)
          .map((v) => ({ value: v.key, label: v.label })),
        filterSingle: true,
        width: 150,
        accessorFn: (row) => stampFor(row, slug)?.valueLabel ?? "",
        cell: (row) => {
          const stamp = stampFor(row, slug);
          if (!row.keyword_id) {
            return <span className="text-[11px] text-muted-foreground">—</span>;
          }
          return (
            <StampCell
              label={stamp?.valueLabel ?? null}
              source={stamp?.source ?? null}
              notes={stamp?.notes ?? null}
              onAssign={() =>
                setAssignTarget({
                  keywordIds: [row.keyword_id as string],
                  label: `“${row.key}”`,
                  lockedDimensionSlug: slug,
                  initial:
                    stamp && dimension
                      ? {
                          dimensionId: dimension.dimension_id,
                          dimensionSlug: dimension.slug,
                          dimensionLabel: dimension.label,
                          valueId: stamp.valueId,
                          valueLabel: stamp.valueLabel,
                        }
                      : null,
                })
              }
              onFilter={
                stamp ? () => filterByStamp(slug, stamp.value) : undefined
              }
            />
          );
        },
      };
    },
  );

  const columns: MatrxColumnDef<GscBreakdownRow>[] = [
    {
      id: "key",
      header: "Keyword",
      sortable: true,
      filter: "text",
      accessorKey: "key",
      // NEVER truncated — Arman found keywords cut off on the bench they
      // replaced, and a keyword you cannot read is a row you cannot judge.
      cell: (row) => (
        <span className="block break-words text-xs text-foreground">
          {row.key}
        </span>
      ),
    },
    {
      id: "traffic_class",
      header: "Class",
      sortable: true,
      filter: "select",
      filterSingle: true,
      filterOptions: (classDimension?.values ?? [])
        .filter((v) => !v.abstain)
        .map((v) => ({ value: v.key, label: v.label })),
      width: 140,
      accessorFn: (row) => valueFor(row)?.traffic_class ?? "",
      cell: (row) => (
        <ClassCell
          current={valueFor(row)?.traffic_class ?? null}
          source={valueFor(row)?.class_source ?? null}
          options={(classDimension?.values ?? []).filter((v) => !v.abstain)}
          disabled={!row.keyword_id}
          onPick={(value) => {
            if (!row.keyword_id || !classDimension) return;
            const picked: PickedValue = {
              dimensionId: classDimension.dimension_id,
              dimensionSlug: classDimension.slug,
              dimensionLabel: classDimension.label,
              valueId: value.value_id,
              valueLabel: value.label,
            };
            setLastUsed(picked);
            void quickAssign([row.keyword_id], picked);
          }}
          onAssignWithReason={() => {
            if (!row.keyword_id) return;
            setAssignTarget({
              keywordIds: [row.keyword_id],
              label: `“${row.key}”`,
              lockedDimensionSlug: "traffic_class",
            });
          }}
        />
      ),
    },
    ...dimensionColumns,
    ...buildGscMetricColumns<GscBreakdownRow>(
      periods.compare !== null,
      "clicks-only",
    ).filter((column) => {
      // CTR and Position are opt-in: clicks and impressions are what a person
      // scans, and two more numeric columns push the meaning columns off a
      // laptop screen.
      if (column.id === "ctr") return state.optional.includes("ctr");
      if (column.id === "position") return state.optional.includes("position");
      return true;
    }),
    {
      id: "value_score",
      header: "Score",
      sortable: true,
      filter: false,
      align: "right",
      width: 76,
      accessorFn: (row) => valueFor(row)?.value_score ?? null,
      cell: (row) => {
        const value = valueFor(row);
        return (
          <span className="text-xs tabular-nums text-foreground">
            {value?.value_score == null
              ? "—"
              : Math.round(Number(value.value_score)).toLocaleString()}
          </span>
        );
      },
    },
    {
      id: "value_band",
      header: "Level",
      sortable: true,
      filter: false,
      width: 130,
      accessorFn: (row) => valueFor(row)?.value_band ?? "",
      cell: (row) => {
        const value = valueFor(row);
        if (!value) return <span className="text-[11px] text-muted-foreground">—</span>;
        return (
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium",
                value.value_band === "negative"
                  ? "text-destructive"
                  : value.value_band === "unvalued"
                    ? "text-muted-foreground"
                    : "text-foreground",
              )}
            >
              {value.value_band ? humanizeSlug(value.value_band) : "—"}
            </span>
            <WhyPopover
              reasons={value.reasons}
              source={
                value.value_source === "override"
                  ? "override"
                  : value.value_source === "computed"
                    ? "computed"
                    : "unvalued"
              }
              brandId={brandId}
              siteId={site.id}
            />
          </span>
        );
      },
    },
  ];

  /* ------------------------------------------------------------- table state */
  const tableQuery: MatrxDataTableQueryState = {
    page: state.page,
    pageSize: state.pageSize,
    search: state.search,
    anyOf: "",
    columnFilters: {},
    sort: { id: state.sort, direction: state.sortDir },
  };

  /**
   * A dimension column has no server sort (the RPC sorts search metrics), so
   * it sorts what is on screen and the header says exactly that. Sorting
   * 20,000 rows by a stamp the browser never fetched is the kind of quiet lie
   * this system exists to stop.
   */
  const displayRows = SERVER_SORTABLE.has(state.sort)
    ? rows
    : [...rows].sort((a, b) => {
        const read = (row: GscBreakdownRow) =>
          state.sort.startsWith("dim:")
            ? (stampFor(row, state.sort.slice(4))?.valueLabel ?? "")
            : state.sort === "traffic_class"
              ? (valueFor(row)?.traffic_class ?? "")
              : state.sort === "value_band"
                ? (valueFor(row)?.value_band ?? "")
                : String(valueFor(row)?.value_score ?? "");
        const av = read(a);
        const bv = read(b);
        const cmp =
          state.sort === "value_score"
            ? Number(av || 0) - Number(bv || 0)
            : av.localeCompare(bv);
        return state.sortDir === "asc" ? cmp : -cmp;
      });

  const onQueryStateChange = (next: MatrxDataTableQueryState) => {
    const sortId = next.sort?.id ?? "clicks";
    // Column filters on a dimension are REAL filters — they become the
    // server-side `stamps` filter rather than sieving the page in the browser.
    const columnFilterEntries = Object.entries(next.columnFilters ?? {});
    for (const [id, raw] of columnFilterEntries) {
      if (!id.startsWith("dim:") && id !== "traffic_class") continue;
      const slug = id.startsWith("dim:") ? id.slice(4) : "traffic_class";
      const picked = Array.isArray(raw) ? raw[0] : raw;
      if (typeof picked === "string" && picked !== "") {
        filterByStamp(slug, picked);
        return;
      }
    }
    push({
      ...state,
      page: next.page,
      pageSize: next.pageSize,
      search: next.search ?? "",
      sort: sortId,
      sortDir: next.sort?.direction ?? "desc",
    });
  };

  /* ---------------------------------------------------------- context menu */
  const resolveRowContext = (target: HTMLElement | null) => {
    const key = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
    const row = key ? (rows.find((r) => r.key === key) ?? null) : null;
    clickedRow.current = row;
    if (!row) return null;
    return { content: humanLines(gscMetricCopyLines("Keyword", "query", row)) };
  };
  const openPagesPanel = () => {
    const row = clickedRow.current;
    if (!row) {
      toast.error("Right-click a keyword row to open its pages.");
      return;
    }
    const drill = panelDrillFor("query", row);
    openDrilldown({
      siteId: site.id,
      siteName: site.domain,
      dimension: drill.dimension,
      filters: { ...state.filters, ...drill.filters },
      range: state.range,
      customFrom: state.customFrom,
      customTo: state.customTo,
      compare: state.compare,
      title: drill.label,
    });
  };

  const rangeLabel =
    state.range === "custom" && state.customFrom && state.customTo
      ? `${state.customFrom} → ${state.customTo}`
      : (GSC_RANGE_PRESETS.find((r) => r.key === state.range)?.label ??
        "Last 28 days");

  /* ------------------------------------------------------------------ render */
  const table = (
    <MatrxDataTable<GscBreakdownRow>
      data={displayRows}
      columns={columns}
      getRowId={(row) => row.key}
      isLoading={breakdown.isLoading}
      isFetching={breakdown.isFetching || values.isFetching || stamps.isFetching}
      query={{
        mode: "controlled",
        totalItems: total,
        state: tableQuery,
        onStateChange: onQueryStateChange,
      }}
      selection={{
        selectedIds,
        onSelectedIdsChange: setSelectedIds,
        noun: "keyword",
        isRowSelectable: (row) => !!row.keyword_id,
        actions: (_selected, ids) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={selectedKeywordIds.length === 0}
              onClick={() =>
                setAssignTarget({
                  keywordIds: selectedKeywordIds,
                  label: `${selectedKeywordIds.length.toLocaleString()} keyword${selectedKeywordIds.length === 1 ? "" : "s"}`,
                })
              }
            >
              <Tag className="h-3.5 w-3.5" />
              Assign…
            </Button>
            {lastUsed ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={selectedKeywordIds.length === 0}
                onClick={() => void quickAssign(selectedKeywordIds, lastUsed)}
              >
                {lastUsed.valueLabel}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setSelectedIds([])}
            >
              Clear {ids.length}
            </Button>
          </div>
        ),
      }}
      toolbar={{
        searchPlaceholder: "Search keywords…",
        leading:
          total > rows.length ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 whitespace-nowrap text-xs"
              onClick={() => void selectAllMatching()}
              disabled={selectingAll}
            >
              {selectingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Tag className="h-3.5 w-3.5" />
              )}
              Assign all {formatCount(total)} matching
            </Button>
          ) : undefined,
      }}
      copy={{
        label: "Keyword",
        listLabel: "Keyword workbench",
        location: webLocation("Marketing — Keyword workbench"),
        rowKind: "web-keyword-workbench-row",
        listKind: "web-keyword-workbench-table",
        rowDescription:
          "One keyword's search performance, class, score, level and stamped dimensions for this site.",
        listDescription:
          "The visible keyword workbench rows (respecting search, filters, sort and pagination).",
        humanRow: (row) => humanLines(gscMetricCopyLines("Keyword", "query", row)),
        rowAttributes: (row) => ({
          ...gscScopeAttributes(site.id, site.domain, periods, state.filters),
          key: row.key,
          keyword_id: row.keyword_id ?? "",
        }),
        listAttributes: (visible) => ({
          ...gscScopeAttributes(site.id, site.domain, periods, state.filters),
          visible_rows: visible.length,
          total_rows: total,
          dimension_columns: state.dimensions.join(","),
        }),
      }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      pageSize={state.pageSize}
      emptyState={{
        icon: <SearchX className="h-8 w-8 text-muted-foreground" />,
        title: "No keywords match",
        description:
          "Nothing in this window carries every filter you set. Widen the date range, drop a filter chip, or clear the search.",
      }}
      className="flex-1"
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 bg-textured p-3">
      {/* THE THIN TOP — one line of context, then controls. Nothing else. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SavedViewTabs
          views={views.data ?? []}
          loading={views.isLoading}
          activeId={state.viewId}
          dirty={!!activeView && !viewStateMatches(state, activeView.state)}
          busy={viewsBusy}
          onOpen={openView}
          onSaveNew={() => setSavingNew(true)}
          onUpdate={(view) =>
            void runViewWrite(
              () =>
                saveView({
                  siteId: site.id,
                  id: view.id,
                  name: view.name,
                  state: viewStateFor(state),
                  shared: view.shared,
                }),
              `“${view.name}” now opens on this arrangement.`,
            )
          }
          onRename={(view) => setRenaming(view)}
          onToggleShared={(view) =>
            void runViewWrite(
              () =>
                saveView({
                  siteId: site.id,
                  id: view.id,
                  name: view.name,
                  state: view.state as Record<string, string>,
                  shared: !view.shared,
                }),
              view.shared
                ? `“${view.name}” is yours again.`
                : `“${view.name}” is shared with your team.`,
            )
          }
          onMove={(view, direction) => {
            const ordered = [...(views.data ?? [])];
            const index = ordered.findIndex((v) => v.id === view.id);
            const swap = ordered[index + direction];
            if (!swap) return;
            void runViewWrite(
              () =>
                Promise.all([
                  saveView({
                    siteId: site.id,
                    id: view.id,
                    name: view.name,
                    state: view.state as Record<string, string>,
                    shared: view.shared,
                    position: swap.position ?? index + direction + 1,
                  }),
                  saveView({
                    siteId: site.id,
                    id: swap.id,
                    name: swap.name,
                    state: swap.state as Record<string, string>,
                    shared: swap.shared,
                    position: view.position ?? index + 1,
                  }),
                ]),
              "Reordered.",
            );
          }}
          onDelete={(view) => {
            void (async () => {
              const ok = await confirm({
                title: `Delete “${view.name}”?`,
                description:
                  "The view goes away. The keywords, stamps and reasons behind it are untouched.",
                confirmLabel: "Delete view",
                variant: "destructive",
              });
              if (!ok) return;
              await runViewWrite(
                () => deleteSavedView(site.id, view.id),
                `“${view.name}” deleted.`,
              );
              if (state.viewId === view.id) openView(null);
            })();
          }}
        />
        <div className="flex items-center gap-1.5">
          <RangePicker
            value={state.range}
            label={rangeLabel}
            onChange={(range) => patch({ range })}
          />
          <ColumnChooser
            dimensions={dimensions}
            loading={catalog.isLoading}
            selected={state.dimensions}
            onSelectedChange={(next) => patch({ dimensions: next })}
            optional={state.optional}
            onOptionalChange={(next) => patch({ optional: next })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterBar
          filters={state.filters}
          onChange={(filters) => patch({ filters })}
          allowedKeys={allowedFilterKeysForTab("queries")}
          siteId={site.id}
        />
        <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
          {formatCount(total)} keywords · {rangeLabel}
          {dataThrough ? ` · through ${dataThrough}` : ""}
        </span>
      </div>

      {assignTarget ? (
        <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <AssignPanel
            siteId={site.id}
            dimensions={dimensions}
            dimensionsLoading={catalog.isLoading}
            target={assignTarget}
            onCancel={() => setAssignTarget(null)}
            onDone={(result, picked) => {
              setLastUsed(picked);
              setAssignTarget(null);
              toast.success(
                result.cleared > 0
                  ? `Removed ${picked.valueLabel} from ${result.cleared.toLocaleString()} keyword${result.cleared === 1 ? "" : "s"}.`
                  : `${picked.dimensionLabel}: ${picked.valueLabel} on ${result.written.toLocaleString()} keyword${result.written === 1 ? "" : "s"}${result.notesSaved ? " — your reason is saved with them." : "."}`,
              );
              if (
                result.written > 0 &&
                !state.dimensions.includes(picked.dimensionSlug)
              ) {
                // You just gave these keywords a meaning; you should be able
                // to SEE it without hunting for the column chooser.
                patch({ dimensions: [...state.dimensions, picked.dimensionSlug] });
              }
            }}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {breakdown.isError ? (
          <div className="flex h-full items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-4">
            <p className="max-w-lg text-center text-xs text-destructive">
              {breakdown.error instanceof Error
                ? breakdown.error.message
                : String(breakdown.error)}
            </p>
          </div>
        ) : (
          <NonEditableContextMenu
            sourceFeature="marketing"
            contextData={{ content: "" }}
            resolveContextOnOpen={resolveRowContext}
            extraSections={[
              {
                id: "keyword-workbench",
                label: "This keyword",
                anchor: "after-compare",
                items: [
                  ...(lastUsed
                    ? [
                        {
                          kind: "item" as const,
                          id: "kw-quick-assign",
                          label: `${lastUsed.dimensionLabel}: ${lastUsed.valueLabel}`,
                          icon: Tag,
                          description: "Assign the value you used last — one click, no dialog",
                          onSelect: () => {
                            const row = clickedRow.current;
                            if (!row?.keyword_id) {
                              toast.error("Right-click a keyword row to assign it.");
                              return;
                            }
                            void quickAssign([row.keyword_id], lastUsed);
                          },
                        },
                      ]
                    : []),
                  {
                    kind: "item" as const,
                    id: "kw-assign",
                    label: "Assign…",
                    icon: BrainCircuit,
                    description:
                      "Pick a dimension and value — or type a new one — and say why",
                    onSelect: () => {
                      const row = clickedRow.current;
                      if (!row?.keyword_id) {
                        toast.error("Right-click a keyword row to assign it.");
                        return;
                      }
                      setAssignTarget({
                        keywordIds: [row.keyword_id],
                        label: `“${row.key}”`,
                      });
                    },
                  },
                  {
                    kind: "item" as const,
                    id: "kw-why",
                    label: "Why this score",
                    icon: Info,
                    description:
                      "The full receipt, with a door to every rule behind it",
                    onSelect: () => {
                      const row = clickedRow.current;
                      const value = row ? valueFor(row) : undefined;
                      if (!value) {
                        toast.error("No score has been worked out for that row yet.");
                        return;
                      }
                      setWhyRow(row);
                    },
                  },
                  {
                    kind: "item" as const,
                    id: "kw-pages",
                    label: "See pages for this keyword",
                    icon: PanelTop,
                    description:
                      "Opens beside this table in a floating panel — you never lose the view",
                    onSelect: openPagesPanel,
                  },
                ],
              },
            ]}
          >
            {table}
          </NonEditableContextMenu>
        )}
      </div>

      {whyRow ? (
        <FloatingSheet
          isOpen
          onClose={() => setWhyRow(null)}
          title="Why this score"
          description={whyRow.key}
          position="right"
          width="md"
        >
          <div className="p-4">
            {(() => {
              const value = valueFor(whyRow);
              if (!value) {
                return (
                  <p className="text-xs text-muted-foreground">
                    No score has been worked out for this keyword yet.
                  </p>
                );
              }
              return (
                <WhyBody
                  reasons={value.reasons}
                  source={
                    value.value_source === "override"
                      ? "override"
                      : value.value_source === "computed"
                        ? "computed"
                        : "unvalued"
                  }
                  brandId={brandId}
                  siteId={site.id}
                />
              );
            })()}
          </div>
        </FloatingSheet>
      ) : null}

      {savingNew ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setSavingNew(false);
          }}
          title="Name this view"
          description="Filters, columns and sort are saved. It becomes a tab you and your team can come back to."
          placeholder="e.g. Local buyers with no page yet"
          confirmLabel="Save view"
          onConfirm={async (name) => {
            setSavingNew(false);
            await runViewWrite(async () => {
              const created = await saveView({
                siteId: site.id,
                name,
                state: viewStateFor(state),
              });
              push({ ...state, viewId: created.id });
            }, `“${name}” saved.`);
          }}
        />
      ) : null}

      {renaming ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          title="Rename view"
          defaultValue={renaming.name}
          confirmLabel="Rename"
          onConfirm={async (name) => {
            const view = renaming;
            setRenaming(null);
            if (!view) return;
            await runViewWrite(
              () =>
                saveView({
                  siteId: site.id,
                  id: view.id,
                  name,
                  state: view.state as Record<string, string>,
                  shared: view.shared,
                }),
              `Renamed to “${name}”.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
