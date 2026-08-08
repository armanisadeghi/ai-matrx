// features/transcripts/browse/types.ts
//
// What is genuinely TRANSCRIPTS-specific about the canonical entity list.
// The hub's five row shapes collapse to ONE row type with a `kind` column
// (transcript | session | cleanup | unsorted), exactly as trx_list_scoped
// returns it. Active in-session recordings are children, not list rows.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

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

export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
