"use client";

/**
 * `data_table` — THE canonical component for the platform's tabular primitive
 * (Table Kinds Run, Stage B).
 *
 * It is the one renderer for this kind (THE CANONICAL COMPONENT LAW):
 * dispatched standalone by the block registry AND composed by any other
 * family that nests a table. serverData is the streaming `{ value, isComplete }`
 * bridge output or a bare kind value — both coerced by the search family's
 * `readSearchKindValue` (ONE reader, never a second copy); every field read is
 * defensive because values are partial mid-stream.
 *
 * ── INVENTORY LAW ──────────────────────────────────────────────────────────
 * The repo had FIVE table renderers before this one and a sixth would be a
 * defect. Survey verified path-by-path 2026-08-25. What this consumes rather
 * than re-writing:
 *
 *  - CELL TYPOGRAPHY — lifted from `blocks/json/JsonTableView.tsx` into
 *    `./data-table-cells.tsx` (the best cell formatting in the repo, previously
 *    trapped in a component that only takes object rows).
 *  - MOBILE — `components/official/mobile-table/mobileTable.ts`, the ONE
 *    frozen-first-column recipe with its three documented CSS traps.
 *  - EXPORT — `blocks/json/json-tabular-utils.ts` (`rowsToCsv`, `rowsToNdjson`,
 *    `rowsToXlsx`, `downloadText`), the existing export builders.
 *  - MARKDOWN — `components/official/matrx-data-table/tableCopy.ts`
 *    (`rowsToMarkdownTable`), and the Copy-for-AI envelope is that file's
 *    `buildViewAgentInput` + `buildAgentPayload`. No second envelope shape.
 *  - "OPEN BIG" — routes to `TableViewerWindow` through its own opener; this
 *    component does not duplicate that window's toolbar, menu or surface.
 *  - UUID cells — the platform's `ShortId`.
 *
 * DELIBERATELY NOT USED, and why:
 *  - `MatrxDataTable` (1,628 lines, 99 import sites) — the right answer for a
 *    full-page SQL console and the wrong ALTITUDE inside a message: it requires
 *    an AUTHORED column spec (a `data_table` declares its columns at runtime,
 *    and a headerless CSV has none) and mounts windows + URL state.
 *  - `UserTableViewer` — needs a persisted `tableId`; a table lifted out of a
 *    PDF has no record behind it.
 *  - `StreamingTableRenderer` — markdown-string input only; this kind carries
 *    typed cells, and stringifying them to markdown to render them would throw
 *    away the exact thing the kind exists to carry.
 *  - `ResultTable` — the survey's best-of-breed for UNKNOWN-shape rows, and it
 *    is still that. It cannot be reused here: it takes `Record<string,unknown>`
 *    rows keyed by column, and `data_table` rows are POSITIONAL by design (a
 *    headerless CSV has cells and no names; keying them would mean inventing
 *    `col_1`, `col_2`). Converting positional rows to objects to reuse it would
 *    fabricate exactly the names the shape refuses to fabricate, and would drop
 *    a ragged row's unplaceable cells. Its `shape.ts` sibling
 *    (`isUniformObjectArray`, the repo's one column-derivation function) is the
 *    right tool when columns must be DERIVED — here they are DECLARED, so
 *    deriving them would be the wrong answer to a solved problem. At Stage D,
 *    the honest convergence is the other direction: an untyped uniform object
 *    array becomes a `data_table` upstream.
 *  - `@tanstack/react-table` — a declared dependency with ZERO import sites in
 *    the repo. Not adopted here, deliberately: this table's sort + filter is
 *    ~40 lines over positional rows, adopting a headless table library for one
 *    kind block would make it the repo's FOURTH sorting implementation while
 *    pulling a new runtime into the chat bundle, and the decision of whether
 *    the platform standardises on it belongs to `MatrxDataTable`, not to a
 *    message-altitude block. Recorded so the next agent does not re-open it.
 *
 * ── THE FIVE THINGS IT EXISTS TO FIX (each a MEASURED defect) ──────────────
 * 1. `type` IS OPTIONAL AND NULL NEVER MEANS "STRING". One of five producers
 *    can type its columns; the rest genuinely cannot. Typed and untyped columns
 *    render and align DIFFERENTLY, and an untyped cell is never sniffed. See
 *    `./data-table-cells.tsx`.
 * 2. TRUNCATION IS IMPOSSIBLE TO MISS. Four producers capped their rows and
 *    said nothing — a user reading 500 of 40,000 rows had no way to know. When
 *    `total_row_count` is present the banner says "500 of 40,000".
 * 3. NOTES ARE SURFACED, NOT SWALLOWED. A heuristic PDF header, a ragged row, a
 *    lossy Decimal→float coercion, an INFERRED truncation — every one is a
 *    caveat the reader needs to judge what they are looking at.
 * 4. RAGGED ROWS ARE REAL. PDF extraction produces them. Short rows are padded
 *    visibly; a row LONGER than the declared columns gets extra "(undeclared)"
 *    columns rather than losing cells. NOTHING IS EVER DROPPED.
 * 5. ZERO ROWS WITH COLUMNS IS A MEANINGFUL STATE. An empty result that still
 *    describes its schema renders its header and says so — never a bare "no
 *    data" that hides what was asked for.
 */

