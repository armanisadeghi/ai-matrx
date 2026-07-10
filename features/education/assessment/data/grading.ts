// features/education/assessment/data/grading.ts
//
// The ONE grading path for assessment answers. Selected/objective items
// (multiple_choice, true_false, fill_blank) grade LOCALLY (instant, free);
// free-response items (short_answer, written_response) grade on MEANING via the
// reused `gradeTypedAnswer` agent (P0's grade-on-meaning contract — paraphrase-
// tolerant, never exact-string). This is the antidote to Knowt's exact-string
// grading the market hates.
//
// `gradeAnswerLocal` is a pure function; `gradeAnswerAI` is a Redux thunk that
// drives the agent (mirrors features/flashcards/data/quiz/makeQuizItems.ts).
// `gradeAnswer` (in the taking hook) picks the path per question type.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import {
  coerceGradeVerdict,
  gradeResultScore,
  verdictResult,
  type GradeVerdict,
} from "@/features/education/trust/types";
import { ASSESSMENT_AGENTS } from "./agents";
import type { AssessmentItemRow, AttemptResult, QuestionType } from "./types";

/** The unified per-answer verdict every question type resolves to. */
export interface GradedAnswer {
  result: AttemptResult;
  /** Normalized 0..1 — 1 correct, 0.5 partial, 0 incorrect. */
  scoreValue: number;
  /** Meaning-terms feedback (why); always present. */
  explanation: string;
  /** The named misconception the learner appears to hold, if any. */
  misconception: string | null;
  /** How this was graded — 'local' (objective match) or the agent id. */
  gradedBy: string;
}

const OBJECTIVE_TYPES: readonly QuestionType[] = [
  "multiple_choice",
  "true_false",
  "fill_blank",
];

export function isObjectiveType(t: QuestionType): boolean {
  return OBJECTIVE_TYPES.includes(t);
}

/** Normalize a typed answer for objective comparison (case/space/punctuation-insensitive). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()"']/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Grade an objective answer locally. `response` is the learner's selected
 * option (MC/TF) or typed word (fill_blank). fill_blank accepts the canonical
 * answer OR any `acceptable_answers`, normalized. Returns null for a
 * free-response type (caller must use the AI path).
 */
export function gradeAnswerLocal(
  item: Pick<
    AssessmentItemRow,
    "question_type" | "correct_answer" | "acceptable_answers" | "explanation"
  >,
  response: string,
): GradedAnswer | null {
  const type = item.question_type as QuestionType;
  if (!isObjectiveType(type)) return null;

  const correct = item.correct_answer ?? "";
  const explanation = item.explanation ?? "";
  let isCorrect = false;

  if (type === "multiple_choice" || type === "true_false") {
    isCorrect = response === correct || normalize(response) === normalize(correct);
  } else {
    // fill_blank: canonical + acceptable answers, normalized.
    const accepted = [correct, ...normalizeAcceptable(item.acceptable_answers)];
    const target = normalize(response);
    isCorrect = target.length > 0 && accepted.some((a) => normalize(a) === target);
  }

  const result: AttemptResult = isCorrect ? "correct" : "incorrect";
  return {
    result,
    scoreValue: gradeResultScore(result),
    explanation,
    misconception: null,
    gradedBy: "local",
  };
}

function normalizeAcceptable(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

/**
 * Map a grade-on-meaning verdict → the unified GradedAnswer. `GradedAnswer` is
 * the TYPED-answer adapter: the canonical `GradeVerdict` core (result +
 * explanation + misconception via the shared helpers) plus assessment's extras
 * (scoreValue, gradedBy).
 */
function verdictToGraded(v: GradeVerdict, agentId: string): GradedAnswer {
  const result = verdictResult(v);
  return {
    result,
    scoreValue: gradeResultScore(result),
    explanation: v.explanation,
    misconception: v.misconception,
    gradedBy: agentId,
  };
}

async function waitForObject(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 60_000,
): Promise<unknown | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    if (selectJsonExtractionComplete(requestId)(state)) {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    if (selectRequestStatus(requestId)(state) === "error") {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/**
 * Grade a free-response (short_answer / written_response) answer on MEANING via
 * the `gradeTypedAnswer` agent. `expected` is the model answer (short_answer's
 * correct_answer) or, for written_response, the rubric describing full credit.
 * Returns a safe fallback verdict on any failure — never throws.
 */
export function gradeAnswerAI(args: {
  question: string;
  expected: string;
  learnerAnswer: string;
  agentId?: string;
}) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<GradedAnswer> => {
    const agentId = args.agentId ?? ASSESSMENT_AGENTS.gradeTypedAnswer;
    const fallback: GradedAnswer = {
      result: "partial",
      scoreValue: 0.5,
      explanation:
        "We couldn't auto-grade this answer — mark it yourself below.",
      misconception: null,
      gradedBy: "fallback",
    };
    if (!args.learnerAnswer.trim()) {
      return {
        result: "incorrect",
        scoreValue: 0,
        explanation: "No answer was given.",
        misconception: null,
        gradedBy: "local",
      };
    }
    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId,
          surfaceKey: "assessment-grade-typed",
          sourceFeature: "education-assessment-grade",
          isEphemeral: false,
          runtime: {
            variables: {
              question: args.question,
              expected_answer: args.expected,
              learner_answer: args.learnerAnswer,
            },
          },
          config: { autoRun: true, displayMode: "background" },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;
      const requestId = launch.requestId;
      if (!requestId) return fallback;
      const raw = await waitForObject(getState, requestId);
      const verdict = coerceGradeVerdict(raw);
      if (!verdict) return fallback;
      return verdictToGraded(verdict, agentId);
    } catch (err) {
      console.error("[assessment.gradeAnswerAI] failed:", err);
      return fallback;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
