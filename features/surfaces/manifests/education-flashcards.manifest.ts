/**
 * Surface manifest — Flashcards (`matrx-user/education-flashcards`).
 *
 * The `/education/flashcards` home: the learner's deck library on the
 * canonical list shell (scope lanes Mine / My Orgs / Shared / Public, search,
 * sort and filter on every column, the archive axis), plus the cross-mode
 * study streak. Rows open the deck, spaced-repetition study, and the Fast
 * Fire drill. Agents create, change and archive the person's own decks
 * through `create_decks` / `update_decks` / `delete_decks`.
 *
 * Scoped to the LIST surface. The set-detail / study / FastFire routes are their
 * own surfaces (a study session's vocabulary — the current card, the grade, the
 * timer — is nothing like a library listing) and are not covered here.
 *
 * Curated groups (band 0-899):
 *
 *   library       The learner's sets and folders as loaded
 *   list_view     The live filter/search state deciding what is on screen
 *   study_signal  The cross-mode streak shown in the header
 *
 * Emitter: `features/flashcards/components/home/FlashcardsHome.tsx`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "library",
    label: "Set library",
    sortOrder: 100,
    description:
      "The flashcard decks the learner can see (the page on screen), plus the folder taxonomy decks are filed under.",
  },
  {
    key: "list_view",
    label: "List view",
    sortOrder: 200,
    description:
      "The live search / visibility / folder filter state — i.e. which subset of the library is actually on screen right now.",
  },
  {
    key: "decks",
    label: "Deck changes",
    sortOrder: 50,
    description:
      "Create, change and archive the person's own decks — saved immediately after the person approves.",
  },
  {
    key: "study_signal",
    label: "Study signal",
    sortOrder: 300,
    description:
      "The learner's cross-mode study streak, written by the study spine on every study session (not just flashcards).",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Library ───────────────────────────────────────────────────────────
  {
    name: "sets_loaded",
    label: "Sets loaded",
    description:
      "True once the set list has finished loading successfully. False while loading and after a load failure — in which case `set_count` and the set values are absent and `load_error` explains why. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "library",
  },
  {
    name: "set_count",
    label: "Total set count",
    description:
      "How many decks match the list right now — the active lane, search, filters and archive filter — across every page (the \"of N\" under the list). The per-lane totals are on the lane tabs. Absent until `sets_loaded` is true.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "library",
  },
  {
    name: "visible_sets",
    label: "Sets on screen",
    description:
      "The decks on the current page of the list — the active lane, search, filters, archive filter and sort applied, in the order rendered — as { id, name, topic, lesson, description, visibility, updated_at, folder_ids }. Empty array when nothing matches. Absent until `sets_loaded` is true. `deck_list` is the same page condensed.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 330,
    group: "library",
  },
  {
    name: "visible_set_ids",
    label: "Visible set IDs",
    description:
      "UUIDs of the sets currently on screen, in render order. Empty array when the filters match nothing. Absent until `sets_loaded` is true. The cheap handle for 'act on what I'm looking at'.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 340,
    group: "library",
  },
  {
    name: "folders",
    label: "Folders",
    description:
      "Every flashcard folder in the learner's taxonomy as { id, name }, in sidebar order. Always present — an empty array when the learner has created no folders.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 350,
    group: "library",
  },
  {
    name: "load_error",
    label: "Load error",
    description:
      "The error message shown at the top of the list when the deck query failed. Absent on the happy path. Present here so an agent can help with a real failure instead of hallucinating an empty library.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 360,
    group: "library",
  },

  {
    name: "deck_list",
    label: "Deck list",
    description:
      "The page of decks on screen, condensed as one XML bundle: <decks lane total shown sort> with one <deck id name topic lesson difficulty visibility folders updated archived/> per row (first 25). The ids are the ones update_decks / delete_decks take for the person's own decks. Absent until the list has loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    inlineUpTo: 4000,
    sortOrder: 325,
    group: "library",
  },
  {
    name: "my_decks",
    label: "My decks",
    description:
      "The person's OWN decks among the rows on screen (only decks they made can be changed by update_decks / delete_decks), as { id, name, topic, lesson, difficulty, description, archived }. The list pages on the server, so a deck not on screen is not here — update_decks and delete_decks still accept the id of any deck the person made. Absent until the list has loaded; an empty array when none on screen are theirs.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 345,
    group: "library",
  },
  {
    name: "list_sort",
    label: "Sort",
    description:
      'How the list is sorted, as "<column> <asc|desc>" — e.g. "updated_at desc" (most recently edited first). Columns: name, topic, lesson, difficulty, visibility, updated_at, created_at. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 430,
    group: "list_view",
  },
  {
    name: "archive_filter",
    label: "Archive filter",
    description:
      'Which decks the list shows: "active" (live decks only, the default), "archived" (archived only) or "all". Archived decks are restorable (update_decks with archived: false, or Trash).',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 440,
    group: "list_view",
  },
  {
    name: "list_filters",
    label: "Column filters",
    description:
      'Column filters the person applied, keyed by column id, e.g. { "difficulty": { "kind": "select", "values": ["hard"] }, "topic": { "kind": "text", "value": "bio" } }. An empty object when no column filter is set. Always present.',
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 450,
    group: "list_view",
  },

  // ── List view state ───────────────────────────────────────────────────
  {
    name: "search_query",
    label: "Search query",
    description:
      "The learner's current search text, matched case-insensitively across deck name, topic, lesson, and description. Always present — an empty string when the search box is empty.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 30,
    sortOrder: 400,
    group: "list_view",
  },
  {
    name: "visibility_filter",
    label: "Visibility filter",
    description:
      'The active list lane (scope tab): "mine" (decks the person made), "orgs" (org-mates\' decks visible to the organization), "shared" (someone else\'s deck handed to the person by a grant or link) or "public" (someone else\'s published deck). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 410,
    group: "list_view",
  },
  {
    name: "selected_folder_ids",
    label: "Selected folders",
    description:
      "UUIDs of the folders the Folders filter is narrowed to; a deck matches if it is filed under ANY of them (\"__none__\" = decks in no folder). Always present — an empty array means no folder filter is applied.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 420,
    group: "list_view",
  },

  {
    name: "selected_deck_ids",
    label: "Ticked decks",
    description:
      "Ids of the decks the person ticked in the list (the checkboxes), in the order ticked — what \"these decks\" means. Always present — an empty array when nothing is ticked.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 425,
    group: "list_view",
  },
  {
    name: "visibility_options",
    label: "Who-can-see-it options",
    description:
      'The choices for a deck\'s "Who can see it", as { id, label }: personal (Only me), internal (Organization), link (Anyone with link), public (Public). update_decks takes the id as visibility.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 160,
    autoContext: false,
    sortOrder: 360,
    group: "library",
  },

  // ── Study signal ──────────────────────────────────────────────────────
  {
    name: "study_streak_days",
    label: "Current study streak",
    description:
      "Consecutive days the learner has studied in ANY mode (the streak row is written by the study spine on every study session, not just flashcards). Zero when the streak is broken. Absent until the streak row loads, and for a learner who has never studied.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 500,
    group: "study_signal",
  },
  {
    name: "longest_streak_days",
    label: "Longest study streak",
    description:
      "The learner's best-ever consecutive-day streak, as shown in the streak badge tooltip. Absent until the streak row loads, and for a learner who has never studied.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    autoContext: false,
    sortOrder: 510,
    group: "study_signal",
  },
];

const DECK_FIELDS =
  'name: string, description?: string, topic?: string, lesson?: string, difficulty?: "easy" | "medium" | "hard"';

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "create_decks",
    label: "Create decks",
    description: `Creates one or more EMPTY decks, saved immediately, in the person's active workspace (they may be asked to pick one). Value is a JSON ARRAY (not a string) of 1-25 objects, each { ${DECK_FIELDS} }, e.g. [{ "name": "Cell Biology", "topic": "Biology", "difficulty": "medium" }]. Cards are not created here — the person adds them on the deck's page (or with Create deck, which generates cards with AI). Every entry is checked before any is created: a missing name, an unknown key, a bad difficulty, a name repeated in the list or a name one of the person's live decks already has refuses the whole write with every reason, and nothing is created.`,
    valueType: "array",
    updatesValue: "my_decks",
    mode: "entity",
    applyPolicy: "ask",
    group: "decks",
    sortOrder: 110,
  },
  {
    name: "update_decks",
    label: "Update decks",
    description: `Changes one or more of the person's OWN decks (ids from my_decks — decks other people shared cannot be changed here), saved immediately. Value is a JSON ARRAY (not a string) of 1-25 objects, each { id: string (required), name?, description?, topic?, lesson?, difficulty?: "easy" | "medium" | "hard" | null, visibility?: "personal" | "internal" | "link" | "public" (see visibility_options), folder_ids?: string[] (folder ids from folders — REPLACES the deck's folders; [] takes it out of every folder), archived?: boolean }. Only the fields you send change; send "" or null to clear description, topic, lesson or difficulty. Renaming is name; "move to folder" is folder_ids; "who can see it" is visibility. archived: true archives the deck (it leaves the list and is restorable from Trash or the Archived filter); archived: false restores it — send it in the same item to edit an archived deck. The whole list is refused, with nothing changed, on an unknown id, the same id twice, an item that changes nothing, or a rename onto a name another of the person's live decks has. Example: [{ "id": "…", "lesson": "Mitosis" }, { "id": "…", "archived": true }].`,
    valueType: "array",
    updatesValue: "my_decks",
    mode: "entity",
    applyPolicy: "ask",
    group: "decks",
    sortOrder: 120,
  },
  {
    name: "duplicate_decks",
    label: "Duplicate decks",
    description: `Copies decks into the person's own library — every card and its layers — saved immediately (the person may be asked which workspace the copy goes to). Value is a JSON ARRAY (not a string) of 1-25 deck ids from deck_list, or { id, name? } objects; without a name the copy is called "<name> (copy)". Works on the person's own decks and on any deck on screen (a shared or public deck becomes their own copy). An unknown or archived id, or a name the person already has, refuses the whole list with nothing copied. Example: [{ "id": "…", "name": "Cell Biology — exam week" }].`,
    valueType: "array",
    updatesValue: "my_decks",
    mode: "entity",
    applyPolicy: "ask",
    group: "decks",
    sortOrder: 125,
  },
  {
    name: "delete_decks",
    label: "Delete decks",
    description: `Removes one or more of the person's OWN live decks from the library. Value is a JSON ARRAY (not a string) of deck ids from my_decks, or of { id } objects, e.g. ["…"]. What happens: the deck is ARCHIVED — it leaves this list and every study mode, its cards and study history are kept, and it is restorable from Trash (or update_decks with archived: false); nothing on this page deletes a deck permanently. Prefer update_decks with archived: true when the person says "archive". Unknown, repeated or already-archived ids refuse the whole list, with nothing changed.`,
    valueType: "array",
    updatesValue: "my_decks",
    mode: "entity",
    applyPolicy: "ask",
    group: "decks",
    sortOrder: 130,
  },
];

export const educationFlashcardsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-flashcards",
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Flashcard Studio — the learner's deck library with lanes, search, sort, filters and archive, plus their study streak; agents can create, change, copy and archive the person's own decks.",
  readiness: "partial",
  readinessNote:
    "page-pass 2026-09-27: the list moved onto EntityListPage over the server-side education.fc_set_list_scoped RPC (lanes, sort/filter, archive, row menus) and gained create/update/delete_decks + the deck_list bundle. The agent write path is proven live only for what the page-pass report lists.",
  label: "Flashcard Studio",
  urlPattern: "/education/flashcards",
  intro: `<surface_intro>
You are on Flashcard Studio at /education/flashcards — the learner's LIBRARY of flashcard decks (called "sets" in older values), not a study session. The list has lanes (Mine, My Orgs, Shared, Public), a search box, sort and filter on every column, and an archive filter; each row opens the deck, spaced-repetition study, or the Fast Fire drill.
Read deck_list first: it is the page on screen, with ids. Check sets_loaded — while it is false the library is still loading (or load_error explains a real failure), so never tell the learner they have no decks. If a lane, search, filter or the archive filter is narrowing the list (visibility_filter, search_query, list_filters, selected_folder_ids, archive_filter), say so rather than concluding a deck does not exist.
To change decks use ONLY these targets, on decks the person made (my_decks): create_decks adds empty decks; update_decks renames, re-topics, sets difficulty, changes who can see it (visibility), files it into folders (folder_ids), archives (archived: true) or restores (archived: false); duplicate_decks copies decks; delete_decks archives. "These decks" means selected_deck_ids when it is not empty. Never use generic scope or context tools for deck data. Cards are edited on each deck's own page.
The study streak is cross-mode: it reflects every study session the learner has run, not only flashcards. Treat it as encouragement context, never as a reason to pressure them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
};

/** One entry of `my_decks`. */
export interface MyDeckSummary {
  id: string;
  name: string;
  topic: string | null;
  lesson: string | null;
  difficulty: string | null;
  description: string | null;
  archived: boolean;
}

/** One entry in `visible_sets`. */
export interface FlashcardSetSummary {
  id: string;
  name: string;
  topic: string | null;
  lesson: string | null;
  description: string | null;
  visibility: string;
  updated_at: string | null;
  folder_ids: string[];
}

/** One entry in `folders`. */
export interface FlashcardFolderSummary {
  id: string;
  name: string;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationFlashcardsScope(values: {
  // alwaysAvailable: true → required
  sets_loaded: boolean;
  folders: FlashcardFolderSummary[];
  visibility_filter: string;
  selected_folder_ids: string[];
  selected_deck_ids: string[];
  visibility_options: { id: string; label: string }[];
  search_query: string;
  list_sort: string;
  archive_filter: string;
  list_filters: Record<string, unknown>;
  // alwaysAvailable: false → optional
  deck_list?: string;
  my_decks?: MyDeckSummary[];
  selection?: string;
  context?: Record<string, unknown>;
  set_count?: number;
  visible_sets?: FlashcardSetSummary[];
  visible_set_ids?: string[];
  load_error?: string;
  study_streak_days?: number;
  longest_streak_days?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
