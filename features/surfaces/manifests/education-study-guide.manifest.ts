/**
 * Surface manifest — one study guide (`matrx-user/education-study-guide`).
 *
 * The reader at /education/study-guides/[id]: ONE guide (a Notes note in the
 * "Study Notes" folder) rendered in the centre, the guide picker and outline
 * on the left, and the "Notes & comments" / "Key Terms" tabs on the right.
 * The library route /education/study-guides (the same reader with no guide
 * open) stays on `matrx-user/education-study-guides`.
 *
 * Why its own surface (2026-09-27): the detail page is about one record that
 * the person reads, edits and annotates. The list surface had no write
 * targets, never emitted the private notes it declared, and did not see the
 * guide's comments at all; an agent asked to "add a note on this paragraph"
 * had no way to do it through the page.
 *
 * Read half: `study_guide` is THE record (10_000): id, title,
 * the whole markdown body, version and the counts of what the right-hand
 * tabs hold. `personal_annotations` (private highlights and notes) and
 * `guide_comments` (shared comment threads, suggestions included) are the
 * two sub-item lists — part of the record, so also 10_000
 * (Arman 2026-09-27) — read from the page's own annotation sidecar through a
 * child that publishes into a ref (`StudyGuideAgentBridge`).
 *
 * Write half — all `ask`, all saved through the page's own functions:
 *  - `create_study_guides`: creates a Notes-backed guide in the Education
 *    Study Notes folder through the same path as the library button.
 *  - `guide_content` (patchable): the guide's body, saved with the reader's
 *    own splice-save (`guideSource(...).save` → `spliceSaveBody` on the note,
 *    compare-and-swap on its version) — the same path an accepted suggestion
 *    takes.
 *  - `create_/update_/delete_personal_notes`: private highlights (on a quoted
 *    passage) and whole-guide notes, through the sidecar's own service calls
 *    (`createHighlight`, then the sidecar's `saveNote` / `recolor` /
 *    `removeHighlight`).
 *  - `create_/update_/delete_guide_comments`: comments, replies and
 *    suggestions (`addComment`, then the sidecar's `editComment` /
 *    `resolveComment` / `deleteComment`).
 *  - `delete_study_guides`: moves only the open Notes-backed guide to Trash
 *    through the same archive path as the reader's delete control.
 * Every list is checked whole (`features/education/study-guides/studyGuideAgentWrites.ts`,
 * unit-tested) before the approval card; `apply` returns what landed, with ids.
 *
 * Deliberately read-only here:
 *  - `key_terms` — they are flashcards of the decks linked to the guide, edited
 *    in the flashcard editor, not on this page. Linking a deck happens in the
 *    "Manage linked flashcards" picker, which loads the deck list only when it
 *    opens, so there is no deck list here for an agent to name ids from.
 *  - the guide's title: this page has no rename in read mode (the Notes editor
 *    it opens in edit mode does).
 *
 * Edit mode: pressing Edit mounts the canonical Notes editor, whose own surface
 * (`matrx-user/notes`) is the deeper provider and takes over while it is open;
 * its `note_content` target then edits the same note. This surface's targets
 * refuse while the person is editing.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_STUDY_GUIDE_SURFACE_NAME = "matrx-user/education-study-guide";

const groups: SurfaceValueGroup[] = [
  { key: "guide", label: "The guide", sortOrder: 100, description: "The study guide open in the reader." },
  { key: "navigation", label: "Guide navigation", sortOrder: 200, description: "The person's other guides and this guide's outline." },
  { key: "personal_notes", label: "My notes", sortOrder: 300, description: "The person's private highlights and notes on this guide." },
  { key: "comments", label: "Comments", sortOrder: 400, description: "Comment threads and suggestions on this guide, visible to everyone who can read it." },
  { key: "key_terms", label: "Key terms", sortOrder: 500, description: "Flashcard terms from the decks linked to this guide." },
];

const PERSONAL_NOTE_SHAPE =
  '{ id, kind: "highlight" | "note", quote: string | null, note: string, color: "yellow" | "green" | "blue" | "pink" | "purple", attached: boolean, created_at }';
const COMMENT_SHAPE =
  "{ id, quote: string | null, body, suggested_text: string | null, author, mine: boolean, resolved: boolean, attached: boolean, created_at, replies: [{ id, body, author, mine, created_at }] }";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "study_guide",
    label: "Study guide",
    description:
      'THE guide open on this page, whole: { id, title, content (the full markdown body — what guide_content edits), version, updated_at, tags, key_term_count, personal_note_count, comment_count }. The counts say how many entries key_terms, personal_annotations and guide_comments hold (null while that list is still loading or failed). Absent while the guide loads or when it cannot be opened.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    inlineUpTo: 7000,
    group: "guide",
    sortOrder: 100,
  },
  { name: "guide_loaded", label: "Guide loaded", description: "True when the guide has loaded; false while loading or after a failed read (load_error then says why).", valueType: "boolean", alwaysAvailable: true, typicalCharCount: 5, group: "guide", sortOrder: 110 },
  { name: "guide_id", label: "Guide ID", description: "ID of the open guide (a Notes note id). Absent until it loads.", valueType: "string", alwaysAvailable: false, typicalCharCount: 36, group: "guide", sortOrder: 120 },
  { name: "guide_title", label: "Guide title", description: "Title of the open guide.", valueType: "string", alwaysAvailable: false, typicalCharCount: 80, group: "guide", sortOrder: 130 },
  { name: "guide_content", label: "Guide content", description: "The guide's full markdown body, exactly as saved — the read twin of the guide_content write target (anchored edits resolve against this text). Same text as study_guide.content.", valueType: "string", alwaysAvailable: false, typicalCharCount: 8000, autoContext: false, group: "guide", sortOrder: 140 },
  { name: "reader_mode", label: "Reader mode", description: '"read" while the guide is shown in the reader; "edit" while the person has the Notes editor open on it (this page\'s write targets refuse then).', valueType: "string", alwaysAvailable: true, typicalCharCount: 4, group: "guide", sortOrder: 150 },
  { name: "load_error", label: "Load error", description: "Why the guide, the guide list, or the last save failed; absent on a normal load. A failed read is not an empty guide.", valueType: "string", alwaysAvailable: false, typicalCharCount: 160, group: "guide", sortOrder: 160 },
  { name: "available_guides", label: "My study guides", description: "The person's study guides in the picker, newest first, as { id, title, version }. Empty when they have none; absent while loading or on error. version protects list updates from overwriting a later save.", valueType: "array", alwaysAvailable: false, typicalCharCount: 1600, group: "navigation", sortOrder: 200 },
  { name: "outline", label: "Outline", description: "Headings of the guide in reading order, as { index, level, text }.", valueType: "array", alwaysAvailable: false, typicalCharCount: 2000, group: "navigation", sortOrder: 210 },
  { name: "active_details_tab", label: "Details tab", description: '"notes" for Notes & comments, "terms" for Key Terms, or "resources" for linked flashcards and related study material.', valueType: "string", alwaysAvailable: true, typicalCharCount: 10, group: "navigation", sortOrder: 220 },
  {
    name: "personal_annotations",
    label: "My highlights and notes",
    description: `The person's PRIVATE highlights (a marked passage, optional note) and whole-guide notes on this guide, oldest first, as ${PERSONAL_NOTE_SHAPE}. quote is the marked passage (null for a whole-guide note); attached is false when the guide's text changed and the passage can no longer be found. Only saved items. The ids work with update_personal_notes and delete_personal_notes. Part of the guide's record, so it is shown to you in full (no lookup needed). Absent while loading or on error; an empty array when there are none.`,
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    // The record's own sub-list counts as part of the record (Arman 2026-09-27).
    inlineUpTo: 1500,
    group: "personal_notes",
    sortOrder: 300,
  },
  {
    name: "guide_comments",
    label: "Comments",
    description: `Comment threads on this guide, oldest first, as ${COMMENT_SHAPE}. quote is the passage a comment is pinned to (null = on the whole guide); suggested_text is set when the comment proposes replacing that passage; resolved threads are included. Everyone who can read the guide sees these. The ids (threads and replies) work with update_guide_comments and delete_guide_comments. Part of the guide's record, so it is shown to you in full (no lookup needed). Absent while loading or on error; an empty array when there are none.`,
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    // The record's own sub-list counts as part of the record (Arman 2026-09-27).
    inlineUpTo: 1500,
    group: "comments",
    sortOrder: 400,
  },
  { name: "key_terms", label: "Key terms", description: "Flashcard terms from the decks linked to this guide, as { id, term, definition }. Read-only here: they are edited in the flashcard editor. Absent while loading or on error; an empty array when no deck is linked.", valueType: "array", alwaysAvailable: false, typicalCharCount: 2500, group: "key_terms", sortOrder: 500 },
  { name: "details_error", label: "Details error", description: "Why the key terms or the notes and comments could not load; absent when they loaded.", valueType: "string", alwaysAvailable: false, typicalCharCount: 160, group: "key_terms", sortOrder: 510 },
];

const QUOTE_RULE =
  'quote must be copied EXACTLY from guide_content (the markdown text, including any ** or other markup inside it) and must appear there exactly once — add surrounding words if it appears more than once';

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "create_study_guides",
    label: "Create study guides",
    description: 'Creates 1-10 new Study Guides in the person\'s selected organization. Value is a JSON ARRAY of { title: string, content?: string }; title is required and single-line, content is optional markdown. Each guide is a Notes record in the Education Study Notes folder and opens in this reader. If the person has not selected an organization, they are asked to choose one before anything is created.',
    valueType: "array",
    updatesValue: "available_guides",
    mode: "entity",
    applyPolicy: "ask",
    group: "guide",
    sortOrder: 90,
  },
  {
    name: "guide_content",
    label: "Guide content",
    description:
      "Replaces the guide's markdown body, SAVED IMMEDIATELY once the person approves (only the blocks you changed are rewritten). Value is the complete new body as a string — or, to change one part of a long guide, an anchored edit { command: \"str_replace\", old_str, new_str } against guide_content. Refused while the person has the editor open (reader_mode \"edit\"), when nothing would change, or when someone else saved the guide since the page loaded.",
    valueType: "string",
    updatesValue: "guide_content",
    approvalComparison: "text-replacement",
    patchable: true,
    mode: "entity",
    applyPolicy: "ask",
    group: "guide",
    sortOrder: 100,
  },
  {
    name: "delete_study_guides",
    label: "Move this study guide to Trash",
    description: 'Moves 1-10 loaded study guides to Trash. Value is a JSON ARRAY of ids from available_guides, or { id } objects. What is lost: each guide leaves this library and its reader; it can be restored from Trash. The guides\' associated annotations and comments are not changed by this action.',
    valueType: "array",
    updatesValue: "available_guides",
    mode: "entity",
    applyPolicy: "ask",
    group: "guide",
    sortOrder: 200,
  },
  {
    name: "update_study_guides",
    label: "Update study guides",
    description: "Updates 1-10 loaded guides. Value is a JSON ARRAY of { id: string, title?: string, content?: string }. Each id must come from available_guides; the guide is fetched again and saved only when its emitted version still matches, so a later save is refused rather than overwritten.",
    valueType: "array",
    updatesValue: "available_guides",
    mode: "entity",
    applyPolicy: "ask",
    group: "guide",
    sortOrder: 210,
  },
  {
    name: "create_personal_notes",
    label: "Add my highlights and notes",
    description: `Adds PRIVATE highlights and notes for the person (only they see them), saved immediately. Value is a JSON ARRAY (not a string) of 1-25 objects, each { quote?: string, note?: string, color?: "yellow" | "green" | "blue" | "pink" | "purple" (default "yellow") }. With quote it highlights that passage (note optional); without quote it is a note on the whole guide and note is required. ${QUOTE_RULE}. The whole list is refused, with nothing saved, on a quote that is missing or ambiguous, the same quote twice, or a passage the person already highlighted (change that one with update_personal_notes). The first save may ask the person which workspace to file private notes in.`,
    valueType: "array",
    updatesValue: "personal_annotations",
    mode: "entity",
    applyPolicy: "ask",
    group: "personal_notes",
    sortOrder: 300,
  },
  {
    name: "update_personal_notes",
    label: "Change my highlights and notes",
    description: 'Changes the person\'s private highlights and notes, saved immediately. Value is a JSON ARRAY (not a string) of 1-25 objects, each { id: string (from personal_annotations), note?: string (replaces the note text; "" clears it), color?: "yellow" | "green" | "blue" | "pink" | "purple" (highlights only) }. Only the fields sent change. An unknown or repeated id, or an entry that changes nothing, refuses the whole list.',
    valueType: "array",
    updatesValue: "personal_annotations",
    mode: "entity",
    applyPolicy: "ask",
    group: "personal_notes",
    sortOrder: 310,
  },
  {
    name: "delete_personal_notes",
    label: "Remove my highlights and notes",
    description: 'Removes the person\'s private highlights and notes. Value is a JSON ARRAY (not a string) of ids from personal_annotations, or of { id } objects. What is lost: the highlight mark and its note disappear from the guide; they go to the person\'s Trash, where they can be restored. The guide\'s text is never changed. Unknown or repeated ids refuse the whole list, with nothing removed.',
    valueType: "array",
    updatesValue: "personal_annotations",
    mode: "entity",
    applyPolicy: "ask",
    group: "personal_notes",
    sortOrder: 320,
  },
  {
    name: "create_guide_comments",
    label: "Add comments",
    description: `Posts comments on the guide, saved immediately and VISIBLE TO EVERYONE who can read the guide (for a private note use create_personal_notes). Value is a JSON ARRAY (not a string) of 1-25 objects, each { body: string (required), quote?: string (pins it to that passage; omit for the whole guide), suggested_text?: string (proposes replacing the quoted passage with this text; needs quote), reply_to?: string (a thread id from guide_comments; a reply takes only body) }. ${QUOTE_RULE}. The whole list is refused, with nothing posted, on a missing body, a bad quote, an unknown reply_to, the same comment twice, or a comment the person already posted.`,
    valueType: "array",
    updatesValue: "guide_comments",
    mode: "entity",
    applyPolicy: "ask",
    group: "comments",
    sortOrder: 400,
  },
  {
    name: "update_guide_comments",
    label: "Edit or resolve comments",
    description: 'Changes comments, saved immediately. Value is a JSON ARRAY (not a string) of 1-25 objects, each { id: string (a thread or reply id from guide_comments), body?: string (new text — only the person\'s own comments, mine: true), resolved?: boolean (threads only: true resolves the thread, false reopens it) }. Resolving is how a thread is closed and kept; prefer it over deleting. An unknown or repeated id, editing someone else\'s comment, or an entry that changes nothing refuses the whole list.',
    valueType: "array",
    updatesValue: "guide_comments",
    mode: "entity",
    applyPolicy: "ask",
    group: "comments",
    sortOrder: 410,
  },
  {
    name: "delete_guide_comments",
    label: "Delete comments",
    description: 'DELETES the person\'s own comments or replies (mine: true). Value is a JSON ARRAY (not a string) of ids from guide_comments, or of { id } objects. What is lost: the comment disappears for everyone who can read the guide; its author can restore it from Trash. PREFER update_guide_comments with resolved: true to close a thread and keep it. Unknown or repeated ids, or someone else\'s comment, refuse the whole list, with nothing deleted.',
    valueType: "array",
    updatesValue: "guide_comments",
    mode: "entity",
    applyPolicy: "ask",
    group: "comments",
    sortOrder: 420,
  },
];

export const educationStudyGuideManifest: SurfaceManifest = {
  surfaceName: EDUCATION_STUDY_GUIDE_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "One study guide: its full text, outline, the person's private highlights and notes, comment threads and linked key terms; create, edit, or move a guide to Trash, and add or change notes and comments (/education/study-guides/[id]).",
  label: "Study guide",
  urlPattern: "/education/study-guides/[id]",
  readiness: "partial",
  readinessNote:
    "Record, notes, comments and key terms emitted from the reader; guide_content and the personal-note and comment CRUD targets validate through unit-tested parsers. Not yet stamped verified: no structured target names a valueKind, no outside-helper binding test, and a guide longer than the record tier (10,000 chars) arrives as a lookup.",
  guide: "features/surfaces/guides/education-study-guide.md",
  intro: `<surface_intro>
You are on one study guide at /education/study-guides/[id]. study_guide is the guide itself (title and the full markdown body in content); personal_annotations are the person's private highlights and notes on it; guide_comments are comment threads everyone who can read the guide sees; key_terms are flashcards from linked decks (read-only here).

Every change goes through these targets; each asks the person once and returns what it did, with ids:
- create_study_guides — add one or more Notes-backed study guides to the Education library.
- update_study_guides — change a loaded guide's title and/or full markdown body with version protection.
- guide_content — rewrite or fix the guide's text (send the whole body, or { command: "str_replace", old_str, new_str } for one part).
- delete_study_guides — move this open guide to Trash. It can be restored there.
- create_personal_notes / update_personal_notes / delete_personal_notes — private highlights (on a quoted passage) and notes. Use these when the person says "highlight", "note to self", "mark this".
- create_guide_comments / update_guide_comments / delete_guide_comments — shared comments, replies and suggested rewrites; resolve a thread with update_guide_comments (resolved: true) rather than deleting it.
A quote must be copied exactly from study_guide.content and appear there once. Never use generic note, document or comment tools for this guide: they skip the page's anchoring and privacy rules.

If reader_mode is "edit", the person has the editor open; ask them to press "Back to reading" before writing here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
};

/** THE record — `study_guide`. */
export interface StudyGuideRecordScope {
  id: string;
  title: string;
  content: string;
  version: number;
  updated_at: string | null;
  tags: string[];
  key_term_count: number | null;
  personal_note_count: number | null;
  comment_count: number | null;
}

