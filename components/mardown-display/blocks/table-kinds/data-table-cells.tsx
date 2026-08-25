"use client";

/**
 * Cell typography and column-header treatment for the tabular kind family.
 *
 * INVENTORY LAW (survey verified 2026-08-25). The repo already had five table
 * renderers and a sixth would be a defect. Nothing here re-derives columns,
 * re-implements sorting, or re-writes value rendering:
 *
 *  - UUID cells are the platform's `ShortId` (shorten + hover-copy);
 *  - value RECOGNITION is the tool-result field library's own detectors,
 *    via `./cell-value-shapes.ts` — the same functions `StructuredValueView`
 *    uses, so a UUID looks the same in a cell as in a tool result;
 *  - STRUCTURE inside a cell renders through `StructuredValueView`, THE FLOOR
 *    of the platform's structured rendering, and opens full size in the
 *    canonical `structuredValueWindow` — this file draws no field list of its
 *    own;
 *  - the mobile treatment is `mobileTable.ts` (`MOBILE_TABLE*`), the ONE
 *    frozen-first-column recipe;
 *  - nothing in this file knows what a `data_table` is. It renders a cell given
 *    a value and a DECLARED type, which is the one thing `JsonTableView` could
 *    not do.
 *
 * 🚨 RULE 1: `type` IS OPTIONAL, AND NULL NEVER MEANS "STRING". Measured across
 * the family's five producers, exactly ONE can type its columns (the SQL path
 * holds full matrx-orm field metadata and threw it away one line later); the
 * other four genuinely cannot — a parsed CSV cell is a `str` whatever it looks
 * like, a PDF cell is `str | None`, and a JSONB row has no declared column list
 * at all. So a column WITH a type is rendered by that type, a column WITHOUT
 * one is never SNIFFED INTO A DIFFERENT TYPE — a string of digits stays the
 * string `"01234"`, never the number 1234 — and the two states are visibly
 * different in the header, because "we know this is text" and "we do not know
 * what this is" are different facts.
 *
 * 🚨 RULE 2 — LAW 3b, RECOGNITION IS BY VALUE, NOT ONLY BY DECLARATION
 * (`common-docs/policies/no-dead-ends.md`, Arman 2026-08-25). Presentation is
 * decided by the VALUE wherever the value is unambiguous: a UUID gets the
 * shortened-id + copy treatment in every column, not only in the one column a
 * source happened to declare `uuid`; the same goes for a URL, an email and an
 * ISO timestamp. Before this, a real `seo.serp_opportunity` read rendered `id`
 * as a neat short id and every foreign key beside it as a raw 36-character
 * string — the same data, two treatments, in one table.
 *
 * RECOGNITION IS NOT COERCION and never changes what a value IS: the exact
 * source string is always one hover (or one copy) away, and a numeric-looking
 * string is still never treated as a number.
 *
 * 🚨 RULE 3 — LAW 3a, NO DEVELOPER JARGON AT EYE LEVEL. No cell ever renders
 * the words `null`, `undefined`, `NaN`, `Array(2)` or `Object(3)`. Our reader
 * is a subject-matter expert, not an engineer: an empty cell says it is empty,
 * a list says how many things are in it, and a record shows its fields.
 */

import React from "react";
import { ChevronDown, ChevronRight, ExternalLink, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShortId } from "@/features/tool-call-visualization/result-fields/ShortId";
import { humanizeKey } from "@/features/tool-call-visualization/result-fields/shape";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { useOpenStructuredValueWindow } from "@/features/overlays/openers/structuredValueWindow";
import {
  formatTemporal,
  looksLikeEmail,
  looksLikeUrl,
  looksLikeUuid,
  temporalShape,
  urlLabel,
} from "./cell-value-shapes";

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
  boolean: "yes/no",
  datetime: "datetime",
  date: "date",
  time: "time",
  json: "record",
  array: "list",
  uuid: "id",
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
    nullable === true ? "can be empty" : nullable === false ? "always filled" : null,
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

// ---------------------------------------------------------------------------
// Empty — the one thing a cell must never call `null`
// ---------------------------------------------------------------------------

/**
 * A stored empty value. It is NOT the same as a ragged row's missing cell (·),
 * and both are different from an empty string — so each says which it is in
 * plain words on hover, and none of them says "null".
 */
const EmptyCell: React.FC<{ title: string }> = ({ title }) => (
  <span className="select-none text-muted-foreground/60" title={title}>
    —
  </span>
);

// ---------------------------------------------------------------------------
// Structure — expandable in place, full size in a window
// ---------------------------------------------------------------------------

