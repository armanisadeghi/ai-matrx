/**
 * REGRESSION GUARD: reasoning (thinking) keeps its exact chronological
 * position, passive events never shred runs, and the live slot walk agrees
 * with the persisted part order.
 *
 * Companion to interleave-ordering.test.ts (which covers text/tool
 * interleave but had ZERO reasoning coverage — which is exactly where the
 * 2026-07 ordering regressions escaped through). Drives the REAL reducers +
 * REAL StreamBlockAccumulator through the dispatch sequences
 * process-stream.ts produces.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendChunk,
  appendReasoningChunk,
  markTextStreamStart,
  markReasoningStreamStart,
  closeTextRun,
  closeReasoningRun,
  upsertRenderBlock,
  appendTimeline,
  upsertToolLifecycle,
} from "../active-requests.slice";
import { selectUnifiedSlots } from "../active-requests.selectors";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";
import { assembleMessageParts } from "../../utils/assemble-cx-content-blocks";
import type { ActiveRequest } from "@/features/agents/types/request.types";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

type AnyState = Parameters<ReturnType<typeof selectUnifiedSlots>>[0];

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

const REQ = "req_reasoning_1";
const CONV = "conv_reasoning_1";

function getRequest(store: ReturnType<typeof makeStore>): ActiveRequest {
  return (
    store.getState() as {
      activeRequests: { byRequestId: Record<string, ActiveRequest> };
    }
  ).activeRequests.byRequestId[REQ];
}

/** Replay process-stream's dispatch order for one reasoning run. */
function reasoningRun(
  acc: StreamBlockAccumulator,
  dispatch: (a: unknown) => unknown,
  text: string,
) {
  // process-stream (reasoning_chunk branch): on run ENTRY it always flushes
  // and breaks the accumulator's open block (no-ops when nothing is open),
  // then marks the run. Keyed on entry — NOT on the local text flag, which
  // passive events reset while the accumulator still holds the open block.
  acc.breakTextBlock(dispatch);
  dispatch(
    markReasoningStreamStart({ requestId: REQ, timestamp: 1 }) as never,
  );
  dispatch(appendReasoningChunk({ requestId: REQ, content: text }) as never);
}

function textRun(
  acc: StreamBlockAccumulator,
  dispatch: (a: unknown) => unknown,
  text: string,
) {
  dispatch(closeReasoningRun({ requestId: REQ, timestamp: 1 }) as never);
  dispatch(markTextStreamStart({ requestId: REQ, timestamp: 1 }) as never);
  dispatch(appendChunk({ requestId: REQ, content: text }) as never);
  acc.ingest(text, dispatch);
}

function toolEvent(
  acc: StreamBlockAccumulator,
  dispatch: (a: unknown) => unknown,
  callId: string,
  toolName: string,
) {
  acc.breakTextBlock(dispatch);
  dispatch(
    upsertToolLifecycle({
      requestId: REQ,
      callId,
      toolName,
      status: "started",
    }) as never,
  );
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "tool_event",
        seq: 0,
        timestamp: 1,
        data: { event: "tool_started", call_id: callId, tool_name: toolName },
      },
    }) as never,
  );
}

function slotKinds(store: ReturnType<typeof makeStore>): string[] {
  const slots = selectUnifiedSlots(REQ)(store.getState() as AnyState);
  return slots.map((s) => (s.kind === "tool" ? `tool:${s.callId}` : s.kind));
}

function persistShape(store: ReturnType<typeof makeStore>): string[] {
  return assembleMessageParts(getRequest(store)).map((p) => p.type);
}

test("thinking-first turn keeps the tool in position (live + persist)", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));

  reasoningRun(acc, dispatch, "I should search for that.");
  textRun(acc, dispatch, "Let me search.\n");
  toolEvent(acc, dispatch, "call_1", "web_search");
  textRun(acc, dispatch, "Here is the answer.\n");
  dispatch(closeTextRun({ requestId: REQ, timestamp: 1 }) as never);
  acc.finalize(dispatch);

  // LIVE: thinking pinned first, tool BETWEEN the two text blocks — the
  // pre-fix reasoning_end sweep hoisted both text blocks above the tool.
  expect(slotKinds(store)).toEqual([
    "thinking",
    "render_block", // "Let me search."
    "tool:call_1",
    "render_block", // "Here is the answer."
  ]);

  // PERSIST: identical order.
  expect(persistShape(store)).toEqual([
    "thinking",
    "text",
    "tool_call",
    "text",
  ]);
});

