"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ChevronRight,
  Eraser,
  PanelRight,
  PanelRightOpen,
  Search,
  WholeWord,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import GenericTablePagination from "@/components/generic-table/GenericTablePagination";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem } from "@/components/agent-copy/export";
import { cn } from "@/lib/utils";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { useTableUrlState } from "@/lib/data-table/useTableUrlState";
import {
  jsonUrlCodec,
  stringUrlCodec,
  useUrlState,
} from "@/lib/url-state/useUrlState";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ColumnHeaderCell } from "./ColumnHeaderCell";
import { DataRowInspector } from "./DataRowInspector";
import DataRowWindow from "./DataRowWindow.dynamic";
import { DirtySavePill } from "./DirtySavePill";
import { EditableTableCell } from "./EditableTableCell";
import { tokenFromColumnName } from "@/components/official/entity-ref/doors";
import { MatrxUuidCell } from "./MatrxUuidCell";
import { isUuidValue } from "@/components/official/entity-ref/doors";
import { ToolbarFacets, resetToolbarFacets } from "./ToolbarFacets";
import { LayeredFilterBuilder } from "./LayeredFilterBuilder";
import {
  completeLayeredFilterRules,
  type LayeredFilterRule,
} from "./layered-filters";
import {
  applyRowEdits,
  columnId,
  countActiveColumnFilters,
  filterAndSortRows,
  getCellValue,
  stringifyCellValue,
} from "./filter-engine";
import {
  buildRowAgentInput,
  buildViewAgentInput,
  buildViewHuman,
  rowsToCsvFromColumns,
} from "./tableCopy";
import {
  nextQueryState,
  resolveQueryFilterMeta,
  safeQueryPage,
  type QueryFilterMeta,
} from "./query-control";
import type {
  CellEditsMap,
  ColumnFilterValue,
  ColumnFiltersState,
  MatrxColumnDef,
  MatrxDataTableProps,
  MatrxDataTableQueryState,
  SortState,
  TableSearchMatchMode,
} from "./types";

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

const activeUrlTableIds = new Set<string>();

/**
 * MatrxDataTable — the official canonical data table.
 *
 * Sticky headers · every-column sort/filter (searchable selects) · toolbar
 * facets with per-facet + global clear · any-of cross-column search ·
 * Copy/Copy-for-AI (row + this view) · inline edit with dirty Save/Cancel pill ·
 * row → SidePanelSurface or WindowPanel · trailing icon → the secondary view.
 */
export function MatrxDataTable<T>(props: MatrxDataTableProps<T>) {
  if (!props.urlState) return <MatrxDataTableCore {...props} />;
  return <MatrxDataTableWithUrlState {...props} urlState={props.urlState} />;
}

function MatrxDataTableWithUrlState<T>({
  urlState,
  ...props
}: MatrxDataTableProps<T> & {
  urlState: NonNullable<MatrxDataTableProps<T>["urlState"]>;
}) {
  if (props.query && props.query.mode !== "local") {
    throw new Error(
      `MatrxDataTable "${urlState.id}" cannot combine urlState with controlled query mode. Use useTableUrlState({ tableId: "${urlState.id}" }) in the remote query owner.`,
    );
  }

  const table = useTableUrlState({
    tableId: urlState.id,
    defaultSort: urlState.defaultSort,
    defaultPageSize: props.pageSize ?? 25,
    history: urlState.history,
    textHistory: urlState.textHistory,
  });
  useEffect(() => {
    if (activeUrlTableIds.has(urlState.id)) {
      throw new Error(
        `Duplicate MatrxDataTable urlState.id "${urlState.id}" on one page. Give every table a unique stable id.`,
      );
    }
    activeUrlTableIds.add(urlState.id);
    return () => {
      activeUrlTableIds.delete(urlState.id);
    };
  }, [urlState.id]);
  const prefix = `table.${urlState.id}`;
  const [urlSelectedId, setUrlSelectedId] = useUrlState(
    `${prefix}.row`,
    stringUrlCodec(),
  );
  const [urlWindowRowId, setUrlWindowRowId] = useUrlState(
    `${prefix}.window`,
    stringUrlCodec(),
  );
  const [urlSelection, setUrlSelection] = useUrlState(
    `${prefix}.selection`,
    jsonUrlCodec<string[]>([], isStringArray),
  );
  const syncSelectedRow = urlState.selectedRow !== false;
  const syncWindowRow = urlState.windowRow !== false;
  const syncSelection = urlState.selection === true && Boolean(props.selection);
  const selectedId = syncSelectedRow ? urlSelectedId || null : props.selectedId;
  const windowRowId = syncWindowRow
    ? urlWindowRowId || null
    : props.windowRowId;
  const selection =
    syncSelection && props.selection
      ? {
          ...props.selection,
          selectedIds: urlSelection,
          onSelectedIdsChange: (ids: string[]) => {
            setUrlSelection(ids, { history: urlState.history });
            props.selection?.onSelectedIdsChange(ids);
          },
        }
      : props.selection;

  return (
    <MatrxDataTableCore
      {...props}
      urlState={urlState}
      query={{
        mode: "controlled-local",
        state: table.state,
        onStateChange: table.onStateChange,
      }}
      selectedId={selectedId}
      onSelectedIdChange={(id) => {
        if (syncSelectedRow) {
          setUrlSelectedId(id === null ? "" : id, {
            history: urlState.history,
          });
        }
        props.onSelectedIdChange?.(id);
      }}
      windowRowId={windowRowId}
      onWindowRowIdChange={(id) => {
        if (syncWindowRow) {
          setUrlWindowRowId(id === null ? "" : id, {
            history: urlState.history,
          });
        }
        props.onWindowRowIdChange?.(id);
      }}
      selection={selection}
    />
  );
}

