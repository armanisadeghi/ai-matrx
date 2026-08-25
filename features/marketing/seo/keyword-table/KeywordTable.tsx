"use client";

/**
 * THE KEYWORD TABLE — the canonical keyword list. One component, every surface.
 *
 * Arman, 2026-08-24, on finding a 5,823-row keyword list with no sort, no
 * filters and no dimensions: "whoever made this table didn't bring over the
 * full functionality of our table system… all they had to do is just use the
 * canonical table… we've gotta also make it where the rule is anywhere the
 * table appears. This is the bare bones table. The core data doesn't change.
 * The things you can sort and filter by do not change. Now we can add and
 * remove columns… they all need to be one single table at the core. One table,
 * one data access system, but then you're basically just saving configurations
 * for each page, and then the user gets to create their own configurations."
 *
 * That is P26 (one table) + P28 (one data access) — and this file is it:
 *
 *   • the rows come from ONE query (`useKeywordRows` → `gsc_perf_breakdown`);
 *   • the columns come from ONE builder (`buildKeywordColumns`);
 *   • sort, filter and pagination are SERVER side, always. A page of fifty
 *     sorted in the browser is not a sorted list of 5,823 keywords, it is a
 *     lie about one;
 *   • a surface supplies a CONFIGURATION — which columns it opens on, a base
 *     filter it never lets go of, its own bulk actions — and nothing else;
 *   • the user's own arrangement rides the URL, so Back is one-step undo (P27)
 *     and a saved view is literally this state.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md
 */

import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  ColumnFiltersState,
  MatrxColumnDef,
  MatrxDataTableEmptyState,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { toast } from "@/lib/toast";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { FilterBar } from "@/features/marketing/search-console/components/FilterBar";
import { RangeCompareControl } from "@/features/marketing/search-console/components/RangeCompareControl";
import { useGscFreshness } from "@/features/marketing/search-console/hooks/useGscQuery";
import { gscMetricCopyLines } from "@/features/marketing/search-console/lib/columns";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import {
  allowedFilterKeysForTab,
  resolveGscDataThrough,
  resolvePeriods,
} from "@/features/marketing/search-console/lib/url-state";
import type {
  GscBreakdownRow,
  GscFilters,
} from "@/features/marketing/search-console/types";
import {
  GSC_CLASS_SOURCES,
  GSC_RANGE_PRESETS,
  encodeStampFilter,
  formatCount,
  formatCtr,
  parseLevelFilter,
  parseStampFilter,
} from "@/features/marketing/search-console/types";
import {
  setKeywordService,
  setKeywordStamps,
} from "@/features/marketing/seo/keyword-workbench/data";
import {
  AssignPanel,
  type AssignTarget,
} from "@/features/marketing/seo/keyword-workbench/components/AssignPanel";
import { OfferingAssignPanel } from "@/features/marketing/seo/keyword-workbench/components/OfferingAssignPanel";
import { ServiceFilterControl } from "@/features/marketing/seo/keyword-workbench/components/ServiceFilterControl";
import { ServiceCell } from "@/features/marketing/seo/keyword-workbench/components/ServiceCell";
import { ClassCell } from "@/features/marketing/seo/keyword-workbench/components/cells";
import type { PickedValue } from "@/features/marketing/seo/keyword-workbench/components/DimensionValuePicker";
import { WhyScoreHint } from "@/features/marketing/seo/value-system/workbench/WhyScore";
import { humanizeSlug } from "@/features/marketing/seo/value-system/lib";
import { ColumnChooser } from "./ColumnChooser";
import { buildKeywordColumns } from "./columns";
import {
  liveSearchParams,
  mergeKeywordTableParams,
  parseKeywordTableState,
  toggleCoreColumn,
  visibleCoreColumns,
  type KeywordCoreColumnId,
  type KeywordTableState,
} from "./state";
import {
  SERVER_SORTABLE,
  useKeywordRows,
  type KeywordRowsResult,
} from "./useKeywordRows";

export interface KeywordTableSurface {
  /** Stable id — names the copy payloads and the surface in a toast. */
  id: string;
  /** Human label for one row ("Keyword") and the list ("Unplaced queue"). */
  label: string;
  listLabel: string;
  /** Where in the product this table lives, for the copy payload. */
  location: string;
  /** URL parameter prefix, so two keyword tables can share one route. */
  prefix?: string;
  /** The columns this surface OPENS on. The user may add or remove any. */
  defaultColumns: KeywordCoreColumnId[];
  /**
   * Filters this surface always applies and the user cannot clear — they are
   * what MAKES it that surface ("keywords with no offering", "placements the
   * assigner is unsure about"). Everything else stays a normal, clearable
   * filter.
   */
  baseFilters?: GscFilters;
  /** Show the shared Search Console filter bar + offering filter. Default true. */
  showFilterBar?: boolean;
  /** Show the date-range / compare control. Default true. */
  showRangeControl?: boolean;
}

