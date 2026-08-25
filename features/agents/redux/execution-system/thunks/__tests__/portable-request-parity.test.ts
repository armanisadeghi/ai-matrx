import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import {
  createAgentRequestProjection,
  projectAgentEvents,
  type AgentProjectionEvent,
} from "@ai-matrx/agents/projection/request";
import activeRequestsReducer, {
  createRequest,
} from "../../active-requests/active-requests.slice";
import { processStream } from "../process-stream";
import {
  compareMatrixRequestToPortableProjection,
  projectMatrixRequestForPortableParity,
} from "@/features/agents/runtime/portable-request-parity";
import {
  PORTABLE_PARITY_CONVERSATION_ID,
  PORTABLE_PARITY_REPLAY_EVENTS,
  PORTABLE_PARITY_REQUEST_ID,
  PORTABLE_PARITY_SERVER_TOOL_EVENTS,
  PORTABLE_PARITY_SETTLED_EVENTS,
} from "@/features/agents/runtime/portable-request-parity.fixtures";
import type { RootState } from "@/lib/redux/store";

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (typeof globals.TextEncoder !== "function") {
  globals.TextEncoder = NodeTextEncoder;
}
if (typeof globals.TextDecoder !== "function") {
  globals.TextDecoder = NodeTextDecoder;
}

const encoder = new TextEncoder();

function responseFor(events: readonly AgentProjectionEvent[]): Response {
  const chunks = events.map((event) =>
    encoder.encode(`${JSON.stringify(event)}\n`),
  );
  const reader = {
    read(): Promise<{ value?: Uint8Array; done: boolean }> {
      const value = chunks.shift();
      return Promise.resolve(value ? { value, done: false } : { done: true });
    },
    releaseLock() {},
  };
  return {
    body: { getReader: () => reader },
    headers: new Headers(),
  } as unknown as Response;
}

function matrixHarness() {
  let activeRequests = activeRequestsReducer(
    undefined,
    createRequest({
      requestId: PORTABLE_PARITY_REQUEST_ID,
      conversationId: PORTABLE_PARITY_CONVERSATION_ID,
    }),
  );

  const getState = () =>
    ({
      activeRequests,
      conversations: {
        byConversationId: {
          [PORTABLE_PARITY_CONVERSATION_ID]: {
            status: "running",
            agentId: null,
          },
        },
      },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
      messages: { byConversationId: {} },
      observability: { toolCalls: {}, userRequests: {}, requests: {} },
      agentDefinition: { agents: {} },
    }) as unknown as RootState;

  const dispatch = (action: unknown) => {
    if (
      typeof action === "object" &&
      action !== null &&
      "type" in action &&
      typeof action.type === "string"
    ) {
      activeRequests = activeRequestsReducer(activeRequests, action as never);
    }
    return action;
  };

  const request = () => {
    const activeRequest =
      activeRequests.byRequestId[PORTABLE_PARITY_REQUEST_ID];
    if (!activeRequest) {
      throw new Error("Parity harness request disappeared from activeRequests");
    }
    return activeRequest;
  };

  return {
    dispatch,
    getState,
    request,
  };
}

async function runMatrix(events: readonly AgentProjectionEvent[]) {
  const harness = matrixHarness();
  await processStream({
    requestId: PORTABLE_PARITY_REQUEST_ID,
    conversationId: PORTABLE_PARITY_CONVERSATION_ID,
    response: responseFor(events),
    submitAt: 0,
    conversationIdAt: null,
    dispatch: harness.dispatch as never,
    getState: harness.getState,
    abortController: new AbortController(),
  });
  return harness.request();
}

function runPortable(events: readonly AgentProjectionEvent[]) {
  return projectAgentEvents(
    createAgentRequestProjection({
      requestId: PORTABLE_PARITY_REQUEST_ID,
      conversationId: PORTABLE_PARITY_CONVERSATION_ID,
    }),
    events,
  );
}

test("the public projector and Matrix agree on the complete portable core", async () => {
  const matrixRequest = await runMatrix(PORTABLE_PARITY_SETTLED_EVENTS);
  const portable = runPortable(PORTABLE_PARITY_SETTLED_EVENTS);
  const report = compareMatrixRequestToPortableProjection(
    matrixRequest,
    portable,
  );

  expect(report.shared).toEqual({
    requestId: true,
    conversationId: true,
    status: true,
    answer: true,
    reasoning: true,
    reasoningActive: true,
    phase: true,
    phaseHistory: true,
    operations: true,
    tools: true,
    explicitRenderBlocks: true,
    completion: true,
    error: true,
    lastTransportSeq: true,
  });

  // The package answer owns raw chunks; explicit server blocks are compared
  // independently so they cannot be lost or double-counted.
  expect(projectMatrixRequestForPortableParity(matrixRequest).answer).toBe(
    "Portable answer.",
  );
  expect(portable.answer).toBe("Portable answer.");
  expect(report.matrixOnlyRenderBlockIds).not.toHaveLength(0);
});

test("stream_seq makes replay idempotent in both consumers", async () => {
  const matrixRequest = await runMatrix(PORTABLE_PARITY_REPLAY_EVENTS);
  const portable = runPortable(PORTABLE_PARITY_REPLAY_EVENTS);

  // The duplicate frame is dropped before either reducer sees it.
  expect(matrixRequest.chunkCount).toBe(1);
  expect(portable.answer).toBe("Portable answer.");
  expect(projectMatrixRequestForPortableParity(matrixRequest).answer).toBe(
    "Portable answer.",
  );
  expect(matrixRequest.lastTransportSeq).toBe(11);
  expect(portable.lastTransportSeq).toBe(11);
});

test("server tool starts do not falsely suspend either consumer", async () => {
  const matrixRequest = await runMatrix(PORTABLE_PARITY_SERVER_TOOL_EVENTS);
  const portable = runPortable(PORTABLE_PARITY_SERVER_TOOL_EVENTS);
  const report = compareMatrixRequestToPortableProjection(
    matrixRequest,
    portable,
  );

  expect(matrixRequest.status).toBe("complete");
  expect(portable.status).toBe("complete");
  expect(report.shared.status).toBe(true);
  expect(report.shared.tools).toBe(true);
});