function MatrxDataTableCore<T>({
  data,
  columns,
  getRowId,
  isLoading = false,
  isFetching = false,
  query,
  urlState,
  toolbar,
  detail,
  window: windowConfig,
  copy,
  edit,
  selectedId: controlledSelectedId,
  onSelectedIdChange,
  windowRowId: controlledWindowRowId,
  onWindowRowIdChange,
  selection,
  rowActions,
  rowWrapper,
  emptyState,
  pageSize: defaultPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  zebra = true,
  className,
  tableClassName,
  mobile = "scroll",
  onRowOpen,
}: MatrxDataTableProps<T>) {
  // Two sticky leading cells would overlap, and a frozen checkbox identifies
  // nothing — selection and the mobile frozen identity column are exclusive.
  const mobileScroll = mobile !== "plain" && !selection;
  const controlledQuery =
    query?.mode === "controlled" || query?.mode === "controlled-local"
      ? query
      : null;
  const remoteQuery = query?.mode === "controlled" ? query : null;
  const emitControlledQueryChange = useCallback(
    (
      patch: Partial<MatrxDataTableQueryState>,
      options?: { resetPage?: boolean },
    ) => {
      if (!controlledQuery) return;
      controlledQuery.onStateChange(
        nextQueryState(controlledQuery.state, patch, options),
      );
    },
    [controlledQuery],
  );

  const [internalSearch, setInternalSearch] = useState("");
  const toolbarSearchControlled = toolbar?.searchValue !== undefined;
  const searchValue = controlledQuery
    ? controlledQuery.state.search
    : toolbarSearchControlled
      ? (toolbar?.searchValue ?? "")
      : internalSearch;
  const setSearchValue = (v: string) => {
    if (controlledQuery) {
      emitControlledQueryChange({ search: v }, { resetPage: true });
    } else if (!toolbarSearchControlled) {
      setInternalSearch(v);
    }
    toolbar?.onSearchChange?.(v);
  };
  const [internalSearchMatchMode, setInternalSearchMatchMode] =
    useState<TableSearchMatchMode>(
      toolbar?.searchMatch?.defaultMode ?? "contains",
    );
  const searchMatchMode = controlledQuery
    ? (controlledQuery.state.searchMatchMode ??
      toolbar?.searchMatch?.defaultMode ??
      "contains")
    : internalSearchMatchMode;
  const setSearchMatchMode = (mode: TableSearchMatchMode) => {
    if (controlledQuery) {
      emitControlledQueryChange({ searchMatchMode: mode }, { resetPage: true });
      return;
    }
    setInternalSearchMatchMode(mode);
  };

  const [internalAnyOf, setInternalAnyOf] = useState("");
  const toolbarAnyOfControlled = toolbar?.anyOf?.value !== undefined;
  const anyOfValue = controlledQuery
    ? controlledQuery.state.anyOf
    : toolbarAnyOfControlled
      ? (toolbar?.anyOf?.value ?? "")
      : internalAnyOf;
  const setAnyOfValue = (v: string) => {
    if (controlledQuery) {
      emitControlledQueryChange({ anyOf: v }, { resetPage: true });
    } else if (!toolbarAnyOfControlled) {
      setInternalAnyOf(v);
    }
    toolbar?.anyOf?.onChange?.(v);
  };

  const [internalLayeredFilters, setInternalLayeredFilters] = useState<
    LayeredFilterRule[]
  >([]);
  const layeredFilters = controlledQuery
    ? (controlledQuery.state.layeredFilters ?? [])
    : internalLayeredFilters;
  const setLayeredFilters = (next: LayeredFilterRule[]) => {
    if (controlledQuery) {
      emitControlledQueryChange({ layeredFilters: next }, { resetPage: true });
      return;
    }
    setInternalLayeredFilters(next);
  };

  const [internalColumnFilters, setInternalColumnFilters] =
    useState<ColumnFiltersState>({});
  const columnFilters = controlledQuery
    ? controlledQuery.state.columnFilters
    : internalColumnFilters;
  const setColumnFilter = (id: string, next: ColumnFilterValue | undefined) => {
    const nextFilters = { ...columnFilters, [id]: next };
    if (controlledQuery) {
      emitControlledQueryChange(
        { columnFilters: nextFilters },
        { resetPage: true },
      );
      return;
    }
    setInternalColumnFilters(nextFilters);
  };

  const [internalSort, setInternalSort] = useState<SortState | null>(null);
  const sort = controlledQuery ? controlledQuery.state.sort : internalSort;
  const setSort = (next: SortState | null) => {
    if (controlledQuery) {
      emitControlledQueryChange({ sort: next }, { resetPage: true });
      return;
    }
    setInternalSort(next);
  };

  const [internalPage, setInternalPage] = useState(1);
  const page = controlledQuery ? controlledQuery.state.page : internalPage;
  const setPage = (next: number) => {
    if (controlledQuery) {
      emitControlledQueryChange({ page: next });
      return;
    }
    setInternalPage(next);
  };

  const [internalPageSize, setInternalPageSize] = useState(
    defaultPageSize === 0 ? Math.max(data.length, 1) : defaultPageSize,
  );
  const pageSize = controlledQuery
    ? controlledQuery.state.pageSize
    : internalPageSize;
  const setPageSize = (next: number) => {
    if (controlledQuery) {
      emitControlledQueryChange({ pageSize: next }, { resetPage: true });
      return;
    }
    setInternalPageSize(next);
  };

  const [uncontrolledSelectedId, setUncontrolledSelectedId] = useState<
    string | null
  >(null);
  const selectedId =
    controlledSelectedId !== undefined
      ? controlledSelectedId
      : uncontrolledSelectedId;
  const setSelectedId = (id: string | null) => {
    if (controlledSelectedId === undefined) setUncontrolledSelectedId(id);
    onSelectedIdChange?.(id);
  };

  const [uncontrolledWindowRowId, setUncontrolledWindowRowId] = useState<
    string | null
  >(null);
  const windowRowId =
    controlledWindowRowId !== undefined
      ? controlledWindowRowId
      : uncontrolledWindowRowId;
  const setWindowRowId = (id: string | null) => {
    if (controlledWindowRowId === undefined) setUncontrolledWindowRowId(id);
    onWindowRowIdChange?.(id);
  };
  const [windowRowSnapshot, setWindowRowSnapshot] = useState<T | null>(null);
  const [edits, setEdits] = useState<CellEditsMap>({});
  const [saving, setSaving] = useState(false);

  // Mobile scroll affordance: edge fades (+ chevron) show that more columns
  // exist off-screen. Recomputed on scroll/resize; desktop hides them via CSS.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // The table bounds itself with `h-full`, which is inert unless every
  // ancestor is a flex column. When one is not, the table grows past the page
  // and an `overflow-hidden` ancestor clips it: no scrollbar, unreachable
  // rows, no error anywhere. This screams instead.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useClippedContentGuard(rootRef, {
    label: copy?.listLabel ? `Table: ${copy.listLabel}` : "MatrxDataTable",
  });
  const [scrollHintRight, setScrollHintRight] = useState(false);
  const updateScrollHint = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollHintRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);
  useEffect(() => {
    updateScrollHint();
    window.addEventListener("resize", updateScrollHint);
    return () => window.removeEventListener("resize", updateScrollHint);
  }, [updateScrollHint, data, columns]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.hidden),
    [columns],
  );

  const filterMeta = useMemo(() => {
    const meta = new Map<string, QueryFilterMeta>();
    for (const col of visibleColumns) {
      const id = columnId(col);
      meta.set(id, resolveQueryFilterMeta(col, data, Boolean(remoteQuery)));
    }
    return meta;
  }, [visibleColumns, data, remoteQuery]);

  const processed = useMemo(() => {
    if (remoteQuery) return data;
    return filterAndSortRows(
      data,
      visibleColumns,
      columnFilters,
      sort,
      toolbar?.search === false ? "" : searchValue,
      toolbar?.anyOf
        ? { columnIds: toolbar.anyOf.columnIds, query: anyOfValue }
        : undefined,
      layeredFilters,
      searchMatchMode,
    );
  }, [
    data,
    visibleColumns,
    columnFilters,
    sort,
    searchValue,
    toolbar,
    anyOfValue,
    layeredFilters,
    searchMatchMode,
    remoteQuery,
  ]);

  useEffect(() => {
    if (controlledQuery) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Preserve the original local-mode contract: every query-shape change returns to page one, including externally controlled toolbar values.
    setInternalPage(1);
  }, [
    searchValue,
    searchMatchMode,
    anyOfValue,
    layeredFilters,
    columnFilters,
    sort,
    pageSize,
    controlledQuery,
  ]);

  const totalItems = remoteQuery
    ? Math.max(0, remoteQuery.totalItems)
    : processed.length;
  const effectivePageSize = remoteQuery
    ? Math.max(pageSize, 1)
    : defaultPageSize === 0
      ? Math.max(totalItems, 1)
      : pageSize;
  const pageCount = Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const safePage = remoteQuery
    ? safeQueryPage(page, totalItems, effectivePageSize)
    : Math.min(page, pageCount);
  const paginated = useMemo(() => {
    if (remoteQuery) return processed;
    if (defaultPageSize === 0) return processed;
    const start = (safePage - 1) * effectivePageSize;
    return processed.slice(start, start + effectivePageSize);
  }, [processed, safePage, effectivePageSize, defaultPageSize, remoteQuery]);

  // A deletion or narrower filter can leave a controlled URL on a page that
  // no longer exists. Emit the clamped page once the new total arrives.
  useEffect(() => {
    if (!controlledQuery || controlledQuery.state.page === safePage) return;
    emitControlledQueryChange({ page: safePage });
  }, [controlledQuery, emitControlledQueryChange, safePage]);

  const selectedRow = useMemo(() => {
    if (!selectedId) return null;
    return data.find((r) => getRowId(r) === selectedId) ?? null;
  }, [data, selectedId, getRowId]);

  const windowRow = useMemo(() => {
    if (!windowRowId) return null;
    return (
      data.find((r) => getRowId(r) === windowRowId) ??
      (windowRowSnapshot && getRowId(windowRowSnapshot) === windowRowId
        ? windowRowSnapshot
        : null)
    );
  }, [data, windowRowId, windowRowSnapshot, getRowId]);

  const detailEnabled = detail?.enabled !== false;
  const windowEnabled =
    windowConfig?.enabled !== false && (detailEnabled || Boolean(windowConfig));
  const opensWindowOnRowClick = Boolean(
    windowEnabled && windowConfig?.openOnRowClick,
  );
  const editEnabled = Boolean(edit?.enabled && edit.onSave);
  const copyEnabled = Boolean(copy);
  const showRowCopy = copyEnabled && copy?.showRow !== false;
  const showToolbarCopy = copyEnabled && copy?.showToolbar !== false;

  const activeFilterCount = countActiveColumnFilters(columnFilters);
  const facetActive = (toolbar?.facets ?? []).some((f) => {
    if (f.type !== "button-group") return false;
    const def = f.defaultValue ?? f.options[0]?.value;
    return def !== undefined && f.value !== def;
  });
  const hasActiveFilters =
    activeFilterCount > 0 ||
    Boolean(searchValue.trim()) ||
    Boolean(anyOfValue.trim()) ||
    completeLayeredFilterRules(layeredFilters).length > 0 ||
    facetActive;

  const changeCount = useMemo(() => {
    let n = 0;
    for (const fields of Object.values(edits)) {
      n += Object.keys(fields).length;
    }
    return n;
  }, [edits]);

  const showSearch = toolbar?.search !== false;

  const openDetail = (row: T) => {
    if (!detailEnabled) {
      onRowOpen?.(row);
      return;
    }
    setSelectedId(getRowId(row));
    onRowOpen?.(row);
  };

  const openWindow = (row: T, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Prefer window.onOpen so consumers can hydrate the Edit tab without also
    // opening the side panel (onRowOpen is reserved for row-click → detail).
    if (windowConfig?.onOpen) {
      windowConfig.onOpen(row);
    } else if (!windowConfig?.openOnRowClick) {
      onRowOpen?.(row);
    }
    setWindowRowSnapshot(row);
    setWindowRowId(getRowId(row));
  };

  const closeWindow = () => {
    setWindowRowId(null);
    setWindowRowSnapshot(null);
  };

  const openRow = (row: T) => {
    if (opensWindowOnRowClick) {
      openWindow(row);
      return;
    }
    openDetail(row);
  };

  const clearAllFilters = () => {
    if (controlledQuery) {
      emitControlledQueryChange(
        {
          search: "",
          searchMatchMode: toolbar?.searchMatch?.defaultMode ?? "contains",
          anyOf: "",
          layeredFilters: [],
          columnFilters: {},
        },
        { resetPage: true },
      );
      toolbar?.onSearchChange?.("");
      toolbar?.anyOf?.onChange?.("");
    } else {
      setInternalColumnFilters({});
      setSearchValue("");
      setInternalSearchMatchMode(
        toolbar?.searchMatch?.defaultMode ?? "contains",
      );
      setAnyOfValue("");
      setInternalLayeredFilters([]);
    }
    resetToolbarFacets(toolbar?.facets);
  };

  const commitCell = (rowId: string, field: string, next: unknown) => {
    setEdits((prev) => {
      const rowEdits = { ...(prev[rowId] ?? {}), [field]: next };
      return { ...prev, [rowId]: rowEdits };
    });
  };

  const handleSaveEdits = async () => {
    if (!edit?.onSave || changeCount === 0) return;
    setSaving(true);
    try {
      await edit.onSave(edits, data);
      setEdits({});
      toast.success("Changes saved");
    } catch (e) {
      toast.error(
        `Couldn't save: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdits = () => {
    setEdits({});
    edit?.onCancel?.();
  };

  const showActionsCol = windowEnabled || Boolean(rowActions) || showRowCopy;

  // ── Multi-row selection ───────────────────────────────────────────────────
  // Controlled by the consumer (see MatrxDataTableSelectionConfig). Everything
  // here derives from `selection.selectedIds` — the table keeps no shadow copy
  // that could disagree with the surface after a re-fetch.
  const selectedIdSet = useMemo(
    () => new Set(selection?.selectedIds ?? []),
    [selection?.selectedIds],
  );
  const selectableRows = paginated.filter(
    (row) => selection?.isRowSelectable?.(row) ?? true,
  );
  const selectedOnPage = selectableRows.filter((row) =>
    selectedIdSet.has(getRowId(row)),
  );
  const allOnPageSelected =
    selectableRows.length > 0 &&
    selectedOnPage.length === selectableRows.length;
  const someOnPageSelected = selectedOnPage.length > 0 && !allOnPageSelected;
  const selectedRows = useMemo(
    () => data.filter((row) => selectedIdSet.has(getRowId(row))),
    [data, selectedIdSet, getRowId],
  );
  // Anchor for shift-click range selection — the thing that makes clearing 40
  // rows of noise one gesture instead of forty.
  const lastToggledIndex = useRef<number | null>(null);

  const setSelectedIds = (next: Set<string>) =>
    selection?.onSelectedIdsChange([...next]);

  const toggleRowSelected = (index: number, shiftKey: boolean) => {
    if (!selection) return;
    const row = paginated[index];
    if (!row) return;
    const id = getRowId(row);
    const next = new Set(selectedIdSet);
    const turningOn = !next.has(id);
    const anchor = lastToggledIndex.current;
    const from = shiftKey && anchor !== null ? Math.min(anchor, index) : index;
    const to = shiftKey && anchor !== null ? Math.max(anchor, index) : index;
    for (let i = from; i <= to; i += 1) {
      const target = paginated[i];
      if (!target) continue;
      if (!(selection.isRowSelectable?.(target) ?? true)) continue;
      const targetId = getRowId(target);
      if (turningOn) next.add(targetId);
      else next.delete(targetId);
    }
    lastToggledIndex.current = index;
    setSelectedIds(next);
  };

  const toggleAllOnPage = () => {
    if (!selection) return;
    const next = new Set(selectedIdSet);
    for (const row of selectableRows) {
      const id = getRowId(row);
      if (allOnPageSelected) next.delete(id);
      else next.add(id);
    }
    lastToggledIndex.current = null;
    setSelectedIds(next);
  };

  const selectionNoun = selection?.noun ?? "row";
  const selectionCount = selection?.selectedIds.length ?? 0;
  const leadingCols = selection ? 1 : 0;
  const renderedFacets = controlledQuery
    ? toolbar?.facets?.map((facet) =>
        facet.type === "button-group"
          ? {
              ...facet,
              onChange: (value: string) => {
                facet.onChange(value);
                emitControlledQueryChange({ page: 1 });
              },
            }
          : facet,
      )
    : toolbar?.facets;

  return (
    <div
      ref={rootRef}
      data-url-state-table={urlState?.id}
      className={cn(
        "flex h-full min-h-0 flex-col gap-2 max-lg:[&_button]:min-h-11 max-lg:[&_button]:min-w-11 max-lg:[&_input]:min-h-11 max-lg:[&_table_a]:inline-flex max-lg:[&_table_a]:min-h-11 max-lg:[&_table_a]:items-center",
        className,
      )}
    >
      {/* Toolbar */}
      {(showSearch ||
        toolbar?.anyOf ||
        toolbar?.layeredFilters ||
        (toolbar?.facets && toolbar.facets.length > 0) ||
        toolbar?.leading ||
        toolbar?.actions ||
        hasActiveFilters ||
        showToolbarCopy) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {showSearch ? (
            <div
              className={cn(
                "flex w-full",
                toolbar?.searchMatch ? "max-w-md" : "max-w-xs",
              )}
            >
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder={toolbar?.searchPlaceholder ?? "Search…"}
                  className={cn(
                    "h-8 pl-7 pr-7 text-sm",
                    toolbar?.searchMatch && "rounded-r-none",
                  )}
                  style={{ fontSize: "16px" }}
                />
                {searchValue ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearchValue("")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {toolbar?.searchMatch ? (
                <Button
                  type="button"
                  variant={
                    searchMatchMode === "whole_words" ? "secondary" : "outline"
                  }
                  size="sm"
                  className="h-8 shrink-0 gap-1 rounded-l-none border-l-0 px-2 text-xs"
                  aria-pressed={searchMatchMode === "whole_words"}
                  aria-label={`Search match: ${searchMatchMode === "whole_words" ? "whole words" : "contains text"}`}
                  title={
                    searchMatchMode === "whole_words"
                      ? "Whole words — click to match text anywhere"
                      : "Contains text — click to require whole words"
                  }
                  onClick={() =>
                    setSearchMatchMode(
                      searchMatchMode === "whole_words"
                        ? "contains"
                        : "whole_words",
                    )
                  }
                >
                  <WholeWord className="h-3.5 w-3.5" />
                  {searchMatchMode === "whole_words"
                    ? "Whole words"
                    : "Contains"}
                </Button>
              ) : null}
            </div>
          ) : null}

          {toolbar?.layeredFilters ? (
            <LayeredFilterBuilder
              fields={toolbar.layeredFilters.fields}
              rules={layeredFilters}
              onChange={setLayeredFilters}
              maxRules={toolbar.layeredFilters.maxRules}
              label={toolbar.layeredFilters.label}
            />
          ) : null}

          {toolbar?.anyOf ? (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={anyOfValue}
                onChange={(e) => setAnyOfValue(e.target.value)}
                placeholder={toolbar.anyOf.placeholder ?? "Match any of…"}
                className="h-8 pl-7 pr-7 text-sm"
                style={{ fontSize: "16px" }}
              />
              {anyOfValue ? (
                <button
                  type="button"
                  aria-label="Clear match-any search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setAnyOfValue("")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ) : null}

          {renderedFacets ? <ToolbarFacets facets={renderedFacets} /> : null}
          {toolbar?.leading}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={clearAllFilters}
                title="Clear all filters"
              >
                <Eraser className="h-3.5 w-3.5" />
                Clear all
              </Button>
            ) : null}
            {showToolbarCopy && copy ? (
              <>
                <CopyButtons
                  size="icon"
                  label={copy.listLabel ?? `${copy.label} view`}
                  human={() => buildViewHuman(copy, processed, visibleColumns)}
                  json={() =>
                    processed.map((r) => (copy.agentRow ? copy.agentRow(r) : r))
                  }
                  agent={() =>
                    buildViewAgentInput(copy, processed, data, {
                      search: searchValue,
                      searchMatchMode,
                      anyOf: anyOfValue,
                      filterCount:
                        activeFilterCount +
                        completeLayeredFilterRules(layeredFilters).length,
                      sort: sort ? `${sort.id}:${sort.direction}` : null,
                    })
                  }
                  aiVariants={copy.aiVariants?.(processed, data)}
                  aiCustom={copy.aiCustom?.(processed, data)}
                />
                <ExportMenu
                  label={copy.listLabel ?? `${copy.label} view`}
                  items={[
                    jsonExportItem(
                      () =>
                        processed.map((r) =>
                          copy.agentRow ? copy.agentRow(r) : r,
                        ),
                      "JSON (rows, raw)",
                    ),
                    {
                      id: "csv",
                      label: "CSV (current view)",
                      build: () => ({
                        content: rowsToCsvFromColumns(
                          processed,
                          visibleColumns,
                        ),
                        extension: "csv",
                        mime: "text/csv",
                      }),
                    },
                  ]}
                />
              </>
            ) : null}
            {toolbar?.actions}
          </div>
        </div>
      )}

      {/* Bulk bar — present only while rows are checked, so the toolbar's
          normal actions never compete with a selection that isn't there. */}
      {selection && selectionCount > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
          <span className="text-xs font-medium text-foreground">
            {selectionCount.toLocaleString()} {selectionNoun}
            {selectionCount === 1 ? "" : "s"} selected
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              lastToggledIndex.current = null;
              selection.onSelectedIdsChange([]);
            }}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {selection.actions?.(selectedRows, selection.selectedIds)}
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={updateScrollHint}
          aria-busy={isLoading || isFetching}
          className={cn(
            "relative h-full w-full overflow-auto rounded-md border border-border bg-card",
            tableClassName,
          )}
        >
          {isFetching && !isLoading ? (
            <div
              role="status"
              className="sticky left-0 top-0 z-20 h-0.5 w-full overflow-hidden bg-primary/15"
            >
              <div className="h-full w-full animate-pulse bg-primary" />
              <span className="sr-only">Refreshing table data</span>
            </div>
          ) : null}
          {/* Below `sm` the table sizes to its CONTENT (w-max + max-w-none — a
            global `table { max-width: 100% }` otherwise clamps it and silently
            kills the scroll) so the container scrolls horizontally instead of
            crushing every column into an unreadable wrap. Cells go nowrap and
            the first column freezes (unless `mobile="plain"`), so a row stays
            identifiable while scrolling. Written mobile-first rather than with
            `max-sm:` because a base `w-full` outranks `max-sm:w-max`; `sm:`
            restores the exact desktop rendering.
            The `table` + `overflow-visible` utilities are LOAD-BEARING: a
            globals.css base rule makes every `table` `display:block;
            overflow-x:auto` under 768px, which turns the table into its own
            scroller — the frozen column then sticks to the table's scrollport
            (which itself moves) and never freezes. Utilities outrank the
            `@layer base` rule and restore real table layout. */}
          <table className="table w-max min-w-full max-w-none caption-bottom overflow-visible text-sm sm:w-full sm:min-w-0 sm:max-w-full">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 shadow-[0_1px_0_0_var(--border)] backdrop-blur-sm">
              <tr>
                {selection ? (
                  <th className="h-9 w-9 px-2 text-left align-middle">
                    <Checkbox
                      checked={
                        allOnPageSelected
                          ? true
                          : someOnPageSelected
                            ? "indeterminate"
                            : false
                      }
                      disabled={selectableRows.length === 0}
                      onCheckedChange={toggleAllOnPage}
                      aria-label={
                        allOnPageSelected
                          ? "Clear selection on this page"
                          : "Select every row on this page"
                      }
                    />
                  </th>
                ) : null}
                {visibleColumns.map((col, colIdx) => {
                  const id = columnId(col);
                  const meta = filterMeta.get(id);
                  const isSorted = sort?.id === id;
                  return (
                    <th
                      key={id}
                      aria-sort={
                        isSorted
                          ? sort?.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                      className={cn(
                        "h-9 px-2 text-left align-middle max-sm:whitespace-nowrap",
                        // bg-inherit picks up the thead's translucent bg-muted/90
                        // but NOT its backdrop-filter — re-apply the blur so
                        // scrolled-under header text can't ghost through.
                        mobileScroll &&
                          colIdx === 0 &&
                          "max-sm:sticky max-sm:left-0 max-sm:z-20 max-sm:bg-inherit max-sm:backdrop-blur-sm",
                        // Consumer widths are desktop tuning: applied from `sm`
                        // up via a CSS var, so mobile stays content-sized
                        // (nowrap + a hard width would bleed into the next cell).
                        col.width !== undefined && "sm:w-[var(--matrx-col-w)]",
                        col.headerClassName,
                        col.align === "center" && "text-center",
                        col.align === "right" && "text-right",
                      )}
                      style={columnWidthVar(col.width)}
                    >
                      <ColumnHeaderCell
                        label={col.header}
                        labelText={
                          typeof col.header === "string" ? col.header : id
                        }
                        sortable={col.sortable !== false}
                        isSorted={Boolean(isSorted)}
                        sortDirection={sort?.direction ?? "asc"}
                        onSortAsc={() => setSort({ id, direction: "asc" })}
                        onSortDesc={() => setSort({ id, direction: "desc" })}
                        onClearSort={() => setSort(null)}
                        onHeaderSortClick={() => {
                          if (!isSorted) {
                            setSort({ id, direction: "asc" });
                            return;
                          }
                          if (sort?.direction === "asc") {
                            setSort({ id, direction: "desc" });
                            return;
                          }
                          setSort(null);
                        }}
                        filterKind={meta?.kind ?? null}
                        filterValue={columnFilters[id]}
                        onFilterChange={(next) => setColumnFilter(id, next)}
                        selectOptions={meta?.options}
                        align={col.align}
                      />
                    </th>
                  );
                })}
                {showActionsCol && (
                  <th className="h-9 w-28 px-2 text-right align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-border/60">
                    {selection ? (
                      <td className="px-2 py-2">
                        <Skeleton className="h-3.5 w-3.5" />
                      </td>
                    ) : null}
                    {visibleColumns.map((col) => (
                      <td key={columnId(col)} className="px-2 py-2">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                    {showActionsCol && (
                      <td className="px-2 py-2">
                        <Skeleton className="ml-auto h-5 w-10" />
                      </td>
                    )}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      visibleColumns.length +
                      leadingCols +
                      (showActionsCol ? 1 : 0)
                    }
                    className="px-4 py-12 text-center"
                  >
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                      {emptyState?.icon}
                      <p className="text-sm font-medium text-foreground">
                        {emptyState?.title ?? "No rows"}
                      </p>
                      {emptyState?.description ? (
                        <p className="text-xs text-muted-foreground">
                          {emptyState.description}
                        </p>
                      ) : null}
                      {emptyState?.action}
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((row, index) => {
                  const id = getRowId(row);
                  const isSelected = selectedId === id;
                  const rowEdits = edits[id];
                  const displayRow = applyRowEdits(row, rowEdits);
                  const isChecked = selectedIdSet.has(id);
                  const rowNode = (
                    <tr
                      key={id}
                      data-row-id={id}
                      data-state={isSelected ? "selected" : undefined}
                      onClick={(e) => {
                        // A click that started on a real link (the D112 title
                        // anchor, an FK cell link) must not ALSO fire the
                        // row-open — the anchor owns that navigation.
                        if ((e.target as HTMLElement).closest("a")) return;
                        openRow(row);
                      }}
                      className={cn(
                        // bg-card is a visual no-op (the container is bg-card) but
                        // gives the frozen first cell an OPAQUE background to
                        // inherit, so horizontally-scrolled content never shows
                        // through it. The translucent tints (zebra/hover) would
                        // let it bleed, so they are desktop-only.
                        "border-b border-border/60 bg-card transition-colors",
                        (detailEnabled || Boolean(onRowOpen)) &&
                          "cursor-pointer sm:hover:bg-muted/50",
                        isSelected && "bg-muted",
                        isChecked && "bg-primary/5",
                        zebra &&
                          index % 2 === 1 &&
                          !isSelected &&
                          !isChecked &&
                          "sm:bg-muted/20",
                      )}
                    >
                      {selection ? (
                        <td
                          className="px-2 py-1.5 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isChecked}
                            disabled={
                              !(selection.isRowSelectable?.(row) ?? true)
                            }
                            aria-label={`Select this ${selectionNoun}`}
                            // Radix hands the checkbox's own click through here;
                            // shift-range needs the native event's modifier, so
                            // the row toggles from onClick, not onCheckedChange.
                            onClick={(e) =>
                              toggleRowSelected(index, e.shiftKey)
                            }
                          />
                        </td>
                      ) : null}
                      {visibleColumns.map((col, colIdx) => {
                        const field = col.accessorKey
                          ? String(col.accessorKey)
                          : columnId(col);
                        const display = renderCell(displayRow, col, index);
                        const editable = Boolean(
                          editEnabled &&
                          col.editable &&
                          (col.editableIf?.(row) ?? true),
                        );
                        const dirty = Boolean(rowEdits && field in rowEdits);
                        const cellHref = col.href?.(row) ?? undefined;
                        return (
                          <td
                            key={columnId(col)}
                            className={cn(
                              "px-2 py-1.5 align-middle",
                              // nowrap (NOT truncate — truncate clips the cell and
                              // defeats w-max, killing the horizontal scroll).
                              "max-sm:whitespace-nowrap",
                              mobileScroll &&
                                colIdx === 0 &&
                                "max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-inherit",
                              col.width !== undefined &&
                                "sm:w-[var(--matrx-col-w)] sm:max-w-[var(--matrx-col-w)]",
                              col.className,
                              col.align === "center" && "text-center",
                              col.align === "right" && "text-right",
                            )}
                            style={columnWidthVar(col.width)}
                          >
                            {editable && col.editable ? (
                              <EditableTableCell
                                value={
                                  rowEdits && field in rowEdits
                                    ? rowEdits[field]
                                    : getCellValue(row, col)
                                }
                                editType={col.editable}
                                editOptions={col.editOptions}
                                display={display}
                                dirty={dirty}
                                onCommit={(next) => commitCell(id, field, next)}
                                href={cellHref}
                                editTrigger={col.editTrigger}
                              />
                            ) : cellHref ? (
                              <Link
                                href={cellHref}
                                onClick={(e) => e.stopPropagation()}
                                className="block w-full min-w-0 rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {display}
                              </Link>
                            ) : (
                              display
                            )}
                          </td>
                        );
                      })}
                      {showActionsCol && (
                        <td className="px-2 py-1.5 text-right align-middle">
                          <div
                            className="inline-flex items-center justify-end gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {showRowCopy && copy ? (
                              <CopyButtons
                                size="icon"
                                label={copy.label}
                                human={() => copy.humanRow(displayRow)}
                                json={() =>
                                  copy.agentRow
                                    ? copy.agentRow(displayRow)
                                    : displayRow
                                }
                                agent={() =>
                                  buildRowAgentInput(copy, displayRow)
                                }
                              />
                            ) : null}
                            {rowActions?.(row, {
                              closeDetail: () => setSelectedId(null),
                              openDetail: () => openDetail(row),
                              openWindow: () => openWindow(row),
                              closeWindow,
                            })}
                            {windowEnabled ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                aria-label={
                                  opensWindowOnRowClick
                                    ? "Open in side panel"
                                    : "Open in window"
                                }
                                title={
                                  opensWindowOnRowClick
                                    ? "Open in side panel"
                                    : "Open in window"
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (opensWindowOnRowClick) {
                                    openDetail(row);
                                  } else {
                                    openWindow(row);
                                  }
                                }}
                              >
                                {opensWindowOnRowClick ? (
                                  <PanelRightOpen className="h-3.5 w-3.5" />
                                ) : (
                                  <PanelRight className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                  // The seam that keeps a surface from forking the table for a
                  // right-click menu / drag handle / drop target. The wrapper
                  // must emit the <tr> unchanged (Radix `asChild` does).
                  return rowWrapper ? (
                    <Fragment key={id}>{rowWrapper(row, rowNode)}</Fragment>
                  ) : (
                    rowNode
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile-only scroll affordance: right/left edge fades over the
            scroll container (siblings, so they don't scroll away). The right
            fade carries a chevron until the user reaches the end. Desktop
            (>= sm) never shows them; `mobile="plain"` opts out entirely. */}
        {mobileScroll && scrollHintRight ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-30 flex w-10 items-center justify-end rounded-r-md bg-gradient-to-l from-card via-card/60 to-transparent pr-0.5 sm:hidden"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
          </div>
        ) : null}
      </div>

      {(controlledQuery || defaultPageSize !== 0) && totalItems > 0 ? (
        <div className="shrink-0">
          <GenericTablePagination
            totalItems={totalItems}
            itemsPerPage={effectivePageSize}
            currentPage={safePage}
            onPageChange={setPage}
            onItemsPerPageChange={(n) => {
              setPageSize(n);
              if (!controlledQuery) setPage(1);
            }}
            pageSizeOptions={pageSizeOptions}
            compact
            hideEntriesInfo={false}
          />
        </div>
      ) : null}

      {detailEnabled && selectedRow ? (
        <SidePanelSurface
          // `title` stays a plain string (it is the accessible name), while
          // `titleNode` / `description` carry whatever the caller actually
          // rendered — an `EntityRef` door included. These used to be coerced
          // through string-only resolvers, so a detail config returning JSX had
          // its door silently dropped.
          title={resolveStringTitle(
            detail?.title?.(selectedRow),
            defaultRowTitle(selectedRow, visibleColumns),
          )}
          titleNode={detail?.title?.(selectedRow)}
          description={detail?.description?.(selectedRow)}
          onClose={() => setSelectedId(null)}
          defaultWidth={detail?.defaultWidth ?? 480}
          headerActions={
            <div className="flex items-center gap-1">
              {copy && showRowCopy ? (
                <CopyButtons
                  size="icon"
                  label={copy.label}
                  human={() => copy.humanRow(selectedRow)}
                  json={() =>
                    copy.agentRow ? copy.agentRow(selectedRow) : selectedRow
                  }
                  agent={() => buildRowAgentInput(copy, selectedRow)}
                />
              ) : null}
              {detail?.headerActions?.(selectedRow)}
              {windowEnabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Open in window"
                  title="Open in window"
                  onClick={() => openWindow(selectedRow)}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          }
        >
          {detail?.render?.(selectedRow, {
            closeDetail: () => setSelectedId(null),
            openDetail: () => openDetail(selectedRow),
            openWindow: () => openWindow(selectedRow),
            closeWindow,
          }) ?? (
            <DataRowInspector
              row={selectedRow}
              recordKind={copy?.rowKind}
              recordLabel={copy?.label}
              location={copy?.location}
              tokenForField={detail?.tokenForField}
            />
          )}
        </SidePanelSurface>
      ) : null}

      {windowRow ? (
        <DataRowWindow
          isOpen
          onClose={closeWindow}
          title={
            windowConfig?.title?.(windowRow) ??
            defaultRowTitle(windowRow, visibleColumns)
          }
          row={windowRow}
          width={windowConfig?.width}
          height={windowConfig?.height}
          windowId={`matrx-data-row-${urlState?.id ?? "local"}-${getRowId(windowRow)}`}
          defaultTab={windowConfig?.defaultTab}
          headerActions={
            <div className="flex items-center gap-1">
              {opensWindowOnRowClick && detailEnabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Open in side panel"
                  title="Open in side panel"
                  onClick={() => {
                    closeWindow();
                    openDetail(windowRow);
                  }}
                >
                  <PanelRightOpen className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {copy ? (
                <CopyButtons
                  size="icon"
                  label={copy.label}
                  human={() => copy.humanRow(windowRow)}
                  json={() =>
                    copy.agentRow ? copy.agentRow(windowRow) : windowRow
                  }
                  agent={() => buildRowAgentInput(copy, windowRow)}
                />
              ) : null}
            </div>
          }
          viewContent={
            windowConfig?.renderView?.(windowRow, {
              closeDetail: () => setSelectedId(null),
              openDetail: () => openDetail(windowRow),
              openWindow: () => openWindow(windowRow),
              closeWindow,
            }) ??
            (copy ? (
              <DataRowInspector
                row={windowRow}
                recordKind={copy.rowKind}
                recordLabel={copy.label}
                location={copy.location}
                tokenForField={detail?.tokenForField}
              />
            ) : undefined)
          }
          editContent={
            windowConfig?.renderEdit === false
              ? undefined
              : windowConfig?.renderEdit
                ? windowConfig.renderEdit(windowRow, {
                    closeDetail: () => setSelectedId(null),
                    openDetail: () => openDetail(windowRow),
                    openWindow: () => openWindow(windowRow),
                    closeWindow,
                  })
                : detail?.render?.(windowRow, {
                    closeDetail: () => setSelectedId(null),
                    openDetail: () => openDetail(windowRow),
                    openWindow: () => openWindow(windowRow),
                    closeWindow,
                  })
          }
        >
          {windowConfig?.render?.(windowRow, {
            closeDetail: () => setSelectedId(null),
            openDetail: () => openDetail(windowRow),
            openWindow: () => openWindow(windowRow),
            closeWindow,
          })}
        </DataRowWindow>
      ) : null}

      {editEnabled ? (
        <DirtySavePill
          changeCount={changeCount}
          saving={saving}
          onSave={() => void handleSaveEdits()}
          onCancel={handleCancelEdits}
        />
      ) : null}
    </div>
  );
}

/**
 * Consumer column widths apply ONLY from `sm` up (via the paired
 * `sm:w-[var(--matrx-col-w)]` utilities) — below `sm` the table is
 * content-sized, and a hard width plus nowrap would bleed text across cells.
 */
function columnWidthVar(
  width: string | number | undefined,
): CSSProperties | undefined {
  if (width === undefined) return undefined;
  return {
    "--matrx-col-w": typeof width === "number" ? `${width}px` : width,
  } as CSSProperties;
}

function renderCell<T>(
  row: T,
  col: MatrxColumnDef<T>,
  index: number,
): ReactNode {
  if (col.cell) return col.cell(row, index);

  const raw = getCellValue(row, col);
  const kind = col.cellKind ?? "auto";
  const asUuid =
    kind === "uuid" || kind === "fk" || (kind === "auto" && isUuidValue(raw));

  if (asUuid && typeof raw === "string") {
    const forbidden =
      typeof col.fk?.forbidden === "function"
        ? col.fk.forbidden(raw, row)
        : Boolean(col.fk?.forbidden);
    const declaredToken =
      typeof col.fk?.token === "function" ? col.fk.token(row) : col.fk?.token;
    return (
      <MatrxUuidCell
        value={raw}
        label={
          col.fk?.label ??
          (typeof col.header === "string" ? col.header : col.id)
        }
        forbidden={forbidden}
        // `token: "auto"` opts INTO the column-name guess. It is opt-in, not
        // the default, because the guess is only safe when the author has
        // checked the FK: `scheduler.sch_run.task_id` points at
        // `scheduler.sch_task`, not the workspace `task` the name implies, and
        // `app_id` / `conversation_id` / `file_id` / `workflow_id` each have
        // several candidate tables. A wrong door sends the user to a different
        // record and is worse than no door at all.
        token={
          declaredToken === "auto"
            ? tokenFromColumnName(col.id ?? col.accessorKey ?? "")
            : declaredToken
        }
        href={col.fk?.href?.(raw, row)}
        onOpen={
          col.fk?.onOpen
            ? (id) => {
                col.fk?.onOpen?.(id, row);
              }
            : undefined
        }
      />
    );
  }

  return (
    <span className="text-sm text-foreground">
      {stringifyCellValue(raw) || "—"}
    </span>
  );
}

function defaultRowTitle<T>(row: T, columns: MatrxColumnDef<T>[]): string {
  for (const col of columns) {
    const v = getCellValue(row, col);
    if (typeof v === "string" && v.trim()) return v;
  }
  return "Details";
}

function resolveStringTitle(
  title: ReactNode | undefined,
  fallback: string,
): string {
  if (typeof title === "string" && title.trim()) return title;
  if (typeof title === "number") return String(title);
  return fallback;
}

export default MatrxDataTable;