import React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Braces,
  Bot,
  Copy,
  Download,
  Loader2,
  Maximize2,
  Scissors,
  Search,
  Table2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MOBILE_TABLE,
  MOBILE_TABLE_FROZEN_CELL,
  MOBILE_TABLE_FROZEN_HEAD,
} from "@/components/official/mobile-table/mobileTable";
import {
  downloadText,
  rowsToCsv,
  rowsToNdjson,
  rowsToXlsx,
} from "@/components/mardown-display/blocks/json/json-tabular-utils";
import { rowsToMarkdownTable } from "@/components/official/matrx-data-table/tableCopy";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { useClipboard } from "@/hooks/useClipboard";
import { useOpenTableViewerWindow } from "@/features/overlays/openers/tableViewerWindow";
import { readSearchKindValue, text } from "../search-kinds/search-kind-data";
import {
  ColumnTypeBadge,
  DataCell,
  cellToText,
  isNumericColumn,
} from "./data-table-cells";
import { useDataTableMore } from "./data-table-more";

export interface DataTableBlockProps {
  serverData?: unknown;
  className?: string;
}

/** How many rows the block shows before the reader asks for the rest. */
const INLINE_ROW_CAP = 25;
/** Above this, a filter box earns its space. */
const FILTER_THRESHOLD = 10;

type SortDir = "asc" | "desc" | null;

/** A column as this component renders it — declared, or synthesized for a
 *  ragged row's unplaceable cells (which are shown, never dropped). */