/** Plain-words summary of a structure. NEVER `Array(2)` / `Object(3)`. */
export function structureSummary(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "Empty list";
    return `${value.length.toLocaleString()} ${value.length === 1 ? "item" : "items"}`;
  }
  const keys = Object.keys(value as object);
  if (keys.length === 0) return "No details";
  // The FIELDS THEMSELVES beat a count: "name, status, score" tells a reader
  // what this is; "Object(3)" tells them we have three of something.
  const shown = keys.slice(0, 3).map(humanizeKey).join(", ");
  return keys.length > 3
    ? `${shown} +${keys.length - 3} more`
    : shown;
}

/**
 * Structure inside a cell. Collapsed to a plain-words summary, expanded IN
 * PLACE through the canonical structured renderer, and openable full size in a
 * movable window.
 *
 * 🚨 NO JSON DUMP, AND NO BOX IN A BOX (LAW 3a + LAW 3c). The old treatment
 * put `JSON.stringify(value, null, 2)` in a `<pre>` with its own background and
 * padding, inside a cell that was already padded, inside a table that already
 * has borders — Arman's "padding, then a box, then padding, then a list", in
 * the ~200px a column gets. The expansion is now the same document renderer
 * every other surface falls through to, unboxed, and the reader who wants room
 * gets a real window instead of a wider cell.
 */
