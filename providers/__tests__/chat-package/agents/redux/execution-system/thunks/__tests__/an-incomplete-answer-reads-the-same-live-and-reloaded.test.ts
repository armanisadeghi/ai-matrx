/**
 * An answer the provider cut short reads THE SAME live and after a reload.
 *
 * 2026-10-07: Gemini's RECITATION stop arrived after a full flashcard answer.
 * The server now saves that request completed, keeps the error, and streams
 * `warning` {provider_recitation_stop, metadata.answer_kept} -> completion
 * "success" -> end. Live that was a silent success while the reloaded row
 * (finish_reason "recitation") became a failed turn with Retry. One verdict
 * (turn-outcome.ts) now covers: (a) recitation with the answer kept,
 * (b) recitation with no answer, (c) a safety stop, (d) max_tokens.
 */

import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";

const g = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (typeof g.TextEncoder !== "function") g.TextEncoder = NodeTextEncoder;
if (typeof g.TextDecoder !== "function") g.TextDecoder = NodeTextDecoder;

import type { UnknownAction } from "@reduxjs/toolkit";
import { processStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/process-stream";
import activeRequestsReducer, {
  createRequest,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";
import {
  liveTurnOutcome,
  reloadTurnOutcome,
} from "@ai-matrx/chat/agents/redux/execution-system/messages/turn-outcome";
import { selectVisibleWarnings } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { MessageRecord } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";

beforeAll(() => {
  configureServerForTest({});
});

jest.useFakeTimers();

const CONVERSATION_ID = "e9f550d7-8aeb-478e-996d-c9a98521049d";
const REQUEST_ID = "req_incomplete_answer";
const SAFETY_SENTENCE =
  "The response was stopped by the provider's content-safety filters.";

const encoder = new TextEncoder();
const line = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);

const OK_COMPLETION = {
  event: "completion",
  data: {
    operation: "user_request",
    operation_id: "op-ur",
    status: "success",
    result: { status: "complete", finish_reason: "stop" },
  },
};
const END = { event: "end", data: {} };

function closingResponse(lines: Uint8Array[]): Response {
  const queue = [...lines];
  const reader = {
    read(): Promise<{ value?: Uint8Array; done: boolean }> {
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift(), done: false });
      }
      return Promise.resolve({ done: true });
    },
    releaseLock() {
      /* noop */
    },
  };
  return {
    body: { getReader: () => reader },
    headers: new Headers(),
  } as unknown as Response;
}

/** The real active-requests reducer; every other slice is an empty shell. */
function makeStore() {
  let activeRequests = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
  );
  const getState = () =>
    ({
      activeRequests,
      conversations: { byConversationId: {} },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
      messages: { byConversationId: {} },
      observability: { toolCalls: {}, userRequests: {}, requests: {} },
    }) as unknown as ChatRootState;
  const dispatch = (action: unknown) => {
    if (action && typeof action === "object" && "type" in action) {
      activeRequests = activeRequestsReducer(
        activeRequests,
        action as UnknownAction,
      );
    }
    return action;
  };
  return { getState, dispatch };
}

const ANSWER =
  "Front: Population distribution\nBack: the pattern of human settlement.\n";

const RECITATION_WARNING = {
  event: "warning",
  data: {
    code: "provider_recitation_stop",
    system_message: "recitation",
    user_message:
      "The provider stopped this answer because it was repeating published text word for word.",
    level: "medium",
    recoverable: true,
    metadata: { answer_kept: true },
  },
};
const TRUNCATED_WARNING = {
  event: "warning",
  data: {
    code: "truncated_response",
    system_message: "hit the output token limit",
    user_message: "The response hit its length limit before it finished.",
    level: "medium",
    recoverable: true,
    metadata: { finish_reason: "max_tokens" },
  },
};

