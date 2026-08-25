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

test("the public projector and Matrix agree on the settled portable core", async () => {
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
    answer: false,
    reasoning: true,
    reasoningActive: true,
    phase: true,
    phaseHistory: true,
    operations: true,
    tools: true,
    explicitRenderBlocks: true,
    completion: true,
    error: true,
    lastTransportSeq: false,
  });

  // Exact intentional divergence: Matrix's canonical answer includes both
  // client-derived text blocks and explicit server blocks. The package's
  // summary currently concatenates only raw chunk events.
  expect(projectMatrixRequestForPortableParity(matrixRequest).answer).toBe(
    "Portable answer.\nconst proven = true;",
  );
  expect(portable.answer).toBe("Portable answer.");
  expect(report.matrixOnlyRenderBlockIds).not.toHaveLength(0);
});

test("the stream reader's lost stream_seq is an explicit replay blocker", async () => {
  const matrixRequest = await runMatrix(PORTABLE_PARITY_REPLAY_EVENTS);
  const portable = runPortable(PORTABLE_PARITY_REPLAY_EVENTS);

  // The direct projector does the right thing. The public NDJSON reader used
  // by Matrix currently strips stream_seq while normalizing the envelope, so
  // Matrix cannot see the cursor and replays the duplicated chunk.
  // Matrix batches adjacent chunks into one reducer write, so chunkCount is
  // not the replay signal; the doubled answer is.
  expect(matrixRequest.chunkCount).toBe(1);
  expect(portable.answer).toBe("Portable answer.");
  expect(projectMatrixRequestForPortableParity(matrixRequest).answer).toContain(
    "Portable answer.Portable answer.",
  );
  expect(matrixRequest.lastTransportSeq).toBe(0);
  expect(portable.lastTransportSeq).toBe(11);
});

test("server tool starts remain a documented status blocker", async () => {
  const matrixRequest = await runMatrix(PORTABLE_PARITY_SERVER_TOOL_EVENTS);
  const portable = runPortable(PORTABLE_PARITY_SERVER_TOOL_EVENTS);
  const report = compareMatrixRequestToPortableProjection(
    matrixRequest,
    portable,
  );

  expect(matrixRequest.status).toBe("complete");
  expect(portable.status).toBe("awaiting-tools");
  expect(report.shared.status).toBe(false);
  expect(report.shared.tools).toBe(true);
});
