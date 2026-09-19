import { z } from "zod";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";
import { readDecisionResult, type DecisionResultView } from "./decision-result";
import type { DecisionRunInput } from "./DecisionPlayground";

type SystemOneEntry = components["schemas"]["SystemOneEntry"];
type SystemOneState = components["schemas"]["SystemOneState"];
type DecisionQuestionPayload = components["schemas"]["Question"];

const jsonValueSchema: z.ZodType<components["schemas"]["JsonValue"]> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);
const entrySchema: z.ZodType<SystemOneEntry> = z.union([
  z.string(),
  z.record(z.string(), jsonValueSchema),
  z.array(jsonValueSchema),
  z.null(),
]);
const stateSchema: z.ZodType<SystemOneState> = z.union([
  z.string(),
  z.record(z.string(), jsonValueSchema),
  z.array(jsonValueSchema),
]);
const questionSchema: z.ZodType<DecisionQuestionPayload> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), instructions: entrySchema, criteria: z.record(z.string(), entrySchema) }),
  z.object({ type: z.literal("score"), instructions: entrySchema, criteria: z.array(entrySchema).min(2) }),
  z.object({ type: z.literal("noul"), instructions: entrySchema, criteria: z.record(z.string(), entrySchema).nullable().optional() }),
]);
const requestSchema = z.object({
  model: z.string().min(1),
  offering_id: z.string().min(1).optional(),
  state: stateSchema,
  questions: z.record(z.string().min(1), questionSchema).refine((questions) => Object.keys(questions).length > 0, "Add at least one question."),
});

function readResult(value: unknown, label: string): DecisionResultView {
  const result = readDecisionResult(value);
  if (!result) throw new Error(`${label} returned an invalid decision result.`);
  return result;
}

export async function runDecision(
  dispatch: AppDispatch,
  input: DecisionRunInput,
): Promise<DecisionResultView> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Decision request is invalid.");
  let streamedResult: DecisionResultView | null = null;
  let runtimeRequestId: string | null = null;
  const response = await dispatch(callApi({
    path: "/ai/decisions",
    method: "POST",
    body: parsed.data,
    stream: true,
    onStreamStart: (requestId) => { runtimeRequestId = requestId; },
    onStreamEvent: (event) => {
      if (event.event !== "data") return;
      const result = readDecisionResult(event.data);
      if (result) streamedResult = result;
    },
  }));
  if (response.error && runtimeRequestId) {
    const rejoin = await dispatch(callApi({
      path: "/runtime/operations/{request_id}/rejoin",
      method: "POST",
      pathParams: { request_id: runtimeRequestId },
      stream: true,
      onStreamEvent: (event) => {
        if (event.event !== "data") return;
        const result = readDecisionResult(event.data);
        if (result) streamedResult = { ...result, source: "recovered" };
      },
    }));
    if (rejoin.error) throw new Error(rejoin.error.message);
  } else if (response.error) throw new Error(response.error.message);
  if (!streamedResult) throw new Error("The decision ended without a typed result. Reconnect with the execution ID when it is available.");
  return streamedResult;
}

export async function loadDecision(
  dispatch: AppDispatch,
  executionId: string,
): Promise<DecisionResultView> {
  const response = await dispatch(callApi({
    path: "/ai/decisions/{execution_id}",
    method: "GET",
    pathParams: { execution_id: executionId },
    expectedErrorStatuses: [404],
  }));
  if (response.error) throw new Error(response.error.message);
  return { ...readResult(response.data, "Saved decision"), source: "recovered" };
}
