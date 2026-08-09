/**
 * Surface manifest — Assessments (`matrx-user/education-assessment`).
 *
 * ONE surface covering BOTH /education/quizzes AND /education/practice-tests.
 * The two routes render the identical component set (AssessmentHome /
 * AssessmentCreate / AssessmentDetail / the take flow) parameterized only by
 * `kindConfig.ts` (kind "quiz" | "practice_test", timed, defaultCount, metered
 * capability) — so they are one surface, not two. `urlPattern` names the
 * quizzes route; the route map covers /education/practice-tests as the same
 * surface (handled in `utils/route-to-surface.ts`, not here).
 *
 * The surface spans list / create / detail / take views, so most values are
 * view-scoped and optional. The two honest always-available values are
 * `assessment_kind` (every view knows which kind it is showing — the list and
 * create views from their route, the detail/take views from the loaded row)
 * and `view` (each emitter knows which view it is).
 *
 * Curated groups (band 0-899):
 *
 *   assessment_identity  Which kind + which view the learner is in
 *   library              The list view: loaded rows + live filter state
 *   generation           The create view: the full generation config
 *   record               The open assessment: row, items, access
 *   attempts             The open assessment's results history + take state
 *
 * Emitters: `features/education/assessment/components/AssessmentHome.tsx`,
 * `.../components/create/AssessmentCreate.tsx`, and
 * `.../components/AssessmentDetail.tsx` (which also covers the take flow —
 * the taker renders inside the detail route's provider).
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
    key: "assessment_identity",
    label: "Assessment identity",
    sortOrder: 100,
    description:
      "Which assessment kind (quiz or practice test) and which view (list / create / detail / take) the learner is in — read these first, they decide which other groups are populated.",
  },
  {
    key: "library",
    label: "Assessment library",
    sortOrder: 200,
    description:
      "The list view: every assessment of this kind the learner can see, plus the live search + visibility filter state deciding what is on screen.",
  },
  {
    key: "generation",
    label: "Generation config",
    sortOrder: 300,
    description:
      "The create view: the full generate-an-assessment configuration the learner is composing (source, topic, count, difficulty, depth, types).",
  },
  {
    key: "record",
    label: "Open assessment",
    sortOrder: 400,
    description:
      "The detail/take views: the loaded assessment row, its questions, and the learner's access level on it.",
  },
  {
    key: "attempts",
    label: "Attempts",
    sortOrder: 500,
    description:
      "The open assessment's results history (past attempts + best score) and whether a take is in progress right now.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Assessment identity ───────────────────────────────────────────────
  {
    name: "assessment_kind",
    label: "Assessment kind",
    description:
      'Which assessment family this surface is showing: "quiz" or "practice_test". Always present — the list and create views know it from the route, the detail/take views from the loaded row.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 13,
    sortOrder: 300,
    group: "assessment_identity",
  },
  {
    name: "view",
    label: "Current view",
    description:
      'Which view of the surface the learner is in: "list" (the library), "create" (the generator form), "detail" (one assessment\'s overview), or "take" (mid-attempt). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 310,
    group: "assessment_identity",
  },

  // ── Library (list view only) ──────────────────────────────────────────
  {
    name: "assessments_loaded",
    label: "Assessments loaded",
    description:
      "True once the list view's assessment query finished successfully; false while loading or after a failure (see `list_error`). Absent outside the list view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "library",
  },
  {
    name: "assessment_count",
    label: "Total assessments",
    description:
      "How many assessments of this kind the learner can see in total, before search/visibility filters. Zero for a learner with none yet. Absent until the list loads (and outside the list view).",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 410,
    group: "library",
  },
  {
    name: "assessments",
    label: "All assessments",
    description:
      "Every loaded assessment of this kind, recent-first, as { id, title, topic, exam_type, depth, status, visibility, updated_at }. Absent outside the list view and until the query resolves. Can be large — bindable-only; bind `visible_assessments` for what is on screen.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 420,
    group: "library",
  },
  {
    name: "visible_assessments",
    label: "Assessments on screen",
    description:
      "The assessments currently passing the search + visibility filters, in render order, same shape as `assessments`. Empty array when the filters match nothing. Absent outside the list view. This — not `assessments` — is what the learner is looking at.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 430,
    group: "library",
  },
  {
    name: "search_query",
    label: "Search query",
    description:
      "The learner's list-view search text, matched across title, topic, description, and exam type. Absent when the box is empty or outside the list view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 440,
    group: "library",
  },
  {
    name: "visibility_filter",
    label: "Visibility filter",
    description:
      'The list view\'s active visibility chip: "all", "mine", "shared", or "public". Absent outside the list view (defaults to "all" inside it).',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 450,
    group: "library",
  },
  {
    name: "list_error",
    label: "List load error",
    description:
      "The error shown in place of the list when the assessment query failed. Absent on the happy path — present so an agent helps with the real failure instead of hallucinating an empty library.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 460,
    group: "library",
  },

  // ── Generation config (create view only) ──────────────────────────────
  {
    name: "source_mode",
    label: "Generation source",
    description:
      'The create view\'s source mode: "topic" (ungrounded), "deck" (grounded in a flashcard deck), or "document" (grounded in a RAG document, cited). Absent outside the create view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 500,
    group: "generation",
  },
  {
    name: "topic",
    label: "Topic",
    description:
      "The topic the learner typed for topic-mode generation. Absent outside the create view and when the field is empty.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 510,
    group: "generation",
  },
  {
    name: "question_count",
    label: "Requested questions",
    description:
      "How many questions the learner asked the generator for (defaults 8 for quizzes, 20 for practice tests). Absent outside the create view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 520,
    group: "generation",
  },
  {
    name: "difficulty",
    label: "Difficulty",
    description:
      'The requested difficulty: "Easy", "Medium", or "Hard". Absent outside the create view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 530,
    group: "generation",
  },
  {
    name: "depth",
    label: "Depth",
    description:
      'The requested cognitive depth: "recall" (facts), "applied" (use the concept), or "exam" (exam/clinical rigor). Absent outside the create view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 540,
    group: "generation",
  },
  {
    name: "question_types",
    label: "Question types",
    description:
      "The question types the learner checked (multiple_choice, true_false, fill_blank, short_answer, written_response). Empty array = automatic mix. Absent outside the create view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 550,
    group: "generation",
  },
  {
    name: "exam_type",
    label: "Exam type",
    description:
      'The optional exam the learner is preparing for (e.g. "AP Biology", "SAT"). Absent when blank or outside the create view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 15,
    sortOrder: 560,
    group: "generation",
  },
  {
    name: "time_limit_minutes",
    label: "Time limit (minutes)",
    description:
      "The requested time limit for timed kinds (practice tests). Absent for quizzes and outside the create view; 0 means untimed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 570,
    group: "generation",
  },
  {
    name: "user_request",
    label: "Extra instructions",
    description:
      "Free-form extra instructions the learner gave the generator. Absent when blank or outside the create view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 580,
    group: "generation",
  },
  {
    name: "selected_deck",
    label: "Selected deck",
    description:
      "The flashcard deck picked as the grounded source, as { id, name }. Absent unless the create view is in deck mode with a deck chosen.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 590,
    group: "generation",
  },
  {
    name: "selected_document",
    label: "Selected document",
    description:
      "The RAG document picked as the grounded (cited) source, as { id, name }. Absent unless the create view is in document mode with a document chosen.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 600,
    group: "generation",
  },
  {
    name: "is_generating",
    label: "Generation running",
    description:
      "True while the generator agent is writing questions (the create view shows its progress card). Absent outside the create view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 610,
    group: "generation",
  },

  // ── Open assessment (detail / take views) ─────────────────────────────
  {
    name: "assessment_id",
    label: "Assessment ID",
    description:
      "UUID of the assessment the learner has open. Absent on the list and create views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 700,
    group: "record",
  },
  {
    name: "assessment_title",
    label: "Assessment title",
    description:
      "Title of the open assessment. Absent on the list and create views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 710,
    group: "record",
  },
  {
    name: "assessment_description",
    label: "Assessment description",
    description:
      "Description of the open assessment. Absent when the row has none, and on the list/create views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 720,
    group: "record",
  },
  {
    name: "assessment_status",
    label: "Assessment status",
    description:
      'Lifecycle status of the open assessment: "draft", "generating", "ready", or "error". Absent on the list/create views.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 730,
    group: "record",
  },
  {
    name: "assessment_topic",
    label: "Assessment topic",
    description:
      "Topic (or source title) the open assessment was generated from. Absent when the row has none, and on the list/create views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 740,
    group: "record",
  },
  {
    name: "assessment_exam_type",
    label: "Assessment exam type",
    description:
      "The exam the open assessment targets (e.g. \"AP Biology\"). Absent when the row has none, and on the list/create views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 15,
    sortOrder: 750,
    group: "record",
  },
  {
    name: "assessment_depth",
    label: "Assessment depth",
    description:
      'Cognitive depth the open assessment was generated at: "recall", "applied", or "exam". Absent when the row has none, and on the list/create views.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 760,
    group: "record",
  },
  {
    name: "assessment_time_limit_seconds",
    label: "Time limit (seconds)",
    description:
      "The open assessment's time limit in seconds (practice tests). Absent when untimed and on the list/create views.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 770,
    group: "record",
  },
  {
    name: "item_count",
    label: "Question count",
    description:
      "How many questions the open assessment has. Absent on the list/create views.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 780,
    group: "record",
  },
  {
    name: "items",
    label: "Questions",
    description:
      "The open assessment's questions as { id, question_type, prompt, options, correct_answer, depth, points }. Absent on the list/create views. Includes answer keys and can be large — bindable-only so it never silently reaches an agent mid-take.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 790,
    group: "record",
  },
  {
    name: "access_level",
    label: "Access level",
    description:
      'The learner\'s access on the open assessment: "view", "edit", "admin", or "owner". Absent on the list/create views.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 800,
    group: "record",
  },

  // ── Attempts (detail / take views) ────────────────────────────────────
  {
    name: "result_count",
    label: "Past attempts",
    description:
      "How many recorded attempts (results) the learner has on the open assessment. Zero for a never-taken assessment. Absent on the list/create views.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 820,
    group: "attempts",
  },
  {
    name: "best_score_pct",
    label: "Best score",
    description:
      "The learner's best completed score on the open assessment as a 0-100 percentage. Absent until at least one completed, scored attempt exists.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 830,
    group: "attempts",
  },
  {
    name: "results",
    label: "Attempt history",
    description:
      "The open assessment's attempts as { id, status, phase, score_value, correct_count, total_count, created_at }, newest first. Empty until a first attempt. Absent on the list/create views. Bindable-only — bind `best_score_pct` / `result_count` for automatic context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 840,
    group: "attempts",
  },
  {
    name: "is_taking",
    label: "Take in progress",
    description:
      "True while the learner is actively mid-attempt (the taker is on screen — do not interrupt or reveal answer keys). Absent outside the detail/take views.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 850,
    group: "attempts",
  },
];

export const educationAssessmentManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-assessment",
  readiness: "partial",
  readinessNote:
    "Manifest + emitters shipped for the list, create, and detail/take views (one surface spanning /education/quizzes and /education/practice-tests). Not yet stamped verified: the DB sync, a live non-matching-name binding test, and the Matrx-vs-matrix context check have not been run; no agent roles are declared (the generator/grader agents resolve via ASSESSMENT_AGENTS ids, not surface roles); no `data-surface-value` Locate anchors are tagged; and the detail emitter mounts only after the row loads, so the loading/error states emit nothing.",
  label: "Assessments",
  urlPattern: "/education/quizzes",
  intro: `<surface_intro>
You are on the Assessments surface — ONE surface behind both /education/quizzes and /education/practice-tests. Quizzes and practice tests share every component; assessment_kind tells you which family the learner is in, and practice tests are the timed, longer variant.
Read assessment_kind and view first — view decides which groups are populated. In "list" the learner is browsing their library (visible_assessments is what is actually on screen after their search + visibility filters; the full set is bindable via assessments). In "create" they are composing a generation: the Generation config group is the exact request they are about to send (source_mode says whether it is an ungrounded topic run or grounded in a deck/document — grounded runs cite their source). In "detail" one assessment is open: the Open assessment group describes it and the Attempts group carries their history.
When is_taking is true the learner is mid-attempt: never reveal correct answers, hints toward the key, or the contents of items — help with process, pacing, and understanding only. The questions list (items) includes answer keys and is deliberately bindable-only for that reason.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry in `assessments` / `visible_assessments`. */
export interface AssessmentListSummary {
  id: string;
  title: string;
  topic: string | null;
  exam_type: string | null;
  depth: string | null;
  status: string;
  visibility: string;
  updated_at: string;
}