/**
 * The table's own write panels, handed to a surface so it never rebuilds one.
 * "Place under a topic…" on the unplaced queue and "Offering…" on the workbench
 * are the SAME panel over the SAME RPC (`seo.gsc_set_keyword_topic`).
 */
export interface KeywordTableControls {
  /** Open the reason-carrying offering placement panel for these keywords. */
  openServiceAssign: (keywordIds: string[], label: string) => void;
  /**
   * Open the dimension assign panel (P24 — the WHY rides the stamp).
   * `lockedDimensionSlug` pins the panel to one dimension, which is how the
   * shared keyword menu's "Set the class…" reaches THIS panel instead of
   * mounting a second one.
   */
  openAssign: (
    keywordIds: string[],
    label: string,
    lockedDimensionSlug?: string,
  ) => void;
  /** Re-read everything a write can change. */
  refresh: () => Promise<void>;
  /**
   * The value the person assigned last, and the one-click way to repeat it
   * (P23). It lives on the table because the Class cell, the bulk bar and the
   * right-click menu all offer the same gesture and must agree about it.
   */
  lastUsed: PickedValue | null;
  quickAssign: (keywordIds: string[], picked: PickedValue) => void;
}

/** The live view a surface's own controls act on. */
export interface KeywordTableView extends KeywordTableControls {
  /** State filters PLUS the surface's base filters — what the RPC actually got. */
  filters: GscFilters;
  periods: ReturnType<typeof resolvePeriods>;
  total: number;
  rows: GscBreakdownRow[];
  search: string;
}

export interface KeywordTableSelectionContext extends KeywordTableControls {
  keywordIds: string[];
  rows: GscBreakdownRow[];
  clear: () => void;
}

export interface KeywordTableProps {
  siteId: string;
  siteDomain: string;
  brandId: string;
  surface: KeywordTableSurface;
  emptyState?: MatrxDataTableEmptyState;
  /** Rendered on the header line, right of the count. */
  headerActions?: ReactNode;
  /** Rendered in the bulk bar. */
  selectionActions?: (ctx: KeywordTableSelectionContext) => ReactNode;
  /** A trailing per-row action column owned by this surface. */
  rowActions?: (
    row: GscBreakdownRow,
    controls: KeywordTableControls,
  ) => ReactNode;
  /** Columns this surface appends after the core set (e.g. Confidence). */
  extraColumns?: (data: KeywordRowsResult) => MatrxColumnDef<GscBreakdownRow>[];
  /**
   * Wrap the rendered table — for a surface that owns the whole grid's
   * gesture, such as the Keyword Workbench's right-click menu. Return the node
   * unchanged for a no-op.
   */
  wrapTable?: (table: ReactNode) => ReactNode;
  /**
   * Extra controls in the table's own toolbar, given the LIVE view. The
   * workbench's "Assign all 4,471 matching" needs the filters and the total,
   * and reading them from a second copy of the URL state is how two truths
   * start.
   */
  toolbarLeading?: (view: KeywordTableView) => ReactNode;
  /**
   * Live handle on the table for chrome that renders OUTSIDE it (a right-click
   * menu on the grid, a header button that acts on the whole result set). A
   * ref, not a callback, because the view changes on every render and calling
   * setState from a child's render is the loop this avoids.
   */
  viewRef?: MutableRefObject<KeywordTableView | null>;
  /** Called after any write this table performs, so the host can re-read. */
  onWrite?: () => void;
  /**
   * The checked rows' KEYWORD ids, for a surface whose action lives OUTSIDE the
   * bulk bar (the topic assigner sits on the header line). Fired from the
   * selection handler, never during render.
   */
  onSelectedKeywordIdsChange?: (ids: string[]) => void;
  className?: string;
}

