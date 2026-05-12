"use client";

import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Input } from "@/components/ui/input";

type SortDir = "asc" | "desc" | null;

interface JsonTableViewProps {
  rows: Record<string, unknown>[];
  columns: string[];
  /** Optional preamble shown above the table — e.g. "12 rows × 5 cols". */
  caption?: React.ReactNode;
  className?: string;
}

function formatPrimitive(value: unknown): React.ReactNode {
  if (value === null)
    return <span className="text-orange-500 italic">null</span>;
  if (value === undefined)
    return <span className="text-muted-foreground">—</span>;
  if (typeof value === "boolean")
    return (
      <span className="text-purple-600 dark:text-purple-400 font-mono">
        {String(value)}
      </span>
    );
  if (typeof value === "number")
    return (
      <span className="text-blue-600 dark:text-blue-400 font-mono tabular-nums">
        {value}
      </span>
    );
  return <span>{String(value)}</span>;
}

interface NestedCellProps {
  value: unknown;
}

const NestedCell: React.FC<NestedCellProps> = ({ value }) => {
  const [expanded, setExpanded] = useState(false);
  const isArr = Array.isArray(value);
  const preview = isArr
    ? `Array(${(value as unknown[]).length})`
    : `Object(${Object.keys(value as object).length})`;

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="font-mono">{preview}</span>
      </button>
      {expanded && (
        <pre className="text-[11px] bg-muted/50 rounded px-2 py-1 overflow-auto max-h-48 whitespace-pre-wrap break-all">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
};

const Cell: React.FC<{ value: unknown }> = ({ value }) => {
  if (value !== null && typeof value === "object") {
    return <NestedCell value={value} />;
  }
  return <>{formatPrimitive(value)}</>;
};

/**
 * Compare two cell values for sorting. Primitives sort by natural order;
 * nested objects/arrays compare by their stringified length (consistent
 * but rarely useful — the column header is the user's clue that this
 * column isn't a great sort target).
 */
function compareCells(a: unknown, b: unknown, dir: SortDir): number {
  if (dir === null) return 0;
  const mul = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return -1 * mul;
  if (b == null) return 1 * mul;
  if (typeof a === "number" && typeof b === "number") return (a - b) * mul;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (Number(a) - Number(b)) * mul;
  }
  const sa = typeof a === "object" ? JSON.stringify(a) : String(a);
  const sb = typeof b === "object" ? JSON.stringify(b) : String(b);
  return sa.localeCompare(sb) * mul;
}

export const JsonTableView: React.FC<JsonTableViewProps> = ({
  rows,
  columns,
  caption,
  className,
}) => {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [query, setQuery] = useState("");

  const handleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortCol(null);
        setSortDir(null);
      }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((c) => {
        const v = row[c];
        if (v == null) return false;
        const s = typeof v === "object" ? JSON.stringify(v) : String(v);
        return s.toLowerCase().includes(q);
      }),
    );
  }, [rows, columns, query]);

  const sortedRows = useMemo(() => {
    if (!sortCol || !sortDir) return filteredRows;
    return [...filteredRows].sort((a, b) =>
      compareCells(a[sortCol], b[sortCol], sortDir),
    );
  }, [filteredRows, sortCol, sortDir]);

  const getSortIcon = (col: string) => {
    if (sortCol !== col)
      return (
        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50" />
      );
    if (sortDir === "asc") return <ArrowUp className="w-3 h-3 text-primary" />;
    return <ArrowDown className="w-3 h-3 text-primary" />;
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-card border-t border-border/30",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/20">
        <div className="text-xs text-muted-foreground">{caption}</div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter rows…"
            className="h-7 pl-7 w-48 text-xs"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>
      <div className="overflow-auto max-h-[600px]">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/70 backdrop-blur">
              <th className="px-1 py-1 text-center text-[10px] text-muted-foreground font-mono border-r border-border/30 w-10 sticky left-0 bg-muted/70 backdrop-blur">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="group/th px-3 py-1.5 text-left text-xs font-semibold text-foreground border-r border-border/30 last:border-r-0 cursor-pointer hover:bg-muted transition-colors select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col}</span>
                    {getSortIcon(col)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  {query ? "No rows match the filter." : "Empty table."}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="border-t border-border/20 hover:bg-muted/20 transition-colors align-top"
                >
                  <td className="px-1 py-1 text-center text-[10px] text-muted-foreground font-mono border-r border-border/30 sticky left-0 bg-background">
                    {rowIdx + 1}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-1.5 text-foreground border-r border-border/30 last:border-r-0 align-top min-w-0 max-w-md"
                    >
                      <Cell value={row[col]} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default JsonTableView;
