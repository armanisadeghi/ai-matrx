/**
 * Surface manifest — Notes editor (`matrx-user/notes`).
 *
 * Drives every agent shortcut, context-menu action, and widget that runs inside
 * the Notes feature (`features/notes/**`, route `/notes/**`). The manifest is
 * the **only** contract a no-code agent engineer has with this surface: any
 * value declared here is wireable from the binding editor, and anything not
 * declared here is unreachable.
 *
 * Shape vs. PDF Widgets:
 *
 * - PDF Widgets has one huge document segmented by page; it exposes a 4-way
 *   scope picker (full / current page / page range / selection).
 * - Notes is many small/medium plaintext-markdown resources with live editor
 *   state. Persisted note CONTENT is represented once by `current_note` (a
 *   resource_ref the server resolves on demand); the note's lightweight
 *   metadata (title, folder, tags, visibility, timestamps) is emitted inline
 *   because the page already holds it.
 *
 * Curated groups (band 0-899):
 *
 *   active_scope    Selection / cursor mirror (the runtime cut)
 *   note_identity   The active note's metadata + canonical resource reference
 *   workspace       Open tabs, folder tree, scope assignments
 *   editor_state    Mode, panes, find/replace
 *
 * Plus the cross-surface baseline (`selection`, `text_before`, `text_after`,
 * `content`, `context`) which keeps legacy shortcuts wired to the universal
 * keys working without touching the resolver.
 *
 * The agent author binds a variable to one of these values via agent↔surface
 * binding value_mappings (platform.associations edge metadata). The Notes
 * runtime emits this scope at trigger time (see
 * `features/notes/hooks/useNotesSurfaceScope.ts` →
 * `features/notes/agent-context/buildNotesEditorContextData.ts`); whichever
 * keys aren't relevant for a given run are simply absent from the payload, and
 * unmapped keys are dropped harmlessly by the launcher.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "active_scope",
    label: "Selection & cursor",
    sortOrder: 100,
    description:
      "The live runtime cut — what the user has highlighted and where the cursor sits.",
  },
  {
    key: "note_identity",
    label: "Active note",
    sortOrder: 200,
    description:
      "The persisted note the user has open: canonical resource reference plus its lightweight metadata.",
  },
  {
    key: "workspace",
    label: "Workspace",
    sortOrder: 300,
    description:
      "The surrounding Notes workspace: open tabs, the folder tree, and scope assignments.",
  },
  {
    key: "editor_state",
    label: "Editor state",
    sortOrder: 400,
    description:
      "Transient editor UI state: mode, split pane, history pane, find & replace.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Selection / scope mirror ──────────────────────────────────────────
  {
    name: "active_text",
    label: "Active text",
    description:
      "The highlighted editor selection. When there is no selection, use `current_note`; its content is resolved lazily by the server instead of duplicated by the client.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 210,
    group: "active_scope",
  },
  {
    name: "active_scope_kind",
    label: "Active scope kind",
    description:
      '"selection" when text is highlighted, "note" when no selection but a note is open, "empty" when no note is open. Lets an agent reason about what `active_text` actually represents on this run.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 220,
    group: "active_scope",
  },
  {
    name: "current_heading",
    label: "Current heading",
    description:
      "Nearest markdown heading (`#`, `##`, `###`, …) above the cursor, with leading hashes stripped. Empty when no heading precedes the cursor or no note is open. Lets section-aware actions target the surrounding heading without parsing the markdown themselves.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 230,
    group: "active_scope",
  },
  {
    name: "current_section_text",
    label: "Current section text",
    description:
      "Text under `current_heading`, from the heading line through to (but not including) the next heading of equal or higher level — or end of note. Empty when no heading precedes the cursor. Wire here for 'rewrite this section' style actions that should operate on a heading-bounded block without requiring the user to select it manually.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 240,
    group: "active_scope",
  },
  {
    name: "cursor_offset",
    label: "Cursor character offset",
    description:
      "0-indexed character offset of the cursor into the active note's content. When a selection exists this is `selectionStart`. Useful for 'insert at cursor' style actions. Zero when no note is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 250,
    group: "active_scope",
  },

  // ── Active note — canonical reference + metadata ──────────────────────
  {
    name: "current_note",
    label: "Active note resource",
    description:
      "Canonical resource reference for the active persisted note. The server resolves its title, folder, tags, content, timestamps, permissions, and other available fields. When the editor is dirty, the same reference carries a request-scoped content overlay so the unsaved buffer remains authoritative. Absent when no note is open or the note is a client-only draft.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 180,
    sortOrder: 300,
    group: "note_identity",
  },
  {
    name: "current_note_id",
    label: "Active note ID",
    description:
      "UUID of the note the user has open in the active tab. Empty when no note is open. For client-only drafts this id exists locally but is not yet persisted (see `is_new_note`).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 305,
    group: "note_identity",
  },
  {
    name: "current_note_title",
    label: "Title",
    description:
      "Display title (label) of the active note as shown on the tab and info panel. Empty when no note is open or the title hasn't loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
    group: "note_identity",
  },
  {
    name: "current_note_folder",
    label: "Folder",
    description:
      "Name of the folder the active note lives in (e.g. Draft, Inbox). Empty when no note is open or the note has no folder.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 315,
    group: "note_identity",
  },
  {
    name: "current_note_tags",
    label: "Tags",
    description:
      "The active note's tag strings, exactly as shown in the info panel. Empty/absent when no note is open or the note has no tags.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 320,
    group: "note_identity",
  },
  {
    name: "current_note_visibility",
    label: "Visibility",
    description:
      "Visibility of the active note (personal / internal / public). Empty when no note is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 325,
    group: "note_identity",
  },
  {
    name: "current_note_word_count",
    label: "Word count",
    description:
      "Word count of the live editor buffer (including unsaved edits). Absent when no note is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 330,
    group: "note_identity",
  },
  {
    name: "current_note_updated_at",
    label: "Last updated",
    description:
      "ISO timestamp of the active note's last persisted update. Empty when no note is open or the note was never saved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 335,
    group: "note_identity",
  },
  {
    name: "current_note_is_dirty",
    label: "Has unsaved changes",
    description:
      "True when the editor buffer differs from the last saved version of the active note. Absent when no note is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 340,
    group: "note_identity",
  },
  {
    name: "current_note_summary",
    label: "Active note summary",
    description:
      "Composite of the active note's metadata as one object: { id, title, folder, tags, visibility, word_count, updated_at, is_dirty }. Mirrors the individual note-identity values (completeness law). Absent when no note is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 345,
    group: "note_identity",
  },
  {
    name: "shared_access",
    label: "Shared access",
    description:
      "Present only when the active note was shared WITH the current user (not owned): { shared_with_me: true, permission_level: viewer|editor|admin, owner_email }. Absent for the user's own notes. Lets agents refuse or adapt writes on viewer-level notes.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 348,
    group: "note_identity",
  },

  // ── Workspace context ─────────────────────────────────────────────────
  {
    name: "open_note_ids",
    label: "Open note IDs",
    description:
      "Array of note UUIDs the user currently has open as tabs in this Notes view. Always populated — empty array when no tabs are open.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 360,
    sortOrder: 350,
    group: "workspace",
  },
  {
    name: "open_notes_summary",
    label: "Open tabs summary",
    description:
      "One entry per open tab with { id, title, folder, updated_at }, in tab order. Always populated — empty array when no tabs are open. Richer sibling of `open_note_ids` for agents that reason about the whole tab strip.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    sortOrder: 355,
    group: "workspace",
  },
  {
    name: "all_folder_names",
    label: "All folders",
    description:
      "Every folder name in the user's Notes sidebar (defaults + custom), sorted as displayed. Always populated — empty array only in embedded/demo contexts before the notes list loads. Useful for 'move/file this note' style actions.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 150,
    autoContext: false,
    sortOrder: 360,
    group: "workspace",
  },
  {
    name: "current_folder_note_ids",
    label: "Folder sibling note IDs",
    description:
      "UUIDs of the other (non-deleted) notes in the active note's folder — the siblings, excluding the active note itself. Absent when no note is open or the folder has no other notes. Resolvable from ids, so bindable-only by default.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 380,
    autoContext: false,
    sortOrder: 365,
    group: "workspace",
  },
  {
    name: "note_scope_assignments",
    label: "Note scopes",
    description:
      "Scope assignments tagged onto the active note (from ctx_scope_assignments): one entry per assignment with { scope_id, scope_name, scope_type }. Always populated — empty array when the note has no scopes, none are loaded yet, or no note is open.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 370,
    group: "workspace",
  },

  // ── Editor / pane state ───────────────────────────────────────────────
  {
    name: "editor_mode",
    label: "Editor mode",
    description:
      'Current Notes editor mode: "plain" (raw textarea), "split" (textarea + markdown preview), "preview" (read-only render), "wysiwyg" (visual markdown editor), or "markdown-split". Lets actions adapt or refuse when the mode is unsuitable (e.g. inserting at cursor is meaningless in preview).',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 400,
    group: "editor_state",
  },
  {
    name: "is_new_note",
    label: "Note is new (unsaved)",
    description:
      "True when the active note is client-only — created in this session but never persisted to the database (often the case for the first 'New Note' click before any edit). False when the note exists server-side or no note is open. Actions that depend on a stable note id should save first or refuse.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 410,
    group: "editor_state",
  },
  {
    name: "is_split_pane_visible",
    label: "Split pane visible",
    description:
      "True when the Notes view is showing the right-hand split pane (a second note alongside the active one). Always populated. Pairs with `split_note_id`.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 420,
    group: "editor_state",
  },
  {
    name: "split_note_id",
    label: "Split pane note ID",
    description:
      'UUID of the note currently shown in the right-hand split pane. Empty when the split pane is closed. Lets "compare these two", "merge into left", and similar dual-note actions target the secondary note.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 430,
    group: "editor_state",
  },
  {
    name: "history_pane_open",
    label: "History pane open",
    description:
      "True when the version-history side panel is open in this Notes view. Always populated — false when closed or when the editor is embedded outside the multi-tab view.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 440,
    group: "editor_state",
  },
  {
    name: "find_replace",
    label: "Find & replace state",
    description:
      "Present only while the find & replace bar is open: { query, scope: file|global, case_sensitive, use_regex, match_count }. Absent when the bar is closed. Bindable-only — rarely useful as automatic context.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 450,
    group: "editor_state",
  },
];

export const notesEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/notes",
  label: "Notes",
  urlPattern: "/notes/[id]",
  intro: `<surface_intro>
You are on the Notes editor: the user's markdown workspace of many small-to-medium notes, organized into folders and opened as tabs. One note is active in the editor at a time; a second may sit in a split pane.
Read the values in tiers: the Selection & cursor group is the live runtime cut (what is highlighted, where the cursor is); the Active note group identifies the persisted note and its metadata — its full content resolves through the current_note resource reference (with an unsaved-buffer overlay when dirty); the Workspace group describes the surrounding tabs, folders, and scope assignments; Editor state tells you what the UI can currently do (mode, panes, find bar).
When shared_access is present the note belongs to someone else — respect its permission_level before proposing writes. When is_new_note is true the note has no server row yet; actions needing a stable id should save first or refuse.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    // Baseline:
    //   `selection` / `text_before` / `text_after` — the universal text-editor
    //     triad. Notes is the canonical text surface; these always make sense.
    // `content` remains declared for the one case with no server resource yet:
    // a brand-new client-only note. Persisted notes emit `current_note` only.
    pickBaseline("selection", "text_before", "text_after", "content"),
    surfaceSpecific,
  ),
};

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
  editor_mode: "plain" | "split" | "preview" | "wysiwyg" | "markdown-split";
  is_split_pane_visible: boolean;
  history_pane_open: boolean;
  // alwaysAvailable: false → optional
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
  current_note_visibility?: string;
  current_note_word_count?: number;
  current_note_updated_at?: string;
  current_note_is_dirty?: boolean;
  current_note_summary?: {
    id: string;
    title: string;
    folder: string;
    tags: string[];
    visibility: string;
    word_count: number;
    updated_at: string;
    is_dirty: boolean;
  };
  shared_access?: {
    shared_with_me: true;
    permission_level: "viewer" | "editor" | "admin";
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
  };
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
