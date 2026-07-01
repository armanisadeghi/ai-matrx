"use client";

/**
 * features/administration/canonicalization/components/AdminAuditTable.tsx
 *
 * Dense, virtualized admin data grid for the `audit.*` snapshot views:
 * sticky header, per-column sort + filter (text/enum/number/date), a
 * global search box, CSV export, and no row-count truncation — every row
 * the query returns is filterable/sortable/exportable. Built as a
 * CSS-grid (not a native <table>) so header + body columns stay pixel-
 * aligned while `@tanstack/react-virtual` only mounts visible rows.
 *
 * Reuses the kg-inspector column-filter primitives (tableFilters.ts,
 * KgInspectorColumnHeader) rather than reimplementing sort/filter logic.
 */

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Download, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  KgInspectorColumnHeader,
  KgSortIcon,
} from "@/features/administration/kg-inspector/components/KgInspectorColumnHeader";
import { ValueListFilterPopover } from "@/features/administration/kg-inspector/components/ValueListFilterPopover";
import {
  applyColumnFilters,
  isColumnFilterActive,
  sortRows,
  toggleSort,
  type ColumnDef,
  type ColumnFilter,
  type ColumnFilterType,
  type SortDirection,
} from "@/features/administration/kg-inspector/utils/tableFilters";
import { exportRowsAsCsv } from "../utils/exportCsv";

/** Value-list dropdowns render every option in the DOM — cap how many a text column may offer. */
const MAX_TEXT_FILTER_OPTIONS = 300;

export interface AuditColumnDef<T> {
  key: string;
  label: string;
  type: ColumnFilterType;
  getValue: (row: T) => string | number | null | undefined;
  /** Custom cell renderer — overrides the default truncated text cell. */
  render?: (row: T) => React.ReactNode;
  /** CSS grid track size, e.g. "160px" or "minmax(240px,1fr)". Default "160px". */
  width?: string;
  align?: "left" | "right";
  monospace?: boolean;
  /** Adds a copy-to-clipboard affordance on hover. */
  copyable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  /**
   * Opt a `text` column OUT of the auto value-list dropdown — for columns
   * that are effectively free text / near-unique per row (`detail`,
   * `message`, `signature`, …) where a checkbox list of every distinct
   * value wouldn't be useful. Bounded text columns (schema, table, token,
   * function name, …) get the dropdown automatically.
   */
  noValueList?: boolean;
}

/**
 * Merges a partial patch into a column's `ColumnFilter`, keeping the free
 * substring (`text`) and the exact-value checklist (`enumValues`) — set by
 * the value-list dropdown — independent of each other. Drops the filter
 * entirely once both are empty so the column filter map stays clean.
 */
function mergeTextFilter(
  prev: ColumnFilter | undefined,
  patch: Partial<ColumnFilter>,
): ColumnFilter | undefined {
  const next: ColumnFilter = { ...(prev ?? {}), ...patch };
  const hasText = Boolean(next.text?.trim());
  const hasValues =
    Array.isArray(next.enumValues) && next.enumValues.length > 0;
  if (!hasText) delete next.text;
  if (!hasValues) delete next.enumValues;
  return hasText || hasValues ? next : undefined;
}