/** One entry of `personal_annotations`. */
export interface PersonalAnnotationScope {
  id: string;
  kind: "highlight" | "note";
  quote: string | null;
  note: string;
  color: string;
  attached: boolean;
  created_at: string;
}

/** One entry of `guide_comments`. */
export interface GuideCommentScope {
  id: string;
  quote: string | null;
  body: string;
  suggested_text: string | null;
  author: string;
  mine: boolean;
  resolved: boolean;
  attached: boolean;
  created_at: string;
  replies: { id: string; body: string; author: string; mine: boolean; created_at: string }[];
}

/**
 * Type-safe payload helper. Required keys mirror `alwaysAvailable: true`;
 * optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationStudyGuideScope(values: {
  guide_loaded: boolean;
  reader_mode: "read" | "edit";
  active_details_tab: "notes" | "terms" | "resources";
  study_guide?: StudyGuideRecordScope;
  guide_id?: string;
  guide_title?: string;
  guide_content?: string;
  load_error?: string;
  available_guides?: { id: string; title: string; version: number }[];
  outline?: { index: number; level: number; text: string }[];
  personal_annotations?: PersonalAnnotationScope[];
  guide_comments?: GuideCommentScope[];
  key_terms?: { id: string; term: string; definition: string }[];
  details_error?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
