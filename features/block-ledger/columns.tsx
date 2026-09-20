"use client";

// features/block-ledger/columns.tsx
//
// THE COLUMN THAT MATTERS IS THE SENTENCE. Every other register on this platform
// shows a code and hides the words; this one leads with what the site, the file or
// the provider actually said, because that sentence is the whole finding
// (HUNTER-RULES.md law 3: "the exact error or behaviour (verbatim)").
//
// SORTING IS HONEST. The five columns the table can order by are the five the
// service whitelists; the rest declare `sortable: false` rather than offering a
// control that would quietly fall back to "most recent".

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Muted,
  TextCell,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { personFacingSentence } from "@/lib/progress/failureSentence";
import { cn } from "@/lib/utils";
import {
  ENGINE_LABELS,
  RUNG_LABELS,
  SOURCE_TYPE_LABELS,
  STATUS_LABELS,
  labelFor,
  type AcquisitionBlock,
} from "./types";

const STATUS_ACCENT: Record<string, string> = {
  open: "border-amber-500/40 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
  retrying:
    "border-sky-500/40 text-sky-700 dark:border-sky-400/40 dark:text-sky-300",
  resolved:
    "border-emerald-500/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
  escalated:
    "border-violet-500/40 text-violet-700 dark:border-violet-400/40 dark:text-violet-300",
  decision:
    "border-rose-500/40 text-rose-700 dark:border-rose-400/40 dark:text-rose-300",
};

