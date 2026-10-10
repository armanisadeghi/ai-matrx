/**
 * Names and scope builder of `notes-editor`, kept apart from the manifest body so
 * eagerly loaded features can import them without pulling the manifest
 * (descriptions, write targets) into the shell's first-load JS.
 */
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import type { PermissionLevel } from "@/utils/permissions/types";


/** One open-tab entry as emitted in `open_notes_summary`. */
export interface NotesOpenTabSummaryEntry {
  id: string;
  title: string;
  folder: string;
  updated_at: string;
}

/** One scope assignment as emitted in `note_scope_assignments`. */
export interface NotesScopeAssignmentEntry {
  scope_id: string;
  scope_name: string;
  scope_type: string;
}

/**
 * Type-safe payload helper. The Notes runtime calls this when assembling its
 * `ApplicationScope` so TypeScript catches missing required keys and unknown
 * keys at the callsite.
 *
 * Required keys (no `?`) mirror every value declared `alwaysAvailable: true`
 * in the manifest above; optional keys (`?`) mirror `alwaysAvailable: false`.
 */
export function createNotesScope(values: {
  // alwaysAvailable: true → required
  active_scope_kind: "selection" | "note" | "empty";
  open_note_ids: string[];
  open_notes_summary: NotesOpenTabSummaryEntry[];
  all_folder_names: string[];
  note_scope_assignments: NotesScopeAssignmentEntry[];
  editor_mode: "write" | "plain" | "split" | "preview";
  is_split_pane_visible: boolean;
  history_pane_open: boolean;
  // alwaysAvailable: false → optional
  note_bundle?: string;
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  active_text?: string;
  current_heading?: string;
  current_section_text?: string;
  cursor_offset?: number;
  current_note?: {
    __kind: "resource_ref";
    resource_type: "note";
    resource_id: string;
    overlay?: { content: string; is_dirty: true };
  };
  current_note_id?: string;
  current_note_title?: string;
  current_note_folder?: string;
  current_note_tags?: string[];
  current_note_shown_to?: string;
  current_note_published_to_web?: boolean;
  current_note_word_count?: number;
  current_note_updated_at?: string;
  current_note_is_dirty?: boolean;
  current_note_summary?: {
    id: string;
    title: string;
    folder: string;
    tags: string[];
    shown_to: string | null;
    published_to_web: boolean;
    word_count: number;
    updated_at: string;
    is_dirty: boolean;
  };
  shared_access?: {
    shared_with_me: boolean;
    /** Display/context only — never gates access; iam.has_access is authoritative. */
    permission_level: PermissionLevel;
    owner_email: string | null;
  };
  current_folder_note_ids?: string[];
  is_new_note?: boolean;
  split_note_id?: string;
  find_replace?: {
    query: string;
    scope: "file" | "global";
    case_sensitive: boolean;
    use_regex: boolean;
    match_count: number;
  } | null;
  /** Baseline value: a note shows no custom-fields section, so it is always []. */
  custom_fields?: unknown[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
