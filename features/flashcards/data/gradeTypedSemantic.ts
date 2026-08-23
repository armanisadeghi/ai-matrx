// features/flashcards/data/gradeTypedSemantic.ts
//
// WP3 gap 14 — Write mode grades on MEANING, not string distance. The
// `flashcards.grade_typed_answer` mandate (IC-1: "grade-on-meaning,
// paraphrase-tolerant") judges a typed answer against the card; the instant
// Levenshtein result (`utils/textSimilarity.ts`) stays as the immediate
// signal so the learner is never blocked waiting on an agent — this verdict
// UPGRADES the suggestion when it lands (typically 1-3s).
//
// Mirrors the microCoach lane exactly: mandate key from FC_MANDATES (never a
// raw agent id), runHeadlessAgentJson, defensive parse, null on any failure —
// the similarity fallback is already on screen, so failure costs nothing.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import {
  coerceGradeVerdict,
  verdictResult,
} from "@/features/education/trust/types";
import type { ReviewResult } from "../types";
import { FC_MANDATES } from "./mandates";

export interface TypedGradeVerdict {
  result: ReviewResult;
  /** The grader's one-line reason — shown to the learner. */
  reason: string | null;
}

/**
 * The Write-surface view of the `answer_grade` kind: adapts THE ONE verdict
 * reader (`coerceGradeVerdict`, trust/types.ts — booleans + result-token
 * contracts, `__kind` ignored) into the inline result + one-line reason.
 * Null when unusable.
 */
export function readTypedGradeVerdict(data: unknown): TypedGradeVerdict | null {
  const verdict = coerceGradeVerdict(data);
  if (!verdict) return null;
  const explanation = verdict.explanation.trim() || null;
  const misconception = verdict.misconception?.trim() || null;
  const reason =
    misconception && explanation
      ? `${explanation} (misconception: ${misconception})`
      : (explanation ?? misconception);
  const result: ReviewResult = verdictResult(verdict);
  return { result, reason };
}

/** Semantic verdict on a typed answer, or null on failure (fallback on screen). */
export function gradeTypedSemantic(ctx: {
  question: string;
  expectedAnswer: string;
  learnerAnswer: string;
  /** Override the mandate (rare — testing only). */
  mandateKey?: string | null;
}) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<TypedGradeVerdict | null> => {
    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        mandateKey: ctx.mandateKey ?? FC_MANDATES.gradeTypedAnswer,
        surfaceKey: "flashcards-grade-typed",
        sourceFeature: "education-flashcards",
        // Fires on the learner's own "Check answer" gesture.
        initiation: "user",
        variables: {
          question: ctx.question,
          expected_answer: ctx.expectedAnswer,
          learner_answer: ctx.learnerAnswer,
        },
        timeoutMs: 20_000,
        pollIntervalMs: 100,
      });
      return readTypedGradeVerdict(result.data);
    } catch (err) {
      console.error("[flashcards.gradeTypedSemantic] failed:", err);
      return null;
    }
  };
}