/** The address without its protocol, which is noise in a list of a hundred. */
function shortInput(row: AcquisitionBlock): string {
  const label = row.input_label?.trim();
  if (label) return label;
  return row.input_ref.replace(/^https?:\/\//, "");
}

/** The finding, as a person reads it.
 *
 * 🚨 The sentence a row carries is never rendered raw. cold-walk-14 (2026-09-20)
 * read a raw `INSERT INTO docproc.processed_documents … VALUES ($1, $2, … Args:
 * (…)` on `/acquisition`, bound argument values included. The write seam now
 * refuses machine text (aidream `bd369c21c7`), but this table shows rows written
 * by every version of the server there has ever been, so the render path holds
 * the rule too: the sentence is plain English, and anything machine-shaped drops
 * to the muted second line — visible to whoever is debugging, never the finding.
 *
 * `break-words` + `whitespace-normal` because the phone card lays this out inline
 * beside its label: without them the one sentence that IS the finding runs off the
 * edge of the card instead of wrapping.
 */
function sentenceCell(raw: string) {
  const spoken = personFacingSentence(raw);
  return (
    <span className="flex min-w-0 flex-col">
      <span
        className="line-clamp-3 whitespace-normal break-words text-xs"
        title={spoken.text}
      >
        {spoken.text}
      </span>
      {spoken.detail ? (
        <span
          className="truncate text-[11px] text-muted-foreground"
          title={spoken.detail}
        >
          {spoken.detail}
        </span>
      ) : null}
    </span>
  );
}

export const BLOCK_COLUMNS: EntityColumnSpec<AcquisitionBlock>[] = [
  {
    id: "input_ref",
    label: "What we could not get",
    locked: true,
    phone: "title",
    column: {
      id: "input_ref",
      accessorKey: "input_ref",
      header: "What we could not get",
      filter: "text",
      width: 280,
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <TextCell value={shortInput(row)} className="font-medium" />
          {row.input_label?.trim() && (
            <span
              className="truncate text-[11px] text-muted-foreground"
              title={row.input_ref}
            >
              {row.input_ref.replace(/^https?:\/\//, "")}
            </span>
          )}
        </div>
      ),
    },
  },
  {
    id: "error_sentence",
    label: "What happened",
    locked: true,
    phone: "primary",
    column: {
      id: "error_sentence",
      accessorKey: "error_sentence",
      header: "What happened",
      sortable: false,
      width: 300,
      cell: (row) => sentenceCell(row.error_sentence),
    },
  },
  {
    id: "unblock_note",
    label: "What would unblock it",
    phone: "rest",
    column: {
      id: "unblock_note",
      accessorKey: "unblock_note",
      header: "What would unblock it",
      sortable: false,
      width: 280,
      cell: (row) =>
        row.unblock_note?.trim() ? (
          <span
            className="line-clamp-3 whitespace-normal break-words text-xs text-muted-foreground"
            title={row.unblock_note}
          >
            {row.unblock_note}
          </span>
        ) : (
          // An honest blank. We would rather say nothing than send somebody
          // down a route we invented.
          <Muted>We don&apos;t have a route for this one yet</Muted>
        ),
    },
  },
  {
    id: "status",
    label: "Status",
    facet: "status",
    phone: "primary",
    formatFacetValue: (value) => labelFor(STATUS_LABELS, value),
    column: {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      width: 140,
      cell: (row) => (
        <Badge
          variant="outline"
          className={cn(
            "py-0 text-[10px] font-medium",
            STATUS_ACCENT[row.status] ?? "border-border text-muted-foreground",
          )}
        >
          {labelFor(STATUS_LABELS, row.status)}
        </Badge>
      ),
    },
  },
  {
    id: "acted",
    label: "What we did",
    phone: "meta",
    column: {
      id: "acted",
      header: "What we did",
      accessorFn: (row) => row.retry_count,
      sortable: false,
      width: 190,
      // 🚨 THE ROW SAYS WHAT WAS DONE TO IT. An independent verifier pressed both
      // buttons and could not tell afterwards that anything had happened — the
      // retry was not counted and the handoff it created was not named. Both are
      // written by the server now, and this is where a person reads them.
      cell: (row) => {
        const tried =
          row.retry_count > 0
            ? `Tried again ${row.retry_count === 1 ? "once" : `${row.retry_count}×`}`
            : "";
        if (!tried && !row.handoff_id) return <Muted>Not yet</Muted>;
        return (
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            {tried && (
              <span className="text-muted-foreground" title={row.last_retry_at ?? undefined}>
                {tried}
              </span>
            )}
            {row.handoff_id && (
              <Link
                href="/capture/needs-you"
                className="truncate text-primary underline-offset-2 hover:underline"
              >
                Waiting in your browser
              </Link>
            )}
          </div>
        );
      },
    },
  },
  {
    id: "source_type",
    label: "Source",
    facet: "source_type",
    phone: "meta",
    formatFacetValue: (value) => labelFor(SOURCE_TYPE_LABELS, value),
    column: {
      id: "source_type",
      accessorKey: "source_type",
      header: "Source",
      filter: "select",
      width: 140,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {labelFor(SOURCE_TYPE_LABELS, row.source_type)}
        </span>
      ),
    },
  },
  {
    id: "engine",
    label: "Engine",
    facet: "engine",
    phone: "meta",
    formatFacetValue: (value) => labelFor(ENGINE_LABELS, value),
    column: {
      id: "engine",
      accessorKey: "engine",
      header: "Engine",
      filter: "select",
      width: 150,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {labelFor(ENGINE_LABELS, row.engine)}
        </span>
      ),
    },
  },
  {
    id: "rung",
    label: "Rung reached",
    facet: "rung",
    phone: "rest",
    formatFacetValue: (value) => labelFor(RUNG_LABELS, value),
    column: {
      id: "rung",
      accessorKey: "rung",
      header: "Rung reached",
      filter: "select",
      sortable: false,
      width: 170,
      cell: (row) =>
        row.rung ? (
          <span className="text-xs text-muted-foreground">
            {labelFor(RUNG_LABELS, row.rung)}
          </span>
        ) : (
          // Not every engine is on the ladder — a file reader has no rung, and
          // saying "—" is truer than pretending it stopped at step one.
          <Muted>Not on the ladder</Muted>
        ),
    },
  },
  {
    id: "error_class",
    label: "Class",
    facet: "error_class",
    defaultHidden: true,
    phone: "rest",
    column: {
      id: "error_class",
      accessorKey: "error_class",
      header: "Class",
      filter: "select",
      width: 160,
      cell: (row) => (
        <code className="text-[11px] text-muted-foreground">
          {row.error_class}
        </code>
      ),
    },
  },
  {
    id: "occurrence_count",
    label: "Times",
    phone: "meta",
    column: {
      id: "occurrence_count",
      accessorKey: "occurrence_count",
      header: "Times",
      width: 90,
      cell: (row) => (
        <span className="tabular-nums text-xs">
          {Number(row.occurrence_count ?? 1).toLocaleString()}
        </span>
      ),
    },
  },
  {
    id: "last_seen_at",
    label: "Last seen",
    phone: "meta",
    column: {
      id: "last_seen_at",
      accessorKey: "last_seen_at",
      header: "Last seen",
      width: 130,
      cell: (row) => timeCell(row.last_seen_at),
    },
  },
  {
    id: "first_seen_at",
    label: "First seen",
    defaultHidden: true,
    phone: "rest",
    column: {
      id: "first_seen_at",
      accessorKey: "first_seen_at",
      header: "First seen",
      width: 130,
      cell: (row) => timeCell(row.first_seen_at),
    },
  },
];