export function KeywordTable({
  siteId,
  siteDomain,
  brandId,
  surface,
  emptyState,
  headerActions,
  selectionActions,
  rowActions,
  extraColumns,
  wrapTable,
  toolbarLeading,
  viewRef,
  onWrite,
  onSelectedKeywordIdsChange,
  className,
}: KeywordTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const prefix = surface.prefix ?? "";
  const state = parseKeywordTableState(params, { prefix });

  /**
   * Search has two clocks. The draft is what the input shows RIGHT NOW; the
   * URL/server value changes only after the person pauses. Binding the input
   * straight to URL state calls router.push + the breakdown RPC for every
   * character, so a large site can interrupt the next keystroke.
   */
  const [searchDraft, setSearchDraft] = useState(state.search);
  const [urlSearchAtDraftSync, setUrlSearchAtDraftSync] = useState(
    state.search,
  );
  const lastSearchCommit = useRef(state.search);
  if (state.search !== urlSearchAtDraftSync) {
    setUrlSearchAtDraftSync(state.search);
    setSearchDraft(state.search);
  }
  const debouncedSearch = useDebounce(searchDraft, 300);

  /**
   * THE BACK BUTTON IS UNDO (P27). Every write here is a discrete user action —
   * a filter, a column, a page — so it PUSHES a history entry and Back walks
   * back exactly one step.
   */
  const push = (
    next: KeywordTableState,
    options: { history?: "push" | "replace" } = {},
  ) => {
    /**
     * Read the LIVE query string, never the `params` this render closed over.
     *
     * Measured 2026-08-24: with the React Compiler on, the handler handed to
     * the controlled table can be memoized around an older `useSearchParams()`
     * value. Merging into that stale copy produced a URL identical to the one
     * already showing, so `router.push` no-opped and the header's second click
     * (asc → desc) silently did nothing — the exact class of quiet lie this
     * table exists to stop. `window.location.search` cannot be stale.
     */
    const merged = mergeKeywordTableParams(liveSearchParams(params), next, {
      prefix,
    });
    const qs = merged.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (options.history === "replace") router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  };
  const patch = (partial: Partial<KeywordTableState>) =>
    push({ ...state, search: searchDraft, page: 1, ...partial });

  useEffect(() => {
    if (debouncedSearch === state.search) {
      lastSearchCommit.current = state.search;
      return;
    }
    if (lastSearchCommit.current === debouncedSearch) return;
    lastSearchCommit.current = debouncedSearch;
    // Free text is one evolving search session, not one Back-stack entry per
    // pause. Discrete table decisions still push().
    push(
      { ...state, page: 1, search: debouncedSearch },
      { history: "replace" },
    );
  }, [debouncedSearch, state.search]);

  /* ---------------------------------------------------------------- periods */
  const freshness = useGscFreshness(siteId);
  const dataThrough = resolveGscDataThrough(freshness.data, [
    "query",
    "query_page",
  ]);
  const periods = resolvePeriods(state, new Date(), dataThrough);

  /**
   * The surface's base filters are applied LAST so nothing the user does can
   * silently turn the unplaced queue into the whole corpus.
   */
  const effectiveFilters: GscFilters = {
    ...state.filters,
    ...(surface.baseFilters ?? {}),
  };

  const data = useKeywordRows({
    siteId,
    brandId,
    periods,
    filters: effectiveFilters,
    search: state.search,
    sort: state.sort,
    sortDir: state.sortDir,
    page: state.page,
    pageSize: state.pageSize,
    dimensions: state.dimensions,
  });
  const { rows, total } = data;

  /* -------------------------------------------------------------- selection */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /**
   * A selection belongs to the result set it was made in. Changing the filters,
   * the window, or the search produces a DIFFERENT set of rows, and carrying
   * "7 keywords selected" across that boundary invites a bulk write onto
   * keywords the person can no longer see.
   */
  const selectionScope = `${JSON.stringify(effectiveFilters)}|${state.search}|${state.range}|${state.customFrom}|${state.customTo}|${state.viewId}`;
  const [scopeAtSelection, setScopeAtSelection] = useState(selectionScope);
  if (scopeAtSelection !== selectionScope) {
    setScopeAtSelection(selectionScope);
    if (selectedIds.length > 0) setSelectedIds([]);
  }

  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [serviceTarget, setServiceTarget] = useState<AssignTarget | null>(null);
  /** P23 — the value you used last, offered as one click until you change it. */
  const [lastUsed, setLastUsed] = useState<PickedValue | null>(null);

  const rowById = new Map(rows.map((r) => [r.key, r]));
  const selectedRows = selectedIds
    .map((key) => rowById.get(key))
    .filter((row): row is GscBreakdownRow => !!row);
  const selectedKeywordIds = selectedRows
    .map((row) => row.keyword_id)
    .filter((id): id is string => !!id);

  const afterWrite = async () => {
    await data.refreshMeaning();
    onWrite?.();
  };

  const controls: KeywordTableControls = {
    openServiceAssign: (keywordIds, label) =>
      setServiceTarget({ keywordIds, label }),
    openAssign: (keywordIds, label, lockedDimensionSlug) =>
      setAssignTarget({
        keywordIds,
        label,
        ...(lockedDimensionSlug ? { lockedDimensionSlug } : {}),
      }),
    refresh: afterWrite,
    lastUsed,
    quickAssign: (keywordIds, picked) => void quickAssign(keywordIds, picked),
  };

  /* ----------------------------------------------------------------- writes */
  const placeService = async (
    keywordId: string,
    topicId: string | null,
    keyword: string,
  ) => {
    try {
      await setKeywordService({ siteId, keywordIds: [keywordId], topicId });
      await afterWrite();
      const name = topicId
        ? (data.services.byId.get(topicId)?.name ?? "that offering")
        : null;
      toast.success(
        name
          ? `“${keyword}” maps to ${name}.`
          : `“${keyword}” is off the tree — it maps to no offering now.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not place that.",
      );
    }
  };

  const quickAssign = async (targetIds: string[], picked: PickedValue) => {
    try {
      const result = await setKeywordStamps({
        siteId,
        keywordIds: targetIds,
        valueId: picked.valueId,
      });
      setLastUsed(picked);
      await afterWrite();
      toast.success(
        `${picked.dimensionLabel}: ${picked.valueLabel} — ${result.written.toLocaleString()} keyword${result.written === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that.",
      );
    }
  };

  /**
   * TAKING A RULING BACK. `gsc_set_keyword_stamps` has always accepted
   * `p_clear` — nothing in the UI ever offered it, so a class could be set and
   * then never unset: pick "Money" by accident and the only way back was
   * another wrong answer. Same RPC, same provenance, one flag.
   */
  const quickClear = async (
    targetIds: string[],
    valueId: string,
    dimensionLabel: string,
  ) => {
    try {
      const result = await setKeywordStamps({
        siteId,
        keywordIds: targetIds,
        valueId,
        clear: true,
      });
      await afterWrite();
      toast.success(
        `${dimensionLabel} cleared on ${result.cleared.toLocaleString()} keyword${result.cleared === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clear that.",
      );
    }
  };

  /* ---------------------------------------------------------------- filters */
  const filterByService = (topic: string | undefined) => {
    const filters: GscFilters = { ...state.filters };
    if (!topic) delete filters.topic;
    else filters.topic = topic;
    patch({ filters });
  };

  /**
   * C10 — WHICH BRANCH. A server filter (`lo=`) like the offering filter, never
   * a page-local one: "everything the San Diego yard owns" has to mean the
   * whole list. Clicking the location you are already filtered to clears it,
   * so the cell is a toggle and never a dead end.
   */
  const filterByLocation = (location: string | undefined) => {
    const filters: GscFilters = { ...state.filters };
    if (!location || location === state.filters.location)
      delete filters.location;
    else filters.location = location;
    patch({ filters });
  };

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

  /* ---------------------------------------------------------------- columns */
  const coreVisible = visibleCoreColumns(surface.defaultColumns, state);
  const columns: MatrxColumnDef<GscBreakdownRow>[] = [
    ...buildKeywordColumns({
      visible: coreVisible,
      dimensions: state.dimensions,
      data,
      siteId,
      brandId,
      hasCompare: periods.compare !== null,
      handlers: {
        onPlaceService: (keywordId, topicId, keyword) =>
          void placeService(keywordId, topicId, keyword),
        onFilterByService: filterByService,
        onFilterByLocation: filterByLocation,
        onQuickAssign: (ids, picked) => void quickAssign(ids, picked),
        onQuickClear: (ids, valueId, dimensionLabel) =>
          void quickClear(ids, valueId, dimensionLabel),
        onAssign: (keywordId, keyword, lockedDimensionSlug, initial) =>
          setAssignTarget({
            keywordIds: [keywordId],
            label: `“${keyword}”`,
            ...(lockedDimensionSlug ? { lockedDimensionSlug } : {}),
            ...(initial ? { initial } : {}),
          }),
        onFilterByStamp: filterByStamp,
      },
    }),
    ...(extraColumns?.(data) ?? []),
  ];

  /* ------------------------------------------------------------ table state */
  const tableColumnFilters: ColumnFiltersState = {};
  if (searchDraft) {
    tableColumnFilters.key = { kind: "text", value: searchDraft };
  }
  if (state.filters.topic) {
    tableColumnFilters.topic = { kind: "select", value: state.filters.topic };
  }
  if (state.filters.location) {
    tableColumnFilters.location = {
      kind: "select",
      value: state.filters.location,
    };
  }
  const levels = parseLevelFilter(state.filters.levels);
  if (levels.length > 0) {
    tableColumnFilters.value_band = {
      kind: "select",
      value: levels[0],
      values: levels,
    };
  }
  for (const [id, min, max] of [
    ["clicks", state.filters.clicks_min, state.filters.clicks_max],
    [
      "impressions",
      state.filters.impressions_min,
      state.filters.impressions_max,
    ],
    ["position", state.filters.position_min, state.filters.position_max],
  ] as const) {
    if (min || max) {
      tableColumnFilters[id] = {
        kind: "number",
        ...(min ? { min: Number(min) } : {}),
        ...(max ? { max: Number(max) } : {}),
      };
    }
  }
  for (const pair of stampPairs) {
    const id =
      pair.dimension === "traffic_class"
        ? "traffic_class"
        : `dim:${pair.dimension}`;
    const existing = tableColumnFilters[id];
    const values =
      existing?.kind === "select"
        ? [...(existing.values ?? [existing.value]), pair.value]
        : [pair.value];
    tableColumnFilters[id] = { kind: "select", value: values[0], values };
  }

  const tableQuery: MatrxDataTableQueryState = {
    page: state.page,
    pageSize: state.pageSize,
    search: searchDraft,
    anyOf: "",
    columnFilters: tableColumnFilters,
    sort: { id: state.sort, direction: state.sortDir },
  };

  /**
   * A dimension column has no server sort (the RPC sorts search metrics), so it
   * sorts what is on screen. Sorting 5,823 rows by a stamp the browser never
   * fetched would be the quiet lie this system exists to stop, so the page
   * badge says which sorts are whole-list and which are this page.
   */
  const displayRows = SERVER_SORTABLE.has(state.sort)
    ? rows
    : [...rows].sort((a, b) => {
        const read = (row: GscBreakdownRow) =>
          state.sort.startsWith("dim:")
            ? (data.stampFor(row, state.sort.slice(4))?.valueLabel ?? "")
            : state.sort === "traffic_class"
              ? (data.valueFor(row)?.traffic_class ?? "")
              : state.sort === "value_band"
                ? (data.valueFor(row)?.value_band ?? "")
                : String(data.valueFor(row)?.value_score ?? "");
        const av = read(a);
        const bv = read(b);
        const cmp =
          state.sort === "value_score"
            ? Number(av || 0) - Number(bv || 0)
            : av.localeCompare(bv);
        return state.sortDir === "asc" ? cmp : -cmp;
      });

  const numberFilter = (
    id: "clicks" | "impressions" | "position",
    next: MatrxDataTableQueryState,
  ): GscFilters | null => {
    const value = next.columnFilters[id];
    const min = value?.kind === "number" ? value.min : undefined;
    const max = value?.kind === "number" ? value.max : undefined;
    const minKey = `${id}_min` as keyof GscFilters;
    const maxKey = `${id}_max` as keyof GscFilters;
    const currentMin = state.filters[minKey] ?? "";
    const currentMax = state.filters[maxKey] ?? "";
    const nextMin = min == null ? "" : String(min);
    const nextMax = max == null ? "" : String(max);
    if (nextMin === currentMin && nextMax === currentMax) return null;
    const filters: GscFilters = { ...state.filters };
    if (nextMin) filters[minKey] = nextMin;
    else delete filters[minKey];
    if (nextMax) filters[maxKey] = nextMax;
    else delete filters[maxKey];
    return filters;
  };

  const onQueryStateChange = (next: MatrxDataTableQueryState) => {
    if (next.search !== searchDraft) {
      setSearchDraft(next.search ?? "");
      return;
    }
    const keywordFilter = next.columnFilters.key;
    const keywordFilterText =
      keywordFilter?.kind === "text" ? keywordFilter.value : "";
    if (keywordFilterText !== searchDraft) {
      setSearchDraft(keywordFilterText);
      return;
    }
    const selectedValue = (id: string) => {
      const filter = next.columnFilters[id];
      if (!filter || filter.kind !== "select") return undefined;
      return (
        (filter.values?.length ? filter.values[0] : filter.value) || undefined
      );
    };

    const nextTopic = selectedValue("topic");
    if (nextTopic !== state.filters.topic) {
      filterByService(nextTopic);
      return;
    }

    // C10 — LOCATION is a server filter (`lo=`) too. Picking it from the
    // column header and clicking it in a cell are the same write.
    const nextLocation = selectedValue("location");
    if (nextLocation !== state.filters.location) {
      const filters: GscFilters = { ...state.filters };
      if (!nextLocation) delete filters.location;
      else filters.location = nextLocation;
      patch({ filters });
      return;
    }

    // LEVEL is a server filter (`lv=`) — never a page-local one.
    const nextLevels = (() => {
      const filter = next.columnFilters.value_band;
      if (!filter || filter.kind !== "select") return [];
      return filter.values?.length
        ? filter.values
        : filter.value
          ? [filter.value]
          : [];
    })();
    if (nextLevels.join("|") !== levels.join("|")) {
      const filters: GscFilters = { ...state.filters };
      if (nextLevels.length === 0) delete filters.levels;
      else filters.levels = nextLevels.join("|");
      patch({ filters });
      return;
    }

    for (const id of ["clicks", "impressions", "position"] as const) {
      const filters = numberFilter(id, next);
      if (filters) {
        patch({ filters });
        return;
      }
    }

    // A column filter on a dimension is a REAL server filter — it replaces
    // that dimension's stamp pair.
    const stampColumnIds = [
      "traffic_class",
      ...state.dimensions.map((slug) => `dim:${slug}`),
    ];
    for (const id of stampColumnIds) {
      const slug = id.startsWith("dim:") ? id.slice(4) : "traffic_class";
      const current = stampPairs.find((pair) => pair.dimension === slug)?.value;
      const picked = selectedValue(id);
      if (picked === current) continue;
      const nextPairs = stampPairs.filter((pair) => pair.dimension !== slug);
      if (picked) nextPairs.push({ dimension: slug, value: picked });
      const filters: GscFilters = { ...state.filters };
      if (nextPairs.length === 0) delete filters.stamps;
      else filters.stamps = encodeStampFilter(nextPairs);
      patch({ filters });
      return;
    }

    push({
      ...state,
      page: next.page,
      pageSize: next.pageSize,
      search: searchDraft,
      sort: next.sort?.id ?? "clicks",
      sortDir: next.sort?.direction ?? "desc",
    });
  };

  const rangeLabel =
    state.range === "custom" && state.customFrom && state.customTo
      ? `${state.customFrom} → ${state.customTo}`
      : (GSC_RANGE_PRESETS.find((r) => r.key === state.range)?.label ??
        "Last 28 days");

  const view: KeywordTableView = {
    ...controls,
    filters: effectiveFilters,
    periods,
    total,
    rows,
    search: state.search,
  };
  useEffect(() => {
    if (!viewRef) return;
    viewRef.current = view;
    return () => {
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [view, viewRef]);

  const renderMobileCard = (
    row: GscBreakdownRow,
    index: number,
    mobile: {
      selected: boolean;
      selectable: boolean;
      onSelectedChange: (selected: boolean) => void;
      actions: ReactNode;
    },
  ) => {
    const value = data.valueFor(row);
    const classSource = GSC_CLASS_SOURCES.find(
      (source) => source.key === value?.class_source,
    );
    const classValue = (data.classDimension?.values ?? []).find(
      (option) => option.key === value?.traffic_class,
    );
    const headingId = `keyword-card-${index}`;

    return (
      <article
        data-row-id={row.key}
        data-selected={mobile.selected}
        aria-labelledby={headingId}
        className="rounded-lg border border-border bg-background p-3 shadow-sm"
      >
        <div className="flex items-start gap-2">
          <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md hover:bg-accent">
            <Checkbox
              checked={mobile.selected}
              disabled={!mobile.selectable}
              onCheckedChange={(checked) =>
                mobile.onSelectedChange(checked === true)
              }
              aria-label={`Select ${row.key}`}
            />
          </label>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Keyword
            </p>
            <h2
              id={headingId}
              className="break-words text-sm font-semibold text-foreground"
            >
              {row.key}
            </h2>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Offering
            </p>
            <ServiceCell
              siteId={siteId}
              services={data.services}
              placement={data.serviceFor(row)}
              disabled={!row.keyword_id}
              onPlace={(topicId) => {
                if (!row.keyword_id) return;
                void placeService(row.keyword_id, topicId, row.key);
              }}
              onFilter={filterByService}
              triggerClassName="min-h-11 w-full justify-start px-2"
              filterClassName="min-h-11 min-w-11 opacity-100"
            />
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Class
            </p>
            <ClassCell
              current={value?.traffic_class ?? null}
              source={value?.class_source ?? null}
              options={(data.classDimension?.values ?? []).filter(
                (option) => !option.abstain,
              )}
              disabled={!row.keyword_id}
              onPick={(picked) => {
                if (!row.keyword_id || !data.classDimension) return;
                void quickAssign([row.keyword_id], {
                  dimensionId: data.classDimension.dimension_id,
                  dimensionSlug: data.classDimension.slug,
                  dimensionLabel: data.classDimension.label,
                  valueId: picked.value_id,
                  valueLabel: picked.label,
                });
              }}
              onAssignWithReason={() => {
                if (!row.keyword_id) return;
                setAssignTarget({
                  keywordIds: [row.keyword_id],
                  label: `“${row.key}”`,
                  lockedDimensionSlug: "traffic_class",
                });
              }}
              onClear={
                row.keyword_id && classValue && data.classDimension
                  ? () =>
                      void quickClear(
                        [row.keyword_id as string],
                        classValue.value_id,
                        data.classDimension?.label ?? "Class",
                      )
                  : undefined
              }
              onMakeYourOwn={() => {
                if (!row.keyword_id) return;
                setAssignTarget({
                  keywordIds: [row.keyword_id],
                  label: `“${row.key}”`,
                });
              }}
              triggerClassName="min-h-11 w-full justify-start px-2 text-xs"
            />
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2 text-xs">
          <div>
            <dt className="text-[10px] uppercase text-muted-foreground">
              Clicks
            </dt>
            <dd className="font-medium tabular-nums text-foreground">
              {formatCount(row.clicks)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-muted-foreground">
              Impressions
            </dt>
            <dd className="font-medium tabular-nums text-foreground">
              {formatCount(row.impressions)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-muted-foreground">CTR</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {formatCtr(row.ctr)}
            </dd>
          </div>
        </dl>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Why
            </p>
            <p className="font-medium text-foreground">
              {classSource?.label ?? "No signal"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Level
            </p>
            <span className="flex min-h-11 items-center gap-1">
              <span className="font-medium text-foreground">
                {value?.value_band
                  ? humanizeSlug(value.value_band)
                  : "Unvalued"}
              </span>
              {value ? (
                <WhyScoreHint
                  subject={{
                    keywordId: row.keyword_id,
                    keyword: row.key,
                    valueBand: value.value_band,
                    valueScore: value.value_score,
                    valueSource: value.value_source,
                    reasons: value.reasons,
                  }}
                  context={{ brandId, siteId, keyword: row.key }}
                />
              ) : null}
            </span>
          </div>
        </div>

        {mobile.actions ? (
          <div
            className="mt-2 flex min-h-11 items-center justify-end border-t border-border pt-2"
            aria-label={`Actions for ${row.key}`}
            role="group"
          >
            {mobile.actions}
          </div>
        ) : null}
      </article>
    );
  };

  /* ------------------------------------------------------------------ render */
  // The context menu's trigger renders `asChild`, so `wrapTable` must return a
  // real DOM element around the table — handing `asChild` a component that does
  // not forward props drops the right-click handler on the floor, silently.
  const table = (
    <MatrxDataTable<GscBreakdownRow>
      data={displayRows}
      columns={columns}
      getRowId={(row) => row.key}
      isLoading={data.isLoading}
      isFetching={data.isFetching}
      query={{
        mode: "controlled",
        totalItems: total,
        state: tableQuery,
        onStateChange: onQueryStateChange,
      }}
      selection={{
        selectedIds,
        onSelectedIdsChange: (ids) => {
          setSelectedIds(ids);
          onSelectedKeywordIdsChange?.(
            ids
              .map((key) => rowById.get(key)?.keyword_id)
              .filter((id): id is string => !!id),
          );
        },
        noun: "keyword",
        isRowSelectable: (row) => !!row.keyword_id,
        actions: () =>
          selectionActions?.({
            ...controls,
            keywordIds: selectedKeywordIds,
            rows: selectedRows,
            clear: () => setSelectedIds([]),
          }) ?? null,
      }}
      rowActions={rowActions ? (row) => rowActions(row, controls) : undefined}
      toolbar={{
        searchPlaceholder: "Search keywords…",
        leading: toolbarLeading?.(view),
      }}
      copy={{
        label: surface.label,
        listLabel: surface.listLabel,
        location: webLocation(surface.location),
        rowKind: `web-${surface.id}-row`,
        listKind: `web-${surface.id}-table`,
        rowDescription:
          "One keyword's search performance, class, score, level and stamped dimensions for this site.",
        listDescription:
          "The visible keyword rows (respecting search, filters, sort and pagination).",
        humanRow: (row) =>
          humanLines(gscMetricCopyLines("Keyword", "query", row)),
        rowAttributes: (row) => ({
          ...gscScopeAttributes(siteId, siteDomain, periods, effectiveFilters),
          key: row.key,
          keyword_id: row.keyword_id ?? "",
        }),
        listAttributes: (visible) => ({
          ...gscScopeAttributes(siteId, siteDomain, periods, effectiveFilters),
          visible_rows: visible.length,
          total_rows: total,
          dimension_columns: state.dimensions.join(","),
        }),
      }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      mobileCards={renderMobileCard}
      pageSize={state.pageSize}
      emptyState={
        emptyState ?? {
          icon: <SearchX className="h-8 w-8 text-muted-foreground" />,
          title: "No keywords match",
          description:
            "Nothing in this window carries every filter you set. Widen the date range, drop a filter chip, or clear the search.",
        }
      }
      className="flex-1"
    />
  );

  return (
    <div className={className ?? "flex min-h-0 flex-1 flex-col gap-2"}>
      <div className="flex flex-wrap items-center gap-2">
        {surface.showFilterBar !== false ? (
          <>
            <FilterBar
              filters={state.filters}
              onChange={(filters) => patch({ filters })}
              allowedKeys={allowedFilterKeysForTab("queries")}
              siteId={siteId}
            />
            {surface.baseFilters?.topic ? null : (
              <ServiceFilterControl
                siteId={siteId}
                services={data.services}
                value={state.filters.topic}
                onChange={filterByService}
              />
            )}
          </>
        ) : null}
        {data.isLoading ? (
          <span
            role="status"
            aria-live="polite"
            className="text-[11px] text-muted-foreground"
          >
            Preparing keyword totals and rows
          </span>
        ) : (
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">
            {formatCount(total)} keywords · {rangeLabel}
            {dataThrough ? ` · through ${dataThrough}` : ""}
            {SERVER_SORTABLE.has(state.sort)
              ? ""
              : " · sorted on this page only"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {headerActions}
          {surface.showRangeControl !== false ? (
            <RangeCompareControl
              value={{
                range: state.range,
                customFrom: state.customFrom,
                customTo: state.customTo,
                compare: state.compare,
              }}
              onChange={(next) =>
                patch({
                  range: next.range,
                  customFrom: next.customFrom,
                  customTo: next.customTo,
                  compare: next.compare,
                })
              }
            />
          ) : null}
          <ColumnChooser
            dimensions={data.dimensionCatalog}
            loading={data.dimensionCatalogLoading}
            selected={state.dimensions}
            onSelectedChange={(next) => patch({ dimensions: next })}
            coreVisible={coreVisible}
            onToggleCore={(id) =>
              patch(toggleCoreColumn(surface.defaultColumns, state, id))
            }
          />
        </div>
      </div>

      {assignTarget ? (
        <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <AssignPanel
            siteId={siteId}
            dimensions={data.dimensionCatalog}
            dimensionsLoading={data.dimensionCatalogLoading}
            target={assignTarget}
            onCancel={() => setAssignTarget(null)}
            onDone={(result, picked) => {
              setAssignTarget(null);
              setLastUsed(picked);
              void afterWrite();
              toast.success(
                result.cleared > 0
                  ? `Removed ${picked.valueLabel} from ${result.cleared.toLocaleString()} keyword${result.cleared === 1 ? "" : "s"}.`
                  : `${picked.dimensionLabel}: ${picked.valueLabel} on ${result.written.toLocaleString()} keyword${result.written === 1 ? "" : "s"}${result.notesSaved ? " — your reason is saved with them." : "."}`,
              );
              if (
                result.written > 0 &&
                !state.dimensions.includes(picked.dimensionSlug)
              ) {
                // You just gave these keywords a meaning; you should be able to
                // SEE it without hunting for the column chooser.
                patch({
                  dimensions: [...state.dimensions, picked.dimensionSlug],
                });
              }
            }}
          />
        </div>
      ) : null}

      {serviceTarget ? (
        <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <OfferingAssignPanel
            siteId={siteId}
            services={data.services}
            target={serviceTarget}
            onCancel={() => setServiceTarget(null)}
            onDone={(result, placed) => {
              setServiceTarget(null);
              void afterWrite();
              setSelectedIds([]);
              toast.success(
                placed.topicId
                  ? `${result.length.toLocaleString()} keyword${result.length === 1 ? "" : "s"} now map to ${placed.name}.`
                  : `${result.length.toLocaleString()} keyword${result.length === 1 ? "" : "s"} taken off the tree.`,
              );
            }}
          />
        </div>
      ) : null}

      {data.error ? (
        <InlineQueryError
          what={surface.listLabel.toLowerCase()}
          error={data.error}
          onRetry={data.refetch}
        />
      ) : wrapTable ? (
        wrapTable(table)
      ) : (
        table
      )}
    </div>
  );
}
