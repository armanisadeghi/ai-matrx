import type { AppDispatch } from "@/lib/redux/store";
import { loadDecision, runDecision } from "./decision-api";

jest.mock("@/lib/api/call-api", () => ({
  callApi: (options: unknown) => options,
}));

type RequestOptions = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  pathParams?: Record<string, string>;
  onStreamStart?: (id: string) => void;
  onStreamEvent?: (event: { event: string; data: unknown }) => void;
};
const result = {
  type: "decision_result",
  execution_id: "execution-1",
  request_id: "request-1",
  provider_request_id: "provider-1",
  model: "jev-1.13.0",
  answers: {
    route: {
      type: "choice",
      choice: "billing",
      confidence: 1,
      probabilities: { billing: 1, technical: 0 },
    },
  },
  usage: { input_tokens: 396, output_tokens: 61 },
  cost_usd: 0.000016632,
  offering_id: "offering-1",
  route: "preferred",
};
const input = {
  model: "jev-1.13.0",
  state: "Synthetic billing ticket",
  questions: {
    route: {
      type: "choice",
      instructions: "Choose a team",
      criteria: { billing: "Invoices", technical: "Broken service" },
    },
  },
};

it("sends the exact pinned native request and reads its streamed answer", async () => {
  const dispatch = jest.fn(async (options: RequestOptions) => {
    options.onStreamEvent?.({ event: "data", data: result });
    return {};
  });
  const answer = await runDecision(dispatch as unknown as AppDispatch, {
    ...input,
    offeringId: "offering-1",
  });
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch.mock.calls[0][0]).toMatchObject({
    path: "/ai/decisions",
    method: "POST",
    body: { ...input, offering_id: "offering-1" },
  });
  expect(dispatch.mock.calls[0][0].body).not.toHaveProperty("offeringId");
  expect(answer.executionId).toBe("execution-1");
});

it("rejoins an interrupted request without issuing another paid decision", async () => {
  const dispatch = jest.fn(async (options: RequestOptions) => {
    if (options.path === "/ai/decisions") {
      options.onStreamStart?.("request-1");
      return { error: { message: "connection interrupted" } };
    }
    options.onStreamEvent?.({ event: "data", data: result });
    return {};
  });
  const answer = await runDecision(dispatch as unknown as AppDispatch, input);
  expect(dispatch.mock.calls.map(([options]) => options.path)).toEqual([
    "/ai/decisions",
    "/runtime/operations/{request_id}/rejoin",
  ]);
  expect(dispatch.mock.calls[1][0]).toMatchObject({
    method: "POST",
    pathParams: { request_id: "request-1" },
  });
  expect(dispatch.mock.calls[0][0].body).not.toHaveProperty("offering_id");
  expect(answer).toMatchObject({
    executionId: "execution-1",
    source: "recovered",
  });
});

it("loads a saved result through the authorized GET route", async () => {
  const dispatch = jest.fn(async (_options: RequestOptions) => ({
    data: result,
  }));
  await expect(
    loadDecision(dispatch as unknown as AppDispatch, "execution-1"),
  ).resolves.toMatchObject({ executionId: "execution-1", source: "recovered" });
  expect(dispatch.mock.calls[0][0]).toMatchObject({
    path: "/ai/decisions/{execution_id}",
    method: "GET",
    pathParams: { execution_id: "execution-1" },
  });
});

it("reports a failed recovery instead of submitting the decision twice", async () => {
  const dispatch = jest.fn(async (options: RequestOptions) => {
    options.onStreamStart?.("request-1");
    return { error: { message: "recovery unavailable" } };
  });
  await expect(
    runDecision(dispatch as unknown as AppDispatch, input),
  ).rejects.toThrow("recovery unavailable");
  expect(dispatch).toHaveBeenCalledTimes(2);
});
