"use client";

/**
 * ResultTable — a uniform object array rendered as a real, scannable table.
 *
 *   inline  — first ~3 rows + "+N more rows" (expands in place).
 *   full    — all rows; a filter <input> (font-size ≥16px) when >10 rows.
 *
 * Copy is owned at the result level (GenericRenderer inline / OutputView overlay)
 * so the table doesn't render a second, duplicate copy bar. A dedicated CSV
 * export is a deliberate future enhancement.
 *
 * Column headers are click-to-sort (asc → desc → none). Cells render scalars
 * directly; nested objects/arrays render as a compact inline {@link ResultValue}
 * so structure is never flattened away.
 */

import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableColumn } from "./shape";
import { isPlainObject } from "./shape";
import { ResultValue, type ResultDensity } from "./ResultValue";

export interface ResultTableProps {
    rows: Array<Record<string, unknown>>;
    columns: TableColumn[];
    density?: ResultDensity;
    depth?: number;
    className?: string;
}

type SortDir = "asc" | "desc" | null;

const INLINE_ROW_CAP = 3;
const FILTER_THRESHOLD = 10;

/** Stable scalar→string for sorting / CSV / filtering. */
function cellToText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/** Compare two cells: numeric when both parse as numbers, else locale string. */
function compareCells(a: unknown, b: unknown): number {
    const na = typeof a === "number" ? a : Number(a);
    const nb = typeof b === "number" ? b : Number(b);
    const bothNumeric = !Number.isNaN(na) && !Number.isNaN(nb) && a !== "" && b !== "";
    if (bothNumeric) return na - nb;
    return cellToText(a).localeCompare(cellToText(b));
}

/**
 * A nested object/array inside a table cell. Rendering it expanded made one
 * cell swallow half the page (the owner-flagged "wrapping monster"). It now
 * collapses to a tiny summary toggle — "{5 fields}" / "[3 items]" — and only
 * expands to the full ResultValue on click. Nothing is hidden, nothing wraps.
 */
const NestedCell: React.FC<{ value: unknown; depth: number }> = ({ value, depth }) => {
    const [open, setOpen] = React.useState(false);
    const summary = Array.isArray(value)
        ? `[${value.length} ${value.length === 1 ? "item" : "items"}]`
        : `{${Object.keys(value as Record<string, unknown>).length} fields}`;
    if (!open) {
        return (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(true);
                }}
                className="whitespace-nowrap font-mono text-xs text-muted-foreground hover:text-foreground"
                title="Expand"
            >
                {summary}
            </button>
        );
    }
    return (
        <div className="min-w-0">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                }}
                className="mb-1 whitespace-nowrap font-mono text-xs text-muted-foreground hover:text-foreground"
                title="Collapse"
            >
                {summary} ×
            </button>
            <ResultValue value={value} density="inline" depth={depth + 1} />
        </div>
    );
};

/**
 * A long string inside a cell. Unclamped it makes one cell own half the page;
 * it clamps to 2 lines and expands in place on click (nothing hidden for good).
 */
const LongTextCell: React.FC<{ value: string }> = ({ value }) => {
    const [open, setOpen] = React.useState(false);
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
            }}
            title={open ? "Collapse" : "Expand"}
            className={cn(
                "block max-w-md text-left break-words",
                !open && "line-clamp-2",
            )}
        >
            {value}
        </button>
    );
};

const LONG_CELL_CHARS = 80;

/** Render a single cell — scalar inline, structure collapsed behind a toggle. */
const Cell: React.FC<{ value: unknown; depth: number }> = ({ value, depth }) => {
    if (value === null || value === undefined) {
        return <span className="italic text-muted-foreground">—</span>;
    }
    if (typeof value === "string" && value.length > LONG_CELL_CHARS) {
        return <LongTextCell value={value} />;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return <ResultValue value={value} density="inline" depth={depth + 1} />;
    }
    if (Array.isArray(value) || isPlainObject(value)) {
        return <NestedCell value={value} depth={depth} />;
    }
    return <span className="break-words">{cellToText(value)}</span>;
};

export const ResultTable: React.FC<ResultTableProps> = ({
    rows,
    columns,
    density = "inline",
    depth = 0,
    className,
}) => {
    const [showAll, setShowAll] = React.useState(false);
    const [sortKey, setSortKey] = React.useState<string | null>(null);
    const [sortDir, setSortDir] = React.useState<SortDir>(null);
    const [filter, setFilter] = React.useState("");

    const full = density === "full";

    // Filter (full density only).
    const filtered = (() => {
        const q = filter.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) =>
            columns.some((c) => cellToText(row[c.key]).toLowerCase().includes(q)),
        );
    })();

    // Sort.
    const sorted = (() => {
        if (!sortKey || !sortDir) return filtered;
        const copy = [...filtered];
        copy.sort((a, b) => {
            const cmp = compareCells(a[sortKey], b[sortKey]);
            return sortDir === "asc" ? cmp : -cmp;
        });
        return copy;
    })();

    const cap = !full && !showAll ? INLINE_ROW_CAP : sorted.length;
    const shown = sorted.slice(0, cap);
    const remaining = sorted.length - shown.length;

    const cycleSort = (key: string) => {
        if (sortKey !== key) {
            setSortKey(key);
            setSortDir("asc");
        } else if (sortDir === "asc") {
            setSortDir("desc");
        } else if (sortDir === "desc") {
            setSortKey(null);
            setSortDir(null);
        } else {
            setSortDir("asc");
        }
    };

    return (
        <div className={cn("min-w-0 space-y-2", className)}>
            {full &&
                (rows.length > FILTER_THRESHOLD ? (
                    <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={`Filter ${rows.length} rows…`}
                        // text-base = 16px to prevent iOS zoom-on-focus.
                        className="h-9 w-full max-w-xs rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                    />
                ) : (
                    <span className="text-xs text-muted-foreground">
                        {rows.length} {rows.length === 1 ? "row" : "rows"}
                    </span>
                ))}

            {/* Data-density type (text-xs) — a result table is reference material,
                never louder than the message text around it. */}
            <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr>
                            {columns.map((col) => {
                                const active = sortKey === col.key;
                                return (
                                    <th
                                        key={col.key}
                                        className="border-b border-border/60 px-2.5 py-1.5 text-left align-bottom text-[11px] font-medium text-muted-foreground"
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                cycleSort(col.key);
                                            }}
                                            className="inline-flex items-center gap-1 hover:text-foreground"
                                            title={`Sort by ${col.label}`}
                                        >
                                            <span className="break-words">{col.label}</span>
                                            {active && sortDir === "asc" ? (
                                                <ArrowUp className="h-3 w-3" />
                                            ) : active && sortDir === "desc" ? (
                                                <ArrowDown className="h-3 w-3" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3 opacity-40" />
                                            )}
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-3 py-4 text-center text-xs text-muted-foreground"
                                >
                                    No rows match the filter
                                </td>
                            </tr>
                        ) : (
                            shown.map((row, ri) => (
                                <tr key={ri} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                                    {columns.map((col) => (
                                        <td key={col.key} className="px-2.5 py-1.5 align-top text-foreground">
                                            <Cell value={row[col.key]} depth={depth} />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {remaining > 0 && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowAll(true);
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                >
                    +{remaining} more {remaining === 1 ? "row" : "rows"}
                </button>
            )}
        </div>
    );
};
