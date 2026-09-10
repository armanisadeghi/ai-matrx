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
import {
    detectResultShape,
    humanizeEnumValue,
    isPlainObject,
    mediaElementHintForKey,
} from "./shape";
import { ResultValue, type ResultDensity } from "./ResultValue";
import {
  MOBILE_TABLE,
  MOBILE_TABLE_FROZEN_CELL,
  MOBILE_TABLE_FROZEN_HEAD,
} from "@/components/official/mobile-table/mobileTable";

export interface ResultTableProps {
    rows: Array<Record<string, unknown>>;
    columns: TableColumn[];
    density?: ResultDensity;
    depth?: number;
    /** Propagated to every cell — see `ResultValueProps.embedMedia`. */
    embedMedia?: boolean;
    className?: string;
}

type SortDir = "asc" | "desc" | null;

const INLINE_ROW_CAP = 3;
const FILTER_THRESHOLD = 10;

/**
 * Machine plumbing is still part of the result, but it is not the document's
 * primary reading path. A raw object-array table used to put UUIDs, hashes,
 * source metadata, and byte offsets beside the reader's actual content — the
 * exact developer artifact the structured-value floor exists to remove.
 *
 * Keep the test deliberately structural rather than domain-specific. These
 * tokens describe transport identity/provenance in every payload; everything
 * remains reachable through the per-row Details disclosure below.
 */
const TECHNICAL_COLUMN_TOKEN =
    /(^|_)(ids?|uuids?|hash|checksum|digest|metadata|offset)(_|$)/i;

function normalizeColumnKey(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[-\s]+/g, "_")
        .toLowerCase();
}

export function isTechnicalTableColumn(key: string): boolean {
    return TECHNICAL_COLUMN_TOKEN.test(normalizeColumnKey(key));
}

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
const NestedCell: React.FC<{ value: unknown; depth: number; embedMedia: boolean }> = ({ value, depth, embedMedia }) => {
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
            <ResultValue value={value} density="inline" depth={depth + 1} embedMedia={embedMedia} />
        </div>
    );
};

const TechnicalDetailsCell: React.FC<{
    row: Record<string, unknown>;
    columns: TableColumn[];
    depth: number;
    embedMedia: boolean;
}> = ({ row, columns, depth, embedMedia }) => {
    const [open, setOpen] = React.useState(false);
    const details = Object.fromEntries(columns.map((column) => [column.key, row[column.key]]));
    const count = columns.length;

    return (
        <div className="min-w-0">
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen((value) => !value);
                }}
                aria-expanded={open}
                className="whitespace-nowrap text-xs font-medium text-muted-foreground hover:text-foreground"
            >
                {open ? "Hide details" : `${count} ${count === 1 ? "detail" : "details"}`}
            </button>
            {open ? (
                <div className="mt-2 min-w-[16rem] max-w-md rounded-md bg-muted/30 p-2">
                    <ResultValue
                        value={details}
                        density="full"
                        depth={depth + 1}
                        embedMedia={embedMedia}
                    />
                </div>
            ) : null}
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

/** Chip-able cell list: at most this many items, each this short. */
const CHIP_LIST_MAX_ITEMS = 4;
const CHIP_LIST_MAX_CHARS = 24;

function isShortScalarList(
    value: unknown,
): value is Array<string | number | boolean> {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.length <= CHIP_LIST_MAX_ITEMS &&
        value.every(
            (item) =>
                (typeof item === "string" && item.length <= CHIP_LIST_MAX_CHARS) ||
                typeof item === "number" ||
                typeof item === "boolean",
        )
    );
}

