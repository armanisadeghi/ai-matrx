"use client";

// features/masterwork/kept-sources/columns.tsx
//
// What a person needs to recognise one piece of kept raw material: which lane
// captured it, when, how big it is, how many voices are in it, and what it
// actually produced.
//
// 🚨 NO RAW KEYS ON SCREEN. `approach_key` is a slug (`oracle_tap`,
// `body_of_work`) and the Lane column renders `platform.approach.label` — the
// same registry every other Masterwork surface reads, never a hand-kept map in
// this file. When the registry has not answered, the cell says the lane name
// could not be read rather than printing the slug as if it were English.

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  TextCell,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { keptSourceTitle, type KeptSourceRow } from "./types";

/** What each medium is called in the Expert's language, never the stored word. */
export const MEDIUM_LABELS: Record<string, string> = {
  turns: "Conversation",
  document: "Document",
  text: "Text",
  exchange: "Exchange",
};

export function mediumLabel(value: string): string {
  return MEDIUM_LABELS[value] ?? "Other";
}

function countCell(n: number, unit: string) {
  if (!n) return <Muted>—</Muted>;
  return (
    <span className="tabular-nums" title={`${n.toLocaleString()} ${unit}`}>
      {n.toLocaleString()}
    </span>
  );
}

export const KEPT_SOURCE_COLUMNS: EntityColumnSpec<KeptSourceRow>[] = [
  {
    id: "label",
    label: "Source",
    locked: true,
    phone: "title",
    column: {
      id: "label",
      accessorFn: (row) => keptSourceTitle(row),
      header: "Source",
      sortable: true,
      filter: false,
      cell: (row) => (
        <div className="min-w-0">
          <TextCell value={keptSourceTitle(row)} className="font-medium" />
          {row.truncated ? (
            // The capped state is visible BEFORE the reader is opened — a
            // person comparing two sources by size must not be told one is
            // 12,000 words without being told that is where we stopped.
            <span className="text-xs text-amber-600 dark:text-amber-500">
              Stored copy is capped
            </span>
          ) : null}
        </div>
      ),
    },
  },
  {
    id: "lane_label",
    label: "Lane",
    facet: "lane_label",
    phone: "meta",
    column: {
      id: "lane_label",
      accessorFn: (row) => row.lane_label,
      header: "Lane",
      // Sorting is on `approach_key`, the DATABASE column — not on the
      // resolved label, which exists only in the browser. The two orders can
      // differ, so the sort words say nothing about the alphabet.
      sortable: true,
      filter: "select",
      cell: (row) =>
        row.lane_unresolved ? (
          <span
            className="text-xs text-muted-foreground"
            title="We couldn't read the name of the lane that captured this."
          >
            Lane name unavailable
          </span>
        ) : (
          <TextCell value={row.lane_label} />
        ),
    },
  },
  {
    id: "medium",
    label: "Kind",
    facet: "medium",
    formatFacetValue: mediumLabel,
    defaultHidden: true,
    column: {
      id: "medium",
      accessorFn: (row) => row.medium_raw,
      header: "Kind",
      sortable: false,
      filter: "select",
      cell: (row) => (
        <Badge variant="outline" className="px-1.5 py-0 text-[11px]">
          {mediumLabel(row.medium_raw)}
        </Badge>
      ),
    },
  },
  {
    id: "captured_at",
    label: "Captured",
    phone: "meta",
    column: {
      id: "captured_at",
      accessorKey: "captured_at",
      header: "Captured",
      sortable: true,
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      // Relative-date buckets are mutually exclusive VIEWS, not an OR set —
      // without this the popover accumulates and the first choice wins forever
      // (D218).
      filterSingle: true,
      cell: (row) => timeCell(row.captured_at),
    },
  },
  {
    id: "word_count",
    label: "Length",
    sortWords: { asc: "shortest first", desc: "longest first" },
    phone: "meta",
    column: {
      id: "word_count",
      accessorKey: "word_count",
      header: "Length",
      sortable: true,
      filter: false,
      cell: (row) => countCell(row.word_count, "words"),
    },
  },
  {
    id: "speaker_count",
    label: "Speakers",
    sortWords: { asc: "fewest first", desc: "most first" },
    column: {
      id: "speaker_count",
      accessorKey: "speaker_count",
      header: "Speakers",
      sortable: true,
      filter: false,
      cell: (row) => countCell(row.speaker_count, "speakers"),
    },
  },
  {
    id: "rule_count",
    label: "Rules",
    sortWords: { asc: "fewest first", desc: "most first" },
    phone: "meta",
    column: {
      id: "rule_count",
      accessorKey: "rule_count",
      header: "Rules",
      /**
       * 🚨 NOT SORTABLE, AND THAT IS HONEST. The count is a client-side join
       * against `rulebook.rules`, a jsonb array on the Rulebook row — there is
       * no SQL column to order by, so a sort here would reorder the loaded
       * page and silently claim to have ordered the set. App policy is that a
       * declared capability runs server-side over the whole result; where it
       * cannot, the column says `false` rather than lying.
       */
      sortable: false,
      filter: false,
      cell: (row) =>
        row.rule_count ? (
          <span className="tabular-nums">{row.rule_count}</span>
        ) : (
          // Zero is a real, meaningful state here: kept material that has not
          // produced a rule yet is exactly what an Expert wants to find.
          <span className="text-muted-foreground tabular-nums" title="No rules came from this source yet.">
            0
          </span>
        ),
    },
  },
];