test("mid-turn thinking between two text runs keeps order and raw text", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));

  textRun(acc, dispatch, "Before the thought.\n");
  reasoningRun(acc, dispatch, "Reconsidering.");
  textRun(acc, dispatch, "After the thought.\n");
  dispatch(closeTextRun({ requestId: REQ, timestamp: 1 }) as never);
  acc.finalize(dispatch);

  expect(slotKinds(store)).toEqual([
    "render_block",
    "thinking",
    "render_block",
  ]);

  const parts = assembleMessageParts(getRequest(store));
  expect(parts.map((p) => p.type)).toEqual(["text", "thinking", "text"]);
  // The pre-fix flow left run 1 with no text_end: the next
  // markTextStreamStart wiped its rawText and Pass 2 swept its blocks to
  // the END of the message.
  expect((parts[0] as { text: string }).text).toBe("Before the thought.\n");
  expect((parts[1] as { text: string }).text).toBe("Reconsidering.");
  expect((parts[2] as { text: string }).text).toBe("After the thought.\n");
});

test("passive events (heartbeat/reservation) do not shred an open text run", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));

  textRun(acc, dispatch, "One flowing ");
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: { kind: "heartbeat", seq: 0, timestamp: 2, data: {} },
    }) as never,
  );
  // process-stream re-marks the run on the next chunk — idempotent no-op.
  dispatch(markTextStreamStart({ requestId: REQ, timestamp: 3 }) as never);
  dispatch(appendChunk({ requestId: REQ, content: "paragraph.\n" }) as never);
  acc.ingest("paragraph.\n", dispatch);
  dispatch(closeTextRun({ requestId: REQ, timestamp: 4 }) as never);
  acc.finalize(dispatch);

  const request = getRequest(store);
  const textEnds = request.timeline.filter((e) => e.kind === "text_end");
  expect(textEnds).toHaveLength(1);

  const parts = assembleMessageParts(request);
  expect(parts.map((p) => p.type)).toEqual(["text"]);
  expect((parts[0] as { text: string }).text).toBe("One flowing paragraph.\n");
});

test("token-less reasoning survives heartbeat/phase and closes on real content", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  dispatch(markReasoningStreamStart({ requestId: REQ, timestamp: 1 }) as never);

  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: { kind: "heartbeat", seq: 0, timestamp: 2, data: {} },
    }) as never,
  );
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "phase",
        seq: 0,
        timestamp: 3,
        data: { phase: "processing" },
      },
    }) as never,
  );
  // The pre-fix appendTimeline closed the run on the FIRST heartbeat,
  // killing the "Reasoning…" state the started/stopped bracketing provides.
  expect(getRequest(store).isReasoningStreaming).toBe(true);

  // The live walker shows the open thinking slot (the "Reasoning…" line).
  expect(slotKinds(store)).toContain("thinking");

  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "tool_event",
        seq: 0,
        timestamp: 4,
        data: { event: "tool_started", call_id: "c1", tool_name: "t" },
      },
    }) as never,
  );
  expect(getRequest(store).isReasoningStreaming).toBe(false);
});

test("</thinking> never leaks as text across a mid-region tool break (live)", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));

  textRun(acc, dispatch, "<thinking>\nfirst thought\n");
  toolEvent(acc, dispatch, "call_1", "web_search");
  textRun(acc, dispatch, "second thought\n</thinking>\nThe answer.\n");
  dispatch(closeTextRun({ requestId: REQ, timestamp: 1 }) as never);
  acc.finalize(dispatch);

  const request = getRequest(store);
  const blocks = request.renderBlockOrder.map((id) => request.renderBlocks[id]);

  for (const b of blocks) {
    expect(b.content ?? "").not.toContain("</thinking>");
    expect(b.content ?? "").not.toContain("<thinking>");
  }
  // Both halves of the split region are typed thinking blocks.
  const thinkingBlocks = blocks.filter(
    (b) => b.type === "thinking" && b.content?.trim(),
  );
  expect(thinkingBlocks.map((b) => b.content?.trim())).toEqual([
    "first thought",
    "second thought",
  ]);
  const textBlocks = blocks.filter(
    (b) => b.type === "text" && b.content?.trim(),
  );
  expect(textBlocks.map((b) => b.content?.trim())).toEqual(["The answer."]);
});

