/**
 * Surface manifest — Flashcards (`matrx-user/education-flashcards`).
 *
 * The `/education/flashcards` home: the list-first "savior" view over every
 * flashcard set the learner owns or can see (RLS-filtered, recent-first), with
 * client-side search, a visibility facet, and folder filtering, plus the
 * cross-mode study streak. Rows deep-link into set detail, spaced-repetition
 * study, and the FastFire spoken drill.
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
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "library",
    label: "Set library",
    sortOrder: 100,
    description:
      "Every flashcard set the learner owns or can see, plus the folder taxonomy those sets are filed under.",
  },
  {
    key: "list_view",
    label: "List view",
    sortOrder: 200,
    description:
      "The live search / visibility / folder filter state — i.e. which subset of the library is actually on screen right now.",
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
      "How many flashcard sets the learner can see in total, before any filter is applied. Zero for a learner with no sets yet. Absent until `sets_loaded` is true.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "library",
  },
  {
    name: "all_sets",
    label: "All sets",
    description:
      "Every set the learner can see, recent-first, as { id, name, topic, lesson, description, visibility, updated_at, folder_ids }. Absent until `sets_loaded` is true. Can be hundreds of rows — bindable-only, so it never silently consumes the context window; bind `visible_sets` for the on-screen subset.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    sortOrder: 320,
    group: "library",
  },
  {
    name: "visible_sets",
    label: "Sets on screen",
    description:
      "The sets currently passing the search + visibility + folder filters, in the order rendered, as { id, name, topic, lesson, description, visibility, updated_at, folder_ids }. Empty array when the filters match nothing. Absent until `sets_loaded` is true. This — not `all_sets` — is what the learner is looking at.",
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
      "The error message shown in place of the list when the set query failed. Absent on the happy path. Present here so an agent can help with a real failure instead of hallucinating an empty library.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 360,
    group: "library",
  },

  // ── List view state ───────────────────────────────────────────────────
  {
    name: "search_query",
    label: "Search query",
    description:
      "The learner's current search text, matched case-insensitively across set name, topic, lesson, and description. Absent when the search box is empty.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 400,
    group: "list_view",
  },
  {
    name: "visibility_filter",
    label: "Visibility filter",
    description:
      'The active visibility chip: "all", "mine" (personal + org), "shared" (link-shared), or "public". Always present — defaults to "all".',
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
      "UUIDs of the folder chips the learner has toggled on; a set matches if it is filed under ANY of them. Always present — an empty array means no folder filter is applied.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 420,
    group: "list_view",
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

export const educationFlashcardsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-flashcards",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter shipped and complete for everything the flashcards home loads. Not yet stamped verified: the DB sync + a live non-matching-name binding test and the Matrx-vs-matrix context check have not been run, no agent roles are declared, and no `data-surface-value` Locate anchors are tagged on the page yet.",
  label: "Flashcards",
  urlPattern: "/education/flashcards",
  intro: `<surface_intro>
You are on the Flashcards home at /education/flashcards — the learner's LIBRARY of flashcard sets, not a study session. It lists every set they own or can see, recent-first, with a search box, a visibility facet, and folder chips; each row deep-links to the set, to spaced-repetition study, or to the FastFire spoken drill.
Read the values in tiers. Check sets_loaded first — while it is false the library is still in flight (or load_error explains a real failure), and you must not describe the learner as having no sets. visible_sets is what is actually on screen after the learner's filters; all_sets is the whole library and is large, so reason from visible_sets unless the request is explicitly about everything. The List view group tells you WHY the two differ — if a search query or folder chip is narrowing things, say so rather than concluding a set does not exist.
The study streak is cross-mode: it reflects every study session the learner has run, not only flashcards. Treat it as encouragement context, never as a reason to pressure them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry in `all_sets` / `visible_sets`. */
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
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  set_count?: number;
  all_sets?: FlashcardSetSummary[];
  visible_sets?: FlashcardSetSummary[];
  visible_set_ids?: string[];
  load_error?: string;
  search_query?: string;
  study_streak_days?: number;
  longest_streak_days?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
