// features/education/assessment/data/mandates.ts
//
// Mandate keys for the Assessment Engine AI lanes (P1). These are MANDATE
// KEYS, not agent ids: each key resolves LIVE (system default → org binding →
// user binding) to whatever agent the DATABASE currently binds — agent
// identity never lives in code. Swap the agent behind any lane at
// /agents/mandates; no code change, no deploy. See
// features/agents/mandates/FEATURE.md.
//
// The grade-on-meaning + spoken + verify lanes REUSE the flashcards mandates
// (P0 mandate: grade-on-meaning is the ONE typed/short-answer grading path —
// P1 does not fork a second grading lane).

import { FC_MANDATES } from "@/features/flashcards/data/mandates";

export const ASSESSMENT_MANDATES = {
  /** topic, count, difficulty, depth, question_types, exam_type, grade_level, user_request
   *  → { title, description, questions[] } (5 types; trust=inferred) */
  generateQuiz: "education.quiz_generate",
  /** source_content, source_label, count, difficulty, depth, question_types, exam_type,
   *  user_request → { title, description, questions[] with grounded trust } */
  generateQuizFromSource: "education.quiz_generate_from_source",
  /** prompt, correct_answer, question_type, current_depth, target_depth, topic, exam_type,
   *  source_content → ONE deeper question object ("make this deeper") */
  deepenItem: "education.quiz_deepen_item",
  /** VISION grader — question, expected_answer (+ photo message part) → StepGradeVerdict.
   *  The ONE handwritten / image-answer grading path. */
  gradeHandwritten: "education.grade_handwritten",

  // ── REUSED flashcards mandates (do not fork) ───────────────────────────────
  gradeTypedAnswer: FC_MANDATES.gradeTypedAnswer,
  gradeSpoken: FC_MANDATES.gradeSpoken,
  verifyAgainstSource: FC_MANDATES.verifyAgainstSource,
} as const;

export type AssessmentMandateKey = keyof typeof ASSESSMENT_MANDATES;

/** The study-spine item_type every graded assessment question records under. */
export const ASSESSMENT_ITEM_TYPE = "assessment_item" as const;

/**
 * The study-spine item_type for a STANDALONE handwritten-work grading (the
 * "Grade my handwritten work" surface) — a worked problem the learner photographs
 * outside any assessment. Each submission is its own item (a fresh id), so it
 * records an attempt + a session without needing an assessment row.
 */
export const HANDWRITTEN_WORK_ITEM_TYPE = "handwritten_work" as const;
