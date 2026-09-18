// features/transcripts/browse/bulkExport.ts
//
// /transcripts' one bulk action: export the selection as a CSV.
//
// It is the FIRST consumer of `EntityListConfig.bulkActions`, and it was chosen
// because it is the cheap half of the contract — nothing is written, nothing is
// destroyed — so the shell's mechanics (checkboxes, shift-range, the honest
// "all matching" escalation, the confirm, the toast) could be proven on a live
// surface without risking a row. The verb itself is the surface's; everything
// around it is the primitive's.
//
// Export helpers are the repo's existing ones (`components/agent-copy/export`),
// which is also what this hub's toolbar ExportMenu uses — one CSV writer, not a
// second one that quotes commas differently.

import {
  downloadFile,
  exportFilename,
  rowsToCsv,
} from "@/components/agent-copy/export";
import type {
  EntityBulkActionResult,
  EntityBulkSelection,
} from "@/lib/entity-list/selection";
import { KIND_META, primaryRowHref, type TranscriptListKind } from "./types";
import type { TranscriptListRow } from "./types";

/** The columns the file carries, named the way the hub names them on screen. */
const EXPORT_COLUMNS = [
  { key: "type", header: "Type" },
  { key: "title", header: "Title" },
  { key: "status", header: "Status" },
  { key: "folder", header: "Folder" },
  { key: "tags", header: "Tags" },
  { key: "duration_seconds", header: "Duration (s)" },
  { key: "word_count", header: "Words" },
  { key: "organization", header: "Organization" },
  { key: "owner", header: "Owner" },
  { key: "updated_at", header: "Updated" },
  { key: "created_at", header: "Created" },
  { key: "link", header: "Link" },
  { key: "id", header: "Id" },
];

function projectRow(row: TranscriptListRow): Record<string, unknown> {
  return {
    type: KIND_META[row.kind as TranscriptListKind]?.label ?? row.kind,
    title: row.title,
    status: row.status,
    folder: row.folder_name,
    tags: row.tags?.join(" | "),
    duration_seconds: row.duration_seconds,
    word_count: row.word_count,
    organization: row.organization_name,
    owner: row.owner_email,
    updated_at: row.updated_at,
    created_at: row.created_at,
    link: primaryRowHref(row),
    id: row.id,
  };
}

/**
 * 🚨 THE SENTENCE BEFORE THE CLICK. Exporting is not destructive, but it does
 * put a file of this organization's records on a laptop, and on a selection
 * that outlived a page change it can honestly cover FEWER rows than the number
 * on the bar — the shell holds ids for rows it no longer has objects for. Both
 * facts are named here rather than discovered in the downloaded file.
 */
export function confirmTranscriptExport(
  selection: EntityBulkSelection<TranscriptListRow>,
) {
  const held = selection.rows.length;
  const short = held < selection.count;
  return {
    title: short
      ? `Export ${held.toLocaleString()} of the ${selection.count.toLocaleString()} selected items?`
      : `Export ${selection.count.toLocaleString()} selected item${selection.count === 1 ? "" : "s"}?`,
    description: short
      ? `This downloads a CSV of the ${held.toLocaleString()} selected items this page currently holds — the other ${(selection.count - held).toLocaleString()} are selected but were loaded on a page you have moved off, so they cannot be written. Use "Select all matching this filter" to include every one of them. The file carries titles, folders, tags, durations, word counts, owners and links — never the transcript text.`
      : `This downloads a CSV to your computer carrying each item's title, type, status, folder, tags, duration, word count, organization, owner and link. It does NOT carry the transcript text, and nothing here is changed, moved or deleted.`,
    confirmLabel: "Download CSV",
  };
}

export function exportTranscriptSelection(
  selection: EntityBulkSelection<TranscriptListRow>,
): EntityBulkActionResult {
  const rows = selection.rows.map(projectRow);
  if (rows.length === 0) {
    // Never a silent no-op file: the action says why nothing came out.
    throw new Error(
      "None of the selected items are loaded on this page, so there was nothing to write. Page back to them, or use “Select all matching this filter”.",
    );
  }
  downloadFile(
    exportFilename("transcripts-selection", "csv"),
    rowsToCsv(rows, EXPORT_COLUMNS),
    "text/csv",
  );
  return {
    message: `Exported ${rows.length.toLocaleString()} item${rows.length === 1 ? "" : "s"} to CSV.`,
    // The file is written; the person may well want a second format next.
    keepSelection: true,
  };
}
