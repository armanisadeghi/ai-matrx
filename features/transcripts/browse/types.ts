// features/transcripts/browse/types.ts
//
// What is genuinely TRANSCRIPTS-specific about the canonical entity list.
// The hub's five row shapes collapse to ONE row type with a `kind` column
// (transcript | session | cleanup | unsorted), exactly as trx_list_scoped
// returns it. Active in-session recordings are children, not list rows.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";
// THE package duration formatter (`@ai-matrx/kit/format`, census H1
// 2026-09-07). `compact` is the elapsed-work voice: 250ms / 5.2s / 5m 30s /
// 1h 02m. THE UNIT LAW puts the unit in the name.
import { formatDurationSeconds } from "@ai-matrx/kit/format";

/** One row, exactly as trx_list_scoped returns it. Never hand-mirrored. */
export type TranscriptListRow =
  Database["public"]["Functions"]["trx_list_scoped"]["Returns"][number];

export type TranscriptListKind =
  | "transcript"
  | "session"
  | "cleanup"
  | "unsorted";

/** All four scopes — transcripts and sessions carry visibility + iam grants. */
export const TRANSCRIPT_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
];

/** Fields the table can write back inline (title only — per-kind routing). */
export interface TranscriptRowEdit {
  title?: string;
}

export const KIND_META: Record<
  TranscriptListKind,
  { label: string; accent: string }
> = {
  transcript: { label: "Transcript", accent: "text-sky-500" },
  session: { label: "Session", accent: "text-violet-500" },
  cleanup: { label: "Cleanup", accent: "text-amber-500" },
  unsorted: { label: "Unsorted", accent: "text-rose-500" },
};

/** The row's primary destination — same per-kind routing the hub used. */
export function primaryRowHref(row: TranscriptListRow): string {
  switch (row.kind as TranscriptListKind) {
    case "transcript":
      return `/transcripts/processor?focus=${encodeURIComponent(row.id)}`;
    case "session":
      return `/transcripts/studio?session=${encodeURIComponent(row.id)}`;
    case "cleanup":
      return `/transcripts/cleanup?session=${encodeURIComponent(row.id)}`;
    case "unsorted":
      return "/transcripts/scribe/unsorted";
  }
}

/** A zero-length transcript is an UNKNOWN length here, not "0s". */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  return formatDurationSeconds(seconds, { style: "compact" });
}
