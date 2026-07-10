"use client";

// features/education/assessment/data/useGenerateQuiz.ts
//
// The reusable "run the assessment generator agent → structured questions" hook.
// Mirrors features/flashcards/data/useGenerateCards.ts exactly: dispatch a
// direct, auto-running agent launch with JSON extraction on, expose the live
// requestId (for streaming preview), poll the active-requests slice until
// extraction finalizes, then coerce the extracted object into questions.
//
// Persisting the result (assessment + assessment_item rows) is the CALLER's job
// (assessmentService.createWithItems) — this hook owns only the agent round-trip,
// so the same primitive serves from-topic, from-deck, and from-source flows.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectConversationRequestIds,
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RootState } from "@/lib/redux/store";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import type { NewAssessmentItemInput, QuestionType, Depth } from "./types";

/** The normalized generation result: a title + a list of insert-ready questions. */
export interface GeneratedQuiz {
  title: string;
  description: string | null;
  questions: NewAssessmentItemInput[];
}

/** Variables the topic generator declares (keys must match the agent exactly). */
export interface GenerateQuizVariables {
  topic: string;
  count: number;
  difficulty: string;
  depth: Depth;
  /** Comma-separated subset of question types; empty = automatic mix. */
  question_types?: string;
  exam_type?: string;
  grade_level?: string;
  user_request?: string;
}

/** Variables the from-source (grounded) generator declares. */
export interface GenerateFromSourceVariables {
  source_content: string;
  source_label: string;
  count: number;
  difficulty: string;
  depth: Depth;
  question_types?: string;
  exam_type?: string;
  user_request?: string;
}

function isFromSourceVars(
  vars: GenerateQuizVariables | GenerateFromSourceVariables,
): vars is GenerateFromSourceVariables {
  return "source_content" in vars;
}

export interface UseGenerateQuizResult {
  generate: (
    agentId: string,
    vars: GenerateQuizVariables | GenerateFromSourceVariables,
  ) => Promise<GeneratedQuiz>;
  isGenerating: boolean;
  error: string | null;
  /** Live request id for the in-flight generation (null before the stream connects). */
  activeRequestId: string | null;
}

const EXTRACTION_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 250;

const VALID_TYPES: readonly QuestionType[] = [
  "multiple_choice",
  "true_false",
  "fill_blank",
  "short_answer",
  "written_response",
];
const VALID_DEPTH: readonly Depth[] = ["recall", "applied", "exam"];

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asStringArray = (v: unknown): string[] | null =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : null;

/**
 * Coerce one raw question object into a NewAssessmentItemInput. Drops questions
 * with no prompt; floors the rest to safe defaults so a slightly-off agent
 * payload still yields usable items. Enforces the correct_answer-matches-an-option
 * rule for multiple_choice (repairs a drifted key rather than dropping the item).
 * Returns null for an unusable entry.
 */
function coerceQuestion(raw: unknown): NewAssessmentItemInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const prompt = asString(r.prompt ?? r.question);
  if (!prompt) return null;

  const rawType = asString(r.question_type ?? r.type);
  const questionType: QuestionType = VALID_TYPES.includes(rawType as QuestionType)
    ? (rawType as QuestionType)
    : "multiple_choice";

  let options = asStringArray(r.options);
  // true_false: synthesize the canonical options when the agent omitted them.
  if (questionType === "true_false" && (!options || options.length === 0)) {
    options = ["True", "False"];
  }

  let correctAnswer = asString(r.correct_answer ?? r.correct) || null;

  // MC repair: correct_answer MUST equal one option verbatim (the grader matches
  // by string). If it doesn't, try a case-insensitive match; else fall back to
  // the first option so the item is never silently mis-keyed to a broken value.
  if (
    questionType === "multiple_choice" &&
    options &&
    options.length > 0 &&
    (!correctAnswer || !options.includes(correctAnswer))
  ) {
    const ci = correctAnswer
      ? options.find((o) => o.toLowerCase() === correctAnswer!.toLowerCase())
      : undefined;
    correctAnswer = ci ?? options[0];
  }

  const rawDepth = asString(r.depth);
  const depth: Depth | null = VALID_DEPTH.includes(rawDepth as Depth)
    ? (rawDepth as Depth)
    : null;

  const points = typeof r.points === "number" && r.points > 0 ? r.points : 1;

  return {
    questionType,
    prompt,
    options: questionType === "multiple_choice" || questionType === "true_false"
      ? options
      : null,
    correctAnswer:
      questionType === "written_response" ? null : correctAnswer,
    acceptableAnswers: asStringArray(r.acceptable_answers),
    explanation: asString(r.explanation) || null,
    rubric: asString(r.rubric) || null,
    depth,
    points,
    topic: asString(r.topic) || null,
    trust: coerceTrustEnvelope(r) ?? undefined,
  };
}

