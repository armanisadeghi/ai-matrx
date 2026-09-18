import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import activeRequestsReducer, {
  createRequest,
} from "../../active-requests/active-requests.slice";
import {
  selectReasoningRunText,
  selectUnifiedSlotRange,
  type UnifiedSlot,
} from "../../active-requests/active-requests.selectors";
import messagesReducer from "../../messages/messages.slice";
import {
  buildDisplayEntries,
  groupDisplayEntries,
} from "@/features/agents/components/messages-display/display-groups";
import { processStream } from "../process-stream";
import type { RootState } from "@/lib/redux/store";

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;
const encoder = new TextEncoder();
const CONV = "11111111-1111-4111-8111-111111111111";
const REQ = "req_inbox_segment";

function checkpointedResponse(events: unknown[]) {
  let index = 0;
  let release: (() => void) | undefined;
  let notify!: () => void;
  let ready = new Promise<void>((resolve) => {
    notify = resolve;
  });
  return {
    response: {
      body: {
        getReader: () => ({
          read: async () => {
            if (index >= events.length) {
              notify();
              return { done: true };
            }
            const gate = new Promise<void>((resolve) => {
              release = resolve;
            });
            notify();
            await gate;
            return {
              done: false,
              value: encoder.encode(JSON.stringify(events[index++]) + "\n"),
            };
          },
          releaseLock() {},
        }),
      },
      headers: new Headers(),
    } as unknown as Response,
    async advance() {
      await ready;
      const next = release;
      if (!next)
        throw new Error("stream reader did not stop at its checkpoint");
      ready = new Promise<void>((resolve) => {
        notify = resolve;
      });
      release = undefined;
      next();
      await ready;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
  };
}
const assistant = (id: string, position: number) => ({
  event: "record_reserved",
  data: {
    db_project: "main",
    table: "message",
    record_id: id,
    parent_refs: { conversation_id: CONV },
    metadata: { role: "assistant", position },
  },
});
const injection = (id: string, text: string, position: number) => ({
  event: "injection_consumed",
  data: {
    conversation_id: CONV,
    count: 1,
    items: [{ injection_id: id, text, is_visible_to_user: true, position }],
  },
});

function harness(events: unknown[]) {
  let active = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQ, conversationId: CONV }),
  );
  let messages = messagesReducer(undefined, { type: "test/init" });
  const getState = () =>
    ({
      activeRequests: active,
      messages,
      conversations: {
        byConversationId: { [CONV]: { status: "streaming", agentId: null } },
      },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
      observability: { toolCalls: {}, userRequests: {}, requests: {} },
    }) as unknown as RootState;
  const dispatch = (action: unknown) => {
    active = activeRequestsReducer(active, action as never);
    messages = messagesReducer(messages, action as never);
    return action;
  };
  const stream = checkpointedResponse(events);
  return {
    getState,
    stream,
    done: processStream({
      requestId: REQ,
      conversationId: CONV,
      response: stream.response,
      submitAt: 0,
      conversationIdAt: null,
      dispatch,
      getState,
      abortController: new AbortController(),
    }),
  };
}
function slots(state: RootState, start = 0, end?: number) {
  const request = state.activeRequests.byRequestId[REQ];
  return selectUnifiedSlotRange(
    REQ,
    start,
    end,
  )(state).map((slot: UnifiedSlot) => {
    if (slot.kind === "tool") return `tool:${slot.callId}`;
    if (slot.kind === "thinking")
      return `reasoning:${selectReasoningRunText(REQ, slot.chunkStartIndex, slot.chunkEndIndex)(state)}`;
    if (slot.kind === "render_block")
      return `text:${request.renderBlocks[slot.blockId]?.content}`;
    return slot.kind;
  });
}
function groups(state: RootState, active = false) {
  const e = state.messages.byConversationId[CONV];
  return groupDisplayEntries(
    buildDisplayEntries({
      messages: e.orderedIds.map((id) => e.byId[id]),
      isActive: active,
      latestRequestId: REQ,
      isErrorPhase: false,
    }),
  );
}

