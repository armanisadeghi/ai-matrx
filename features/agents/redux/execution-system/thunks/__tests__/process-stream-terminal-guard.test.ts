/**
 * Terminal-settlement guard (D130).
 *
 * processStream's read loop exits only when the transport closes. A server
 * that reaches terminal (completion/end delivered) but holds the response
 * socket open with heartbeats kept every awaiting thunk hanging for the 24h
 * lifetime ceiling — the heartbeat monitor stays happy as long as beats flow.
 * The guard arms a bounded grace window at the first terminal signal and
 * closes the stream locally, so the promise ALWAYS settles on a terminal run.
 *
 * This test simulates exactly that wedge: completion(user_request) + end
 * arrive, then the "socket" stays open emitting heartbeats forever. Without
 * the guard this test times out; with it, processStream resolves shortly
 * after the grace window.
 */

import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";

// jsdom strips TextEncoder/TextDecoder off the test globalThis; both this
// test and the NDJSON stream parser need them.
const g = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (typeof g.TextEncoder !== "function") g.TextEncoder = NodeTextEncoder;
if (typeof g.TextDecoder !== "function") g.TextDecoder = NodeTextDecoder;

import { processStream } from "../process-stream";
import type { RootState } from "@/lib/redux/store";

jest.useFakeTimers();

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "req_terminal_guard_test";

const encoder = new TextEncoder();

function line(obj: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(obj)}\n`);
}

const COMPLETION_EVENT = {
  event: "completion",
  data: {
    operation: "user_request",
    operation_id: "op-1",
    status: "completed",
    result: {},
  },
};
const END_EVENT = { event: "end", data: {} };
const HEARTBEAT_EVENT = { event: "heartbeat", data: { seq: 1 } };

/**
 * A fake streaming Response whose body delivers the scripted lines, then
 * NEVER closes — it keeps resolving reads with heartbeat lines every 5s of
 * fake time (the wedge). A fetch-abort (the guard's local close) rejects the
 * pending read with AbortError, exactly like a real aborted fetch reader.
 */
function wedgedResponse(
  scripted: Uint8Array[],
  abortSignal: AbortSignal,
): Response {
  const queue = [...scripted];
  let pendingReject: ((err: unknown) => void) | null = null;

  abortSignal.addEventListener("abort", () => {
    if (pendingReject) {
      const reject = pendingReject;
      pendingReject = null;
      reject(new DOMException("The user aborted a request.", "AbortError"));
    }
  });

  const reader = {
    read(): Promise<{ value?: Uint8Array; done: boolean }> {
      if (abortSignal.aborted) {
        return Promise.reject(
          new DOMException("The user aborted a request.", "AbortError"),
        );
      }
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift(), done: false });
      }
      // Socket held open: a heartbeat every 5s of fake time, forever.
      return new Promise((resolve, reject) => {
        pendingReject = reject;
        setTimeout(() => {
          pendingReject = null;
          resolve({ value: line(HEARTBEAT_EVENT), done: false });
        }, 5_000);
      });
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

/** Minimal state satisfying every slice processStream reads on this path. */
function fakeState(): RootState {
  return {
    activeRequests: { byRequestId: {} },
    conversations: { byConversationId: {} },
    instanceUserInput: { byConversationId: {} },
    instanceUIState: { byConversationId: {} },
    instanceResources: { byConversationId: {} },
    instanceVariableValues: { byConversationId: {} },
    messages: { byConversationId: {} },
    observability: { toolCalls: {}, userRequests: {}, requests: {} },
  } as unknown as RootState;
}

test("a terminal stream whose socket never closes settles within the grace window", async () => {
  const abortController = new AbortController();
  const response = wedgedResponse(
    [line(COMPLETION_EVENT), line(END_EVENT)],
    abortController.signal,
  );

  const dispatched: unknown[] = [];
  let settled = false;
  const promise = processStream({
    requestId: REQUEST_ID,
    conversationId: CONVERSATION_ID,
    response,
    submitAt: 0,
    conversationIdAt: null,
    dispatch: (action) => {
      dispatched.push(action);
      return action;
    },
    getState: fakeState,
    abortController,
    heartbeatTimeoutMs: 30_000,
    maxLifetimeMs: 24 * 60 * 60 * 1000,
  }).then((result) => {
    settled = true;
    return result;
  });
  // Swallow nothing: a rejection must fail the test loudly.
  promise.catch(() => {
    settled = true;
  });

  // Let the scripted terminal events drain (microtasks + the 30ms batch timer).
  await jest.advanceTimersByTimeAsync(1_000);
  expect(settled).toBe(false); // still "streaming" — socket open, grace armed

  // Cross the 30s post-terminal grace window (heartbeats keep flowing the
  // whole time, so the liveness monitor never fires — only the guard can).
  await jest.advanceTimersByTimeAsync(35_000);

  expect(settled).toBe(true);
  const result = await promise;
  expect(result.conversationId).toBe(CONVERSATION_ID);
  // The guard's local close is a NORMAL end — the request must be complete.
  expect(
    dispatched.some(
      (a) =>
        (a as { type?: string; payload?: { status?: string } }).type?.includes(
          "setRequestStatus",
        ) &&
        (a as { payload?: { status?: string } }).payload?.status === "complete",
    ),
  ).toBe(true);
}, 15_000);

test("a stream that closes normally right after end is untouched by the guard", async () => {
  const abortController = new AbortController();
  // Normal server: scripted lines then done.
  const queue = [line(COMPLETION_EVENT), line(END_EVENT)];
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
  const response = {
    body: { getReader: () => reader },
    headers: new Headers(),
  } as unknown as Response;

  const promise = processStream({
    requestId: REQUEST_ID,
    conversationId: CONVERSATION_ID,
    response,
    submitAt: 0,
    conversationIdAt: null,
    dispatch: (action) => action,
    getState: fakeState,
    abortController,
  });

  await jest.advanceTimersByTimeAsync(1_000);
  const result = await promise;
  expect(result.conversationId).toBe(CONVERSATION_ID);
  expect(abortController.signal.aborted).toBe(false); // guard never fired
});
