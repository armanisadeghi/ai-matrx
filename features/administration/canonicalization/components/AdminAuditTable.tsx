"use client";

/**
 * features/administration/canonicalization/components/AdminAuditTable.tsx
 *
 * The admin grid for the `audit.*` snapshot views, on the shared MatrxDataTable
 * (sort / filter / search / copy / export / row inspector all come from the
 * package). This file only maps the audit column vocabulary (`AuditColumnDef`)
 * and the page props (deep-link seeds, per-row copy-for-AI, toolbar extras) onto
 * it, so the nine consuming pages keep their API.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useMemo } from "react";
import { Copy } from "lucide-react";
import {
  MatrxDataTable,
  type ColumnFiltersState,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";

import type {
  ColumnFilter,
  ColumnFilterType,
  SortDirection,
} from "@/features/administration/kg-inspector/utils/tableFilters";
import {
  auditRowToAgentInput,
  type AuditTableCopyForAi,
} from "../utils/aiExport";

export type { AuditTableCopyForAi };

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

function Cell<T>({ col, row }: { col: AuditColumnDef<T>; row: T }) {
  const { copyText } = useClipboard({
    notify: copyNotify,
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

const DEFAULT_COLUMN_WIDTH = 160;

/** `"160px"` or `"minmax(240px,1fr)"` (the old grid track) -> the table's pixel width. */
function trackToWidth(track: string | undefined): number {
  const match = track?.match(/(\d+(?:\.\d+)?)px/);
  return match ? Number(match[1]) : DEFAULT_COLUMN_WIDTH;
}

/** The audit filter shape a page seeds from a deep link -> the table's filter value. */
function toTableFilters(
  seeds: Record<string, ColumnFilter> | undefined,
): ColumnFiltersState | undefined {
  if (!seeds) return undefined;
  const out: ColumnFiltersState = {};
  for (const [key, f] of Object.entries(seeds)) {
    if (f.enumValues && f.enumValues.length > 0) {
      out[key] = {
        kind: "select",
        value: f.enumValues[0] ?? "",
        values: f.enumValues,
      };
    } else if (f.text?.trim()) {
      out[key] = { kind: "text", value: f.text };
    } else if (f.numMin != null || f.numMax != null) {
      out[key] = {
        kind: "number",
        min: f.numMin ?? undefined,
        max: f.numMax ?? undefined,
      };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function tableIdFor(urlStateKey?: string, csvFilename?: string): string {
  const raw = urlStateKey
    ? `audit-${urlStateKey}`
    : (csvFilename ?? "audit-table").replace(/\.csv$/i, "");
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return /^[a-z]/.test(slug) ? slug : `audit-${slug}`.slice(0, 64);
}

const FILTER_KIND: Record<
  ColumnFilterType,
  NonNullable<MatrxColumnDef<unknown>["filter"]>
> = {
  text: "auto",
  enum: "select",
  number: "number",
  date: "date",
};

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
  initialColumnFilters,
  initialSearch,
  copyForAi,
  urlStateKey,
}: AdminAuditTableProps<T>) {
  const tableId = tableIdFor(urlStateKey, csvFilename);

  // Audit rows carry no id of their own; identity of the row object is the key.
  const rowIds = useMemo(() => {
    const map = new Map<T, string>();
    rows.forEach((row, index) => map.set(row, String(index)));
    return map;
  }, [rows]);

  const tableColumns = useMemo<MatrxColumnDef<T>[]>(() => {
    const mapped: MatrxColumnDef<T>[] = columns.map((col) => ({
      id: col.key,
      header: col.label,
      accessorFn: col.getValue,
      sortValue: col.getValue,
      width: trackToWidth(col.width),
      ...(col.align === "right" ? { align: "right" as const } : {}),
      sortable: col.sortable !== false,
      filter:
        col.filterable === false
          ? false
          : col.type === "text" && col.noValueList
            ? "text"
            : FILTER_KIND[col.type],
      cell: (row) => <Cell col={col} row={row} />,
    }));
    if (copyForAi) {
      mapped.push({
        id: "copy-for-ai",
        header: "Copy",
        filter: false,
        sortable: false,
        width: 72,
        align: "center",
        customActions: (row) => (
          <CopyButtons
            size="icon"
            label={copyForAi.label}
            human={() => copyForAi.humanRow(row)}
            agent={() => auditRowToAgentInput(copyForAi, row)}
          />
        ),
      });
    }
    return mapped;
  }, [columns, copyForAi]);

  const seededFilters = useMemo(
    () => toTableFilters(initialColumnFilters),
    [initialColumnFilters],
  );

  return (
    <div className="h-full min-h-0">
      <MatrxDataTable<T>
        data={rows}
        columns={tableColumns}
        getRowId={(row) => rowIds.get(row) ?? String(rows.indexOf(row))}
        tableId={tableId}
        urlState={{
          id: tableId,
          ...(defaultSort
            ? {
                defaultSort: {
                  id: defaultSort.key,
                  direction: defaultSort.dir,
                },
              }
            : columns[0]
              ? { defaultSort: { id: columns[0].key, direction: "asc" } }
              : {}),
        }}
        {...(initialSearch ? { initialSearch } : {})}
        {...(seededFilters ? { initialColumnFilters: seededFilters } : {})}
        isLoading={loading}
        read={{
          status: loading ? "loading" : error ? "error" : "ready",
          error,
          what: "these rows",
        }}
        emptyState={{ title: emptyMessage }}
        pageSize={0}
        virtualize={{ enabled: true }}
        frameHeight="fill"
        detail={{ enabled: false }}
        window={{ enabled: false }}
        toolbar={toolbarExtra ? { leading: toolbarExtra } : {}}
        {...(onRowClick ? { onRowOpen: onRowClick } : {})}
      />
    </div>
  );
}
