/**
 * A request the server ENDED FAILED is a failed turn — even with no `error`
 * event on the stream.
 *
 * 2026-10-06: a Flashcard Generator turn was stopped by the provider's
 * recitation filter. The server saved the partial answer, sent a
 * `user_request` completion with `status: "failed"` plus a `record_update`
 * moving the user_request row to `failed`, then a normal `end` — and no
 * `error` event. `processStream` treated the failure as bookkeeping and the
 * `end` handler marked the request `complete`, so the person saw no error at
 * all. This drives the REAL `processStream` and the REAL active-requests
 * reducer over that exact event sequence and reads the request status the
 * assistant turn renders from (`selectErrorIsFatal` = status === "error").
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
  extractRecordError,
  isFailedRecord,
} from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import type { MessageRecord } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";

beforeAll(() => {
  configureServerForTest({});
});

jest.useFakeTimers();

const CONVERSATION_ID = "e9f550d7-8aeb-478e-996d-c9a98521049d";
const REQUEST_ID = "req_recitation_stop";
const SAFETY_SENTENCE =
  "The response was stopped by the provider's content-safety filters.";

const encoder = new TextEncoder();
const line = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);

const CARDS_TEXT =
  '<artifact type="flashcards" id="artifact_1" title="Flashcards 1">\n' +
  "Front: Population distribution\nBack: the pattern of human settlement.\n\n---\n\n" +
  "Front: Boserup theory\nBack: more hands to work, not just more mouths.\n\n</artifact>";

const FAILED_COMPLETION = {
  event: "completion",
  data: {
    operation: "user_request",
    operation_id: "op-ur",
    status: "failed",
    result: {
      status: "failed",
      finish_reason: "recitation",
      metadata: {
        error: SAFETY_SENTENCE,
        error_type: "finish_reason_error",
      },
    },
  },
};
const FAILED_ROW = {
  event: "record_update",
  data: {
    db_project: "matrx",
    table: "user_request",
    record_id: "d47c434d-db5a-400d-8a35-642372642798",
    status: "failed",
    metadata: {
      reason: "terminal_status",
      error: JSON.stringify({
        error_type: "finish_reason_error",
        message: SAFETY_SENTENCE,
      }),
    },
  },
};
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

async function run(events: unknown[]) {
  const store = makeStore();
  const textChunk = { event: "chunk", data: { text: CARDS_TEXT } };
  const promise = processStream({
    requestId: REQUEST_ID,
    conversationId: CONVERSATION_ID,
    response: closingResponse([line(textChunk), ...events.map(line)]),
    submitAt: 0,
    conversationIdAt: null,
    dispatch: store.dispatch as never,
    getState: store.getState,
    abortController: new AbortController(),
  });
  await jest.advanceTimersByTimeAsync(1_000);
  await promise.catch(() => undefined);
  return store.getState().activeRequests.byRequestId[REQUEST_ID];
}

test("failed user_request completion + end (no error event) leaves the request in error, with the server's words", async () => {
  const request = await run([FAILED_COMPLETION, END]);
  expect(request?.status).toBe("error");
  expect(request?.error?.error_type).toBe("finish_reason_error");
  expect(request?.error?.user_message).toBe(SAFETY_SENTENCE);
});

test("a failed user_request row update alone also fails the turn", async () => {
  const request = await run([FAILED_ROW, END]);
  expect(request?.status).toBe("error");
  expect(request?.error?.message).toBe(SAFETY_SENTENCE);
});

test("an error event's own payload is never overwritten by the later failed status", async () => {
  const errorEvent = {
    event: "error",
    data: { error_type: "provider_timeout", message: "Provider timed out." },
  };
  const request = await run([errorEvent, FAILED_COMPLETION, FAILED_ROW, END]);
  expect(request?.status).toBe("error");
  expect(request?.error?.error_type).toBe("provider_timeout");
});

test("a successful run still ends complete", async () => {
  const request = await run([OK_COMPLETION, END]);
  expect(request?.status).toBe("complete");
  expect(request?.error ?? null).toBeNull();
});

// ── Reload: the saved row is the only witness ───────────────────────────────
// The recitation-stopped turn was saved `status: "active"`, `error: null`,
// with only `metadata.finish_reason` telling the truth. Reopened, it must
// read as a failed turn whose error is a sentence — never its 25k-char body.

function savedAssistant(metadata: Record<string, unknown>): MessageRecord {
  return {
    id: "efa763e6-7ead-46e1-b9a6-5140b5f2b1be",
    conversationId: CONVERSATION_ID,
    role: "assistant",
    status: "active",
    error: null,
    metadata,
    content: [{ type: "text", text: CARDS_TEXT }],
  } as unknown as MessageRecord;
}

test("a reloaded turn the provider stopped early reads as failed, with a sentence", () => {
  // A safety stop never lets the half-written body stand as the answer. (A
  // recitation or length stop WITH content is an incomplete answer instead —
  // see an-incomplete-answer-reads-the-same-live-and-reloaded.test.ts.)
  const record = savedAssistant({ finish_reason: "safety" });
  expect(isFailedRecord(record)).toBe(true);
  const message = extractRecordError(record) ?? "";
  expect(message).not.toContain("Front:");
  expect(message.length).toBeLessThan(120);
});

test("a reloaded turn that finished normally is not failed", () => {
  expect(isFailedRecord(savedAssistant({ finish_reason: "stop" }))).toBe(false);
  expect(isFailedRecord(savedAssistant({}))).toBe(false);
});
