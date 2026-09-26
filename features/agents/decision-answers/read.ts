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
  /**
   * Yes/No only — probability that the answer is TRUE, verbatim from the
   * payload. This is NOT the probability of the answer given: a `false`
   * answer at `probability: 0.29` is a 71% No. Use `answerProbability` for
   * the number that belongs beside the answer; this one is for the
   * distribution and the author's threshold, both of which are stated on the
   * true-probability scale.
   */
  probability: number | null;
  /**
   * The full distribution, option/level → probability. For Yes/No this is
   * SYNTHESISED from `probability` (Yes p, No 1−p) so every type has one
   * distribution shape and no surface has to derive the complement itself.
   */
  probabilities: Array<{ key: string; label: string; value: number }>;
  /**
   * The distribution key the ANSWER points at: the option for a choice, the
   * MOST LIKELY level (the distribution's peak) for a score, `"true"`/`"false"`
   * for a Yes/No. `null` when the answer is unreadable or no distribution was
   * returned. A score's weighted number is shown as the number; its label and
   * percentage come from the peak, so the headline and the bold bar below it
   * are the same level (see `answerKeyFor`).
   */
  answerKey: string | null;
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

/**
 * Yes/No as a two-entry distribution. `probability` is P(true), so No is its
 * complement — the one place that subtraction happens.
 */
function noulDistribution(
  probability: number | null,
): Array<{ key: string; label: string; value: number }> {
  if (probability == null) return [];
  return [
    { key: "true", label: "Yes", value: probability },
    { key: "false", label: "No", value: 1 - probability },
  ].sort((a, b) => b.value - a.value);
}

/**
 * The distribution entry the answer points at.
 *
 * A score is a probability-weighted number BETWEEN levels (2.9 on a
 * five-level scale). Its headline used to take the label of the level NEAREST
 * that number, which on a spread distribution read as a contradiction:
 * "urgency 2.9 — data or money at risk 16%" printed above bars led by
 * "a feature is blocked 46%". The label now names the MOST LIKELY level — the
 * peak — with the peak's own probability, while the weighted score stays the
 * number (Arman's ruling via the owning session, 2026-09-23). A tie on the
 * peak goes to the level nearest the weighted score, so the choice is stable.
 * Keys are compared as numbers, never by an assumed 0- or 1-based index.
 */
function answerKeyFor(
  type: DecisionAnswerView["type"],
  answer: boolean | string | number | null,
  probabilities: Array<{ key: string; label: string; value: number }>,
): string | null {
  if (answer === null || probabilities.length === 0) return null;
  if (typeof answer === "boolean") return answer ? "true" : "false";
  if (typeof answer === "string") {
    return probabilities.some((entry) => entry.key === answer) ? answer : null;
  }
  if (type === "choice") return null;
  let best: string | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of probabilities) {
    const level = Number(entry.key);
    if (!Number.isFinite(level)) continue;
    const distance = Math.abs(level - answer);
    if (
      entry.value > bestValue ||
      (entry.value === bestValue && distance < bestDistance)
    ) {
      bestValue = entry.value;
      bestDistance = distance;
      best = entry.key;
    }
  }
  return best;
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
  const probability = finiteNumber(raw?.probability);
  const probabilities =
    type === "noul"
      ? noulDistribution(probability)
      : readDistribution(raw?.probabilities, legend);
  return {
    name,
    type,
    answer,
    probability,
    probabilities,
    answerKey: answerKeyFor(type, answer, probabilities),
    confidence: finiteNumber(raw?.confidence),
    legend,
    suggestedThreshold: finiteNumber(raw?.suggested_threshold),
    instruction:
      typeof raw?.instructions === "string"
        ? (raw.instructions as string)
        : null,
  };
}

/** `null` when the value is not a decision_answers payload at all. */
export function readDecisionAnswers(
  value: unknown,
): DecisionAnswersView | null {
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
    const shown = Number.isInteger(answer.answer)
      ? String(answer.answer)
      : answer.answer.toFixed(1);
    const key = answer.answerKey;
    const level = key == null ? undefined : answer.legend[key];
    return level ? `${shown} — ${level}` : shown;
  }
  return answer.answer;
}

/**
 * The one number that belongs beside the answer: the probability OF THE
 * ANSWER GIVEN, never the biggest number in the distribution and never the
 * raw `probability` field.
 *
 * Two ways this used to lie, both live: a `noul` answered `false` at
 * `probability: 0.3` printed "No 30%" when the model was 70% sure of No; and
 * a score's label and percentage came from different levels. For a score the
 * label is the peak level, so this is the peak's own probability — the label
 * and the number always describe the same level.
 */
export function answerProbability(answer: DecisionAnswerView): number | null {
  const key = answer.answerKey;
  if (key != null) {
    const entry = answer.probabilities.find((e) => e.key === key);
    if (entry) return entry.value;
  }
  if (answer.type === "noul") return null;
  if (answer.probability != null) return answer.probability;
  return null;
}

/** P(true) for a Yes/No — the scale the author's threshold is stated on. */
export function probabilityOfTrue(answer: DecisionAnswerView): number | null {
  return answer.type === "noul" ? answer.probability : null;
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

/**
 * A decision turn as READABLE TEXT — for every surface that shows a run's
 * result as a string instead of drawing the `DecisionAnswers` card: the toast
 * preview, agent apps (their `response` string, public `/p/<slug>` included),
 * a shortcut's `responseText` handed to its caller. A decision turn carries no
 * text at all, so every one of those surfaces used to show nothing — or wait
 * forever — over a paid, finished verdict.
 *
 * One line per answer, with the probability OF THE ANSWER GIVEN (never the raw
 * P(true) a `false` answer carries), then the refusals with their reasons.
 * `null` when the value is not a decision payload — never a guess.
 */
export function decisionAnswersText(payload: unknown): string | null {
  const view = readDecisionAnswers(payload);
  if (!view) return null;
  const lines: string[] = [];
  for (const answer of view.answers) {
    const p = answerProbability(answer);
    const shown = formatDecisionAnswer(answer);
    lines.push(
      `- ${answer.name}: ${shown}${p == null ? "" : ` (${Math.round(p * 100)}%)`}`,
    );
  }
  for (const refusal of view.refusals) {
    lines.push(`- ${refusal.name}: not answered. ${refusal.reason}`);
  }
  if (lines.length === 0) lines.push("- No answers were returned.");
  const how = view.method
    ? `${METHOD_LABELS[view.method]} probabilities`
    : "probabilities of unknown origin";
  const header = `Decision (${how}${view.model ? `, ${view.model}` : ""})`;
  return [header, ...lines].join("\n");
}
