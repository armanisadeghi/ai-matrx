/**
 * `decision_answers` → DecisionAnswersBlock bridge (+ compiled definitions).
 *
 * What a decision holder returns: one typed answer per question asked by the
 * `decision_questions` part, each with the probability the holder attaches to
 * it, the confidence, and — the field that makes the rest meaningful — the
 * METHOD, which says whether the probability was measured on the model's own
 * decision route or written out in words by a text model. Contract:
 * `common-docs/systems/agents/typed-messages/FEATURE.md`.
 *
 * Complete-only bridge. A half-streamed distribution would draw bars that do
 * not sum and a top answer that changes as it arrives; the dispatch entry's
 * loading state stands until the payload closes.
 *
 * The compiled schema here is the BOOTSTRAP floor. The `content_ir` rows win
 * once warm, exactly as with every other kind — and the row for this kind is
 * being registered by the server lane that owns the Python mirror, so a field
 * it carries and this floor lacks still validates and renders.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";

import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import { joinBlocks } from "./kind-markdown-utils";

export const DECISION_ANSWERS_KIND = "decision_answers";
/** The render key `kind-route` sets `block.type` to (SHAPE_BLOCK_DISPATCH). */
export const DECISION_ANSWERS_BLOCK_TYPE = "decision_answers";

export const decisionAnswersKindSchema: KindSchema = {
  kind: DECISION_ANSWERS_KIND,
  fields: {
    model: {
      type: "string",
      nullable: true,
      description: "The model that answered, as dispatched.",
    },
    method: {
      type: "enum",
      values: ["native", "verbalized", "verbalized_calibrated"],
      required: true,
      description:
        "native = the model's own probability from its decision route; verbalized = a probability the model wrote out; verbalized_calibrated = a written one corrected against recorded ground truth. Never omit it — without it a written guess reads as a measurement.",
    },
    answers: {
      type: "inline_object",
      open: true,
      fields: {},
      required: true,
      description:
        "Field name → answer. Each answer carries type (noul|choice|score), answer, probability or probabilities, confidence, and for score a legend.",
    },
    unanswerable: {
      type: "inline_object",
      open: true,
      fields: {},
      nullable: true,
      description:
        "Field name → why the holder refused it. A refusal is an answer; it is never a guess and never an omission.",
    },
    usage: {
      type: "inline_object",
      open: true,
      fields: {},
      nullable: true,
      description: "input_tokens / output_tokens for this decision.",
    },
    cost_usd: { type: "number", nullable: true },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

/** What `DecisionAnswersBlock` receives — the payload, untouched. */
export interface DecisionAnswersServerData extends Record<string, unknown> {
  payload: Record<string, unknown>;
}

export const decisionAnswersServerDataFromEnvelope =
  makeCompleteEnvelopeBridge<DecisionAnswersServerData>(
    DECISION_ANSWERS_KIND,
    (value) => {
      // The one thing the component cannot do without. An EMPTY answers object
      // is a real result (every question was refused), so only its absence
      // declines.
      if (!value.answers || typeof value.answers !== "object") return undefined;
      return { payload: value };
    },
  );

const MD_KNOWN_KEYS = [
  "model",
  "method",
  "answers",
  "unanswerable",
  "usage",
  "cost_usd",
  KIND_KEY,
];

function answerLine(name: string, value: unknown): string {
  if (!value || typeof value !== "object") return `- **${name}**: unreadable`;
  const answer = value as Record<string, unknown>;
  const shown =
    typeof answer.answer === "boolean"
      ? answer.answer
        ? "Yes"
        : "No"
      : answer.answer == null
        ? "unreadable"
        : String(answer.answer);
  const probability =
    typeof answer.probability === "number"
      ? ` (${Math.round(answer.probability * 100)}%)`
      : "";
  const confidence =
    typeof answer.confidence === "number"
      ? `, confidence ${Math.round(answer.confidence * 100)}%`
      : "";
  return `- **${name}**: ${shown}${probability}${confidence}`;
}

export function decisionAnswersMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const answers =
    value.answers && typeof value.answers === "object"
      ? (value.answers as Record<string, unknown>)
      : {};
  const refusals =
    value.unanswerable && typeof value.unanswerable === "object"
      ? (value.unanswerable as Record<string, unknown>)
      : {};
  const header = [
    typeof value.model === "string" ? value.model : null,
    typeof value.method === "string" ? `${value.method} probabilities` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  void MD_KNOWN_KEYS;
  return joinBlocks([
    "# Decision answers",
    header || null,
    Object.keys(answers).length
      ? Object.entries(answers)
          .map(([name, answer]) => answerLine(name, answer))
          .join("\n")
      : "_No answers were returned._",
    Object.keys(refusals).length
      ? `## Refused\n\n${Object.entries(refusals)
          .map(([name, reason]) => `- **${name}**: ${String(reason)}`)
          .join("\n")}`
      : null,
  ]);
}

export const DECISION_ANSWERS_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: DECISION_ANSWERS_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: DECISION_ANSWERS_BLOCK_TYPE,
    toLegacyServerData: decisionAnswersServerDataFromEnvelope,
    toMarkdown: decisionAnswersMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: decisionAnswersKindSchema,
  },
];