/** One entry in `items` (answer keys included — bindable-only). */
export interface AssessmentItemSummary {
  id: string;
  question_type: string;
  prompt: string;
  options: string[] | null;
  correct_answer: string | null;
  depth: string | null;
  points: number;
}

/** One entry in `results`. */
export interface AssessmentResultSummary {
  id: string;
  status: string;
  phase: string;
  score_value: number | null;
  correct_count: number;
  total_count: number;
  created_at: string;
}

/** `selected_deck` / `selected_document`. */
export interface AssessmentSourceSummary {
  id: string;
  name: string;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`. Each
 * emitter passes only the keys its view actually has.
 */
export function createEducationAssessmentScope(values: {
  // alwaysAvailable: true → required
  assessment_kind: string;
  view: "list" | "create" | "detail" | "take";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  // library (list view)
  assessments_loaded?: boolean;
  assessment_count?: number;
  assessments?: AssessmentListSummary[];
  visible_assessments?: AssessmentListSummary[];
  search_query?: string;
  visibility_filter?: string;
  list_error?: string;
  // generation (create view)
  source_mode?: string;
  topic?: string;
  question_count?: number;
  difficulty?: string;
  depth?: string;
  question_types?: string[];
  exam_type?: string;
  time_limit_minutes?: number;
  user_request?: string;
  selected_deck?: AssessmentSourceSummary;
  selected_document?: AssessmentSourceSummary;
  is_generating?: boolean;
  // record (detail/take views)
  assessment_id?: string;
  assessment_title?: string;
  assessment_description?: string;
  assessment_status?: string;
  assessment_topic?: string;
  assessment_exam_type?: string;
  assessment_depth?: string;
  assessment_time_limit_seconds?: number;
  item_count?: number;
  items?: AssessmentItemSummary[];
  access_level?: string;
  // attempts (detail/take views)
  result_count?: number;
  best_score_pct?: number;
  results?: AssessmentResultSummary[];
  is_taking?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