test("text before an injection is closed before later text with no intermediary event", async () => {
  const h = harness([
    assistant("pre", 5),
    { event: "chunk", data: { text: "before" } },
    injection("i1", "steer", 6),
    { event: "chunk", data: { text: "after" } },
    { event: "end", data: {} },
  ]);
  for (let i = 0; i < 3; i++) await h.stream.advance();
  const boundary =
    h.getState().messages.byConversationId[CONV].byId.pre._streamSlotEnd!;
  expect(h.getState().messages.byConversationId[CONV].orderedIds).toEqual([
    "pre",
    "inbox_i1",
  ]);
  for (let i = 0; i < 2; i++) await h.stream.advance();
  await h.done;
  expect(slots(h.getState(), 0, boundary)).toEqual(["text:before"]);
  expect(slots(h.getState(), boundary)).toEqual(["text:after"]);
});
test("reasoning before an injection is closed before later reasoning", async () => {
  const h = harness([
    assistant("pre", 5),
    { event: "reasoning_chunk", data: { text: "before reason" } },
    injection("i1", "steer", 6),
    { event: "reasoning_chunk", data: { text: "after reason" } },
    { event: "end", data: {} },
  ]);
  for (let i = 0; i < 3; i++) await h.stream.advance();
  const boundary =
    h.getState().messages.byConversationId[CONV].byId.pre._streamSlotEnd!;
  for (let i = 0; i < 2; i++) await h.stream.advance();
  await h.done;
  expect(slots(h.getState(), 0, boundary)).toEqual(["reasoning:before reason"]);
  expect(slots(h.getState(), boundary)).toEqual(["reasoning:after reason"]);
});
test("pre text and tool remain before the user bubble when reservation is delayed", async () => {
  const h = harness([
    assistant("pre", 5),
    { event: "chunk", data: { text: "before tool" } },
    {
      event: "tool_event",
      data: {
        event: "tool_started",
        call_id: "before_tool",
        tool_name: "search",
      },
    },
    injection("i1", "steer", 6),
    { event: "chunk", data: { text: "after tool" } },
    assistant("post", 7),
    { event: "end", data: {} },
  ]);
  for (let i = 0; i < 5; i++) await h.stream.advance();
  expect(groups(h.getState(), true).map((g) => g.kind)).toEqual([
    "assistant",
    "user",
    "assistant",
  ]);
  for (let i = 0; i < 2; i++) await h.stream.advance();
  await h.done;
  const state = h.getState(),
    records = state.messages.byConversationId[CONV].byId;
  expect(slots(state, 0, records.pre._streamSlotEnd)).toEqual([
    "text:before tool",
    "tool:before_tool",
  ]);
  expect(slots(state, records.post._streamSlotStart)).toEqual([
    "text:after tool",
  ]);
  expect(groups(state)).toMatchObject([
    { kind: "assistant", members: [{ messageId: "pre" }] },
    { kind: "user", messageId: "inbox_i1" },
    { kind: "assistant", members: [{ messageId: "post" }] },
  ]);
});
test("two injections retain three assistant ranges and both visible user identities", async () => {
  const h = harness([
    assistant("first", 5),
    { event: "chunk", data: { text: "first" } },
    injection("i1", "first steer", 6),
    { event: "chunk", data: { text: "middle" } },
    assistant("middle", 7),
    injection("i2", "second steer", 8),
    { event: "chunk", data: { text: "last" } },
    assistant("last", 9),
    { event: "end", data: {} },
  ]);
  for (let i = 0; i < 9; i++) await h.stream.advance();
  await h.done;
  const state = h.getState(),
    r = state.messages.byConversationId[CONV].byId;
  expect(state.messages.byConversationId[CONV].orderedIds).toEqual([
    "first",
    "inbox_i1",
    "middle",
    "inbox_i2",
    "last",
  ]);
  expect(slots(state, 0, r.first._streamSlotEnd)).toEqual(["text:first"]);
  expect(
    slots(state, r.middle._streamSlotStart, r.middle._streamSlotEnd),
  ).toEqual(["text:middle"]);
  expect(slots(state, r.last._streamSlotStart)).toEqual(["text:last"]);
});
test("END without a final reservation retains post-injection text in a settled synthetic tail", async () => {
  const h = harness([
    assistant("closed", 5),
    { event: "chunk", data: { text: "closed" } },
    injection("i1", "steer", 6),
    { event: "chunk", data: { text: "tail" } },
    { event: "end", data: {} },
  ]);
  for (let i = 0; i < 5; i++) await h.stream.advance();
  await h.done;
  const tail = groups(h.getState())[2];
  expect(tail).toMatchObject({
    kind: "assistant",
    members: [{ messageId: null, requestId: REQ }],
  });
  if (tail.kind !== "assistant") throw new Error("synthetic tail missing");
  expect(slots(h.getState(), tail.members[0].streamSlotStart)).toEqual([
    "text:tail",
  ]);
});
