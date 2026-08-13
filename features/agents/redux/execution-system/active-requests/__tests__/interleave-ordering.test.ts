/**
 * REGRESSION GUARD: tool calls keep their EXACT chronological position.
 *
 * A `text -> tool -> text -> tool -> text` agentic turn must render in that
 * exact order. This has regressed repeatedly; this test drives the REAL
 * reducer + REAL StreamBlockAccumulator through the exact dispatch sequence
 * process-stream.ts produces, then asserts selectUnifiedSlots order.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendChunk,
  markTextStreamStart,
  closeTextRun,
  upsertRenderBlock,
  appendTimeline,
} from "../active-requests.slice";
import { selectUnifiedSlots } from "../active-requests.selectors";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";
import { assembleMessageParts } from "../../utils/assemble-cx-content-blocks";
import { upsertToolLifecycle } from "../active-requests.slice";
import type { ActiveRequest } from "@/features/agents/types/request.types";

type AnyState = Parameters<ReturnType<typeof selectUnifiedSlots>>[0];

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

const REQ = "req_test_1";
const CONV = "conv_test_1";

/** Replay process-stream's dispatch order for one tool event. */
function toolEvent(
  store: ReturnType<typeof makeStore>,
  acc: StreamBlockAccumulator,
  dispatch: (a: unknown) => unknown,
  callId: string,
  toolName: string,
) {
  // process-stream: dispatchBatch() already flushed text; then breakTextBlock,
  // then appendTimeline(tool_event).
  acc.breakTextBlock(dispatch);
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "tool_event",
        seq: 0,
        timestamp: 1,
        data: { event: "tool_started", call_id: callId, tool_name: toolName },
      },
    }) as unknown as never,
  );
}

/** Replay a text run: markTextStreamStart (on first chunk) then flush/ingest. */
function textRun(
  acc: StreamBlockAccumulator,
  dispatch: (a: unknown) => unknown,
  text: string,
) {
  dispatch(
    markTextStreamStart({ requestId: REQ, timestamp: 1 }) as unknown as never,
  );
  dispatch(appendChunk({ requestId: REQ, content: text }) as unknown as never);
  acc.ingest(text, dispatch);
}

test("text -> tool -> text -> tool -> text keeps strict order", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  const acc = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload),
  );

  textRun(acc, dispatch, "Let me search for that.\n");
  toolEvent(store, acc, dispatch, "call_1", "web_search");
  textRun(acc, dispatch, "Found some results. Now checking details.\n");
  toolEvent(store, acc, dispatch, "call_2", "fetch_page");
  textRun(acc, dispatch, "Here is the final answer.\n");
  dispatch(closeTextRun({ requestId: REQ, timestamp: 1 }) as unknown as never);
  acc.finalize(dispatch);

  const slots = selectUnifiedSlots(REQ)(store.getState() as AnyState);

  const kinds = slots.map((s) =>
    s.kind === "tool" ? `tool:${s.callId}` : s.kind,
  );

  // Expected strict interleave. render_block slots carry the text runs.
  expect(kinds).toEqual([
    "render_block", // "Let me search for that."
    "tool:call_1",
    "render_block", // "Found some results..."
    "tool:call_2",
    "render_block", // "Here is the final answer."
  ]);
});

test("server render_block -> tool -> text keeps the block BEFORE the tool", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  // Server-driven render_block (content-ir Phase 5 / py-block-detector).
  // process-stream dispatches upsertRenderBlock THEN appendTimeline(render_block).
  const block = {
    blockId: "srv_block_0",
    blockIndex: 0,
    type: "text",
    status: "complete" as const,
    content: "A server-produced answer block.",
    data: null,
    metadata: undefined,
  };
  dispatch(upsertRenderBlock({ requestId: REQ, block }) as unknown as never);
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: { kind: "render_block", seq: 0, timestamp: 1, data: block },
    }) as unknown as never,
  );

  // Then a tool, then more server content.
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "tool_event",
        seq: 0,
        timestamp: 2,
        data: { event: "tool_started", call_id: "call_1", tool_name: "search" },
      },
    }) as unknown as never,
  );
  const block2 = {
    ...block,
    blockId: "srv_block_1",
    blockIndex: 1,
    content: "After the tool.",
  };
  dispatch(
    upsertRenderBlock({ requestId: REQ, block: block2 }) as unknown as never,
  );
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: { kind: "render_block", seq: 0, timestamp: 3, data: block2 },
    }) as unknown as never,
  );

  const slots = selectUnifiedSlots(REQ)(store.getState() as AnyState);
  const kinds = slots.map((s) =>
    s.kind === "tool"
      ? `tool:${s.callId}`
      : `${s.kind}:${(s as { blockId?: string }).blockId ?? ""}`,
  );

  expect(kinds).toEqual([
    "render_block:srv_block_0",
    "tool:call_1",
    "render_block:srv_block_1",
  ]);
});

