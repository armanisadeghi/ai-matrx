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

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Download, Search, X } from "lucide-react";
import { toast } from "@/lib/toast";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Skeleton } from "@ai-matrx/design-system";
import GenericTablePagination from "@ai-matrx/design-system/data-table/pagination";
import { cn } from "@/lib/utils";
import { ReadFailure } from "@ai-matrx/design-system";

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
import {
  enumUrlCodec,
  jsonUrlCodec,
  stringUrlCodec,
  useUrlState,
} from "@ai-matrx/kit/url-state";
import { exportRowsAsCsv } from "../utils/exportCsv";
import {
  auditRowToAgentInput,
  auditRowsToAgentInput,
  type AuditTableCopyForAi,
} from "../utils/aiExport";
import { formatCount } from "@ai-matrx/kit/format";

export type { AuditTableCopyForAi };

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
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  if (col.render) return <>{col.render(row)}</>;

  const value = col.getValue(row);
  const display = value == null || value === "" ? "—" : String(value);

  return (
    <div className="matrx-touch-targets flex min-w-0 items-center gap-1">
      <span
        className={cn("truncate", col.monospace && "font-mono")}
        title={display}
      >
        {display}
      </span>
      {col.copyable && display !== "—" ? (
        <button
          type="button"
          className="shrink-0 opacity-100 transition-opacity sm:[@media(hover:hover)]:opacity-0 sm:[@media(hover:hover)]:group-hover:opacity-40 sm:[@media(hover:hover)]:hover:opacity-100 focus-visible:opacity-100"
          title="Copy"
          onClick={(e) => {
            e.stopPropagation();
            void copyText(display, "Copied to clipboard");
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
  /**
   * The failure of the read behind `rows` (the parent hook's `error`). When
   * set, the body shows the failure instead of `emptyMessage` and the footer
   * never reports "0 loaded" — a count from a failed read is a lie.
   */
  error?: unknown;
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
  /** Copy + Copy for AI — toolbar (all visible rows) + per-row icon pair. */
  copyForAi?: AuditTableCopyForAi<T>;
  /** Optional namespace when a page hosts more than one audit table. */
  urlStateKey?: string;
}

const DEFAULT_ROW_HEIGHT = 34;

export function AdminAuditTable<T>({
  rows,
  columns,
  loading = false,
  error = null,
  emptyMessage = "No rows.",
  onRowClick,
  csvFilename,
  defaultSort,
  toolbarExtra,
  rowHeight = DEFAULT_ROW_HEIGHT,
  initialColumnFilters,
  initialSearch,
  copyForAi,
  urlStateKey,
}: AdminAuditTableProps<T>) {
  const param = (name: string) =>
    urlStateKey ? `${urlStateKey}.${name}` : name;
  const [search, setSearch] = useUrlState(
    param("q"),
    stringUrlCodec(initialSearch ?? ""),
  );
  const [columnFilters, setColumnFilters] = useUrlState(
    param("f"),
    jsonUrlCodec<Record<string, ColumnFilter>>(
      initialColumnFilters ?? {},
      (value): value is Record<string, ColumnFilter> =>
        Boolean(value) && typeof value === "object" && !Array.isArray(value),
    ),
  );
  const [sortKey, setSortKey] = useUrlState(
    param("sort"),
    stringUrlCodec(defaultSort?.key ?? columns[0]?.key ?? ""),
  );
  const [sortDir, setSortDir] = useUrlState(
    param("dir"),
    enumUrlCodec<SortDirection>(["asc", "desc"], defaultSort?.dir ?? "asc"),
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
    const next = { ...columnFilters };
    if (value) next[key] = value;
    else delete next[key];
    setColumnFilters(next);
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

  const gridTemplateColumns = [
    ...columns.map((c) => c.width ?? "160px"),
    copyForAi ? "52px" : null,
  ]
    .filter(Boolean)
    .join(" ");

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
          <Input adornment="start"
            placeholder="Search all columns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {toolbarExtra}
        {hasActiveFilters ? (
          <Button
            icon={<X />}
            variant="quiet"
            onClick={clearAllFilters}
          > Clear filters
          </Button>
        ) : null}
        {csvFilename ? (
          <Button
            icon={<Download />}
            variant="outline"
            onClick={handleExport}
          > Export CSV
          </Button>
        ) : null}
        {copyForAi && processed.length > 0 ? (
          <CopyButtons
            size="sm"
            label={copyForAi.listLabel}
            human={() =>
              processed.map((row) => copyForAi.humanRow(row)).join("\n\n")
            }
            agent={() =>
              auditRowsToAgentInput(copyForAi, processed, rows, {
                search: search.trim() || undefined,
                filtered: hasActiveFilters ? "yes" : "no",
              })
            }
          />
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
            {copyForAi ? (
              <div className="flex items-center justify-center border-r border-border/60 px-1 py-1.5 text-xs font-semibold last:border-r-0">
                Copy
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : error ? (
            <ReadFailure error={error} what="these rows" />
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
                    {copyForAi ? (
                      <div
                        className="flex items-center justify-center border-r border-border/40 px-1 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CopyButtons
                          size="icon"
                          label={copyForAi.label}
                          human={() => copyForAi.humanRow(row)}
                          agent={() => auditRowToAgentInput(copyForAi, row)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-border bg-card p-0">
        <GenericTablePagination
          totalItems={processed.length}
          // This table virtualizes every processed row. Pagination controls
          // remain as a stable, disabled receipt rather than slicing rows.
          itemsPerPage={0}
          currentPage={1}
          onPageChange={() => undefined}
          onItemsPerPageChange={() => undefined}
          pageSizeOptions={[]}
          allValue={0}
          allOptionLabel="All loaded"
          compact
          layoutType="grid"
          containerClassName="border-t-0 pt-0"
          countUnavailable={
            loading ? "loading" : error ? "failed" : undefined
          }
          labelFormat={(_start, _end, total) =>
            `${formatCount(total)} shown / ${formatCount(rows.length)} loaded`
          }
        />
      </div>
    </div>
  );
}