test("splitter: orphan </thinking> becomes a thinking block, never leaked text (reload)", () => {
  const blocks = splitContentIntoBlocksV2(
    "carried-over thought\n</thinking>\nThe answer.",
  );
  const shapes = blocks.map((b) => ({
    type: b.type,
    content: b.content.trim(),
  }));
  expect(shapes).toEqual([
    { type: "thinking", content: "carried-over thought" },
    { type: "text", content: "The answer." },
  ]);
});

test("heartbeat before a reasoning transition still splits the text (stale-flag guard)", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));

  textRun(acc, dispatch, "Before the thought.\n");
  // Passive event: resets process-stream's LOCAL text flag while the slice
  // (and the accumulator) keep the run open. The old entry gate on that
  // stale flag skipped breakTextBlock here — post-thinking text merged into
  // the pre-thinking block and rendered ABOVE the trace.
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: { kind: "heartbeat", seq: 0, timestamp: 2, data: {} },
    }) as never,
  );
  reasoningRun(acc, dispatch, "Reconsidering.");
  textRun(acc, dispatch, "After the thought.\n");
  dispatch(closeTextRun({ requestId: REQ, timestamp: 3 }) as never);
  acc.finalize(dispatch);

  expect(slotKinds(store)).toEqual([
    "render_block",
    "thinking",
    "render_block",
  ]);
  const request = getRequest(store);
  const contents = selectUnifiedSlots(REQ)(store.getState() as AnyState)
    .filter((s) => s.kind === "render_block")
    .map(
      (s) => request.renderBlocks[(s as { blockId: string }).blockId]?.content,
    );
  expect(contents).toEqual(["Before the thought.", "After the thought."]);
});

test("media mid-text-run + later media stay in position (exact blockId pairing)", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));

  const mediaEvent = (blockId: string) => {
    dispatch(
      upsertRenderBlock({
        requestId: REQ,
        block: {
          blockId,
          blockIndex: 0,
          type: "image_output",
          status: "complete" as const,
          content: null,
          data: { url: `https://x/${blockId}` },
        },
      }) as never,
    );
    dispatch(
      appendTimeline({
        requestId: REQ,
        entry: {
          kind: "data",
          seq: 0,
          timestamp: 1,
          data: { type: "image_output" },
          blockId,
        },
      }) as never,
    );
  };

  // img_1 arrives mid text run → covered by that run's text_end range and
  // emitted inline. Its data entry must then be a NO-OP: the old index scan
  // grabbed the NEXT unemitted media block (img_2) and hoisted it above the
  // tool.
  textRun(acc, dispatch, "Look at this:\n");
  mediaEvent("img_1");
  toolEvent(acc, dispatch, "call_1", "web_search");
  textRun(acc, dispatch, "And this:\n");
  mediaEvent("img_2");
  acc.finalize(dispatch);

  const slots = selectUnifiedSlots(REQ)(store.getState() as AnyState);
  const shape = slots.map((s) =>
    s.kind === "render_block"
      ? `rb:${(s as { blockId: string }).blockId}`
      : s.kind === "tool"
        ? `tool:${s.callId}`
        : s.kind,
  );
  const toolIdx = shape.indexOf("tool:call_1");
  expect(shape.indexOf("rb:img_1")).toBeLessThan(toolIdx);
  expect(shape.indexOf("rb:img_2")).toBeGreaterThan(toolIdx);
});

test("two media data events keep arrival order (forward scan)", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  const media = (blockId: string, type: string) => {
    dispatch(
      upsertRenderBlock({
        requestId: REQ,
        block: {
          blockId,
          blockIndex: 0,
          type,
          status: "complete" as const,
          content: null,
          data: { url: `https://x/${blockId}` },
        },
      }) as never,
    );
    dispatch(
      appendTimeline({
        requestId: REQ,
        entry: { kind: "data", seq: 0, timestamp: 1, data: { type } },
      }) as never,
    );
  };

  media("media_block_audio_current", "audio_output");
  media("media_block_video_current", "video_output");

  const slots = selectUnifiedSlots(REQ)(store.getState() as AnyState);
  const blockIds = slots
    .filter((s) => s.kind === "render_block")
    .map((s) => (s as { blockId: string }).blockId);
  expect(blockIds).toEqual([
    "media_block_audio_current",
    "media_block_video_current",
  ]);
});