async function runStream(events: unknown[], withAnswer: boolean) {
  const store = makeStore();
  const lines = [
    ...(withAnswer ? [line({ event: "chunk", data: { text: ANSWER } })] : []),
    ...events.map(line),
  ];
  const promise = processStream({
    requestId: REQUEST_ID,
    conversationId: CONVERSATION_ID,
    response: closingResponse(lines),
    submitAt: 0,
    conversationIdAt: null,
    dispatch: store.dispatch as never,
    getState: store.getState,
    abortController: new AbortController(),
  });
  await jest.advanceTimersByTimeAsync(1_000);
  await promise.catch(() => undefined);
  return store.getState();
}

function saved(
  metadata: Record<string, unknown>,
  text: string | null,
): MessageRecord {
  return {
    id: "efa763e6-7ead-46e1-b9a6-5140b5f2b1be",
    conversationId: CONVERSATION_ID,
    role: "assistant",
    status: "active",
    error: null,
    metadata,
    content: text ? [{ type: "text", text }] : [],
  } as unknown as MessageRecord;
}

const failedStop = (finishReason: string) => ({
  event: "completion",
  data: {
    operation: "user_request",
    operation_id: "op-ur",
    status: "failed",
    result: {
      status: "failed",
      finish_reason: finishReason,
      metadata: { error: SAFETY_SENTENCE, error_type: "finish_reason_error" },
    },
  },
});

describe("the new server shape: warning answer_kept + completion success + end", () => {
  test("the request completes (never errors), keeps the warning, and the warning is visible", async () => {
    const state = await runStream(
      [RECITATION_WARNING, OK_COMPLETION, END],
      true,
    );
    const request = state.activeRequests.byRequestId[REQUEST_ID];
    expect(request?.status).toBe("complete");
    expect(request?.error ?? null).toBeNull();
    expect(request?.warnings.map((w) => w.code)).toEqual([
      "provider_recitation_stop",
    ]);
    const visible = selectVisibleWarnings(REQUEST_ID)(state);
    expect(visible?.map((w) => w.code)).toEqual(["provider_recitation_stop"]);
  });
});

describe("live outcome equals reload outcome", () => {
  test("(a) recitation with the answer kept: incomplete both ways", async () => {
    const state = await runStream(
      [RECITATION_WARNING, OK_COMPLETION, END],
      true,
    );
    const live = liveTurnOutcome(state.activeRequests.byRequestId[REQUEST_ID]);
    const reload = reloadTurnOutcome(saved({ finish_reason: "recitation" }, ANSWER));
    expect(live).toBe("incomplete");
    expect(reload).toBe(live);
  });

  test("(b) recitation with no answer: failed both ways", async () => {
    const state = await runStream([failedStop("recitation"), END], false);
    const live = liveTurnOutcome(state.activeRequests.byRequestId[REQUEST_ID]);
    const reload = reloadTurnOutcome(saved({ finish_reason: "recitation" }, null));
    expect(live).toBe("failed");
    expect(reload).toBe(live);
  });

  test("(c) a safety stop: failed both ways, even over delivered text", async () => {
    const state = await runStream([failedStop("safety"), END], true);
    const live = liveTurnOutcome(state.activeRequests.byRequestId[REQUEST_ID]);
    const reload = reloadTurnOutcome(saved({ finish_reason: "safety" }, ANSWER));
    expect(live).toBe("failed");
    expect(reload).toBe(live);
  });

  test("(d) max_tokens with content: incomplete both ways", async () => {
    const state = await runStream([TRUNCATED_WARNING, OK_COMPLETION, END], true);
    const live = liveTurnOutcome(state.activeRequests.byRequestId[REQUEST_ID]);
    const reload = reloadTurnOutcome(saved({ finish_reason: "max_tokens" }, ANSWER));
    expect(live).toBe("incomplete");
    expect(reload).toBe(live);
  });

  test("a normal finish is complete both ways", async () => {
    const state = await runStream([OK_COMPLETION, END], true);
    expect(liveTurnOutcome(state.activeRequests.byRequestId[REQUEST_ID])).toBe(
      "complete",
    );
    expect(reloadTurnOutcome(saved({ finish_reason: "stop" }, ANSWER))).toBe(
      "complete",
    );
  });
});
