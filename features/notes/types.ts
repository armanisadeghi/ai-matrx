// features/notes/types.ts
import type { Database } from "@/types/database.types";

// ── Database row alias ──────────────────────────────────────────────────────
// Single source of truth. All code referencing the DB shape must derive from here.
export type NoteRow = Database["workbench"]["Tables"]["notes"]["Row"];
export type NoteInsert = Database["workbench"]["Tables"]["notes"]["Insert"];
export type NoteUpdate = Database["workbench"]["Tables"]["notes"]["Update"];

export type NoteFolderRow = Database["workbench"]["Tables"]["note_folders"]["Row"];
export type NoteVersionRow = Database["public"]["Tables"]["note_versions"]["Row"];
export type NoteShareRow = Database["public"]["Tables"]["note_shares"]["Row"];

// ── Note type — direct alias of the DB Row ─────────────────────────────────
// The DB schema is the single source of truth. If the schema changes and we
// regenerate types via `pnpm types`, every consumer of `Note` updates
// automatically and any shape drift surfaces as a compile error.
export type Note = NoteRow;

// ── Narrowed shapes for JSON columns ────────────────────────────────────────
// `metadata` is a Json column — the generated type is `unknown`. Consumers use
// this helper to read it as a structured object.
export interface NoteMetadata {
    lastEditorMode?: string;
    [key: string]: unknown;
}

export function getNoteMetadata(
    note: Pick<Note, "metadata"> | null | undefined,
): NoteMetadata {
    const raw = note?.metadata;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return raw as NoteMetadata;
    }
    return {};
}

// ── Sidebar list projection (subset returned by fetchNotesList) ─────────────
// Only fields selected in the list query — keep in sync with thunks.ts.
export type NoteListItem = Pick<
    Note,
    | "id"
    | "created_by"
    | "label"
    | "folder_name"
    | "folder_id"
    | "tags"
    | "updated_at"
    | "position"
    | "organization_id"
    | "project_id"
    | "task_id"
    | "visibility"
    | "version"
>;

// ── Group-by modes for the sidebar ──────────────────────────────────────────
export type NoteGroupBy = "folder" | "organization" | "project" | "task" | "scope";

// ── View modes for the editor ────────────────────────────────────────────────
export type NoteViewMode = "edit" | "split" | "rich" | "md" | "preview" | "diff";

export const NOTE_VIEW_MODES: readonly NoteViewMode[] = [
    "edit",
    "split",
    "rich",
    "md",
    "preview",
    "diff",
];

// ── Input types ─────────────────────────────────────────────────────────────
// Derived from the DB Insert/Update shapes so new columns flow automatically
// and removed columns break callers.
export type CreateNoteInput = Pick<
    NoteInsert,
    | "label"
    | "content"
    | "folder_name"
    | "folder_id"
    | "organization_id"
    | "project_id"
    | "task_id"
    | "tags"
    | "metadata"
    | "position"
    | "visibility"
>;

export type UpdateNoteInput = Pick<
    NoteUpdate,
    | "label"
    | "content"
    | "folder_name"
    | "folder_id"
    | "organization_id"
    | "project_id"
    | "task_id"
    | "tags"
    | "metadata"
    | "position"
    | "visibility"
>;

export interface FolderGroup {
    folder_name: string;
    notes: Note[];
    count: number;
}

export interface NoteFilters {
    search?: string;
    tags?: string[];
    folder_name?: string;
}

export type NoteSortField = 'label' | 'created_at' | 'updated_at';
export type NoteSortOrder = 'asc' | 'desc';

export interface NoteSortConfig {
    field: NoteSortField;
    order: NoteSortOrder;
}

