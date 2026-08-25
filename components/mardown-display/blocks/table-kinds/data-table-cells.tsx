"use client";

/**
 * Cell typography and column-header treatment for the tabular kind family.
 *
 * INVENTORY LAW (survey verified 2026-08-25). The repo already had five table
 * renderers and a sixth would be a defect. Nothing here re-derives columns,
 * re-implements sorting, or re-writes value rendering:
 *
 *  - the CELL TYPOGRAPHY is LIFTED from `blocks/json/JsonTableView.tsx` — null
 *    as orange italic, boolean as purple mono, number as blue tabular-nums,
 *    absent as an em-dash, structure behind an expander. It was the best cell
 *    formatting in the repo and it was trapped inside a component that only
 *    takes object rows;
 *  - UUID cells are the platform's `ShortId`;
 *  - the mobile treatment is `mobileTable.ts` (`MOBILE_TABLE*`), the ONE
 *    frozen-first-column recipe;
 *  - nothing in this file knows what a `data_table` is. It renders a cell given
 *    a value and a DECLARED type, which is the one thing `JsonTableView` could
 *    not do.
 *
 * 🚨 THE RULE THAT MAKES THIS FILE EXIST: `type` IS OPTIONAL, AND NULL NEVER
 * MEANS "STRING". Measured across the family's five producers, exactly ONE can
 * type its columns (the SQL path holds full matrx-orm field metadata and threw
 * it away one line later); the other four genuinely cannot — a parsed CSV cell
 * is a `str` whatever it looks like, a PDF cell is `str | None`, and a JSONB
 * row has no declared column list at all. So:
 *
 *  - a column WITH a type is rendered by that type (a `number` right-aligns and
 *    goes tabular-nums, a `datetime` formats, a `uuid` shortens);
 *  - a column WITHOUT one is rendered by the RUNTIME JSON type of each cell and
 *    nothing more — never sniffed, never coerced, never right-aligned because
 *    the values "look numeric". Guessing is how a ZIP code loses its leading
 *    zero;
 *  - the two states are VISIBLY DIFFERENT in the header, because "we know this
 *    is text" and "we do not know what this is" are different facts and a
 *    reader deciding whether to trust a number needs to tell them apart.
 */

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShortId } from "@/features/tool-call-visualization/result-fields/ShortId";

/**
 * The portable type vocabulary the Python model declares
 * (`table_kinds/models.py` → `COLUMN_TYPES`). Deliberately small and portable:
 * a consumer wants to know "can I right-align this and sum it", not that the
 * source called it `int8`. The source's own spelling survives separately in
 * `source_type`.
 */
export const NUMERIC_TYPES = new Set(["number", "integer"]);
const TEMPORAL_TYPES = new Set(["datetime", "date", "time"]);

/** Is this column right-aligned + tabular? ONLY when the source SAID so. */
export function isNumericColumn(type: string | null | undefined): boolean {
  return typeof type === "string" && NUMERIC_TYPES.has(type);
}

/** Compact human label for a declared type; `null` renders as the unknown badge. */
const TYPE_LABEL: Record<string, string> = {
  string: "text",
  number: "num",
  integer: "int",
  boolean: "bool",
  datetime: "datetime",
  date: "date",
  time: "time",
  json: "json",
  array: "array",
  uuid: "uuid",
  binary: "binary",
  unknown: "unknown",
};

/**
 * The header badge — the whole point of which is that its ABSENT state is
 * loud, not silent.
 *
 * A declared type gets a solid chip carrying the portable name, with the
 * source's own type name and nullability in the tooltip. An UNDECLARED type
 * gets a dashed, dimmed `?` whose tooltip says what that means — because a
 * reader who cannot tell "this column is text" from "nobody knows what this
 * column is" will read a string of digits as a number and be wrong.
 */
export const ColumnTypeBadge: React.FC<{
  type?: string | null;
  sourceType?: string | null;
  nullable?: boolean | null;
}> = ({ type, sourceType, nullable }) => {
  if (typeof type !== "string" || type.trim() === "") {
    return (
      <span
        className="shrink-0 rounded border border-dashed border-muted-foreground/50 px-1 text-[10px] font-normal leading-tight text-muted-foreground/70"
        title="Type unknown — the source could not declare one. This is NOT the same as text: nothing here has been checked, so read every value literally."
      >
        ?
      </span>
    );
  }
  const detail = [
    sourceType ? `source type: ${sourceType}` : null,
    nullable === true ? "nullable" : nullable === false ? "not null" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className="shrink-0 rounded bg-primary/10 px-1 text-[10px] font-normal leading-tight text-primary"
      title={detail ? `Declared ${type} — ${detail}` : `Declared ${type}`}
    >
      {TYPE_LABEL[type] ?? type}
    </span>
  );
};

