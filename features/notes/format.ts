// features/notes/format.ts
//
// Shared HUMAN summaries + agent-payload projections for the Notes surfaces
// (agent-copy rollout). One definition per shape — the sidebar row, the list
// header, the search results and the editor's record pair all read from here,
// so a note copied from a row and the same note copied from the editor never
// disagree about what a note IS.
//
// A note's BODY is the highest-value AI capture in the app, so the record
// shapes carry content verbatim; the LIST shapes deliberately do not (a
// sidebar copy of 300 notes must not become a 2MB paste). Row payloads say so
// explicitly via `content_included: false` rather than silently omitting it.

import { humanLines } from "@/features/marketing/lib/copy-payloads";
import type { NoteListItem } from "@/features/notes/types";
import type { NoteRecord } from "@/features/notes/redux/notes.types";

/** Route + surface string stamped into every notes payload's envelope. */
export function noteLocation(surface: string): string {
  return `AI Matrx — Notes — ${surface}`;
}

/** The label a note shows in lists, with the untitled fallback the UI uses. */
export function noteDisplayLabel(
  note: { label?: string | null } | null | undefined,
): string {
  const label = note?.label?.trim();
  return label && label.length > 0 ? label : "Untitled note";
}

function words(content: string | null | undefined): number {
  const text = (content ?? "").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

// ── List row (sidebar / search result) ──────────────────────────────────────

type AnyNote = NoteListItem | NoteRecord;

/**
 * Human summary of one note as a LIST row — the fields the row renders, plus
 * the folder and tags a compact row may truncate away. No body: see the module
 * note above.
 */
export function noteRowSummary(note: AnyNote): string {
  return humanLines([
    ["Note", noteDisplayLabel(note)],
    ["Folder", note.folder_name],
    ["Tags", (note.tags ?? []).join(", ")],
    ["Visibility", note.visibility],
    ["Updated", note.updated_at],
    ["Id", note.id],
  ]);
}

/** Agent projection of a list row. States that the body was NOT included. */
export function noteRowData(note: AnyNote) {
  return {
    id: note.id,
    label: noteDisplayLabel(note),
    folder_name: note.folder_name ?? null,
    folder_id: note.folder_id ?? null,
    tags: note.tags ?? [],
    visibility: note.visibility,
    updated_at: note.updated_at ?? null,
    organization_id: note.organization_id ?? null,
    project_id: note.project_id ?? null,
    task_id: note.task_id ?? null,
    content_included: false as const,
  };
}

/** Compact per-row projection for shortened list variants. */
export function noteKeyFields(note: AnyNote) {
  return {
    label: noteDisplayLabel(note),
    folder: note.folder_name ?? null,
    tags: note.tags ?? [],
    updated_at: note.updated_at ?? null,
  };
}

/**
 * Human summary of a notes list. `total` is the unfiltered count so a
 * filtered/grouped copy states what it is a slice OF.
 */
export function notesListSummary(
  notes: AnyNote[],
  ctx: { surface: string; total?: number; filter?: string; scope?: string },
): string {
  const header = humanLines([
    ["Notes", ctx.surface],
    ["Shown", notes.length],
    [
      "Total",
      ctx.total !== undefined && ctx.total !== notes.length ? ctx.total : null,
    ],
    ["Filter", ctx.filter?.trim() || null],
    ["Scope", ctx.scope || null],
  ]);
  if (notes.length === 0) return `${header}\n\n(no notes)`;
  return `${header}\n\n${notes.map(noteRowSummary).join("\n\n")}`;
}

/** Rows for CSV export of a notes list (flat, one row per note). */
export function notesCsvRows(notes: AnyNote[]): Array<Record<string, unknown>> {
  return notes.map((n) => ({
    id: n.id,
    label: noteDisplayLabel(n),
    folder_name: n.folder_name ?? "",
    tags: (n.tags ?? []).join("|"),
    visibility: n.visibility,
    updated_at: n.updated_at ?? "",
  }));
}

// ── The open note (record) ──────────────────────────────────────────────────

/**
 * Everything the editor knows about the note the user has open RIGHT NOW,
 * including the live buffer, the unsaved-changes state and any save error the
 * user is staring at. Built at click time by the callsite — never cached.
 */
export interface NoteRecordView {
  note: NoteRecord;
  /** The live editor buffer when the callsite has one, else the store value. */
  content: string | null;
  /** Names of fields dirty vs the last save. */
  dirtyFields: string[];
  /** The exact error sentence rendered to the user, if any. */
  error: string | null;
  saving: boolean;
  consecutiveSaveFailures: number;
  /** Read-only because the note is shared at viewer level. */
  readOnly?: boolean;
}

/**
 * Human summary of the open note. Errors and unsaved state come FIRST — they
 * are the highest-value content on the screen and a payload that buries them
 * under metadata is the defect the MISSION section exists to prevent.
 */
export function noteRecordSummary(view: NoteRecordView): string {
  const { note } = view;
  const lines: string[] = [];
  if (view.error) lines.push(`SAVE ERROR: ${view.error}`);
  if (view.consecutiveSaveFailures > 0) {
    lines.push(
      `Consecutive save failures: ${view.consecutiveSaveFailures}`,
    );
  }
  if (view.dirtyFields.length > 0) {
    lines.push(`UNSAVED CHANGES: ${view.dirtyFields.join(", ")}`);
  }
  if (view.readOnly) lines.push("Read-only (shared at viewer level)");
  if (lines.length > 0) lines.push("");
  lines.push(
    humanLines([
      ["Note", noteDisplayLabel(note)],
      ["Folder", note.folder_name],
      ["Tags", (note.tags ?? []).join(", ")],
      ["Visibility", note.visibility],
      ["Words", words(view.content)],
      ["Characters", (view.content ?? "").length],
      ["Updated", note.updated_at],
      ["Saving", view.saving ? "yes" : null],
      ["Id", note.id],
    ]),
  );
  lines.push("", "--- Body ---", view.content ?? "(empty)");
  return lines.join("\n");
}

/** Agent projection of the open note, body included. */
export function noteRecordData(view: NoteRecordView) {
  const { note } = view;
  return {
    id: note.id,
    label: noteDisplayLabel(note),
    folder_name: note.folder_name ?? null,
    folder_id: note.folder_id ?? null,
    tags: note.tags ?? [],
    visibility: note.visibility,
    organization_id: note.organization_id ?? null,
    project_id: note.project_id ?? null,
    task_id: note.task_id ?? null,
    updated_at: note.updated_at ?? null,
    word_count: words(view.content),
    char_count: (view.content ?? "").length,
    content: view.content,
    // The live editor state — never a saved-row snapshot.
    unsaved_changes: {
      dirty: view.dirtyFields.length > 0,
      fields: view.dirtyFields,
    },
    save_error: view.error,
    consecutive_save_failures: view.consecutiveSaveFailures,
    saving: view.saving,
    read_only: view.readOnly ?? false,
  };
}

/** Metadata-only projection — the record without its body, for short variants. */
export function noteRecordMetaData(view: NoteRecordView) {
  const { content, ...rest } = noteRecordData(view);
  return {
    ...rest,
    content_included: false as const,
    content_omitted_chars: (content ?? "").length,
  };
}
