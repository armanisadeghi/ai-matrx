// features/education/assessment/data/deepenItem.ts
//
// The per-item "make this deeper" action (depth-on-demand). Drives the
// `deepenItem` agent for ONE question and returns a single insert/patch-ready
// question at the next depth up. Redux thunk mirroring makeQuizItems.ts; returns
// null on any skip/failure (the caller shows a toast, never a hard block). The
// agent round-trip runs through the canonical `runHeadlessAgentJson` (D126).

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { ASSESSMENT_AGENTS } from "./agents";
import { asDepth, isDepth } from "./types";
import type { AssessmentItemRow, Depth, NewAssessmentItemInput, QuestionType } from "./types";

const VALID_TYPES: readonly QuestionType[] = [
  "multiple_choice",
  "true_false",
  "fill_blank",
  "short_answer",
  "written_response",
];
const nextDepth: Record<Depth, Depth> = {
  recall: "applied",
  applied: "exam",
  exam: "exam",
};

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asStringArray = (v: unknown): string[] | null =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : null;

function coerceOne(raw: unknown): NewAssessmentItemInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const prompt = asString(r.prompt);
  if (!prompt) return null;
  const rawType = asString(r.question_type);
  const questionType: QuestionType = VALID_TYPES.includes(rawType as QuestionType)
    ? (rawType as QuestionType)
    : "multiple_choice";
  let options = asStringArray(r.options);
  if (questionType === "true_false" && (!options || options.length === 0)) {
    options = ["True", "False"];
  }
  let correctAnswer = asString(r.correct_answer) || null;
  if (
    questionType === "multiple_choice" &&
    options &&
    options.length > 0 &&
    (!correctAnswer || !options.includes(correctAnswer))
  ) {
    correctAnswer = options[0];
  }
  const rawDepth = asString(r.depth);
  const depth: Depth | null = isDepth(rawDepth) ? rawDepth : null;
  return {
    questionType,
    prompt,
    options:
      questionType === "multiple_choice" || questionType === "true_false"
        ? options
        : null,
    correctAnswer: questionType === "written_response" ? null : correctAnswer,
    acceptableAnswers: asStringArray(r.acceptable_answers),
    explanation: asString(r.explanation) || null,
    rubric: asString(r.rubric) || null,
    depth,
    points: typeof r.points === "number" && r.points > 0 ? r.points : 1,
    topic: asString(r.topic) || null,
    trust: coerceTrustEnvelope(r) ?? undefined,
  };
}

/** The depth one level above the given item's current depth (caps at 'exam'). */
export function deeperThan(depth: Depth | null | undefined): Depth {
  return nextDepth[depth ?? "recall"];
}

/**
 * Generate a deeper version of ONE question. `sourceContent` (optional) is the
 * passage the original was grounded in, so the deeper item can stay cited.
 * Returns null on any failure.
 */
export function deepenItem(args: {
  item: Pick<
    AssessmentItemRow,
    "prompt" | "correct_answer" | "question_type" | "depth" | "topic"
  >;
  examType?: string | null;
  sourceContent?: string | null;
}) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<NewAssessmentItemInput | null> => {
    const agentId = ASSESSMENT_AGENTS.deepenItem;
    const target = deeperThan(asDepth(args.item.depth));
    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        agentId,
        surfaceKey: "assessment-deepen-item",
        sourceFeature: "education-assessment",
        variables: {
          prompt: args.item.prompt,
          correct_answer: args.item.correct_answer ?? "",
          question_type: args.item.question_type,
          current_depth: args.item.depth ?? "recall",
          target_depth: target,
          topic: args.item.topic ?? "",
          exam_type: args.examType ?? "",
          source_content: args.sourceContent ?? "",
        },
        timeoutMs: 60_000,
        pollIntervalMs: 150,
      });
      return coerceOne(result.data);
    } catch (err) {
      console.error("[assessment.deepenItem] failed:", err);
      return null;
    }
  };
}
