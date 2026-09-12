"use client";

// features/content-ir/studio/records/buildRecordColumns.tsx
//
// The kind's OWN schema is the column registry: one column per property of
// `emitted_json_schema`, plus the standing columns every kind's records share
// (Title · Created · Created by · Source).
//
// Per the density law the confirmation badge is NOT its own column — it lives
// in the title cell, where the row's identity and its standing are read in one
// glance (Airtable/Linear bar: status and action in the same place).

import type { ReactNode } from "react";
import { BrainCircuit, MessageSquareText, User2 } from "lucide-react";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { timeCell, Muted } from "@/lib/entity-list/columns";
import { shapeInstancePermalink } from "@/features/content-ir/studio/constants";
import { ConfirmationBadge } from "@/features/content-ir/records/ConfirmationBadge";
import type { KindRecordRow } from "./types";

/** One property of the kind's emitted schema, as a column needs to see it. */
export interface SchemaField {
  key: string;
  label: string;
  /** How the value is edited and filtered. */
  kind: "string" | "number" | "boolean" | "select";
  /** Present for `select` (a schema `enum`). */
  options?: { value: string; label: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `would_buy_again` → "Would buy again". The key is never shown raw. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The kind's schema properties, in schema order, minus the `__kind` marker.
 *
 * The marker is PART OF THE DATA and is never stripped from what is stored —
 * it is simply not a column a person reads (it holds one constant value for
 * every row of this table).
 */
export function schemaFields(emittedJsonSchema: unknown): SchemaField[] {
  if (!isRecord(emittedJsonSchema)) return [];
  const properties = emittedJsonSchema.properties;
  if (!isRecord(properties)) return [];

  const fields: SchemaField[] = [];
  for (const [key, raw] of Object.entries(properties)) {
    if (key === "__kind") continue;
    const spec = isRecord(raw) ? raw : {};
    const title = typeof spec.title === "string" ? spec.title : null;
    const label = title ?? humanizeKey(key);
    const enumValues = Array.isArray(spec.enum)
      ? spec.enum.filter((v): v is string => typeof v === "string")
      : null;
    if (enumValues && enumValues.length > 0) {
      fields.push({
        key,
        label,
        kind: "select",
        options: enumValues.map((v) => ({ value: v, label: humanizeKey(v) })),
      });
      continue;
    }
    const type = Array.isArray(spec.type)
      ? spec.type.find((t) => typeof t === "string" && t !== "null")
      : spec.type;
    if (type === "boolean") fields.push({ key, label, kind: "boolean" });
    else if (type === "integer" || type === "number")
      fields.push({ key, label, kind: "number" });
    else fields.push({ key, label, kind: "string" });
  }
  return fields;
}

/** Keys that a text search can reach (`title` is searched beside them). */
export function searchableKeys(fields: SchemaField[]): string[] {
  return fields.filter((f) => f.kind === "string" || f.kind === "select").map((f) => f.key);
}

/** Keys whose jsonb ordering must stay numeric rather than lexicographic. */
export function numericKeys(fields: SchemaField[]): string[] {
  return fields.filter((f) => f.kind === "number" || f.kind === "boolean").map((f) => f.key);
}

function renderValue(value: unknown, field: SchemaField): ReactNode {
  if (value === null || value === undefined || value === "") {
    // An empty cell is honest: the record does not carry this value. It is not
    // a zero and it is not a failure to read.
    return <Muted>—</Muted>;
  }
  if (field.kind === "boolean") {
    return <span>{value === true ? "Yes" : "No"}</span>;
  }
  if (field.kind === "number") {
    return <span className="tabular-nums">{String(value)}</span>;
  }
  // A kind's free-text property is routinely a thousand words (a tasting
  // note, a summary). Rendered unclamped it makes ONE row four screens tall
  // and the table unreadable — the density bar this screen is judged against
  // (Airtable, Linear) never lets a cell set the row height. One line, the
  // whole value in the tooltip, the record itself one click away.
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  // `line-clamp-1`, not `truncate`: the table's own cell wrapper forces
  // `whitespace-normal` on every descendant, so `nowrap`-based truncation is
  // overridden from outside and a 2,000-word tasting note made ONE row four
  // screens tall (measured, first browser pass).
  return (
    <span className="line-clamp-1 max-w-[24rem]" title={text}>
      {text}
    </span>
  );
}

export interface RecordColumnContext {
  fields: SchemaField[];
  /** userId → display name, for the Created by column. */
  creatorNames: Map<string, string>;
  /** The signed-in user, so their own rows read "You". */
  viewerId: string | null;
  /** True while the writer facet is not narrowing — shows the tier chip. */
  showWriterTier: boolean;
}

/**
 * Who wrote the row. `ai`/`code` are the machine tiers and get the machine
 * icon; everything else is a person (an unstamped NULL included — the platform
 * reads it as a person and it is never backfilled).
 */
function writerCell(row: KindRecordRow, ctx: RecordColumnContext): ReactNode {
  const isMachine = row.createdByTier === "ai" || row.createdByTier === "code";
  const name = isMachine
    ? (row.createdBySystem ?? "An agent")
    : row.createdBy && row.createdBy === ctx.viewerId
      ? "You"
      : row.createdBy
        ? (ctx.creatorNames.get(row.createdBy) ?? "A teammate")
        : "Unattributed";
  const Icon = isMachine ? BrainCircuit : User2;
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground"
      title={
        isMachine
          ? `Written by a machine (${row.createdByTier}) — nobody has stood behind it unless it is confirmed`
          : "Written by a person"
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="line-clamp-1">{name}</span>
    </span>
  );
}

/**
 * The conversation this record came out of, reached through the `produced_by`
 * association. A record a person typed has no producing message and says so —
 * it never renders a door to nothing.
 */
function sourceCell(row: KindRecordRow): ReactNode {
  if (row.conversationId) {
    return (
      // `data-matrx-cell-control` is the table's OWN opt-out from the wrapping
      // it forces on cell content: it grants this node and its descendants
      // `white-space: nowrap` and intrinsic width. Without it the one-word
      // link was broken into one letter per line in an 80px column.
      <span
        data-matrx-cell-control
        className="inline-flex min-w-0 items-center gap-1.5"
        title={
          row.sourceMessageId
            ? "Produced by a message in this conversation"
            : "Saved from this conversation"
        }
      >
        <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {/* A SHORT name on purpose. The table's cell wrapper forces wrapping
            on every descendant, and this column is ~80px wide in a
            twelve-column table — a sentence here wrapped to five lines and
            set the height of the whole row. The sentence lives in the
            tooltip; the door still opens the conversation. */}
        <EntityRef
          token="conversation"
          id={row.conversationId}
          name="Chat"
          showIcon={false}
        />
      </span>
    );
  }
  return (
    <Muted>
      <span data-matrx-cell-control>Entered directly</span>
    </Muted>
  );
}

/**
 * Build the table's columns for one kind.
 *
 * `onConfirmedByEdit` is how the surface learns a per-cell edit confirmed the
 * row; the announcement is the surface's job, not a column's.
 */
export function buildRecordColumns(
  ctx: RecordColumnContext,
): MatrxColumnDef<KindRecordRow>[] {
  const schemaColumns: MatrxColumnDef<KindRecordRow>[] = ctx.fields.map((field) => ({
    id: `data:${field.key}`,
    label: field.label,
    header: field.label,
    accessorFn: (row) => row.data[field.key],
    cell: (row) => renderValue(row.data[field.key], field),
    editable: field.kind,
    editOptions: field.options,
    filter:
      field.kind === "boolean"
        ? "boolean"
        : field.kind === "number"
          ? "number"
          : field.kind === "select"
            ? "select"
            : "text",
    filterOptions: field.options,
  }));

  return [
    {
      id: "title",
      label: "Title",
      header: "Title",
      accessorKey: "title",
      href: (row) => shapeInstancePermalink(row.id),
      // `min-w-[13rem]` is a declared minimum so the name and its standing sit
      // on ONE line: with twelve columns sharing the width, an auto-sized title
      // column collapsed to 89px and the row grew to hold the wrap.
      cell: (row) => (
        <span className="flex items-center gap-2">
          {/* `line-clamp-1`, not `truncate` — see renderValue: the table's
              cell wrapper forces wrapping on descendants, so a `nowrap`
              truncation loses and a two-word title stacks one letter per
              line in a narrow column. */}
          {/* INLINE styles, deliberately. The data-table's cell wrapper forces
              `min-width: 0`, `max-width: 100%` and wrapping onto EVERY
              descendant by class, so a clamped flex child measured ZERO and
              this cell rendered the badge alone — the record's name, gone
              (measured in the browser, second pass). Only an inline
              declaration outranks those, and the floor is what keeps the name
              readable in a twelve-column table. */}
          <span
            className="font-medium"
            style={{
              flex: "1 1 auto",
              minWidth: "7rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.title?.trim() || "Untitled record"}
          </span>
          <ConfirmationBadge
            confirmation={row.confirmation}
            archivedAt={row.archivedAt}
            variant="grid"
          />
        </span>
      ),
      filter: "text",
    },
    ...schemaColumns,
    {
      id: "created_at",
      label: "Created",
      header: "Created",
      accessorKey: "createdAt",
      cell: (row) => timeCell(row.createdAt),
      filter: false,
      defaultSortDirection: "desc",
    },
    {
      id: "created_by",
      label: "Created by",
      header: "Created by",
      accessorFn: (row) => row.createdByTier,
      cell: (row) => writerCell(row, ctx),
      sortable: false,
      filter: false,
      mobileHidden: true,
    },
    {
      id: "source",
      label: "Source",
      header: "Source",
      accessorFn: (row) => row.conversationId ?? "",
      cell: (row) => sourceCell(row),
      sortable: false,
      filter: false,
      mobileHidden: true,
    },
  ];
}