/** Render a single cell — scalar inline, structure collapsed behind a toggle. */
const Cell: React.FC<{ fieldKey: string; value: unknown; depth: number; embedMedia: boolean }> = ({
    fieldKey,
    value,
    depth,
    embedMedia,
}) => {
    const mediaElementHint = mediaElementHintForKey(fieldKey);
    if (value === null || value === undefined) {
        return <span className="italic text-muted-foreground">—</span>;
    }
    // A signed owned-file URL is often longer than LONG_CELL_CHARS. Recognize
    // media before the generic long-text clamp so table cells receive the same
    // durable renderer and field-name type hint as key/value results.
    if (
        typeof value === "string" &&
        detectResultShape(value, { embedMedia }).kind === "media"
    ) {
        return (
            <ResultValue
                value={value}
                density="inline"
                depth={depth + 1}
                embedMedia={embedMedia}
                mediaElementHint={mediaElementHint}
            />
        );
    }
    if (typeof value === "string" && value.length > LONG_CELL_CHARS) {
        return <LongTextCell value={value} />;
    }
    if (typeof value === "string") {
        const human = humanizeEnumValue(value);
        if (human) {
            return (
                <span className="whitespace-nowrap" title={value}>
                    {human}
                </span>
            );
        }
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return (
            <ResultValue
                value={value}
                density="inline"
                depth={depth + 1}
                embedMedia={embedMedia}
                mediaElementHint={mediaElementHint}
            />
        );
    }
    // A SHORT list of short scalars is the cell — tags, labels, aliases. It
    // reads as chips; collapsing it to "[1 item]" made the reader click to
    // learn the word "definition" (seen 2026-08-18 on the Study Pack
    // flashcards table). Anything longer stays behind the toggle, which is
    // what keeps one cell from swallowing the page.
    if (isShortScalarList(value)) {
        return (
            <span className="flex flex-wrap gap-1">
                {value.map((item, i) => (
                    <span
                        key={i}
                        className="rounded bg-muted px-1 py-px text-[11px] leading-tight text-muted-foreground"
                    >
                        {String(item)}
                    </span>
                ))}
            </span>
        );
    }
    if (Array.isArray(value) || isPlainObject(value)) {
        return <NestedCell value={value} depth={depth} embedMedia={embedMedia} />;
    }
    return <span className="break-words">{cellToText(value)}</span>;
};

export const ResultTable: React.FC<ResultTableProps> = ({
    rows,
    columns,
    density = "inline",
    depth = 0,
    embedMedia = true,
    className,
}) => {
    const [showAll, setShowAll] = React.useState(false);
    const [sortKey, setSortKey] = React.useState<string | null>(null);
    const [sortDir, setSortDir] = React.useState<SortDir>(null);
    const [filter, setFilter] = React.useState("");

    const full = density === "full";
    const technicalColumns = columns.filter((column) =>
        isTechnicalTableColumn(column.key),
    );
    const readerColumns = columns.filter(
        (column) => !isTechnicalTableColumn(column.key),
    );
    // A payload made entirely of machine fields has no higher-level document
    // to promote. Render it honestly instead of replacing the whole table
    // with one column of identical disclosure buttons.
    const collapseTechnicalColumns =
        technicalColumns.length > 0 && readerColumns.length > 0;
    const visibleColumns = collapseTechnicalColumns ? readerColumns : columns;

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
                <table className={cn("border-collapse text-xs", MOBILE_TABLE)}>
                    <thead>
                        <tr>
                            {visibleColumns.map((col, colIdx) => {
                                const active = sortKey === col.key;
                                return (
                                    <th
                                        key={col.key}
                                        className={cn(
                                            "border-b border-border/60 px-2.5 py-1.5 text-left align-bottom text-[11px] font-medium text-muted-foreground",
                                            colIdx === 0 && MOBILE_TABLE_FROZEN_HEAD,
                                        )}
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
                            {collapseTechnicalColumns ? (
                                <th className="border-b border-border/60 px-2.5 py-1.5 text-left align-bottom text-[11px] font-medium text-muted-foreground">
                                    Details
                                </th>
                            ) : null}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={visibleColumns.length + (collapseTechnicalColumns ? 1 : 0)}
                                    className="px-3 py-4 text-center text-xs text-muted-foreground"
                                >
                                    No rows match the filter
                                </td>
                            </tr>
                        ) : (
                            shown.map((row, ri) => (
                                <tr key={ri} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                                    {visibleColumns.map((col, colIdx) => (
                                        <td
                                            key={col.key}
                                            className={cn(
                                                "px-2.5 py-1.5 align-top text-foreground",
                                                colIdx === 0 && MOBILE_TABLE_FROZEN_CELL,
                                            )}
                                        >
                                            <Cell
                                                fieldKey={col.key}
                                                value={row[col.key]}
                                                depth={depth}
                                                embedMedia={embedMedia}
                                            />
                                        </td>
                                    ))}
                                    {collapseTechnicalColumns ? (
                                        <td className="px-2.5 py-1.5 align-top text-foreground">
                                            <TechnicalDetailsCell
                                                row={row}
                                                columns={technicalColumns}
                                                depth={depth}
                                                embedMedia={embedMedia}
                                            />
                                        </td>
                                    ) : null}
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
                    className="text-xs font-medium text-primary "
                >
                    +{remaining} more {remaining === 1 ? "row" : "rows"}
                </button>
            )}
        </div>
    );
};
