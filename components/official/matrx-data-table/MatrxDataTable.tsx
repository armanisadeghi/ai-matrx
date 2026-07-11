"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PanelRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import GenericTablePagination from "@/components/generic-table/GenericTablePagination";
import { cn } from "@/lib/utils";
import { ColumnHeaderCell } from "./ColumnHeaderCell";
import { DataRowInspector } from "./DataRowInspector";
import DataRowWindow from "./DataRowWindow.dynamic";
import { ToolbarFacets } from "./ToolbarFacets";
import {
  collectSelectOptions,
  resolveFilterKind,
  type ResolvedFilterKind,
} from "./infer-filter";
import {
  columnId,
  countActiveColumnFilters,
  filterAndSortRows,
  getCellValue,
  stringifyCellValue,
} from "./filter-engine";
import type {
  ColumnFiltersState,
  MatrxColumnDef,
  MatrxDataTableProps,
  SortState,
} from "./types";

/**
 * MatrxDataTable — the official canonical data table.
 *
 * Sticky headers · every column sortable + filterable · toolbar facets
 * (button groups today; radios/switches later) · row → SidePanelSurface
 * (MatrxDynamicPanelHost) · panel icon → WindowPanel (custom ReactNode ok).
 */
export function MatrxDataTable<T>({
  data,
  columns,
  getRowId,
  isLoading = false,
  toolbar,
  detail,
  window: windowConfig,
  selectedId: controlledSelectedId,
  onSelectedIdChange,
  rowActions,
  emptyState,
  pageSize: defaultPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  zebra = true,
  className,
  tableClassName,
  onRowOpen,
}: MatrxDataTableProps<T>) {
  const [internalSearch, setInternalSearch] = useState("");
  const searchControlled = toolbar?.searchValue !== undefined;
  const searchValue = searchControlled
    ? (toolbar?.searchValue ?? "")
    : internalSearch;
  const setSearchValue = (v: string) => {
    if (!searchControlled) setInternalSearch(v);
    toolbar?.onSearchChange?.(v);
  };

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>({});
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    defaultPageSize === 0 ? Math.max(data.length, 1) : defaultPageSize,
  );

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

  const [windowRowId, setWindowRowId] = useState<string | null>(null);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.hidden),
    [columns],
  );

  const filterMeta = useMemo(() => {
    const meta = new Map<
      string,
      {
        kind: ResolvedFilterKind | null;
        options: Array<{ value: string; label: string }>;
      }
    >();
    for (const col of visibleColumns) {
      const id = columnId(col);
      const kind = resolveFilterKind(col, data);
      meta.set(id, {
        kind,
        options: kind === "select" ? collectSelectOptions(col, data) : [],
      });
    }
    return meta;
  }, [visibleColumns, data]);

  const processed = useMemo(
    () =>
      filterAndSortRows(
        data,
        visibleColumns,
        columnFilters,
        sort,
        toolbar?.search === false ? "" : searchValue,
      ),
    [data, visibleColumns, columnFilters, sort, searchValue, toolbar?.search],
  );

  useEffect(() => {
    setPage(1);
  }, [searchValue, columnFilters, sort, pageSize]);

  const totalItems = processed.length;
  const effectivePageSize =
    defaultPageSize === 0 ? Math.max(totalItems, 1) : pageSize;
  const pageCount = Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const safePage = Math.min(page, pageCount);
  const paginated = useMemo(() => {
    if (defaultPageSize === 0) return processed;
    const start = (safePage - 1) * effectivePageSize;
    return processed.slice(start, start + effectivePageSize);
  }, [processed, safePage, effectivePageSize, defaultPageSize]);

  const selectedRow = useMemo(() => {
    if (!selectedId) return null;
    return data.find((r) => getRowId(r) === selectedId) ?? null;
  }, [data, selectedId, getRowId]);

  const windowRow = useMemo(() => {
    if (!windowRowId) return null;
    return data.find((r) => getRowId(r) === windowRowId) ?? null;
  }, [data, windowRowId, getRowId]);

  const detailEnabled = detail?.enabled !== false;
  const windowEnabled =
    windowConfig?.enabled !== false && (detailEnabled || Boolean(windowConfig));

  const activeFilterCount = countActiveColumnFilters(columnFilters);
  const showSearch = toolbar?.search !== false;

  const openDetail = (row: T) => {
    if (!detailEnabled) {
      onRowOpen?.(row);
      return;
    }
    const id = getRowId(row);
    setSelectedId(id);
    onRowOpen?.(row);
  };

  const openWindow = (row: T, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setWindowRowId(getRowId(row));
  };

  const clearAllFilters = () => {
    setColumnFilters({});
    setSearchValue("");
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-2", className)}>
      {/* Toolbar */}
      {(showSearch ||
        (toolbar?.facets && toolbar.facets.length > 0) ||
        toolbar?.leading ||
        toolbar?.actions ||
        activeFilterCount > 0) && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {showSearch ? (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder={toolbar?.searchPlaceholder ?? "Search…"}
                className="h-8 pl-7 pr-7 text-sm"
                style={{ fontSize: "16px" }}
              />
              {searchValue ? (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchValue("")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ) : null}

          {toolbar?.facets ? <ToolbarFacets facets={toolbar.facets} /> : null}
          {toolbar?.leading}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {activeFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={clearAllFilters}
              >
                Clear filters ({activeFilterCount})
              </Button>
            ) : null}
            {toolbar?.actions}
          </div>
        </div>
      )}

      {/* Table */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card",
          tableClassName,
        )}
      >
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-card shadow-[0_1px_0_0_var(--border)]">
            <tr>
              {visibleColumns.map((col) => {
                const id = columnId(col);
                const meta = filterMeta.get(id);
                const isSorted = sort?.id === id;
                return (
                  <th
                    key={id}
                    className={cn(
                      "h-9 px-2 text-left align-middle",
                      col.headerClassName,
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right",
                    )}
                    style={
                      col.width !== undefined
                        ? {
                            width:
                              typeof col.width === "number"
                                ? `${col.width}px`
                                : col.width,
                          }
                        : undefined
                    }
                  >
                    <ColumnHeaderCell
                      label={col.header}
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
                      onFilterChange={(next) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          [id]: next,
                        }))
                      }
                      selectOptions={meta?.options}
                      align={col.align}
                    />
                  </th>
                );
              })}
              {(windowEnabled || rowActions) && (
                <th className="h-9 w-20 px-2 text-right align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-border/60">
                  {visibleColumns.map((col) => (
                    <td key={columnId(col)} className="px-2 py-2">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                  {(windowEnabled || rowActions) && (
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
                    (windowEnabled || rowActions ? 1 : 0)
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
                return (
                  <tr
                    key={id}
                    data-state={isSelected ? "selected" : undefined}
                    onClick={() => openDetail(row)}
                    className={cn(
                      "border-b border-border/60 transition-colors",
                      detailEnabled && "cursor-pointer hover:bg-muted/50",
                      isSelected && "bg-muted",
                      zebra && index % 2 === 1 && !isSelected && "bg-muted/20",
                    )}
                  >
                    {visibleColumns.map((col) => (
                      <td
                        key={columnId(col)}
                        className={cn(
                          "px-2 py-1.5 align-middle",
                          col.className,
                          col.align === "center" && "text-center",
                          col.align === "right" && "text-right",
                        )}
                      >
                        {renderCell(row, col, index)}
                      </td>
                    ))}
                    {(windowEnabled || rowActions) && (
                      <td className="px-2 py-1.5 text-right align-middle">
                        <div
                          className="inline-flex items-center justify-end gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {rowActions?.(row)}
                          {windowEnabled ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              title="Open in window"
                              onClick={(e) => openWindow(row, e)}
                            >
                              <PanelRight className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {defaultPageSize !== 0 && totalItems > 0 ? (
        <div className="shrink-0">
          <GenericTablePagination
            totalItems={totalItems}
            itemsPerPage={effectivePageSize}
            currentPage={safePage}
            onPageChange={setPage}
            onItemsPerPageChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            pageSizeOptions={pageSizeOptions}
            compact
            hideEntriesInfo={false}
          />
        </div>
      ) : null}

      {/* Side panel — canonical MatrxDynamicPanelHost via SidePanelSurface */}
      {detailEnabled && selectedRow ? (
        <SidePanelSurface
          title={resolveStringTitle(
            detail?.title?.(selectedRow),
            defaultRowTitle(selectedRow, visibleColumns),
          )}
          description={resolveOptionalString(
            detail?.description?.(selectedRow),
          )}
          onClose={() => setSelectedId(null)}
          defaultWidth={detail?.defaultWidth ?? 480}
          headerActions={
            <div className="flex items-center gap-1">
              {detail?.headerActions?.(selectedRow)}
              {windowEnabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Open in window"
                  onClick={() => openWindow(selectedRow)}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          }
        >
          {detail?.render?.(selectedRow) ?? (
            <DataRowInspector row={selectedRow} />
          )}
        </SidePanelSurface>
      ) : null}

      {/* WindowPanel — lazy, page-local, custom ReactNode supported */}
      {windowRow ? (
        <DataRowWindow
          isOpen
          onClose={() => setWindowRowId(null)}
          title={
            windowConfig?.title?.(windowRow) ??
            defaultRowTitle(windowRow, visibleColumns)
          }
          row={windowRow}
          width={windowConfig?.width}
          height={windowConfig?.height}
          windowId={`matrx-data-row-${getRowId(windowRow)}`}
        >
          {windowConfig?.render?.(windowRow)}
        </DataRowWindow>
      ) : null}
    </div>
  );
}

function renderCell<T>(
  row: T,
  col: MatrxColumnDef<T>,
  index: number,
): ReactNode {
  if (col.cell) return col.cell(row, index);
  return (
    <span className="text-sm text-foreground">
      {stringifyCellValue(getCellValue(row, col)) || "—"}
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

function resolveOptionalString(
  value: ReactNode | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

export default MatrxDataTable;
