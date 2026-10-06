/**
 * THE HANDLE A LIVE RUN LEARNS FROM ITS RECEIPT (live, 2026-10-03).
 *
 * The person's message in Redux is the optimistic copy: the server mints the
 * remark handles (c1, c2 …) when it stores the row, so during the run the
 * answer's "Reply in thread · c1" line could not resolve and was not clickable
 * until a reload re-read the stored message. The `comment_reply` receipt names
 * the thread it wrote into; `withReceiptHandle` stamps that handle onto the ONE
 * remark it names, and the stream applies it (process-stream), so the line is a
 * door at once.
 *
 * Use case: Harbor Dental's office manager asked "Is 3-4 hours enough notice?"
 * on the morning-of reminder; the agent answered in that thread.
 */
import {
  readReceiptThread,
  remarkByHandle,
  withReceiptHandle,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remark-handles";

const ANSWER = "896a8a95-6ffa-4ba1-8271-d363773b6449";
const ROOT = "53f1bd6b-549b-4818-a314-6b8993a5f606";

const optimistic = (items: Record<string, unknown>[]) => [
  { id: "a-0", role: "assistant", content: [{ type: "text", text: "Morning of (3–4 hours prior) …" }] },
  {
    id: "u-temp-1",
    role: "user",
    content: [
      { type: "text", text: "Make the 7-day message warmer, it reads a bit stiff." },
      { type: "input_remarks", items },
    ],
  },
];

const comment = {
  kind: "comment",
  id: "res_b4f48879",
  target: { message_id: ANSWER },
  quote: "Morning of (3–4 hours prior)",
  body: "Is 3-4 hours enough notice if someone needs to cancel?",
  comment_id: ROOT,
};

const receiptThread = readReceiptThread({
  entity_type: "message",
  entity_id: ANSWER,
  root_id: ROOT,
  reply_id: "32a81de0-c471-4c83-9990-76bd048d3cc3",
  handle: "c1",
})!;

it("before the receipt the optimistic message cannot resolve c1 (the defect)", () => {
  expect(remarkByHandle(optimistic([comment]), "c1")).toBeNull();
});

it("the receipt stamps c1 onto the remark whose comment is the thread's root", () => {
  const messages = optimistic([comment, { kind: "choice", target: { message_id: ANSWER }, body: "SQLite" }]);
  const stamped = withReceiptHandle(messages, receiptThread)!;
  expect(stamped.messageId).toBe("u-temp-1");
  const after = messages.map((m) => (m.id === stamped.messageId ? { ...m, content: stamped.content } : m));
  const remark = remarkByHandle(after, "c1")!;
  expect(remark.commentId).toBe(ROOT);
  expect(remark.messageId).toBe(ANSWER);
  // the person's own text and the other remark are untouched
  expect(JSON.stringify(after[1].content)).toContain("Make the 7-day message warmer");
  expect(remarkByHandle(after, "c2")).toBeNull();
});

it("a remark with no comment yet (a choice) is found by the answer it was made on", () => {
  const choice = { kind: "choice", target: { message_id: ANSWER }, body: "SQLite" };
  const stamped = withReceiptHandle(optimistic([choice]), { ...receiptThread, root_id: "minted-root" })!;
  expect(stamped).not.toBeNull();
});

it("never guesses: two handle-less remarks on the same answer stamp nothing", () => {
  const a = { kind: "choice", target: { message_id: ANSWER }, body: "SQLite" };
  const b = { kind: "edit", target: { message_id: ANSWER }, body: "warmer" };
  expect(withReceiptHandle(optimistic([a, b]), { ...receiptThread, root_id: "minted-root" })).toBeNull();
});

it("a handle already stored here is left alone", () => {
  expect(withReceiptHandle(optimistic([{ ...comment, handle: "c1" }]), receiptThread)).toBeNull();
});

it("only a server-shaped thread link is read", () => {
  expect(readReceiptThread({ handle: "c0" })).toBeNull();
  expect(readReceiptThread(null)).toBeNull();
});

// ── The seam: the REAL processStream applies the receipt's handle ─────────────
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import activeRequestsReducer, { createRequest } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import messagesReducer, { addOptimisticUserMessage } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";
import observabilityReducer from "@ai-matrx/chat/agents/redux/execution-system/observability/observability.slice";
import { selectConversationMessages } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import { processStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/process-stream";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";

const g = globalThis as { TextEncoder?: typeof NodeTextEncoder; TextDecoder?: typeof NodeTextDecoder };
if (!g.TextEncoder) g.TextEncoder = NodeTextEncoder;
if (!g.TextDecoder) g.TextDecoder = NodeTextDecoder;

it("a live comment_reply receipt makes c1 resolvable on the optimistic message, before any reload", async () => {
  configureServerForTest({});
  const CONV = "a884bdaf-2dfb-41e6-8c2c-37527daf2992";
  const REQ = "req_harbor_reply";
  let active = activeRequestsReducer(undefined, createRequest({ requestId: REQ, conversationId: CONV }));
  let messages = messagesReducer(
    undefined,
    addOptimisticUserMessage({
      conversationId: CONV,
      clientTempId: "u-temp-1",
      position: 2,
      content: optimistic([comment])[1].content as never,
    }),
  );
  let observability = observabilityReducer(undefined, { type: "test/init" });
  const getState = () =>
    ({
      activeRequests: active,
      messages,
      observability,
      conversations: { byConversationId: { [CONV]: { status: "streaming", agentId: null } } },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
    }) as unknown as ChatRootState;
  const dispatch = (action: unknown) => {
    active = activeRequestsReducer(active, action as never);
    messages = messagesReducer(messages, action as never);
    observability = observabilityReducer(observability, action as never);
    return action;
  };
  const events = [
    {
      event: "data",
      data: {
        kind: "directive_apply.item",
        directive: "directive_v1_action_comment_reply",
        index: 0,
        status: "applied",
        resource_kind: "comment",
        resource_ids: ["32a81de0-c471-4c83-9990-76bd048d3cc3"],
        summary: "Replied in the thread on c1.",
        message: "Replied in the thread on c1.",
        before: null,
        thread: {
          entity_type: "message",
          entity_id: ANSWER,
          root_id: ROOT,
          reply_id: "32a81de0-c471-4c83-9990-76bd048d3cc3",
          handle: "c1",
        },
      },
    },
    { event: "end", data: {} },
  ];
  const encoder = new TextEncoder();
  let i = 0;
  const response = {
    body: {
      getReader: () => ({
        read: async () =>
          i >= events.length ? { done: true } : { done: false, value: encoder.encode(JSON.stringify(events[i++]) + "\n") },
        releaseLock() {},
      }),
    },
    headers: new Headers(),
  } as unknown as Response;
  expect(remarkByHandle(selectConversationMessages(CONV)(getState()), "c1")).toBeNull();
  await processStream({
    requestId: REQ,
    conversationId: CONV,
    response,
    submitAt: 0,
    conversationIdAt: null,
    dispatch: dispatch as never,
    getState,
    abortController: new AbortController(),
  });
  const remark = remarkByHandle(selectConversationMessages(CONV)(getState()), "c1");
  expect(remark?.commentId).toBe(ROOT);
});