interface RenderColumn {
  index: number;
  name: string;
  type: string | null;
  sourceType: string | null;
  nullable: boolean | null;
  description: string | null;
  /** True when the SOURCE never declared this column (a long ragged row). */
  undeclared: boolean;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Compare two cells. Numeric ONLY when both runtime values are numbers — a
 * string is never parsed into a number to make it sort "nicely", which is the
 * same guess the cell renderer refuses to make.
 */
function compareCells(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return cellToText(a).localeCompare(cellToText(b));
}

export function DataTableBlock({ serverData, className }: DataTableBlockProps) {
  const { value, isComplete } = readSearchKindValue<"data_table">(serverData);
  const { copyText } = useClipboard();
  const openTableWindow = useOpenTableViewerWindow();
  // THE FETCH-MORE SEAM (LAW 3). Null when the host cannot re-read — the
  // banner then says so rather than offering a button that does nothing.
  const more = useDataTableMore();

  const [showAll, setShowAll] = React.useState(false);
  const [sortIndex, setSortIndex] = React.useState<number | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>(null);
  const [filter, setFilter] = React.useState("");

  const title = text(value.title);
  const notes = Array.isArray(value.notes)
    ? value.notes.filter((n): n is string => typeof n === "string" && n.trim() !== "")
    : [];
  const source = value.source ?? null;

  // Rows are POSITIONAL arrays. Anything else in the array is a malformed row —
  // kept as a single-cell row rather than silently discarded.
  const rows: unknown[][] = React.useMemo(() => {
    if (!Array.isArray(value.rows)) return [];
    return value.rows.map((row) => (Array.isArray(row) ? (row as unknown[]) : [row]));
  }, [value.rows]);

  const declared = Array.isArray(value.columns) ? value.columns : [];
  const widestRow = rows.reduce((max, row) => Math.max(max, row.length), 0);

  const columns: RenderColumn[] = React.useMemo(() => {
    const out: RenderColumn[] = declared.map((column, index) => ({
      index,
      name: str(column?.name) ?? `Column ${index + 1}`,
      type: str(column?.type),
      sourceType: str(column?.source_type),
      nullable: typeof column?.nullable === "boolean" ? column.nullable : null,
      description: str(column?.description),
      undeclared: false,
    }));
    // RAGGED, THE LONG WAY: a row carrying more cells than the source declared
    // columns for. Those cells are real data and get real (clearly labelled)
    // columns — dropping them is the one thing this component must never do.
    for (let index = out.length; index < widestRow; index += 1) {
      out.push({
        index,
        name: `Column ${index + 1}`,
        type: null,
        sourceType: null,
        nullable: null,
        description: null,
        undeclared: true,
      });
    }
    return out;
  }, [declared, widestRow]);

  const undeclaredCount = columns.filter((column) => column.undeclared).length;
  const shortRows = rows.filter((row) => row.length < declared.length).length;

  // ── source truncation (the SOURCE cut rows) — never inferred ─────────────
  const truncated = value.truncated === true;
  const totalRowCount = int(value.total_row_count);
  const truncatedAt = int(value.truncated_at);
  const rowCount = int(value.row_count) ?? rows.length;

  const filtered = React.useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      row.some((cell) => cellToText(cell).toLowerCase().includes(query)),
    );
  }, [rows, filter]);

  const sorted = React.useMemo(() => {
    if (sortIndex === null || !sortDir) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const cmp = compareCells(a[sortIndex], b[sortIndex]);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortIndex, sortDir]);

  const shown = showAll ? sorted : sorted.slice(0, INLINE_ROW_CAP);
  const hiddenByUi = sorted.length - shown.length;

  const cycleSort = (index: number) => {
    if (sortIndex !== index) {
      setSortIndex(index);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortIndex(null);
      setSortDir(null);
    }
  };

  // ── export projections ───────────────────────────────────────────────────
  // Positional rows become records ONLY at the export boundary, keyed by an
  // index-disambiguated key so duplicate or empty column names cannot collide
  // and silently drop a column.
  const exportKeys = columns.map((column) => `${column.index}:${column.name}`);
  const exportHeaders = columns.map((column) =>
    column.undeclared ? `${column.name} (undeclared)` : column.name,
  );
  const toRecords = (source_: unknown[][]) =>
    source_.map((row) =>
      Object.fromEntries(columns.map((column) => [exportKeys[column.index], row[column.index]])),
    );

  const markdownColumns: MatrxColumnDef<Record<string, unknown>>[] = columns.map(
    (column) => ({
      accessorKey: exportKeys[column.index],
      header: exportHeaders[column.index],
    }),
  );

  const filename = (extension: string) =>
    `${(title ?? str(source?.table_name) ?? "table").replace(/[^\w.-]+/g, "-")}.${extension}`;

  const asMarkdown = () => rowsToMarkdownTable(toRecords(sorted), markdownColumns);

  const copyMarkdown = () => {
    void copyText(asMarkdown(), "Table copied as markdown");
  };

  const copyForAi = () => {
    // The platform's ONE agent envelope — never a second shape.
    void copyText(
      buildAgentPayload({
        kind: "data_table",
        location: "AI Matrx — table",
        description: title
          ? `A table: ${title}.`
          : "A table of rows and columns, with its declared column types.",
        data: {
          title,
          source,
          columns: columns.map((column) => ({
            name: column.name,
            type: column.type,
            source_type: column.sourceType,
            nullable: column.nullable,
            undeclared_by_source: column.undeclared || undefined,
          })),
          rows: sorted,
          notes,
        },
        summary: asMarkdown(),
        attributes: {
          rows_shown: sorted.length,
          row_count: rowCount,
          total_row_count: totalRowCount ?? undefined,
          truncated,
          typed_columns: columns.filter((column) => column.type !== null).length,
          untyped_columns: columns.filter((column) => column.type === null).length,
          filter: filter.trim() || undefined,
        },
        context: {
          origin: str(source?.origin) ?? undefined,
          table: str(source?.table_name) ?? undefined,
          query: str(source?.query) ?? undefined,
        },
      }),
      "Table copied for AI",
    );
  };

  const sourceLine = [
    str(source?.origin),
    str(source?.schema_name) && str(source?.table_name)
      ? `${source?.schema_name}.${source?.table_name}`
      : (str(source?.table_name) ?? str(source?.table_id)),
    int(source?.page_number) !== null ? `page ${source?.page_number}` : null,
    str(source?.detector),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "my-2 min-w-0 overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {/* ── header: what this table is, and how big it really is ───────── */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium text-foreground">
              {title ?? "Table"}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <span className="tabular-nums">{rowCount.toLocaleString()}</span>
            {" "}
            {rowCount === 1 ? "row" : "rows"} ×{" "}
            <span className="tabular-nums">{columns.length}</span>{" "}
            {columns.length === 1 ? "column" : "columns"}
            {sourceLine ? <span className="opacity-70"> · {sourceLine}</span> : null}
            {!isComplete ? <span className="opacity-70"> · still arriving…</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={copyMarkdown}
            title="Copy as a markdown table"
            aria-label="Copy as a markdown table"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={copyForAi}
            title="Copy for AI — the table, its column types and its caveats"
            aria-label="Copy for AI"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Bot className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Export"
                aria-label="Export"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  downloadText(
                    filename("csv"),
                    rowsToCsv(toRecords(sorted), exportKeys),
                    "text/csv",
                  )
                }
              >
                <Download className="mr-2 h-3.5 w-3.5" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  downloadText(
                    filename("ndjson"),
                    rowsToNdjson(toRecords(sorted)),
                    "application/x-ndjson",
                  )
                }
              >
                <Braces className="mr-2 h-3.5 w-3.5" /> NDJSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void rowsToXlsx(toRecords(sorted), exportKeys, filename("xlsx"));
                }}
              >
                <Table2 className="mr-2 h-3.5 w-3.5" /> Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() =>
              openTableWindow({ content: asMarkdown(), title: title ?? "Table" })
            }
            title="Open in a window"
            aria-label="Open in a window"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── 2. TRUNCATION — the fact four producers used to hide, AND the
             control that gets the rest (LAW 3: a banner with no control is a
             dead end wearing a disclosure's clothes). ──────────────────────── */}
      {truncated && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <Scissors className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">
            {totalRowCount !== null ? (
              <>
                You are seeing{" "}
                <span className="tabular-nums">{rowCount.toLocaleString()}</span> of{" "}
                <span className="tabular-nums">{totalRowCount.toLocaleString()}</span>{" "}
                rows.
              </>
            ) : (
              <>
                This is not the whole table
                {truncatedAt !== null ? (
                  <>
                    {" "}
                    (it was cut at{" "}
                    <span className="tabular-nums">{truncatedAt.toLocaleString()}</span>)
                  </>
                ) : null}
                .
              </>
            )}
          </span>
          {more ? (
            <>
              <button
                type="button"
                disabled={more.pending}
                onClick={(event) => {
                  event.stopPropagation();
                  void more.onRequestMore({ have: rowCount, total: totalRowCount });
                }}
                className="inline-flex items-center gap-1 rounded border border-amber-500/50 bg-background/60 px-1.5 py-0.5 font-medium text-amber-800 transition-colors hover:bg-background disabled:opacity-60 dark:text-amber-300"
              >
                {more.pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                {more.pending
                  ? "Getting the rest…"
                  : totalRowCount !== null
                    ? `Get all ${totalRowCount.toLocaleString()} rows`
                    : "Get the rest"}
              </button>
              {more.limitNote ? (
                <span className="opacity-80">{more.limitNote}</span>
              ) : null}
            </>
          ) : (
            <span className="opacity-80">
              The rest were left at the source, and this view cannot ask for
              them — re-run the query that produced this table to get them.
            </span>
          )}
        </div>
      )}

      {/* ── 3. NOTES — honest caveats, surfaced ──────────────────────────── */}
      {(notes.length > 0 || undeclaredCount > 0 || shortRows > 0) && (
        <div className="space-y-1 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          {notes.map((note, index) => (
            <div key={`note-${index}`} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span>{note}</span>
            </div>
          ))}
          {undeclaredCount > 0 && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span>
                {undeclaredCount === 1
                  ? "1 column is not declared by the source"
                  : `${undeclaredCount} columns are not declared by the source`}{" "}
                — some rows carry more cells than there are columns. They are shown
                anyway, marked <em>undeclared</em>; nothing is dropped.
              </span>
            </div>
          )}
          {shortRows > 0 && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span>
                {shortRows === 1 ? "1 row is" : `${shortRows} rows are`} shorter than the
                column list. The missing cells are padded (·), not invented.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── filter ──────────────────────────────────────────────────────── */}
      {rows.length > FILTER_THRESHOLD && (
        <div className="border-b border-border/40 bg-muted/20 px-3 py-1.5">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={`Filter ${rows.length.toLocaleString()} rows…`}
              className="h-7 pl-7 text-xs"
              // 16px prevents iOS zoom-on-focus.
              style={{ fontSize: "16px" }}
            />
          </div>
        </div>
      )}

      {/* ── the table ───────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className={cn("border-collapse text-xs", MOBILE_TABLE)}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60">
              <th className="w-10 border-b border-r border-border/40 px-1 py-1 text-center font-mono text-[10px] text-muted-foreground">
                #
              </th>
              {columns.map((column, position) => {
                const active = sortIndex === column.index;
                return (
                  <th
                    key={column.index}
                    className={cn(
                      "select-none border-b border-r border-border/40 px-2.5 py-1.5 align-bottom text-[11px] font-medium last:border-r-0",
                      isNumericColumn(column.type) ? "text-right" : "text-left",
                      column.undeclared ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                      position === 0 && MOBILE_TABLE_FROZEN_HEAD,
                    )}
                    {...(column.description ? { title: column.description } : {})}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        cycleSort(column.index);
                      }}
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 hover:text-foreground",
                        isNumericColumn(column.type) && "flex-row-reverse",
                      )}
                      title={`Sort by ${column.name}`}
                    >
                      {active && sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3 shrink-0 text-primary" />
                      ) : active && sortDir === "desc" ? (
                        <ArrowDown className="h-3 w-3 shrink-0 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
                      )}
                      <span className="break-words">{column.name}</span>
                    </button>
                    <div
                      className={cn(
                        "mt-0.5 flex",
                        isNumericColumn(column.type) ? "justify-end" : "justify-start",
                      )}
                    >
                      {column.undeclared ? (
                        <span
                          className="rounded border border-dashed border-amber-500/60 px-1 text-[10px] font-normal leading-tight text-amber-600 dark:text-amber-400"
                          title="The source declared no column here — these cells came from rows longer than the column list. Shown rather than dropped."
                        >
                          undeclared
                        </span>
                      ) : (
                        <ColumnTypeBadge
                          type={column.type}
                          sourceType={column.sourceType}
                          nullable={column.nullable}
                        />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="p-0 text-xs text-muted-foreground"
                >
                  {/* ── 5. ZERO ROWS IS A MEANINGFUL STATE ─────────────────
                      STICKY, not centered. A wide empty table (measured: a
                      32-column one) centers its colSpan cell far off the right
                      of the horizontal scroller, so the message that explains
                      the empty state is invisible exactly when it matters. */}
                  <div className="sticky left-0 max-w-[min(100%,44rem)] px-3 py-6 text-left">
                  {filter.trim() ? (
                    <>No rows match “{filter.trim()}”.</>
                  ) : columns.length > 0 ? (
                    <>
                      <span className="font-medium text-foreground">No rows.</span> This
                      table still declares{" "}
                      <span className="tabular-nums">{columns.length}</span>{" "}
                      {columns.length === 1 ? "column" : "columns"} — the query ran and
                      returned nothing, which is an answer.
                    </>
                  ) : (
                    <>No rows, and the source declared no columns either.</>
                  )}
                  </div>
                </td>
              </tr>
            ) : (
              shown.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-t border-border/20 align-top transition-colors hover:bg-muted/20"
                >
                  <td className="sticky left-0 border-r border-border/30 bg-background px-1 py-1 text-center font-mono text-[10px] text-muted-foreground">
                    {rowIndex + 1}
                  </td>
                  {columns.map((column, position) => (
                    <td
                      key={column.index}
                      className={cn(
                        "min-w-0 max-w-md border-r border-border/20 px-2.5 py-1.5 align-top text-foreground last:border-r-0",
                        isNumericColumn(column.type) && "text-right",
                        position === 0 && MOBILE_TABLE_FROZEN_CELL,
                      )}
                    >
                      {/* ── 4. RAGGED ROWS: padded, never dropped ────────── */}
                      <DataCell
                        value={row[column.index]}
                        type={column.type}
                        missing={column.index >= row.length}
                        label={column.name}
                        origin={
                          sourceLine
                            ? `Row ${rowIndex + 1} · ${sourceLine}`
                            : `Row ${rowIndex + 1}${title ? ` · ${title}` : ""}`
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* The UI's own cap — deliberately NOT the amber truncation treatment.
          "We are not showing you all of what we have" and "we do not HAVE all
          of it" are different facts and must never read the same. */}
      {hiddenByUi > 0 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowAll(true);
          }}
          className="w-full border-t border-border/40 px-3 py-1.5 text-left text-xs font-medium text-primary hover:bg-muted/30"
        >
          Show {hiddenByUi.toLocaleString()} more{" "}
          {hiddenByUi === 1 ? "row" : "rows"} on this page
        </button>
      )}
    </div>
  );
}

export default DataTableBlock;