const NestedCell: React.FC<{
  value: unknown;
  /** What this structure is, for the window title (the column name). */
  label?: string | null;
  /** Where it came from, for the window subtitle. */
  origin?: string | null;
}> = ({ value, label, origin }) => {
  const [open, setOpen] = React.useState(false);
  const openWindow = useOpenStructuredValueWindow();
  const summary = structureSummary(value);
  const isEmpty = Array.isArray(value)
    ? value.length === 0
    : Object.keys(value as object).length === 0;

  // An empty list / empty record has nothing to expand and nothing to open —
  // offering both controls would be two doors onto an empty room.
  if (isEmpty) {
    return (
      <span
        className="select-none text-muted-foreground/60"
        title={
          Array.isArray(value)
            ? "The source stored a list with nothing in it."
            : "The source stored a record with no fields in it."
        }
      >
        {summary}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((v) => !v);
          }}
          title={open ? "Hide the details" : "Show the details"}
          className="flex min-w-0 items-center gap-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{summary}</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openWindow({
              value,
              title: label?.trim() ? label : "Details",
              subtitle: origin ?? null,
            });
          }}
          title="Open this in a window — movable, and your table stays where it is"
          aria-label="Open in a window"
          className="shrink-0 rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      </div>
      {open && (
        <div className="max-h-64 min-w-0 overflow-auto border-l border-border/60 pl-2 text-xs">
          <StructuredValueView value={value} density="inline" footer={false} />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Recognized scalars
// ---------------------------------------------------------------------------

/** A URL is a door (LAW 1): shown short, opened in a new tab, full in the title. */
const UrlCell: React.FC<{ value: string }> = ({ value }) => (
  <a
    href={value}
    target="_blank"
    rel="noopener noreferrer"
    title={value}
    onClick={(event) => event.stopPropagation()}
    className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
  >
    <span className="truncate">{urlLabel(value)}</span>
    <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
  </a>
);

const EmailCell: React.FC<{ value: string }> = ({ value }) => (
  <a
    href={`mailto:${value}`}
    title={`Write to ${value}`}
    onClick={(event) => event.stopPropagation()}
    className="break-all text-primary hover:underline"
  >
    {value}
  </a>
);

/**
 * A temporal value, formatted for a reader with the exact source string on
 * hover. `declared` says whether a column CLAIMED to be temporal: a declared
 * temporal that does not parse is a fact the reader needs (shown verbatim, in
 * warning colour), while an undeclared string that merely looks like a date is
 * simply left alone when it does not parse.
 */
const TemporalCell: React.FC<{
  value: string;
  shape: "date" | "datetime" | "time";
  declared: boolean;
}> = ({ value, shape, declared }) => {
  const shown = formatTemporal(value, shape);
  if (!shown) {
    return declared ? (
      <span
        className="font-mono text-xs text-warning"
        title={`This column is declared ${shape}, but this value is not one — shown exactly as it arrived.`}
      >
        {value}
      </span>
    ) : (
      <span className="break-words">{value}</span>
    );
  }
  return (
    <span className="whitespace-nowrap tabular-nums" title={value}>
      {shown}
    </span>
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
      title={open ? "Show less" : "Show all of it"}
      className={cn("block max-w-md break-words text-left", !open && "line-clamp-2")}
    >
      {value}
    </button>
  );
};

/**
 * THE STRING PATH — shared by declared-text columns and undeclared ones,
 * because a UUID is a UUID either way (LAW 3b). Recognition only ever decides
 * PRESENTATION; the string itself is never rewritten.
 */
const StringCell: React.FC<{ value: string }> = ({ value }) => {
  const trimmed = value.trim();
  if (trimmed === "") {
    return <EmptyCell title="Empty text — the source stored a value with nothing in it." />;
  }
  if (looksLikeUuid(trimmed)) return <ShortId value={trimmed} />;
  if (looksLikeUrl(trimmed)) return <UrlCell value={trimmed} />;
  if (looksLikeEmail(trimmed)) return <EmailCell value={trimmed} />;
  const shape = temporalShape(trimmed);
  if (shape) return <TemporalCell value={trimmed} shape={shape} declared={false} />;
  return value.length > LONG_CELL_CHARS ? (
    <LongTextCell value={value} />
  ) : (
    <span className="break-words">{value}</span>
  );
};

/** Yes / No, never `true` / `false` (LAW 3a). */
const BooleanCell: React.FC<{ value: boolean }> = ({ value }) => (
  <span
    className={cn(
      "font-medium",
      value ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
    )}
  >
    {value ? "Yes" : "No"}
  </span>
);

const NumberCell: React.FC<{ value: number | string }> = ({ value }) => (
  <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
    {typeof value === "number" && Number.isNaN(value) ? (
      <span className="text-warning" title="The source sent a value that is not a number.">
        not a number
      </span>
    ) : (
      value
    )}
  </span>
);

/**
 * THE UNTYPED PATH. No declared type, so the cell is rendered by its RUNTIME
 * JSON type plus value recognition, and nothing else.
 */
function UntypedValue({
  value,
  label,
  origin,
}: {
  value: unknown;
  label?: string | null;
  origin?: string | null;
}) {
  if (value === null || value === undefined) {
    return <EmptyCell title="Empty — the source stored no value here." />;
  }
  if (typeof value === "boolean") return <BooleanCell value={value} />;
  if (typeof value === "number") return <NumberCell value={value} />;
  if (typeof value === "string") return <StringCell value={value} />;
  return <NestedCell value={value} label={label} origin={origin} />;
}

/**
 * One cell. `type` is the column's DECLARED type or null/undefined; `missing`
 * means the row was shorter than the column list (a ragged row — padded, never
 * fabricated), which is rendered differently from a stored empty value.
 */
export const DataCell: React.FC<{
  value: unknown;
  type?: string | null;
  missing?: boolean;
  /** Column name — the title of the window a structure opens into. */
  label?: string | null;
  /** Row + table, for that window's subtitle. */
  origin?: string | null;
}> = ({ value, type, missing, label, origin }) => {
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
  // An empty value is empty under ANY declared type — the type says what the
  // column holds, not that it is always populated.
  if (value === null || value === undefined) {
    return <EmptyCell title="Empty — the source stored no value here." />;
  }
  if (typeof type !== "string" || type.trim() === "") {
    return <UntypedValue value={value} label={label} origin={origin} />;
  }
  if (type === "uuid" && typeof value === "string") {
    return <ShortId value={value} />;
  }
  if (TEMPORAL_TYPES.has(type) && typeof value === "string") {
    const shape = type === "time" ? "time" : temporalShape(value);
    return (
      <TemporalCell
        value={value}
        shape={shape ?? (type as "date" | "datetime" | "time")}
        declared
      />
    );
  }
  if (NUMERIC_TYPES.has(type)) {
    // A declared numeric that arrived as a STRING is real and common — an
    // exact NUMERIC serialized rather than rounded through a float. It is
    // shown as-is, in the numeric treatment, and never re-parsed.
    if (typeof value === "number" || typeof value === "string") {
      return <NumberCell value={value} />;
    }
    return <NestedCell value={value} label={label} origin={origin} />;
  }
  if (type === "boolean") {
    return typeof value === "boolean" ? (
      <BooleanCell value={value} />
    ) : (
      <UntypedValue value={value} label={label} origin={origin} />
    );
  }
  if (type === "binary" && typeof value === "string") {
    return (
      <span
        className="font-mono text-xs text-muted-foreground"
        title="Binary data, carried as text."
      >
        {value.length > 24 ? `${value.slice(0, 24)}…` : value}
      </span>
    );
  }
  if ((type === "json" || type === "array") && typeof value === "object") {
    return <NestedCell value={value} label={label} origin={origin} />;
  }
  // Declared `string` / `unknown`, or a declared type whose value disagrees:
  // the runtime shape is the truth, and it is never coerced to fit the label.
  return <UntypedValue value={value} label={label} origin={origin} />;
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
