/**
 * The decision budget — what fits in one decision request, and where the
 * numbers come from.
 *
 * THE RULE (`common-docs/systems/agents/typed-messages/FEATURE.md`): a
 * decision request has TWO ceilings, not one.
 *
 *   1. `totalTokens` — the state plus EVERY question, shared.
 *   2. `statePlusLongestQuestionTokens` — the state plus the single LONGEST
 *      question. A decision holder evaluates one question at a time against
 *      the whole state, so ten short questions cost far less than the total
 *      suggests, and one enormous question can break the request while the
 *      total still looks healthy. A meter showing only the total lies.
 *
 * WHERE THE NUMBERS COME FROM, in order:
 *   - the model's own catalog record (`ai.model_definition.context_window`,
 *     and a `decision_budget` object on `capabilities`/`constraints` when the
 *     catalog carries one) — the catalog is always right over this file;
 *   - otherwise `DECISION_BUDGET_DEFAULTS` below, which are the measured Jev
 *     figures recorded in FEATURE.md (64k shared / 32k state + longest).
 *
 * These defaults are a FALLBACK, never a product opinion: they exist so a
 * model row that has not been filled in yet still shows an honest meter with
 * its source labelled ("model catalog" vs "platform default"). When a model
 * needs different numbers, the fix is its catalog row — never an edit here.
 */

import { parseCapabilities } from "@/features/ai-models/capabilities/parse";
import { isDecisionModelCapability } from "@/features/ai-models/capabilities/types";
import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import { estimateTokensForText } from "@/lib/tokens/estimate";
import type { DecisionQuestionSpec } from "./types";

export const DECISION_BUDGET_DEFAULTS = {
  totalTokens: 64_000,
  statePlusLongestQuestionTokens: 32_000,
} as const;

export type DecisionBudgetSource = "catalog" | "default" | "unloaded";

export interface DecisionBudgetLimits {
  totalTokens: number;
  statePlusLongestQuestionTokens: number;
  source: DecisionBudgetSource;
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : null;
}

/** A `decision_budget` object wherever the catalog chose to park it. */
function readDeclaredBudget(
  blob: unknown,
): { total: number | null; statePlusLongest: number | null } | null {
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return null;
  const declared = (blob as Record<string, unknown>).decision_budget;
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) {
    return null;
  }
  const record = declared as Record<string, unknown>;
  return {
    total: positiveInt(record.total_tokens),
    statePlusLongest: positiveInt(record.state_plus_longest_question_tokens),
  };
}

/**
 * The limits for one model. `null` model (nothing selected yet) answers the
 * defaults so the meter renders rather than disappearing.
 */
export function decisionBudgetForModel(
  model: AIModelRecord | null | undefined,
): DecisionBudgetLimits {
  const declared =
    readDeclaredBudget(model?.capabilities) ??
    readDeclaredBudget(model?.constraints);
  const contextWindow = positiveInt(model?.context_window);

  const total = declared?.total ?? contextWindow;
  // Half the window is the honest reading when the catalog declares only a
  // context window: state and question share the request, and the holder
  // evaluates one question against the whole state.
  const statePlusLongest =
    declared?.statePlusLongest ?? (contextWindow ? Math.floor(contextWindow / 2) : null);

  if (total != null && statePlusLongest != null) {
    return {
      totalTokens: total,
      statePlusLongestQuestionTokens: statePlusLongest,
      source: "catalog",
    };
  }
  // "unloaded" and "default" both fall back to the same numbers, but they are
  // different sentences on screen: one says the catalog row declares none, the
  // other says we have not read the row yet.
  return {
    ...DECISION_BUDGET_DEFAULTS,
    source: model ? "default" : "unloaded",
  };
}

export interface DecisionBudgetReading {
  limits: DecisionBudgetLimits;
  /** Tokens of every OTHER part of this message — the state. */
  stateTokens: number;
  /** Per-question estimate, in the questions' own order. */
  questionTokens: number[];
  longestQuestionTokens: number;
  totalTokens: number;
  /** state + longest question, against `statePlusLongestQuestionTokens`. */
  statePlusLongestTokens: number;
  overTotal: boolean;
  overStatePlusLongest: boolean;
}

/** Everything a question contributes: the instruction AND its criteria. */
export function questionTokenCost(question: DecisionQuestionSpec): number {
  const parts: string[] = [question.instructions ?? ""];
  const criteria = question.criteria;
  if (Array.isArray(criteria)) {
    parts.push(...criteria.map((level) => String(level ?? "")));
  } else if (criteria && typeof criteria === "object") {
    for (const [key, value] of Object.entries(criteria)) {
      parts.push(key);
      if (value) parts.push(String(value));
    }
  }
  return estimateTokensForText(parts.join("\n"), "structured");
}

export function readDecisionBudget(params: {
  model: AIModelRecord | null | undefined;
  /** Text of every other part of the same message, already flattened. */
  stateText: string;
  questions: DecisionQuestionSpec[];
}): DecisionBudgetReading {
  const limits = decisionBudgetForModel(params.model);
  const stateTokens = estimateTokensForText(params.stateText, "prose");
  const questionTokens = params.questions.map(questionTokenCost);
  const longestQuestionTokens = questionTokens.reduce((a, b) => Math.max(a, b), 0);
  const totalTokens =
    stateTokens + questionTokens.reduce((a, b) => a + b, 0);
  const statePlusLongestTokens = stateTokens + longestQuestionTokens;
  return {
    limits,
    stateTokens,
    questionTokens,
    longestQuestionTokens,
    totalTokens,
    statePlusLongestTokens,
    overTotal: totalTokens > limits.totalTokens,
    overStatePlusLongest:
      statePlusLongestTokens > limits.statePlusLongestQuestionTokens,
  };
}

/** True when this model can consume a decision_questions part natively. */
export function modelTakesDecisions(
  model: AIModelRecord | null | undefined,
): boolean {
  if (!model) return false;
  return isDecisionModelCapability(
    parseCapabilities(model.capabilities, {
      modelId: model.id,
      modelName: model.name,
    }),
  );
}
