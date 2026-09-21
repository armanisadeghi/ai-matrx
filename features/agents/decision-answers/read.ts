/**
 * Reading a `decision_answers` payload.
 *
 * Contract: `common-docs/systems/agents/typed-messages/FEATURE.md`
 * ("Kind `decision_answers`"). The reader is DEFENSIVE by design — a
 * malformed answer is shown as unreadable, never coerced into a number that
 * a person would then act on. A probability is a claim about the world; a
 * silently-defaulted one is a lie with a bar chart next to it.
 *
 * 🚨 TEMPORARY LOCAL TYPE, same rule as the questions part: when the server
 * lane's generated types carry `decision_answers`, this file keeps its
 * READERS and drops its hand-written interfaces in favour of the generated
 * ones.
 */

export const DECISION_ANSWERS_KIND = "decision_answers" as const;

/** How the probability was obtained. Never inferred — always stated. */
export type DecisionMethod = "native" | "verbalized" | "verbalized_calibrated";

export interface DecisionAnswerView {
  name: string;
  type: "noul" | "choice" | "score" | "unknown";
  /** The answer verbatim: boolean, option name, or score. */
  answer: boolean | string | number | null;
  /** Yes/No only — probability that the answer is true. */
  probability: number | null;
  /** Choice/Score — the full distribution, option → probability. */
  probabilities: Array<{ key: string; label: string; value: number }>;
  confidence: number | null;
  /** Score only — level number → what that level means. */
  legend: Record<string, string>;
  /** The author's suggested cut, when the surface knows it. */
  suggestedThreshold: number | null;
  /** The question as asked, when the surface can supply it. */
  instruction: string | null;
}

export interface DecisionAnswersView {
  model: string | null;
  method: DecisionMethod | null;
  answers: DecisionAnswerView[];
  /** Questions the holder refused, with the reason it gave. */
  refusals: Array<{ name: string; reason: string }>;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readMethod(value: unknown): DecisionMethod | null {
  return value === "native" ||
    value === "verbalized" ||
    value === "verbalized_calibrated"
    ? value
    : null;
}

function readDistribution(
  value: unknown,
  legend: Record<string, string>,
): Array<{ key: string; label: string; value: number }> {
  const raw = record(value);
  if (!raw) return [];
  return Object.entries(raw)
    .map(([key, probability]) => ({
      key,
      label: legend[key] ?? key,
      value: finiteNumber(probability) ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function readLegend(value: unknown): Record<string, string> {
  const raw = record(value);
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function readAnswer(name: string, value: unknown): DecisionAnswerView {
  const raw = record(value);
  const type =
    raw?.type === "noul" || raw?.type === "choice" || raw?.type === "score"
      ? raw.type
      : "unknown";
  const legend = readLegend(raw?.legend);
  const answerRaw = raw?.answer;
  const answer =
    typeof answerRaw === "boolean" ||
    typeof answerRaw === "string" ||
    typeof answerRaw === "number"
      ? answerRaw
      : null;
  return {
    name,
    type,
    answer,
    probability: finiteNumber(raw?.probability),
    probabilities: readDistribution(raw?.probabilities, legend),
    confidence: finiteNumber(raw?.confidence),
    legend,
    suggestedThreshold: finiteNumber(raw?.suggested_threshold),
    instruction:
      typeof raw?.instructions === "string" ? (raw.instructions as string) : null,
  };
}

/** `null` when the value is not a decision_answers payload at all. */
export function readDecisionAnswers(value: unknown): DecisionAnswersView | null {
  const raw = record(value);
  if (!raw) return null;
  const answers = record(raw.answers);
  if (!answers) return null;

  const unanswerable = record(raw.unanswerable);
  const usage = record(raw.usage);

  return {
    model: typeof raw.model === "string" ? raw.model : null,
    method: readMethod(raw.method),
    answers: Object.entries(answers).map(([name, answer]) =>
      readAnswer(name, answer),
    ),
    refusals: unanswerable
      ? Object.entries(unanswerable).map(([name, reason]) => ({
          name,
          reason:
            typeof reason === "string" && reason.trim()
              ? reason
              : "No reason was given.",
        }))
      : [],
    inputTokens: finiteNumber(usage?.input_tokens),
    outputTokens: finiteNumber(usage?.output_tokens),
    costUsd: finiteNumber(raw.cost_usd),
  };
}

/** How the answer reads on screen. Never invented — `null` stays unreadable. */
export function formatDecisionAnswer(answer: DecisionAnswerView): string {
  if (answer.answer === null) return "unreadable";
  if (typeof answer.answer === "boolean") return answer.answer ? "Yes" : "No";
  if (typeof answer.answer === "number") {
    const rounded = Math.round(answer.answer);
    const level = answer.legend[String(rounded)];
    const shown = Number.isInteger(answer.answer)
      ? String(answer.answer)
      : answer.answer.toFixed(1);
    return level ? `${shown} — ${level}` : shown;
  }
  return answer.answer;
}

/** The one number that belongs beside the answer, or null when there isn't one. */
export function answerProbability(answer: DecisionAnswerView): number | null {
  if (answer.probability != null) return answer.probability;
  if (answer.type === "noul") return null;
  const top = answer.probabilities[0];
  return top ? top.value : null;
}

export const METHOD_LABELS: Record<DecisionMethod, string> = {
  native: "native",
  verbalized: "verbalized",
  verbalized_calibrated: "verbalized, calibrated",
};

export const METHOD_EXPLANATIONS: Record<DecisionMethod, string> = {
  native:
    "The model's own probability, read from its decision route — not something it wrote out in words.",
  verbalized:
    "The model was asked for a probability and wrote one. It reads like a measurement but it is an opinion.",
  verbalized_calibrated:
    "A written probability, corrected against this agent version's recorded ground-truth verdicts.",
};
