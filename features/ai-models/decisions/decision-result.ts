import { z } from "zod";

const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) }),
  z.object({ type: z.literal("choice"), choice: z.string(), probabilities: z.record(z.string(), z.number()), confidence: z.number().min(0).max(1) }),
  z.object({ type: z.literal("score"), score: z.number(), probabilities: z.record(z.string(), z.number()), confidence: z.number().min(0).max(1), legend: z.record(z.string(), z.unknown()) }),
]);

const resultSchema = z.object({
  type: z.literal("decision_result").optional(),
  execution_id: z.string().min(1),
  request_id: z.string().nullable(),
  provider_request_id: z.string().nullable(),
  model: z.string().min(1),
  answers: z.record(z.string(), answerSchema),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
  cost_usd: z.number().nonnegative().nullable(),
  offering_id: z.string().nullable(),
  route: z.string().nullable(),
});

export type DecisionAnswerView = z.infer<typeof answerSchema>;
export interface DecisionResultView {
  executionId: string;
  requestId: string | null;
  providerRequestId: string | null;
  model: string;
  answers: Record<string, DecisionAnswerView>;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  offeringId: string | null;
  route: string | null;
  source: "live" | "recovered";
}

/** Validates a returned decision payload before it reaches the result UI. */
export function readDecisionResult(value: unknown): DecisionResultView | null {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    executionId: parsed.data.execution_id,
    requestId: parsed.data.request_id,
    providerRequestId: parsed.data.provider_request_id,
    model: parsed.data.model,
    answers: parsed.data.answers,
    inputTokens: parsed.data.usage.input_tokens,
    outputTokens: parsed.data.usage.output_tokens,
    costUsd: parsed.data.cost_usd,
    offeringId: parsed.data.offering_id,
    route: parsed.data.route,
    source: "live",
  };
}
