"use client";

// features/exports/browse/columns.tsx
//
// The column registry for the items inside one dropped export.
//
// 🚨 NO BODY TEXT COLUMN, AND THERE NEVER WILL BE ONE. An export holds other
// people's words. Every column below is metadata the person already knows they
// have — who, when, how long, which thread, which label — and the API has no
// endpoint that would let a preview pane exist.
//
// SORTING IS HONEST, NOT UNIFORM. The items endpoint orders by exactly five
// keys (`occurred_at`, `char_count`, `word_count`, `title`,
// `attachment_count`). The columns that are not one of them declare
// `sortable: false` rather than offering a control that would quietly fall
// back to "newest first" — the app's every-column-sorts policy allows an
// explicit refusal where the canonical server path cannot serve it, and a dead
// control is the failure this repo calls a screen that lies.

import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Muted,
  TextCell,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { cn } from "@/lib/utils";
import { directionLabel } from "../format";
import type { ExportItem } from "../types";
import { LENGTH_FILTER_OPTIONS, OCCURRED_FILTER_OPTIONS } from "./itemQuery";

const DIRECTION_ACCENT: Record<string, string> = {
  outbound:
    "border-emerald-500/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
  inbound:
    "border-sky-500/40 text-sky-700 dark:border-sky-400/40 dark:text-sky-300",
  unknown: "border-border text-muted-foreground",
};

/** The best name we have for one party, in the order a person would read it. */
export function partyLabel(party: ExportItem["author"]): string {
  if (!party) return "";
  return party.name?.trim() || party.email?.trim() || party.handle?.trim() || "";
}

function NumberCell({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <Muted>—</Muted>;
  }
  return <span className="tabular-nums">{value.toLocaleString()}</span>;
}

export const EXPORT_ITEM_COLUMNS: EntityColumnSpec<ExportItem>[] = [
  {
    id: "title",
    label: "Title",
    locked: true,
    phone: "title",
    column: {
      id: "title",
      accessorKey: "title",
      header: "Title",
      filter: "text",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          {/* An item with no subject line is normal in a chat export — say so
              in words rather than rendering an empty cell. */}
          <TextCell
            value={row.title?.trim() || "(no subject)"}
            className={cn("font-medium", !row.title?.trim() && "italic text-muted-foreground")}
          />
          {row.is_reply && (
            <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
              Reply
            </Badge>
          )}
        </div>
      ),
    },
  },
  {
    id: "direction",
    label: "Direction",
    locked: true,
    facet: "direction",
    phone: "primary",
    formatFacetValue: directionLabel,
    column: {
      id: "direction",
      accessorKey: "direction",
      header: "Direction",
      filter: "select",
      sortable: false,
      width: 120,
      cell: (row) => (
        <Badge
          variant="outline"
          className={cn(
            "py-0 text-[10px] font-medium",
            DIRECTION_ACCENT[row.direction] ?? DIRECTION_ACCENT.unknown,
          )}
        >
          {directionLabel(row.direction)}
        </Badge>
      ),
    },
  },
  {
    id: "kind",
    label: "Type",
    facet: "kind",
    phone: "meta",
    column: {
      id: "kind",
      accessorKey: "kind",
      header: "Type",
      filter: "select",
      sortable: false,
      width: 110,
      cell: (row) => (
        <span className="text-xs capitalize text-muted-foreground">
          {row.kind.replace(/_/g, " ")}
        </span>
      ),
    },
  },
  {
    id: "author",
    label: "From",
    facet: "author",
    phone: "primary",
    column: {
      id: "author",
      header: "From",
      accessorFn: (row) => partyLabel(row.author),
      filter: "select",
      sortable: false,
      width: 180,
      cell: (row) => <TextCell value={partyLabel(row.author)} />,
    },
  },
  {
    id: "container_label",
    label: "Thread / channel",
    facet: "container_label",
    phone: "meta",
    column: {
      id: "container_label",
      accessorKey: "container_label",
      header: "Thread / channel",
      filter: "select",
      sortable: false,
      width: 170,
      cell: (row) => <TextCell value={row.container_label} muted />,
    },
  },
  {
    id: "labels",
    label: "Labels",
    facet: "labels",
    defaultHidden: true,
    phone: "rest",
    column: {
      id: "labels",
      header: "Labels",
      accessorFn: (row) => row.labels.join(", "),
      filter: "select",
      sortable: false,
      width: 180,
      cell: (row) =>
        row.labels.length === 0 ? (
          <Muted>—</Muted>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {row.labels.slice(0, 3).map((label) => (
              <Badge key={label} variant="secondary" className="py-0 text-[10px]">
                {label}
              </Badge>
            ))}
            {row.labels.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{row.labels.length - 3}
              </span>
            )}
          </div>
        ),
    },
  },
  {
    id: "occurred_at",
    label: "When",
    locked: true,
    phone: "meta",
    sortWords: { asc: "oldest first", desc: "newest first" },
    column: {
      id: "occurred_at",
      accessorKey: "occurred_at",
      header: "When",
      filter: "select",
      filterSingle: true,
      filterOptions: OCCURRED_FILTER_OPTIONS,
      defaultSortDirection: "desc",
      width: 120,
      cell: (row) => timeCell(row.occurred_at),
    },
  },
  {
    id: "char_count",
    label: "Length",
    phone: "primary",
    sortWords: { asc: "shortest first", desc: "longest first" },
    column: {
      id: "char_count",
      accessorKey: "char_count",
      header: "Length",
      filter: "select",
      filterSingle: true,
      filterOptions: LENGTH_FILTER_OPTIONS,
      defaultSortDirection: "desc",
      width: 100,
      cell: (row) => <NumberCell value={row.char_count} />,
    },
  },
  {
    id: "word_count",
    label: "Words",
    defaultHidden: true,
    phone: "rest",
    sortWords: { asc: "fewest first", desc: "most first" },
    column: {
      id: "word_count",
      accessorKey: "word_count",
      header: "Words",
      filter: false,
      defaultSortDirection: "desc",
      width: 90,
      cell: (row) => <NumberCell value={row.word_count} />,
    },
  },
  {
    /**
     * ONE column, two server keys: it SORTS by `attachment_count` and FILTERS
     * by `has_attachment`. Splitting them would put two controls on screen for
     * one question ("which ones have attachments?").
     */
    id: "attachment_count",
    label: "Attachments",
    phone: "rest",
    sortWords: { asc: "fewest first", desc: "most first" },
    formatFacetValue: (value) =>
      value === "true" ? "Has an attachment" : "No attachment",
    column: {
      id: "attachment_count",
      accessorKey: "attachment_count",
      header: "Attachments",
      filter: "select",
      filterSingle: true,
      filterOptions: [
        { value: "true", label: "Has an attachment" },
        { value: "false", label: "No attachment" },
      ],
      defaultSortDirection: "desc",
      width: 130,
      cell: (row) =>
        row.attachment_count === 0 ? (
          <Muted>—</Muted>
        ) : (
          <span
            className="inline-flex items-center gap-1 tabular-nums"
            title={row.attachment_names.join(", ")}
          >
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            {row.attachment_count.toLocaleString()}
          </span>
        ),
    },
  },
];