/**
 * Structure inside a cell. Collapsed to a one-line summary and expanded in
 * place — `JsonTableView`'s treatment, which exists because an expanded object
 * makes one cell own half the page.
 */
const NestedCell: React.FC<{ value: unknown }> = ({ value }) => {
  const [open, setOpen] = React.useState(false);
  const summary = Array.isArray(value)
    ? `Array(${value.length})`
    : `Object(${Object.keys(value as object).length})`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="font-mono">{summary}</span>
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 px-2 py-1 text-[11px]">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
};

/** A long string clamps to two lines and expands in place — nothing is hidden. */
const LONG_CELL_CHARS = 90;

const LongTextCell: React.FC<{ value: string }> = ({ value }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setOpen((v) => !v);
      }}
      title={open ? "Collapse" : "Expand"}
      className={cn("block max-w-md break-words text-left", !open && "line-clamp-2")}
    >
      {value}
    </button>
  );
};

/**
 * Format a declared temporal value. A parse failure is NOT hidden: the raw
 * string renders verbatim with a marker, because a datetime column carrying
 * something that is not a datetime is a fact the reader needs, not a blank.
 */
function TemporalCell({ value, type }: { value: string; type: string }) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return (
      <span
        className="font-mono text-xs text-warning"
        title={`Declared ${type}, but this value did not parse as one — shown verbatim.`}
      >
        {value}
      </span>
    );
  }
  const shown =
    type === "date"
      ? parsed.toLocaleDateString()
      : type === "time"
        ? parsed.toLocaleTimeString()
        : parsed.toLocaleString();
  return (
    <span className="whitespace-nowrap tabular-nums" title={value}>
      {shown}
    </span>
  );
}

/**
 * THE UNTYPED PATH. No declared type, so the cell is rendered by its RUNTIME
 * JSON type and nothing else — a string stays a string, verbatim. This is what
 * keeps `"01234"` a ZIP code instead of the number 1234.
 */
function UntypedValue({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="italic text-orange-500">null</span>;
  }
  if (value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className="font-mono text-purple-600 dark:text-purple-400">
        {String(value)}
      </span>
    );
  }
  if (typeof value === "number") {
    return (
      <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
        {value}
      </span>
    );
  }
  if (typeof value === "string") {
    return value.length > LONG_CELL_CHARS ? (
      <LongTextCell value={value} />
    ) : (
      <span className="break-words">{value}</span>
    );
  }
  return <NestedCell value={value} />;
}

/**
 * One cell. `type` is the column's DECLARED type or null/undefined; `missing`
 * means the row was shorter than the column list (a ragged row — padded, never
 * fabricated), which is rendered differently from a real `null`.
 */
export const DataCell: React.FC<{
  value: unknown;
  type?: string | null;
  missing?: boolean;
}> = ({ value, type, missing }) => {
  if (missing) {
    return (
      <span
        className="select-none text-muted-foreground/50"
        title="This row is shorter than the declared column list — the source supplied no cell here. Padded, not invented."
      >
        ·
      </span>
    );
  }
  // A null is a null under ANY declared type — the type says what the column
  // holds, not that it is always populated.
  if (value === null || value === undefined) {
    return <UntypedValue value={value} />;
  }
  if (typeof type !== "string" || type.trim() === "") {
    return <UntypedValue value={value} />;
  }
  if (type === "uuid" && typeof value === "string") {
    return <ShortId value={value} />;
  }
  if (TEMPORAL_TYPES.has(type) && typeof value === "string") {
    return <TemporalCell value={value} type={type} />;
  }
  if (NUMERIC_TYPES.has(type)) {
    // A declared numeric that arrived as a STRING is real and common — an
    // exact NUMERIC serialized rather than rounded through a float. It is
    // shown as-is, in the numeric treatment, and never re-parsed.
    if (typeof value === "number" || typeof value === "string") {
      return (
        <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
          {value}
        </span>
      );
    }
    return <NestedCell value={value} />;
  }
  if (type === "boolean") {
    return (
      <span className="font-mono text-purple-600 dark:text-purple-400">
        {String(value)}
      </span>
    );
  }
  if (type === "binary" && typeof value === "string") {
    return (
      <span
        className="font-mono text-xs text-muted-foreground"
        title="Binary, carried as a base64 string."
      >
        {value.length > 24 ? `${value.slice(0, 24)}…` : value}
      </span>
    );
  }
  if ((type === "json" || type === "array") && typeof value === "object") {
    return <NestedCell value={value} />;
  }
  // Declared `string` / `unknown`, or a declared type whose value disagrees:
  // the runtime shape is the truth, and it is never coerced to fit the label.
  return <UntypedValue value={value} />;
};

/** Stable text for sort / filter / export. Never shown to a reader. */
export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
