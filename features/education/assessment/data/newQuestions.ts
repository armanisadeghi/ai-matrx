// features/education/assessment/data/newQuestions.ts
//
// The pure half of "make more questions": which generated questions are NEW
// (not already on the assessment, not the requested type's opposite) and how a
// kept question is stamped with the run that made it. No network, no store —
// `generateQuestionsFromSources` calls these inside its per-section extract so
// the rules are testable on their own.

import { isNearDuplicateQA, looseKey } from "@/features/education/convert/segmentedGenerate";
import { BATCH_KEY, OUTLINE_SECTION_KEY } from "@/features/education/kits/outline/types";
import type { NewAssessmentItemInput, QuestionType } from "./types";

/** A question the assessment already holds — what a new one must not repeat. */
export interface ExistingQuestion {
  prompt: string;
  correctAnswer?: string | null;
}

/** The section a run was aimed at, when it was aimed at exactly one. */
export interface QuestionSection {
  id: string;
  title: string;
}

/**
 * Keep only questions that are genuinely new and of a requested type.
 * "New" = neither the same normalized prompt nor a near-duplicate
 * (question + answer overlap) of anything in `existing`. An empty `types`
 * means any type.
 */
export function keepNewQuestions(
  questions: readonly NewAssessmentItemInput[],
  existing: readonly ExistingQuestion[],
  types: readonly QuestionType[] = [],
): NewAssessmentItemInput[] {
  const haveKeys = new Set(existing.map((e) => looseKey(e.prompt)));
  return questions.filter((q) => {
    if (types.length > 0 && !types.includes(q.questionType)) return false;
    if (haveKeys.has(looseKey(q.prompt))) return false;
    const mine = { question: q.prompt, answer: q.correctAnswer ?? "" };
    return !existing.some((e) =>
      isNearDuplicateQA({ question: e.prompt, answer: e.correctAnswer ?? "" }, mine),
    );
  });
}

/**
 * Stamp one question with the run that made it: `metadata.batch_id` always,
 * and for a run aimed at one outline section its id (`metadata.outline_section_id`)
 * and title (`topic`) so coverage is counted by id, never by a title.
 */
export function stampQuestion(
  q: NewAssessmentItemInput,
  stamp: { batchId?: string; section?: QuestionSection },
): NewAssessmentItemInput {
  const metadata: Record<string, unknown> = { ...(q.metadata ?? {}) };
  if (stamp.batchId) metadata[BATCH_KEY] = stamp.batchId;
  if (stamp.section) metadata[OUTLINE_SECTION_KEY] = stamp.section.id;
  return {
    ...q,
    ...(stamp.section ? { topic: stamp.section.title } : {}),
    metadata,
  };
}
