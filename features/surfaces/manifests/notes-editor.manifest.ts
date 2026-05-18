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
 * - Notes is many small/medium plaintext-markdown notes with a folder tree,
 *   multiple open tabs, and a split pane. The natural scope is binary —
 *   "selection" vs "whole note" — so we expose a single `active_text` mirror
 *   plus `active_scope_kind` rather than a four-way picker.
 *
 * The surface therefore exposes three concentric tiers of state:
 *
 *   200-249   Selection / scope mirror (the runtime cut)
 *   300-349   Active-note identity and metadata
 *   350-379   Workspace context (open tabs, folder tree, sidebar)
 *   400-449   Editor / pane state (mode, dirty, split)
 *
 * Plus the cross-surface baseline (`selection`, `text_before`, `text_after`,
 * `content`, `context`) which keeps legacy shortcuts wired to the universal
 * keys working without touching the resolver.
 *
 * The agent author binds a variable to one of these values via
 * `agx_agent_surface.value_mappings`. The Notes runtime emits this scope at
 * trigger time (see `features/notes/hooks/useNotesSurfaceScope.ts`); whichever
 * keys aren't relevant for a given run are simply absent from the payload, and
 * unmapped keys are dropped harmlessly by the launcher.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Selection / scope mirror (200-249) ────────────────────────────────
  {
    name: "active_text",
    label: "Active text",
    description:
      "What the user is currently acting on: the highlighted selection if any text is selected, otherwise the full note body. Empty when no note is open. Wire here for an agent that should follow the user's intent — 'run on selection if there is one, run on the whole note otherwise'.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 210,
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
  },

  // ── Active-note identity & metadata (300-349) ─────────────────────────
  {
    name: "current_note_id",
    label: "Active note ID",
    description:
      "UUID of the note the user has open in the active tab. Empty when no note is open. Required for any action that writes back to the note.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "current_note_title",
    label: "Active note title",
    description:
      "Human title (`label`) of the currently open note. Empty when no note is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
  },
  {
    name: "current_note_folder",
    label: "Active note folder",
    description:
      'Free-text folder the active note belongs to (e.g. "Draft", "Personal", "Business"). Empty when uncategorized or no note is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 32,
    sortOrder: 315,
  },
  {
    name: "current_note_tags",
    label: "Active note tags",
    description:
      "Array of tag strings on the currently open note. Empty array when the note has no tags or no note is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 320,
  },
  {
    name: "current_note_word_count",
    label: "Active note word count",
    description:
      "Computed whitespace-delimited word count of the active note's content. Zero when no note is open. Lets agent actions adapt to content size (e.g. summarize-vs-skip thresholds).",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 325,
  },
  {
    name: "current_note_updated_at",
    label: "Active note updated at",
    description:
      "ISO 8601 timestamp of the most recent persisted change to the active note. Empty when the note has never been saved or no note is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 340,
  },
  {
    name: "current_note_is_dirty",
    label: "Active note has unsaved changes",
    description:
      "True when the active note has local edits that have not been persisted yet. False when clean or no note is open. Lets agents prompt the user to save first or refuse to act on stale state.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 345,
  },

  // ── Workspace context (350-379) ───────────────────────────────────────
  {
    name: "open_note_ids",
    label: "Open note IDs",
    description:
      "Array of note UUIDs the user currently has open as tabs in this Notes view. Always populated — empty array when no tabs are open.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 360,
    sortOrder: 350,
  },
  {
    name: "open_notes_summary",
    label: "Open notes summary",
    description:
      "Array of `{ id, title, folder, updated_at }` for every open tab, in tab order. Always populated — empty array when no tabs are open. Lets agents reason about all visible notes (\"summarize my open notes\", \"find duplicates across tabs\") without re-fetching each one.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    sortOrder: 360,
  },
  {
    name: "current_folder_note_ids",
    label: "Notes in current folder",
    description:
      "Array of note UUIDs whose `folder_name` matches the active note's folder. Empty array when the active note is uncategorized, no note is open, or no other notes share the folder. Powers \"find similar in this folder\" and \"tag all in folder\" style actions.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 360,
    sortOrder: 370,
  },
  {
    name: "all_folder_names",
    label: "All folder names",
    description:
      'Array of every distinct folder name across the user\'s notes, ordered by the workspace default folder priority then alphabetically. Always populated — empty array when no folders exist. Powers "move to folder X" suggestions and folder-aware destinations.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 375,
  },

  // ── Editor / pane state (400-449) ─────────────────────────────────────
  {
    name: "editor_mode",
    label: "Editor mode",
    description:
      'Current Notes editor mode: "plain" (raw textarea), "split" (textarea + markdown preview), "preview" (read-only render), "wysiwyg" (visual markdown editor), or "markdown-split". Lets actions adapt or refuse when the mode is unsuitable (e.g. inserting at cursor is meaningless in preview).',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 400,
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
  },
];

export const notesEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/notes",
  values: mergeBaselineValues(
    // Baseline:
    //   `selection` / `text_before` / `text_after` — the universal text-editor
    //     triad. Notes is the canonical text surface; these always make sense.
    //   `content` — full note body. Kept alongside `active_text` so legacy
    //     shortcuts wired to `content` keep working; new shortcuts should
    //     prefer `active_text` (selection-aware) or `content` (always whole).
    //   `context` — free-form escape hatch (the legacy editor-surround XML
    //     blob from `formatEditorSurroundContext` flows through here).
    pickBaseline(
      "selection",
      "text_before",
      "text_after",
      "content",
      "context",
    ),
    surfaceSpecific,
  ),
};

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
  open_notes_summary: Array<{
    id: string;
    title: string;
    folder: string;
    updated_at: string;
  }>;
  all_folder_names: string[];
  editor_mode: "plain" | "split" | "preview" | "wysiwyg" | "markdown-split";
  is_split_pane_visible: boolean;
  // alwaysAvailable: false → optional
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown> | string;
  active_text?: string;
  current_heading?: string;
  current_section_text?: string;
  cursor_offset?: number;
  current_note_id?: string;
  current_note_title?: string;
  current_note_folder?: string;
  current_note_tags?: string[];
  current_note_word_count?: number;
  current_note_updated_at?: string;
  current_note_is_dirty?: boolean;
  current_folder_note_ids?: string[];
  is_new_note?: boolean;
  split_note_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