function HeaderCell<T>({
  col,
  sortKey,
  sortDir,
  onSort,
  columnFilter,
  onColumnFilterChange,
  enumOptions,
  textValueOptions,
}: {
  col: AuditColumnDef<T>;
  sortKey: string;
  sortDir: SortDirection;
  onSort: (key: string) => void;
  columnFilter: ColumnFilter | undefined;
  onColumnFilterChange: (value: ColumnFilter | undefined) => void;
  enumOptions: string[];
  textValueOptions: string[] | undefined;
}) {
  const sortable = col.sortable !== false;
  const filterable = col.filterable !== false;

  if (col.type === "enum") {
    return (
      <div
        className={cn(
          "flex items-center gap-1",
          col.align === "right" && "justify-end",
        )}
      >
        <span
          className={cn(
            "font-semibold",
            sortable && "cursor-pointer select-none hover:text-primary",
          )}
          onClick={() => sortable && onSort(col.key)}
        >
          {col.label}
        </span>
        {sortable ? (
          <KgSortIcon active={sortKey === col.key} dir={sortDir} />
        ) : null}
        {filterable ? (
          <ValueListFilterPopover
            label={col.label}
            options={enumOptions}
            selected={columnFilter?.enumValues}
            onApply={(values) =>
              onColumnFilterChange(
                values && values.length ? { enumValues: values } : undefined,
              )
            }
          />
        ) : null}
      </div>
    );
  }

  return (
    <KgInspectorColumnHeader
      label={col.label}
      sortKey={col.key}
      activeSortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      align={col.align}
      sortable={sortable}
      filterable={filterable}
      filterType={col.type}
      textValue={col.type === "text" ? (columnFilter?.text ?? "") : undefined}
      onTextChange={
        col.type === "text"
          ? (text) =>
              onColumnFilterChange(mergeTextFilter(columnFilter, { text }))
          : undefined
      }
      valueOptions={col.type === "text" ? textValueOptions : undefined}
      selectedValues={
        col.type === "text" ? columnFilter?.enumValues : undefined
      }
      onValueListChange={
        col.type === "text"
          ? (values) =>
              onColumnFilterChange(
                mergeTextFilter(columnFilter, { enumValues: values ?? [] }),
              )
          : undefined
      }
      columnFilter={col.type !== "text" ? columnFilter : undefined}
      onColumnFilterChange={
        col.type !== "text" ? onColumnFilterChange : undefined
      }
    />
  );
}

