/**
 * run-agent-via-matrx.test.ts — behavior parity for the moved one-shot flow.
 *
 * `runAgentViaMatrxClient` routes `useRunAgent`'s wire through the published
 * `@ai-matrx/agents/matrx` client and interprets every event through the REAL
 * `@ai-matrx/agents/projection/request` projector (its first production
 * consumer). These tests pin the legacy semantics the flow must keep:
 * chunk accumulation + onChunk full-text callbacks, the error-message
 * preference orders, completion-output fallback, and callApi's scope
 * injection into the request body.
 */

import type { RootState } from "@/lib/redux/store";

jest.mock("@ai-matrx/agents/matrx", () => ({
  startAgentRun: jest.fn(),
}));
jest.mock("@/lib/api/matrx-transport", () => ({
  createMatrxTransport: jest.fn(() => ({ fetch: jest.fn() })),
}));
jest.mock("@/lib/api/call-api", () => {
  const actual = jest.requireActual("@/lib/api/call-api");
  return {
    ...actual,
    waitForAuthReady: jest.fn(async () => true),
    resolveScope: jest.fn(() => ({
      user_id: "user-1",
      organization_id: "org-1",
      project_id: "proj-1",
    })),
  };
});

import { startAgentRun } from "@ai-matrx/agents/matrx";
import { runAgentViaMatrxClient } from "./useRunAgent";

const mockedStart = startAgentRun as jest.Mock;
const dispatch = jest.fn();
const getState = () =>
  ({ adminPreferences: { desktopTargetInstanceId: null } }) as unknown as
    RootState;

interface Envelope {
  event: string;
  data?: unknown;
  stream_seq?: number;
}

function mockRun(envelopes: Envelope[]): void {
  mockedStart.mockResolvedValue({
    requestId: "srv-req-1",
    conversationId: "conv-1",
    events: (async function* () {
      for (const envelope of envelopes) yield envelope;
    })(),
    response: {},
  });
}

const baseArgs = {
  agentId: "agent-1",
  userInput: "Do the thing",
  sourceApp: "matrx-frontend",
  sourceFeature: "agent-runner",
};

beforeEach(() => {
  mockedStart.mockReset();
  dispatch.mockReset();
});

describe("runAgentViaMatrxClient", () => {
  it("accumulates chunk text through the projector and streams full text to onChunk", async () => {
    mockRun([
      { event: "chunk", data: { text: "Hel" } },
      { event: "chunk", data: { text: "lo" } },
      {
        event: "completion",
        data: { operation: "user_request", status: "success", result: {} },
      },
    ]);
    const seen: string[] = [];

    const text = await runAgentViaMatrxClient({
      ...baseArgs,
      onChunk: (full) => seen.push(full),
    })(dispatch, getState, undefined);

    expect(text).toBe("Hello");
    expect(seen).toEqual(["Hel", "Hello"]);
  });

  it("injects callApi's resolved scope into the wire body", async () => {
    mockRun([]);
    await runAgentViaMatrxClient(baseArgs)(dispatch, getState, undefined);

    const [, agentId, request] = mockedStart.mock.calls[0];
    expect(agentId).toBe("agent-1");
    expect(request).toMatchObject({
      organization_id: "org-1",
      project_id: "proj-1",
      is_new: true,
      store: false,
      user_input: "Do the thing",
      source_app: "matrx-frontend",
      source_feature: "agent-runner",
    });
    expect(typeof request.conversation_id).toBe("string");
  });

  it("throws the error event's user_message → message → fallback", async () => {
    mockRun([
      { event: "chunk", data: { text: "partial" } },
      {
        event: "error",
        data: { message: "boom", user_message: "It broke nicely" },
      },
    ]);

    await expect(
      runAgentViaMatrxClient(baseArgs)(dispatch, getState, undefined),
    ).rejects.toThrow("It broke nicely");
  });

  it("throws result.error → result.user_message → generic on a failed user_request completion", async () => {
    mockRun([
      {
        event: "completion",
        data: {
          operation: "user_request",
          status: "failed",
          result: { user_message: "Model rejected the request" },
        },
      },
    ]);
    await expect(
      runAgentViaMatrxClient(baseArgs)(dispatch, getState, undefined),
    ).rejects.toThrow("Model rejected the request");

    mockRun([
      {
        event: "completion",
        data: { operation: "user_request", status: "cancelled", result: {} },
      },
    ]);
    await expect(
      runAgentViaMatrxClient(baseArgs)(dispatch, getState, undefined),
    ).rejects.toThrow("The agent run cancelled");
  });

  it("falls back to the completion's result.output when no text streamed", async () => {
    mockRun([
      {
        event: "completion",
        data: {
          operation: "user_request",
          status: "success",
          result: { output: "final output" },
        },
      },
    ]);

    const text = await runAgentViaMatrxClient(baseArgs)(
      dispatch,
      getState,
      undefined,
    );
    expect(text).toBe("final output");
  });
});
