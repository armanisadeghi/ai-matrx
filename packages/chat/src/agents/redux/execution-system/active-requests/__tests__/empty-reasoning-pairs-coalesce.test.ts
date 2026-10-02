/**
 * REGRESSION GUARD: empty reasoning brackets coalesce into ONE run.
 *
 * 2026-09-26, Model Battle: a Grok decision stream carried 119 token-less
 * `reasoning` started/stopped pairs (aidream bug, fixed in 7192e45a03). Each
 * pair became its own reasoning_start/reasoning_end, i.e. 238 timeline entries
 * and 119 empty `thinking` slots in the column that was reported crashing
 * with "Maximum update depth exceeded". Any provider or future server bug can
 * send that shape, so the reducer turns consecutive empty pairs into one run
 * (only real content between two pairs keeps them apart).
 *
 * Replays the REAL captured pre-fix Grok stream and a synthetic 200-pair
 * stream through the REAL process-stream thunk and reducer, one event per
 * read and in one burst.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import activeRequestsReducer, {
  appendReasoningChunk,
  closeReasoningRun,
  createRequest,
  markReasoningStreamStart,
  appendTimeline,
} from "../active-requests.slice";
import { selectUnifiedSlotRange } from "../active-requests.selectors";
import messagesReducer from "../../messages/messages.slice";
import { processStream } from "../../thunks/process-stream";
import { DECISION_ANSWERS_BLOCK_TYPE } from "@/features/content-ir/kinds/decision-answers";
import type { RootState } from "@/lib/redux/store";

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;

const REQ = "req_empty_reasoning";

function grokLines(): string[] {
  return readFileSync(
    join(
      __dirname,
      "../../thunks/__tests__/fixtures/decision-stream-grok.ndjson",
    ),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

/** The Grok capture with its brackets replaced by `pairs` empty pairs. */
function withEmptyPairs(pairs: number): string[] {
  const lines = grokLines();
  const first = lines.findIndex((l) => l.includes('"event":"reasoning"'));
  const rest = lines.filter((l) => !l.includes('"event":"reasoning"'));
  const bracket: string[] = [];
  for (let i = 0; i < pairs; i++) {
    bracket.push('{"event":"reasoning","data":{"state":"started"}}');
    // A heartbeat inside some pairs, the way a slow provider interleaves them.
    if (i % 17 === 0) bracket.push('{"event":"heartbeat","data":{}}');
    bracket.push('{"event":"reasoning","data":{"state":"stopped"}}');
  }
  return [...rest.slice(0, first), ...bracket, ...rest.slice(first)];
}

function response(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    body: {
      getReader: () => ({
        read: async () =>
          index >= chunks.length
            ? { done: true, value: undefined }
            : { done: false, value: encoder.encode(chunks[index++]) },
        releaseLock() {},
      }),
    },
    headers: new Headers(),
  } as unknown as Response;
}

async function run(lines: string[], burst: boolean) {
  const conversationId = JSON.parse(
    lines.find((l) => l.includes('"conversation_id"'))!,
  ).data.conversation_id as string;
  let active = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQ, conversationId }),
  );
  let messages = messagesReducer(undefined, { type: "test/init" });
  const getState = () =>
    ({
      activeRequests: active,
      messages,
      conversations: {
        byConversationId: {
          [conversationId]: { status: "streaming", agentId: null },
        },
      },
      agentDefinition: { agents: {} },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
      observability: { toolCalls: {}, userRequests: {}, requests: {} },
    }) as unknown as RootState;
  const dispatch = (action: unknown) => {
    if (typeof action === "function") return undefined;
    active = activeRequestsReducer(active, action as never);
    messages = messagesReducer(messages, action as never);
    return action;
  };
  await processStream({
    requestId: REQ,
    conversationId,
    response: response(
      burst ? [lines.join("\n") + "\n"] : lines.map((line) => line + "\n"),
    ),
    submitAt: 0,
    conversationIdAt: null,
    dispatch: dispatch as never,
    getState,
    abortController: new AbortController(),
  });
  return getState();
}

// The capture has one `conversation_labeled` data event between its first
// pair and the rest — a structural boundary, so it stays two runs (not 119).
const STREAMS: Array<[string, () => string[], number]> = [
  ["captured Grok stream (119 empty pairs)", grokLines, 2],
  ["200 empty pairs with heartbeats inside", () => withEmptyPairs(200), 1],
];

describe.each(STREAMS)("%s", (_label, lines, runs) => {
  it.each([
    ["one event per read", false],
    ["one read", true],
  ])("coalesces to its real runs and still ends in the Answers card — %s", async (_l, burst) => {
    const state = await run(lines(), burst as boolean);
    const request = state.activeRequests.byRequestId[REQ];
    const kinds = request.timeline.map((e) => e.kind);
    expect(kinds.filter((k) => k === "reasoning_start")).toHaveLength(runs);
    expect(kinds.filter((k) => k === "reasoning_end")).toHaveLength(runs);
    // seq stays the entry's index after the coalescing splice.
    request.timeline.forEach((entry, i) => expect(entry.seq).toBe(i));

    const slots = selectUnifiedSlotRange(REQ, 0)(state);
    expect(slots.filter((s) => s.kind === "thinking")).toHaveLength(runs);
    const decision = slots.filter(
      (s) =>
        s.kind === "render_block" &&
        request.renderBlocks[s.blockId]?.type === DECISION_ANSWERS_BLOCK_TYPE,
    );
    expect(decision).toHaveLength(1);
  });
});

describe("coalescing never merges runs that carried something", () => {
  const base = () =>
    activeRequestsReducer(
      undefined,
      createRequest({ requestId: REQ, conversationId: "c1" }),
    );
  const start = (t: number) =>
    markReasoningStreamStart({ requestId: REQ, timestamp: t });
  const stop = (t: number) => closeReasoningRun({ requestId: REQ, timestamp: t });

  it("a run with thinking tokens stays its own run", () => {
    let s = base();
    s = activeRequestsReducer(s, start(1));
    s = activeRequestsReducer(
      s,
      appendReasoningChunk({ requestId: REQ, content: "weighing the report" }),
    );
    s = activeRequestsReducer(s, stop(2));
    s = activeRequestsReducer(s, start(3));
    s = activeRequestsReducer(s, stop(4));
    const kinds = s.byRequestId[REQ].timeline.map((e) => e.kind);
    expect(kinds.filter((k) => k === "reasoning_end")).toHaveLength(2);
  });

  it("content between two empty runs keeps them apart", () => {
    let s = base();
    s = activeRequestsReducer(s, start(1));
    s = activeRequestsReducer(s, stop(2));
    s = activeRequestsReducer(
      s,
      appendTimeline({
        requestId: REQ,
        entry: {
          kind: "tool_event",
          seq: 0,
          timestamp: 3,
          data: { event: "tool_started", call_id: "call_1" },
        } as never,
      }),
    );
    s = activeRequestsReducer(s, start(4));
    s = activeRequestsReducer(s, stop(5));
    const kinds = s.byRequestId[REQ].timeline.map((e) => e.kind);
    expect(kinds.filter((k) => k === "reasoning_end")).toHaveLength(2);
  });
});
