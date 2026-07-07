// features/education/assessment/data/agents.ts
//
// THE single source of truth for the live Education Assessment Engine agent ids
// (P1). Authored + verified in-system (agent_author + agent_run, gemini-3.5-flash);
// see features/education/docs/AGENT_SPECS.md / LIVE_AGENTS.md for the contracts.
//
// These permanent ids always track the latest published version of each agent — so
// the prompts/rubrics can keep being tuned in-system with no code change.
//
// The grade-on-meaning + spoken + verify agents are REUSED from the flashcards
// registry (FC_AGENTS) — P1 does not fork a second grading path (P0 mandate:
// grade-on-meaning is the ONE typed/short-answer grading path).

import { FC_AGENTS } from "@/features/flashcards/data/agents";

export const ASSESSMENT_AGENTS = {
  /** topic, count, difficulty, depth, question_types, exam_type, grade_level, user_request
   *  → { title, description, questions[] } (5 types; trust=inferred) */
  generateQuiz: "afb89a8f-3525-451d-87fa-e19cfa183d58",
  /** source_content (chunk-/card-marked), source_label, count, difficulty, depth,
   *  question_types, exam_type, user_request → { title, description, questions[] with grounded trust } */
  generateQuizFromSource: "04acfd83-63ba-4ca4-9b0d-205d4f853c18",
  /** prompt, correct_answer, question_type, current_depth, target_depth, topic, exam_type,
   *  source_content → ONE deeper question object ("make this deeper") */
  deepenItem: "00ae6c89-59cb-4d49-8b62-c434fa0c4d8b",

  // ── REUSED (do not re-author) ──────────────────────────────────────────────
  /** question, expected_answer, learner_answer → GradeVerdict — the ONE grade-on-meaning
   *  path for typed short/written answers (paraphrase-tolerant). */
  gradeTypedAnswer: FC_AGENTS.gradeTypedAnswer,
  /** front, back, rubric, seconds_allowed (+ audio message part) → spoken grade. */
  gradeSpoken: FC_AGENTS.gradeSpoken,
  /** front, back, source_excerpt → VerifyResult ("Verify against source"). */
  verifyAgainstSource: FC_AGENTS.verifyAgainstSource,
} as const;

export type AssessmentAgentKey = keyof typeof ASSESSMENT_AGENTS;

/** The study-spine item_type every graded assessment question records under. */
export const ASSESSMENT_ITEM_TYPE = "assessment_item" as const;