function Cell<T>({ col, row }: { col: AuditColumnDef<T>; row: T }) {
  if (col.render) return <>{col.render(row)}</>;

  const value = col.getValue(row);
  const display = value == null || value === "" ? "—" : String(value);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span
        className={cn("truncate", col.monospace && "font-mono")}
        title={display}
      >
        {display}
      </span>
      {col.copyable && display !== "—" ? (
        <button
          type="button"
          className="shrink-0 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-40"
          title="Copy"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(display);
            toast.success("Copied to clipboard");
          }}
        >
          <Copy className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

export interface AdminAuditTableProps<T> {
  rows: T[];
  columns: AuditColumnDef<T>[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /** Filename for the CSV export button. Omit to hide the button. */
  csvFilename?: string;
  defaultSort?: { key: string; dir: SortDirection };
  /** Extra controls rendered in the toolbar (e.g. FAIL/WARN preset chips). */
  toolbarExtra?: React.ReactNode;
  rowHeight?: number;
  /** Seeds column filters on mount — e.g. a "FAIL only" deep link from Overview. */
  initialColumnFilters?: Record<string, ColumnFilter>;
  /** Seeds the global search box on mount. */
  initialSearch?: string;
}

const DEFAULT_ROW_HEIGHT = 34;

export function AdminAuditTable<T>({
  rows,
  columns,
  loading = false,
  emptyMessage = "No rows.",
  onRowClick,
  csvFilename,
  defaultSort,
  toolbarExtra,
  rowHeight = DEFAULT_ROW_HEIGHT,
  initialColumnFilters,
  initialSearch,
}: AdminAuditTableProps<T>) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >(initialColumnFilters ?? {});
  const [sortKey, setSortKey] = useState(
    defaultSort?.key ?? columns[0]?.key ?? "",
  );
  const [sortDir, setSortDir] = useState<SortDirection>(
    defaultSort?.dir ?? "asc",
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  const colDefs: ColumnDef<T>[] = useMemo(
    () =>
      columns.map((c) => ({ key: c.key, type: c.type, getValue: c.getValue })),
    [columns],
  );

  const enumOptionsByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      if (col.type !== "enum") continue;
      const set = new Set<string>();
      for (const row of rows) {
        const v = col.getValue(row);
        if (v != null && String(v) !== "") set.add(String(v));
      }
      map[col.key] = Array.from(set).sort();
    }
    return map;
  }, [rows, columns]);

  /**
   * Bounded `text` columns (schema, table, token, function name, …) get the
   * same value-list dropdown as enum columns, computed from the currently
   * loaded dataset. Columns flagged `noValueList` (free text like `detail`
   * or `message`) or whose distinct count blows past the render cap are
   * skipped — the free substring input is still always available for those.
   */
  const textValueOptionsByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      if (col.type !== "text" || col.filterable === false || col.noValueList)
        continue;
      const set = new Set<string>();
      let overflowed = false;
      for (const row of rows) {
        const v = col.getValue(row);
        if (v != null && String(v) !== "") set.add(String(v));
        if (set.size > MAX_TEXT_FILTER_OPTIONS) {
          overflowed = true;
          break;
        }
      }
      if (!overflowed && set.size > 0) {
        map[col.key] = Array.from(set).sort();
      }
    }
    return map;
  }, [rows, columns]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => {
        const v = col.getValue(row);
        return v != null && String(v).toLowerCase().includes(q);
      }),
    );
  }, [rows, columns, search]);

  const filtered = useMemo(
    () => applyColumnFilters(searched, colDefs, columnFilters),
    [searched, colDefs, columnFilters],
  );

  const processed = useMemo(
    () => sortRows(filtered, colDefs, sortKey, sortDir),
    [filtered, colDefs, sortKey, sortDir],
  );

  const handleSort = (key: string) => {
    const next = toggleSort(sortKey, sortDir, key);
    setSortKey(next.sortKey);
    setSortDir(next.sortDir);
  };

  const setColumnFilter = (key: string, value: ColumnFilter | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  const hasActiveFilters =
    search.trim().length > 0 ||
    columns.some((col) =>
      isColumnFilterActive(columnFilters[col.key], col.type),
    );

  const clearAllFilters = () => {
    setSearch("");
    setColumnFilters({});
  };

  const gridTemplateColumns = columns.map((c) => c.width ?? "160px").join(" ");

  const virtualizer = useVirtualizer({
    count: processed.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const handleExport = () => {
    if (!csvFilename) return;
    exportRowsAsCsv(csvFilename, processed, columns);
    toast.success(`Exported ${processed.length} row(s)`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search all columns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-base"
          />
        </div>
        {toolbarExtra}
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          Showing {processed.length} of {rows.length}
        </span>
        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={clearAllFilters}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Clear filters
          </Button>
        ) : null}
        {csvFilename ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleExport}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ minWidth: "fit-content" }}>
          <div
            className="sticky top-0 z-10 grid border-b border-border bg-card text-xs shadow-sm"
            style={{ gridTemplateColumns }}
          >
            {columns.map((col) => (
              <div
                key={col.key}
                className={cn(
                  "flex items-center overflow-hidden border-r border-border/60 px-2 py-1.5 last:border-r-0",
                  col.align === "right" && "justify-end",
                )}
              >
                <HeaderCell
                  col={col}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  columnFilter={columnFilters[col.key]}
                  onColumnFilterChange={(v) => setColumnFilter(col.key, v)}
                  enumOptions={enumOptionsByColumn[col.key] ?? []}
                  textValueOptions={textValueOptionsByColumn[col.key]}
                />
              </div>
            ))}
          </div>

          {loading ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : processed.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const row = processed[vi.index];
                return (
                  <div
                    key={vi.key}
                    className={cn(
                      "group absolute left-0 top-0 grid w-full border-b border-border/60 text-xs hover:bg-muted/40",
                      onRowClick && "cursor-pointer",
                    )}
                    style={{
                      gridTemplateColumns,
                      transform: `translateY(${vi.start}px)`,
                      height: vi.size,
                    }}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <div
                        key={col.key}
                        className={cn(
                          "flex min-w-0 items-center overflow-hidden border-r border-border/40 px-2 py-1.5",
                          col.align === "right" && "justify-end",
                        )}
                      >
                        <Cell col={col} row={row} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
