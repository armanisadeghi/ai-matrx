// features/education/assessment/data/types.ts
//
// Canonical types for the Assessment Engine (P1) content model in the `education`
// schema: assessment / assessment_item / assessment_result. Row types derive from
// the generated `education` schema — never hand-redefine a column shape.
//
// The study spine (study_session/study_attempt/item_mastery) is REUSED for
// per-question attempts keyed item_type='assessment_item' — see agents.ts
// ASSESSMENT_ITEM_TYPE and features/education/study.

import type { Database } from "@/types/database.types";
import type { GradeResult, TrustEnvelope } from "@/features/education/trust/types";

type Edu = Database["education"]["Tables"];

// ─── Row types (generated source of truth) ────────────────────────────────────
export type AssessmentRow = Edu["assessment"]["Row"];
export type AssessmentItemRow = Edu["assessment_item"]["Row"];
export type AssessmentResultRow = Edu["assessment_result"]["Row"];

// ─── Enums / unions (mirror the DB CHECK constraints) ─────────────────────────
export type AssessmentKind = "quiz" | "practice_test";
export type AssessmentStatus = "draft" | "generating" | "ready" | "error";
export type AssessmentSourceKind = "deck" | "note" | "topic" | "source";
export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "short_answer"
  | "written_response";
export type Depth = "recall" | "applied" | "exam";

/**
 * The generation vocabularies, in ONE place. The create form's controls, the
 * surface manifest's write-target descriptions, and the write handlers all
 * read these — a vocabulary is never re-typed as literals at a call site, so
 * an added depth/type/difficulty cannot drift between what the UI offers,
 * what an agent is told it may send, and what the handler accepts.
 */
export const DEPTHS = ["recall", "applied", "exam"] as const satisfies readonly Depth[];

export function isDepth(value: string): value is Depth {
  return DEPTHS.some((d) => d === value);
}

export const QUESTION_TYPES = [
  "multiple_choice",
  "true_false",
  "fill_blank",
  "short_answer",
  "written_response",
] as const satisfies readonly QuestionType[];

export function isQuestionType(value: string): value is QuestionType {
  return QUESTION_TYPES.some((t) => t === value);
}

/** Requested difficulty. Title-case — it is passed verbatim to the generator agents. */
export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export function isDifficulty(value: string): value is Difficulty {
  return DIFFICULTIES.some((d) => d === value);
}

/**
 * Narrow a DB `depth` string (CHECK-constrained to the `Depth` union, nullable)
 * at ingress. Throws loudly on an unknown value — that means the DB CHECK and
 * this union drifted, never a recoverable state.
 */
export function asDepth(value: string | null | undefined): Depth | null {
  if (value == null) return null;
  if (isDepth(value)) return value;
  throw new Error(
    `Unknown assessment_item depth "${value}" — expected one of: ${DEPTHS.join(", ")}. ` +
      "The education.assessment_item CHECK constraint and Depth drifted.",
  );
}
export type ResultPhase = "standalone" | "baseline" | "post";
export type ResultStatus = "in_progress" | "completed" | "abandoned";

/**
 * The three graded outcomes the study spine records. Aliased to the canonical
 * `GradeResult` (features/education/trust) — the ONE shared result vocabulary
 * across typed, spoken, and review grading; never a parallel copy.
 */
export type AttemptResult = GradeResult;

// ─── Service result (supabase-style; the service never throws) ────────────────
export interface AsResult<T> {
  data: T | null;
  error: string | null;
}

// ─── Composite reads ──────────────────────────────────────────────────────────
export interface AssessmentWithItems {
  assessment: AssessmentRow;
  items: AssessmentItemRow[];
}

// ─── Authoring inputs ─────────────────────────────────────────────────────────
/** Config persisted on `assessment.config` (drives regeneration + display). */
export interface AssessmentConfig {
  count?: number;
  difficulty?: string;
  depth?: Depth;
  questionTypes?: QuestionType[];
  examType?: string | null;
  gradeLevel?: string | null;
  userRequest?: string | null;
  /** Practice-test only. */
  timeLimitSeconds?: number | null;
  [key: string]: unknown;
}

export interface NewAssessmentInput {
  assessmentKind: AssessmentKind;
  title: string;
  description?: string | null;
  status?: AssessmentStatus;
  sourceKind?: AssessmentSourceKind | null;
  sourceId?: string | null;
  sourceTitle?: string | null;
  topic?: string | null;
  examType?: string | null;
  depth?: Depth | null;
  timeLimitSeconds?: number | null;
  config?: AssessmentConfig;
  trust?: TrustEnvelope | null;
  /** Active-context org; omit to let the trigger fill the personal org. */
  orgId?: string;
  metadata?: Record<string, unknown>;
}

/** One question to insert. `position` is assigned by the service if omitted. */
export interface NewAssessmentItemInput {
  questionType: QuestionType;
  prompt: string;
  options?: string[] | null;
  correctAnswer?: string | null;
  acceptableAnswers?: string[] | null;
  explanation?: string | null;
  rubric?: string | null;
  depth?: Depth | null;
  points?: number;
  topic?: string | null;
  trust?: TrustEnvelope | null;
  position?: number;
}

export type AssessmentPatch = Partial<
  Pick<
    AssessmentRow,
    | "title"
    | "description"
    | "status"
    | "topic"
    | "exam_type"
    | "depth"
    | "time_limit_seconds"
    | "config"
    | "trust"
  >
>;

export type AssessmentItemPatch = Partial<
  Pick<
    AssessmentItemRow,
    | "prompt"
    | "options"
    | "correct_answer"
    | "acceptable_answers"
    | "explanation"
    | "rubric"
    | "depth"
    | "points"
    | "topic"
    | "question_type"
    | "trust"
    | "position"
  >
>;

// ─── Results ──────────────────────────────────────────────────────────────────
export interface NewResultInput {
  assessmentId: string;
  sessionId?: string | null;
  phase?: ResultPhase;
  gainGroupId?: string | null;
  topic?: string | null;
  sourceKind?: string | null;
  sourceId?: string | null;
  totalCount: number;
  pointsPossible?: number | null;
  orgId?: string;
}

/** One item's outcome captured in `assessment_result.detail`. */
export interface ResultItemDetail {
  itemId: string;
  questionType: QuestionType;
  response: string | null;
  result: AttemptResult;
  scoreValue: number;
  points: number;
  correctAnswer: string | null;
  /** For meaning-graded items: the verdict explanation / named misconception. */
  explanation?: string | null;
  misconception?: string | null;
}

export interface FinalizeResultInput {
  resultId: string;
  correctCount: number;
  partialCount: number;
  totalCount: number;
  scoreValue: number;
  pointsEarned: number;
  pointsPossible: number;
  durationSeconds?: number | null;
  detail: ResultItemDetail[];
  status?: ResultStatus;
}

export interface ListAssessmentsFilter {
  kind?: AssessmentKind;
  sourceKind?: AssessmentSourceKind;
  sourceId?: string;
  status?: AssessmentStatus;
  limit?: number;
}

// ─── Learning-gain contract (PUBLISHED for P5 — see learningGain.ts) ──────────
/**
 * A pre/post learning-gain pair. P5 reads `assessment_result` rows where
 * `phase in ('baseline','post')`, matched by `gain_group_id` (or by
 * (created_by, topic/source_id) when no group id), to compute the delta.
 */
export interface LearningGainPair {
  gainGroupId: string | null;
  topic: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  baseline: AssessmentResultRow | null;
  post: AssessmentResultRow | null;
  /** post.score_value - baseline.score_value, in 0..1 (null until both exist). */
  delta: number | null;
}
