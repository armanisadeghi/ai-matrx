// features/transcripts/browse/copyRows.ts
//
// THE copy projections of one transcripts row — what "Copy" (a person's
// sentence) and "Copy for AI" (the agent row) carry. The list config's copy
// block and the Knowledge hub's transcript rows (H6d) both call these, so the
// two surfaces can never copy the same record two different ways.

import { transcriptRowSummary } from "@/features/transcripts/format";
import {
  KIND_META,
  primaryRowHref,
  type TranscriptListKind,
  type TranscriptListRow,
} from "./types";

export const TRANSCRIPT_COPY_ROW_KIND = "transcript-hub-item";
export const TRANSCRIPT_COPY_LIST_KIND = "transcript-hub-list";

export function transcriptCopyHuman(
  row: TranscriptListRow,
  kindLabel?: string,
): string {
  return transcriptRowSummary({
    kind: kindLabel ?? KIND_META[row.kind as TranscriptListKind]?.label ?? row.kind,
    title: row.title,
    updated_at: row.updated_at,
    duration_seconds: row.duration_seconds,
    word_count: row.word_count,
    scope: row.organization_name,
    id: row.id,
  });
}

export function transcriptCopyAgent(
  row: TranscriptListRow,
  href?: string,
): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    folder_name: row.folder_name,
    tags: row.tags,
    duration_seconds: row.duration_seconds,
    word_count: row.word_count,
    is_draft: row.is_draft,
    visibility: row.visibility,
    organization_name: row.organization_name,
    owner_email: row.owner_email,
    access_level: row.access_level,
    updated_at: row.updated_at,
    created_at: row.created_at,
    href: href ?? primaryRowHref(row),
    body_included: false,
  };
}
