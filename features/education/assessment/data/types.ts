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
import type { TrustEnvelope } from "@/features/education/trust/types";

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
export type ResultPhase = "standalone" | "baseline" | "post";
export type ResultStatus = "in_progress" | "completed" | "abandoned";

/** The three graded outcomes the study spine records (shared vocabulary). */
export type AttemptResult = "correct" | "partial" | "incorrect";

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
