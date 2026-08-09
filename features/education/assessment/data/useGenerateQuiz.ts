"use client";

// features/education/assessment/data/useGenerateQuiz.ts
//
// The reusable "run the assessment generator agent → structured questions" hook.
// Built on the canonical `useHeadlessAgentJson` primitive (D126): launch a
// direct, auto-running agent with JSON extraction on, expose the live
// requestId (for streaming preview), and coerce the extracted object into
// questions.
//
// Persisting the result (assessment + assessment_item rows) is the CALLER's job
// (assessmentService.createWithItems) — this hook owns only the agent round-trip,
// so the same primitive serves from-topic, from-deck, and from-source flows.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useHeadlessAgentJson } from "@/features/agents/hooks/useHeadlessAgentJson";
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
  const { run, isRunning, error, activeRequestId } = useHeadlessAgentJson();

  async function generate(
    agentId: string,
    vars: GenerateQuizVariables | GenerateFromSourceVariables,
  ): Promise<GeneratedQuiz> {
    const fromSource = isFromSourceVars(vars);
    return run<GeneratedQuiz>({
      agentId,
      surfaceKey: fromSource
        ? "assessment-generate-from-source"
        : "assessment-generate-from-topic",
      sourceFeature: "education-assessment",
      surfaceName: "matrx-user/education-assessment",
      // Live streaming preview owns the conversation — keep the instance so
      // consumers of activeRequestId can render the stream + final envelope.
      displayMode: "direct",
      keepInstance: true,
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
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      failureMessages: {
        streamError:
          "The assessment generator failed before returning any questions",
        noJson: "The generator finished but produced no structured JSON",
        timeout: "Timed out waiting for the assessment generator to respond",
      },
      coerce: coerceGeneratedQuiz,
    });
  }

  return { generate, isGenerating: isRunning, error, activeRequestId };
}
