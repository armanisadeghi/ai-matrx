/**
 * Surface manifest — Assessments (`matrx-user/education-assessment`).
 *
 * ONE surface covering one quiz or practice test — its create, detail, take,
 * edit and results views under /education/quizzes/* AND
 * /education/practice-tests/*. They render the identical component set
 * (AssessmentCreate / AssessmentDetail / the take flow) parameterized only by
 * `kindConfig.ts`. The two LISTS (`/education/quizzes`,
 * `/education/practice-tests` exactly) are their own surfaces since the
 * 2026-09-27 page pass — `education-quizzes.manifest.ts` /
 * `education-practice-tests.manifest.ts` — so this manifest carries no list
 * vocabulary.
 *
 * The surface spans create / detail / take views, so most values are
 * view-scoped and optional. The two always-available values are
 * `assessment_kind` and `view`.
 *
 * Curated groups (band 0-899):
 *
 *   assessment_identity  Which kind + which view the learner is in
 *   generation           The create view: the full generation config
 *   record               The open assessment: row, items, access
 *   attempts             The open assessment's results history + take state
 *
 * Emitters: `features/education/assessment/components/create/AssessmentCreate.tsx`
 * and `.../components/AssessmentDetail.tsx` (which also covers the take flow —
 * the taker renders inside the detail route's provider).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
// The generation vocabularies, from their canonical home — the write-target
// descriptions below interpolate these rather than re-typing the enums, so the
// prose an agent reads can never drift from what the handlers accept. This is
// a types-only module (no React, no client); safe for the manifest registry.
import {
  DEPTHS,
  DIFFICULTIES,
  QUESTION_TYPES,
} from "@/features/education/assessment/data/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "assessment_identity",
    label: "Assessment identity",
    sortOrder: 100,
    description:
      "Which assessment kind (quiz or practice test) and which view (create / detail / take) the learner is in — read these first, they decide which other groups are populated.",
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
      'Which assessment family this surface is showing: "quiz" or "practice_test". Always present — the create view knows it from the route, the detail/take views from the loaded row.',
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
      'Which view of the surface the learner is in: "create" (the generator form), "detail" (one assessment\'s overview), or "take" (mid-attempt). Always present. (The list is its own surface.)',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 310,
    group: "assessment_identity",
  },

  // ── Generation config (create view only) ──────────────────────────────
  {
    name: "source_mode",
    label: "Generation source",
    description:
      'The create view\'s source mode: "topic" (ungrounded), "deck" (grounded in a flashcard deck), or "document" (grounded in a Knowledge document, cited). Absent outside the create view.',
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
      "The Knowledge document picked as the grounded (cited) source, as { id, name }. Absent unless the create view is in document mode with a document chosen.",
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
    name: "assessment_version",
    label: "Assessment version",
    description:
      "The revision number of the open assessment. Agent changes include it so an approval prepared against an older assessment is refused.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 735,
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
      'The exam the open assessment targets (e.g. "AP Biology"). Absent when the row has none, and on the list/create views.',
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
      "The open assessment's questions as { id, version, question_type, prompt, options, correct_answer, depth, points }. In the editor, version is required for an update or deletion so an agent cannot overwrite a newer question. Absent on the list/create views. Includes answer keys and can be large — bindable-only so it never silently reaches an agent mid-take.",
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

/**
 * Write half of the 360 loop — what an agent may WRITE into the assessment
 * GENERATOR (`/education/{quizzes|practice-tests}/new` only).
 *
 * Every target is `mode: "draft"` + `applyPolicy: "ask"`: it stages into
 * `AssessmentCreate`'s own React state through the same setters the user's
 * typing uses, so the value appears in the form, is reversible, and reaches
 * the DB only when the USER presses Generate (which still runs the COPPA gate,
 * the entitlement guard, and the canonical `assessmentService.createWithItems`
 * path). Nothing here spends quota or writes a row.
 *
 * Scope is deliberately the create mount ALONE. `AssessmentDetail` mounts this
 * same surface and registers NO handlers, so `listAgentWritableTargets()`
 * offers nothing on the detail/take routes. That is a decision, not an
 * oversight:
 *   • Detail owns no editor state — `assessment`/`items`/`results` are a loaded
 *     read snapshot; its only local state is dialog flags. A draft write would
 *     have nowhere to land, and editing a saved assessment has its own route
 *     and component (`components/edit/AssessmentEdit.tsx`), which does not
 *     mount this surface. Wiring entity writes from detail would be a parallel
 *     write path around the real editor.
 *   • Detail's own affordances are Take / Duplicate / Delete / Convert —
 *     actions in the ownership-and-destructive class the judgment bar excludes.
 *   • That same provider also wraps the TAKE flow (`is_taking`), where the
 *     manifest already treats mid-attempt as a hard boundary (items are
 *     bindable-only so answer keys never auto-flow). Offering writes to an
 *     agent mid-attempt is exactly the wrong direction.
 *
 * Also deliberately NOT writable on the create view: the deck/document source
 * pickers (choosing a specific source is an identity decision and the surface
 * exposes no id options to choose from), and Generate itself (a metered,
 * gated action — the user starts their own run).
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "generation_topic",
    label: "Draft topic",
    description:
      'Stages the topic the assessment will be generated from into the create form, replacing whatever is there. Plain string, 1-500 characters — the subject itself (e.g. "Cellular respiration"), not an instruction. Because the topic only feeds ungrounded topic-mode generation, applying this also switches the Source selector to Topic; a deck/document already picked stays selected and returns if the user switches back. The user still presses Generate.',
    valueType: "string",
    updatesValue: "topic",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 100,
  },
  {
    name: "generation_difficulty",
    label: "Draft difficulty",
    description: `Stages the requested difficulty into the create form. Exactly one of: ${DIFFICULTIES.join(" | ")} (case-sensitive). The user still presses Generate.`,
    valueType: "string",
    updatesValue: "difficulty",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 110,
  },
  {
    name: "generation_depth",
    label: "Draft depth",
    description: `Stages the requested cognitive depth into the create form — how hard the questions think, independently of difficulty. Exactly one of: ${DEPTHS.join(" | ")} ("recall" = facts and definitions, "applied" = use the concept, "exam" = exam/clinical rigor). The user still presses Generate.`,
    valueType: "string",
    updatesValue: "depth",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 120,
  },
  {
    name: "generation_question_types",
    label: "Draft question types",
    description: `Stages the question-type mix into the create form. Array of strings drawn from: ${QUESTION_TYPES.join(" | ")}. REPLACES the full set — include every type you want kept, reading question_types first. An empty array means "let the generator pick a smart automatic mix", which is the default. The user still presses Generate.`,
    valueType: "array",
    updatesValue: "question_types",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 130,
  },
  {
    name: "generation_question_count",
    label: "Draft question count",
    description:
      "Stages how many questions to generate into the create form. Whole number, at least 1, capped by the kind: 30 for a quiz, 60 for a practice test (read assessment_kind). A count above the cap is rejected rather than clamped. The user still presses Generate.",
    valueType: "number",
    updatesValue: "question_count",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 140,
  },
  {
    name: "generation_exam_type",
    label: "Draft exam type",
    description:
      'Stages the exam the assessment is aimed at into the create form (e.g. "AP Biology", "SAT", "NCLEX"), which steers question style and phrasing. Plain string, max 100 characters; the empty string clears it back to no exam. The user still presses Generate.',
    valueType: "string",
    updatesValue: "exam_type",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 150,
  },
  {
    name: "generation_user_request",
    label: "Draft extra instructions",
    description:
      'Stages free-form extra instructions for the generator into the create form — emphasis, coverage, style, things to avoid (e.g. "Emphasize mechanisms over vocabulary; include one case study"). Plain string, max 2000 characters; REPLACES the whole field, so read user_request first if you mean to extend it. The empty string clears it. The user still presses Generate.',
    valueType: "string",
    updatesValue: "user_request",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 160,
  },
  {
    name: "generation_time_limit_minutes",
    label: "Draft time limit",
    description:
      'Stages the time limit, in whole minutes, into the create form. Timed kinds only — accepted when assessment_kind is "practice_test" and rejected for a quiz, which has no time-limit control on screen. Integer 0-600; 0 means untimed. The user still presses Generate.',
    valueType: "number",
    updatesValue: "time_limit_minutes",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 170,
  },
  {
    name: "update_assessment",
    label: "Update assessment title",
    description:
      "Changes the open assessment's title and saves immediately through the same editor service. Value is { expected_version: positive integer from assessment_version, title: non-empty string }. A newer revision is refused rather than overwritten.",
    valueType: "object",
    updatesValue: "assessment_title",
    mode: "entity",
    applyPolicy: "ask",
    group: "record",
    sortOrder: 180,
  },
  {
    name: "add_assessment_items",
    label: "Add questions",
    description:
      "Adds questions to the open assessment and saves immediately. Value is a JSON ARRAY of { expected_assessment_version: positive integer from assessment_version, question_type: multiple_choice | true_false | fill_blank | short_answer | written_response, prompt: non-empty string, options?: string[] | null, correct_answer?: string | null, acceptable_answers?: string[] | null, explanation?: string | null, rubric?: string | null, depth?: recall | applied | exam | null, points?: positive number, topic?: string | null }. Each entry must name the loaded assessment version; stale additions are refused before approval.",
    valueType: "array",
    updatesValue: "items",
    mode: "entity",
    applyPolicy: "ask",
    group: "record",
    sortOrder: 190,
  },
  {
    name: "update_assessment_items",
    label: "Update questions",
    description:
      "Updates loaded questions and saves immediately. Value is a JSON ARRAY of { id: string from items, expected_version: positive integer from that question's version, question_type?, prompt?, options?: string[] | null, correct_answer?: string | null, acceptable_answers?: string[] | null, explanation?: string | null, rubric?: string | null, depth?: recall | applied | exam | null, points?: positive number, topic?: string | null }. Only supplied fields change. A stale, missing, repeated, or empty update is refused before approval; the service compares the version again when applying.",
    valueType: "array",
    updatesValue: "items",
    mode: "entity",
    applyPolicy: "ask",
    group: "record",
    sortOrder: 200,
  },
  {
    name: "delete_assessment_items",
    label: "Delete questions",
    description:
      "Soft-deletes loaded questions. Value is a JSON ARRAY of { id: string from items, expected_version: positive integer from that question's version }. The question no longer appears in this assessment and future takers do not receive it; existing result history remains. A stale, missing, or repeated id is refused before approval, and the service compares the version again when applying.",
    valueType: "array",
    updatesValue: "items",
    mode: "entity",
    applyPolicy: "ask",
    group: "record",
    sortOrder: 210,
  },
];

export const educationAssessmentManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-assessment",
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "One quiz or practice test: its create, detail, take, edit and results views (/education/quizzes/*, /education/practice-tests/*). The two lists are their own surfaces.",
  readiness: "partial",
  readinessNote:
    "Manifest + emitters shipped for the create and detail/take views (the lists moved to education-quizzes / education-practice-tests on 2026-09-27) (one surface spanning /education/quizzes and /education/practice-tests). Not yet stamped verified: the DB sync, a live non-matching-name binding test, and the Matrx-vs-matrix context check have not been run; no agent roles are declared (the generator/grader agents resolve via ASSESSMENT_AGENTS ids, not surface roles); no `data-surface-value` Locate anchors are tagged; and the detail emitter mounts only after the row loads, so the loading/error states emit nothing.",
  label: "Assessments",
  urlPattern: "/education/quizzes/[id]",
  intro: `<surface_intro>
You are on the Assessments surface — ONE quiz or practice test (create, detail, take, edit), under /education/quizzes/* or /education/practice-tests/*. Quizzes and practice tests share every component; assessment_kind tells you which family the learner is in, and practice tests are the timed, longer variant.
Read assessment_kind and view first — view decides which groups are populated. In "create" they are composing a generation: the Generation config group is the exact request they are about to send (source_mode says whether it is an ungrounded topic run or grounded in a deck/document — grounded runs cite their source). In "detail" one assessment is open: the Open assessment group describes it and the Attempts group carries their history.
When is_taking is true the learner is mid-attempt: never reveal correct answers, hints toward the key, or the contents of items — help with process, pacing, and understanding only. The questions list (items) includes answer keys and is deliberately bindable-only for that reason.
On the edit route, update_assessment changes the title; add_assessment_items, update_assessment_items, and delete_assessment_items use the same service as the editor. Every saved change asks the learner first and requires the loaded version.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry in `items` (answer keys included — bindable-only). */
export interface AssessmentItemSummary {
  id: string;
  version: number;
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
  view: "create" | "detail" | "take" | "edit";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
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
  assessment_version?: number;
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