/**
 * Coerce the extracted object into a GeneratedQuiz (tolerant of drift). Exported
 * so the converter-contract generator (quizGenerator.ts) reuses the SAME
 * agent-payload normalization the hook uses — no second coercion path.
 */
export function coerceGeneratedQuiz(value: unknown): GeneratedQuiz {
  if (Array.isArray(value)) {
    const questions = value
      .map(coerceQuestion)
      .filter((q): q is NewAssessmentItemInput => q !== null);
    if (questions.length === 0)
      throw new Error("The generator returned no usable questions");
    return { title: "", description: null, questions };
  }
  if (!value || typeof value !== "object") {
    throw new Error("The generator did not return a JSON object");
  }
  const obj = value as Record<string, unknown>;
  const title = asString(obj.title ?? obj.set_title);
  const description = asString(obj.description) || null;
  const rawQuestions = Array.isArray(obj.questions)
    ? obj.questions
    : Array.isArray(obj.items)
      ? obj.items
      : [];
  const questions = rawQuestions
    .map(coerceQuestion)
    .filter((q): q is NewAssessmentItemInput => q !== null);
  if (questions.length === 0)
    throw new Error("The generator returned no usable questions");
  return { title, description, questions };
}

export function useGenerateQuiz(): UseGenerateQuizResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);

  const activeRequestId = useAppSelector((state) => {
    if (!activeConversationId) return null;
    const ids = selectConversationRequestIds(activeConversationId)(state);
    return ids.length > 0 ? ids[ids.length - 1] : null;
  });

  async function waitForExtraction(requestId: string): Promise<GeneratedQuiz> {
    const start = Date.now();
    while (Date.now() - start < EXTRACTION_TIMEOUT_MS) {
      const state = store.getState() as RootState;
      if (selectJsonExtractionComplete(requestId)(state)) {
        const snapshot = selectFirstExtractedObject(requestId)(state);
        if (!snapshot) {
          throw new Error("The generator finished but produced no structured JSON");
        }
        return coerceGeneratedQuiz(snapshot.value);
      }
      const status = selectRequestStatus(requestId)(state);
      if (status === "error") {
        const reqError = selectRequestError(requestId)(state);
        throw new Error(
          reqError?.user_message ??
            reqError?.message ??
            "The assessment generator failed before returning any questions",
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Timed out waiting for the assessment generator to respond");
  }

  async function generate(
    agentId: string,
    vars: GenerateQuizVariables | GenerateFromSourceVariables,
  ): Promise<GeneratedQuiz> {
    setIsGenerating(true);
    setError(null);
    setActiveConversationId(null);
    try {
      const fromSource = isFromSourceVars(vars);
      const { requestId } = await dispatch(
        launchAgentExecution({
          surfaceKey: fromSource
            ? "assessment-generate-from-source"
            : "assessment-generate-from-topic",
          agentId,
          sourceFeature: "education-assessment",
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
          onConversationCreated: (conversationId) =>
            setActiveConversationId(conversationId),
          runtime: {
            variables: fromSource
              ? {
                  source_content: vars.source_content,
                  source_label: vars.source_label,
                  count: String(vars.count),
                  difficulty: vars.difficulty,
                  depth: vars.depth,
                  question_types: vars.question_types ?? "",
                  exam_type: vars.exam_type ?? "",
                  user_request: vars.user_request ?? "",
                }
              : {
                  topic: vars.topic,
                  count: String(vars.count),
                  difficulty: vars.difficulty,
                  depth: vars.depth,
                  question_types: vars.question_types ?? "",
                  exam_type: vars.exam_type ?? "",
                  grade_level: vars.grade_level ?? "",
                  user_request: vars.user_request ?? "",
                },
          },
          config: { autoRun: true, displayMode: "direct" },
        }),
      ).unwrap();

      if (!requestId) {
        throw new Error("Agent launch did not return a request id");
      }
      return await waitForExtraction(requestId);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to generate the assessment";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  return { generate, isGenerating, error, activeRequestId };
}