test("typed data.content_ir emits its promoted render block at the event slot", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  const block = {
    blockId: "progress_content_ir_1",
    blockIndex: 0,
    type: "structured_info",
    status: "complete" as const,
    content: '{"__kind":"structured_info","title":"Querying Gemini"}',
    data: { content: "**Querying Gemini**\n\nThe provider call is live." },
    metadata: undefined,
  };
  dispatch(upsertRenderBlock({ requestId: REQ, block }) as unknown as never);
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "data",
        seq: 0,
        timestamp: 1,
        blockId: block.blockId,
        data: {
          type: "unknown",
          kind: "seo.ai_visibility_provider_started",
          content_ir: {
            __kind: "structured_info",
            title: "Querying Gemini",
          },
        },
      },
    }) as unknown as never,
  );

  expect(selectUnifiedSlots(REQ)(store.getState() as AnyState)).toEqual([
    expect.objectContaining({
      kind: "render_block",
      blockId: "progress_content_ir_1",
      blockType: "structured_info",
    }),
  ]);
});

test("PERSIST: server render_block -> tool -> block keeps tool_call in position", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  const block0 = {
    blockId: "srv_block_0",
    blockIndex: 0,
    type: "text",
    status: "complete" as const,
    content: "Answer part one.",
    data: null,
    metadata: undefined,
  };
  dispatch(
    upsertRenderBlock({ requestId: REQ, block: block0 }) as unknown as never,
  );
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: { kind: "render_block", seq: 0, timestamp: 1, data: block0 },
    }) as unknown as never,
  );

  dispatch(
    upsertToolLifecycle({
      requestId: REQ,
      callId: "call_1",
      toolName: "web_search",
      status: "started",
    }) as unknown as never,
  );
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "tool_event",
        seq: 0,
        timestamp: 2,
        data: {
          event: "tool_started",
          call_id: "call_1",
          tool_name: "web_search",
        },
      },
    }) as unknown as never,
  );

  const block1 = {
    ...block0,
    blockId: "srv_block_1",
    blockIndex: 1,
    content: "Answer part two.",
  };
  dispatch(
    upsertRenderBlock({ requestId: REQ, block: block1 }) as unknown as never,
  );
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: { kind: "render_block", seq: 0, timestamp: 3, data: block1 },
    }) as unknown as never,
  );

  const request = (
    store.getState() as {
      activeRequests: { byRequestId: Record<string, ActiveRequest> };
    }
  ).activeRequests.byRequestId[REQ];
  const parts = assembleMessageParts(request);
  const shape = parts.map((p) =>
    p.type === "tool_call" ? "tool_call" : p.type,
  );

  // tool_call MUST sit between the two text parts — not shoved after both.
  expect(shape).toEqual(["text", "tool_call", "text"]);
});

test("text + fenced json -> tool -> text keeps tool AFTER the json block", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));

  textRun(
    acc,
    dispatch,
    'Here is data:\n```json\n{"quiz_title": "x"}\n```\nDone.\n',
  );
  toolEvent(store, acc, dispatch, "call_1", "web_search");
  textRun(acc, dispatch, "After the tool.\n");
  dispatch(closeTextRun({ requestId: REQ, timestamp: 1 }) as unknown as never);
  acc.finalize(dispatch);

  const slots = selectUnifiedSlots(REQ)(store.getState() as AnyState);
  const kinds = slots.map((s) =>
    s.kind === "tool" ? `tool:${s.callId}` : s.kind,
  );

  // The tool MUST come after the pre-tool text/json and before the post-tool text.
  const toolIdx = kinds.indexOf("tool:call_1");
  expect(toolIdx).toBeGreaterThan(-1);
  // Everything before the tool is pre-tool content; the LAST slot is post-tool text.
  expect(kinds[kinds.length - 1]).toBe("render_block");
  expect(toolIdx).toBe(kinds.length - 2);
});

test("minified bare json run -> tool -> text keeps strict order", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));

  // Single-line minified JSON with NO trailing newline (structured-output shape),
  // streamed in fragments — the content-ir "nascent json" path.
  dispatch(
    markTextStreamStart({ requestId: REQ, timestamp: 1 }) as unknown as never,
  );
  for (const frag of ['{"__kind"', ':"quiz",', '"q":[]', "}"]) {
    dispatch(
      appendChunk({ requestId: REQ, content: frag }) as unknown as never,
    );
    acc.ingest(frag, dispatch);
  }
  toolEvent(store, acc, dispatch, "call_1", "web_search");
  textRun(acc, dispatch, "After the tool.\n");
  dispatch(closeTextRun({ requestId: REQ, timestamp: 1 }) as unknown as never);
  acc.finalize(dispatch);

  const slots = selectUnifiedSlots(REQ)(store.getState() as AnyState);
  const kinds = slots.map((s) =>
    s.kind === "tool" ? `tool:${s.callId}` : s.kind,
  );

  const toolIdx = kinds.indexOf("tool:call_1");
  expect(toolIdx).toBeGreaterThan(-1);
  // Post-tool text must be the last slot; tool immediately before it.
  expect(kinds[kinds.length - 1]).toBe("render_block");
  expect(toolIdx).toBe(kinds.length - 2);
});
