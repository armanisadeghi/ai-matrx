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
 *   state. Persisted note data is represented once by `current_note`; the
 *   server resolves its complete readable record and content on demand.
 *
 * The surface therefore exposes three concentric tiers of state:
 *
 *   200-249   Selection / scope mirror (the runtime cut)
 *   300-349   Canonical active-note resource reference
 *   350-379   Workspace context (open tabs, folder tree, sidebar)
 *   400-449   Editor / pane state (mode, dirty, split)
 *
 * Plus the cross-surface baseline (`selection`, `text_before`, `text_after`,
 * `content`, `context`) which keeps legacy shortcuts wired to the universal
 * keys working without touching the resolver.
 *
 * The agent author binds a variable to one of these values via
 * agent↔surface binding value_mappings (platform.associations edge metadata). The Notes runtime emits this scope at
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
      "The highlighted editor selection. When there is no selection, use `current_note`; its content is resolved lazily by the server instead of duplicated by the client.",
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

  // ── Canonical active-note reference (300-349) ─────────────────────────
  {
    name: "current_note",
    label: "Active note resource",
    description:
      "Canonical resource reference for the active persisted note. The server resolves its title, folder, tags, content, timestamps, permissions, and other available fields. When the editor is dirty, the same reference carries a request-scoped content overlay so the unsaved buffer remains authoritative.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 180,
    sortOrder: 300,
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
  label: "Notes",
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
  editor_mode: "plain" | "split" | "preview" | "wysiwyg" | "markdown-split";
  is_split_pane_visible: boolean;
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
  is_new_note?: boolean;
  split_note_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
