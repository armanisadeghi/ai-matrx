/**
 * A Stop tells the server the last frame the page applied (bench run 2,
 * 2026-10-01 23:37Z, agent window, conversation 6ca03037…).
 *
 * The server cut the stopped answer where its reader left (3874 of 3932 wire
 * chars), yet the screen held less: frames already on the socket when the
 * browser aborted never reached the page, so the post-Stop re-read grew the
 * answer 588 → 629 words. Only the page knows its cursor, so:
 *   1. the aborted processor commits everything it applied SYNCHRONOUSLY on
 *      abort (its 30 ms batch would otherwise still hold the last frames);
 *   2. `cancelExecution` aborts first, then sends that cursor as `seen_seq`;
 *   3. `cancelConversationRun` (the conversation door) puts it on the wire.
 * Break this guards: any of the three drops or stales the cursor.
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

const cancelCalls: unknown[][] = [];
jest.mock("@ai-matrx/chat/agents/redux/execution-system/thunks/call-conversation-api", () => {
  const actual = jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/thunks/call-conversation-api");
  return {
    ...actual,
    cancelConversationRun: (...args: unknown[]) => {
      cancelCalls.push(args);
      return () => Promise.resolve({ data: { request_id: args[1] } });
    },
  };
});
jest.mock("@ai-matrx/chat/agents/redux/execution-system/thunks/settle-after-stop.thunk", () => ({
  settleAfterStop: () => () => Promise.resolve("reloaded"),
}));

import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";
import { processStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/process-stream";

// The stream is read by the host's parser behind the server port (P9): this app's own.
beforeAll(() => {
  configureServerForTest({
    parseNdjsonStream: jest.requireActual("@host/lib/api/stream-parser").parseNdjsonStream,
  });
});
import { cancelExecution } from "@ai-matrx/chat/agents/redux/execution-system/thunks/smart-execute.thunk";
import { registerAbortController } from "@ai-matrx/chat/agents/redux/execution-system/thunks/abort-registry";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";

jest.useFakeTimers();

const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "req_stop_cursor_test";
const encoder = new TextEncoder();
const line = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);

function openResponse(scripted: Uint8Array[], signal: AbortSignal): Response {
  const queue = [...scripted];
  let pendingReject: ((err: unknown) => void) | null = null;
  signal.addEventListener("abort", () => {
    pendingReject?.(new DOMException("aborted", "AbortError"));
    pendingReject = null;
  });
  const reader = {
    read(): Promise<{ value?: Uint8Array; done: boolean }> {
      if (signal.aborted) {
        return Promise.reject(new DOMException("aborted", "AbortError"));
      }
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift(), done: false });
      }
      return new Promise((_resolve, reject) => {
        pendingReject = reject;
      });
    },
    releaseLock() {},
  };
  return {
    body: { getReader: () => reader },
    headers: new Headers(),
  } as unknown as Response;
}

function fakeState(): ChatRootState {
  return {
    activeRequests: { byRequestId: {}, byConversationId: {} },
    conversations: { byConversationId: {} },
    instanceUserInput: { byConversationId: {} },
    instanceUIState: { byConversationId: {} },
    instanceResources: { byConversationId: {} },
    instanceVariableValues: { byConversationId: {} },
    messages: { byConversationId: {} },
    observability: { toolCalls: {}, userRequests: {}, requests: {} },
  } as unknown as ChatRootState;
}

test("an aborted stream commits its applied cursor at the instant of Stop", async () => {
  const abortController = new AbortController();
  const response = openResponse(
    [
      line({ e: "c", t: "Greeting: open warmly. ", stream_seq: 1 }),
      line({ e: "c", t: "Reason for visit. ", stream_seq: 2 }),
      line({ e: "c", t: "Insurance: member ID. ", stream_seq: 3 }),
    ],
    abortController.signal,
  );
  const dispatched: Array<{ type?: string; payload?: { streamSeq?: number } }> =
    [];
  const promise = processStream({
    requestId: REQUEST_ID,
    conversationId: CONVERSATION_ID,
    response,
    submitAt: 0,
    conversationIdAt: null,
    dispatch: (action: unknown) => {
      dispatched.push(action as (typeof dispatched)[number]);
      return action;
    },
    getState: fakeState,
    abortController,
    heartbeatTimeoutMs: 30_000,
    maxLifetimeMs: 24 * 60 * 60 * 1000,
  } as Parameters<typeof processStream>[0]);
  promise.catch(() => undefined);

  // All three frames read; the shared 30 ms flush has NOT run yet.
  await jest.advanceTimersByTimeAsync(5);
  dispatched.length = 0;

  abortController.abort(); // Stop — nothing awaited before the cursor is read

  const cursor = dispatched.find((a) => a.type?.includes("recordTransportSeq"));
  expect(cursor?.payload?.streamSeq).toBe(3);
  await jest.advanceTimersByTimeAsync(100);
});

test("Stop aborts first, then sends the page's cursor with the cancel", async () => {
  cancelCalls.length = 0;
  const state = {
    ...fakeState(),
    activeRequests: {
      byConversationId: { [CONVERSATION_ID]: ["req-local"] },
      byRequestId: {
        "req-local": {
          requestId: "req-local",
          conversationId: CONVERSATION_ID,
          serverRequestId: "srv-req-9",
          lastTransportSeq: 40,
          status: "streaming",
        },
      },
    },
  } as unknown as ChatRootState;
  const controller = new AbortController();
  // The aborted processor's synchronous commit lands frame 41 in the store.
  controller.signal.addEventListener("abort", () => {
    (
      state.activeRequests.byRequestId["req-local"] as { lastTransportSeq: number }
    ).lastTransportSeq = 41;
  });
  registerAbortController(CONVERSATION_ID, controller);

  const dispatch: jest.Mock<unknown, [unknown]> = jest.fn(
    (action: unknown): unknown =>
      typeof action === "function"
        ? (action as (d: unknown, s: unknown) => unknown)(dispatch, () => state)
        : action,
  );
  await cancelExecution(CONVERSATION_ID)(
    dispatch as unknown as Parameters<ReturnType<typeof cancelExecution>>[0],
    () => state,
    undefined,
  );

  expect(controller.signal.aborted).toBe(true);
  expect(cancelCalls).toEqual([[CONVERSATION_ID, "srv-req-9", "cancel", 41]]);
});
