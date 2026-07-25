/**
 * REGRESSION GUARD: failed-handoff rewind + value-store block persistence,
 * driven through the REAL reducers, REAL StreamBlockAccumulator, and BOTH
 * timeline walkers (selectUnifiedSlots + assembleMessageParts) — the exact
 * dispatch sequence process-stream.ts produces.
 *
 * Pins:
 *  - FIX 2/3: rewindContentToBoundary drops everything the specialist
 *    streamed after the handoff tool boundary — from the live slots AND from
 *    the committed parts (a stale text_end.rawText must not resurrect it) —
 *    while the caller's pre-handoff text, the tool card, and the post-failure
 *    retry text all survive.
 *  - FIX 5: value_store_stored / context_groomed blocks (content: null)
 *    render as slots at their chronological spot but NEVER leak into the
 *    committed message parts, including the outside-a-text-run arrival
 *    (right after tool_completed) that assembleMessageParts Pass 2 sweeps.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendChunk,
  markTextStreamStart,
  closeTextRun,
  upsertRenderBlock,
  appendTimeline,
  rewindContentToBoundary,
} from "../active-requests.slice";
import { selectUnifiedSlots } from "../active-requests.selectors";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";
import { assembleMessageParts } from "../../utils/assemble-cx-content-blocks";
import { HandoffRewindTracker } from "../../utils/handoff-stream-state";
import type { ActiveRequest } from "@/features/agents/types/request.types";

type AnyState = Parameters<ReturnType<typeof selectUnifiedSlots>>[0];

const REQ = "req_handoff_1";
const CONV = "conv_handoff_1";

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

function textRun(
  acc: StreamBlockAccumulator,
  dispatch: (a: unknown) => unknown,
  text: string,
) {
  dispatch(markTextStreamStart({ requestId: REQ, timestamp: 1 }) as never);
  dispatch(appendChunk({ requestId: REQ, content: text }) as never);
  acc.ingest(text, dispatch);
}

function toolStarted(
  acc: StreamBlockAccumulator,
  dispatch: (a: unknown) => unknown,
  tracker: HandoffRewindTracker,
  getRequest: () => ActiveRequest,
  callId: string,
  toolName: string,
) {
  // process-stream order: dispatchBatch (implicit here), breakTextBlock,
  // lifecycle dispatches, appendTimeline(tool_event), THEN the snapshot.
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
    }) as never,
  );
  const req = getRequest();
  tracker.onToolStarted(callId, {
    blockCount: req.renderBlockOrder.length,
    reasoningChunkCount: req.reasoningChunks.length,
    timelineLength: req.timeline.length,
  });
}

function committedText(parts: unknown[]): string {
  return parts
    .filter(
      (p): p is { type: "text"; text: string } =>
        typeof p === "object" &&
        p !== null &&
        (p as { type?: unknown }).type === "text",
    )
    .map((p) => p.text)
    .join("\n");
}

test("failed handoff rewinds to the handoff boundary; caller text, tool card, and retry survive", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  const getRequest = () =>
    (store.getState() as AnyState).activeRequests.byRequestId[
      REQ
    ] as ActiveRequest;
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  const acc = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload),
  );
  const tracker = new HandoffRewindTracker();

  // Caller preamble → handoff tool call → specialist partial answer.
  textRun(acc, dispatch, "Let me hand this to the specialist.\n");
  toolStarted(acc, dispatch, tracker, getRequest, "call_handoff", "custom_tool_1");
  textRun(acc, dispatch, "SPECIALIST PARTIAL ANSWER THAT MUST VANISH.\n");

  // The specialist dies: completion {operation:"sub_agent", status:"failed"}
  // with no observed sub_agent INIT (handoffs suppress it).
  const decision = tracker.decideOnSubAgentFailure("op_handoff_child");
  expect(decision.action).toBe("rewind");
  if (decision.action !== "rewind") throw new Error("unreachable");

  // process-stream order at failure: breakTextBlock, then the rewind.
  acc.breakTextBlock(dispatch);
  dispatch(
    rewindContentToBoundary({ requestId: REQ, ...decision.snapshot }) as never,
  );

  // The caller continues with its correction after the failure.
  textRun(acc, dispatch, "The specialist failed; here is my own answer.\n");
  dispatch(closeTextRun({ requestId: REQ, timestamp: 9 }) as never);
  acc.finalize(dispatch);

  // Live walker: pre-handoff text, the tool card, the retry — no specialist text.
  const slots = selectUnifiedSlots(REQ)(store.getState() as AnyState);
  const kinds = slots.map((s) =>
    s.kind === "tool" ? `tool:${s.callId}` : s.kind,
  );
  expect(kinds).toEqual(["render_block", "tool:call_handoff", "render_block"]);

  const req = getRequest();
  const liveText = req.renderBlockOrder
    .map((id) => req.renderBlocks[id]?.content ?? "")
    .join("\n");
  expect(liveText).toContain("Let me hand this to the specialist.");
  expect(liveText).toContain("here is my own answer.");
  expect(liveText).not.toContain("SPECIALIST PARTIAL ANSWER");

  // Persist walker: the committed parts must not resurrect the specialist
  // text via a stale text_end.rawText.
  const parts = assembleMessageParts(req);
  const text = committedText(parts as unknown[]);
  expect(text).toContain("Let me hand this to the specialist.");
  expect(text).toContain("here is my own answer.");
  expect(text).not.toContain("SPECIALIST PARTIAL ANSWER");
});

test("value-store blocks render as slots but never persist into committed parts (FIX 5)", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  const acc = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload),
  );

  // Text run → tool completes → value_store.stored arrives OUTSIDE any open
  // text run (the typical arrival, right after tool_completed) — the exact
  // spot assembleMessageParts Pass 2 used to sweep into committed text.
  textRun(acc, dispatch, "Delegating the research.\n");
  acc.breakTextBlock(dispatch);
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "tool_event",
        seq: 0,
        timestamp: 1,
        data: { event: "tool_started", call_id: "call_ref", tool_name: "agent_call" },
      },
    }) as never,
  );
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "tool_event",
        seq: 0,
        timestamp: 2,
        data: { event: "tool_completed", call_id: "call_ref", tool_name: "agent_call" },
      },
    }) as never,
  );

  // process-stream: upsertRenderBlock(content:null) + timeline data entry
  // stamped with the blockId.
  const storedEvent = {
    kind: "value_store.stored",
    conversation_id: CONV,
    descriptor: {
      key: "research_summary_key",
      description: "Research summary",
      kind: "text",
      chars: 1234,
      truncated: false,
      fence: '```matrx\n{"matrx_version":1,"kind":"reference","type":"conversation_value","items":[{"key":"research_summary_key"}]}\n```',
    },
  };
  dispatch(
    upsertRenderBlock({
      requestId: REQ,
      block: {
        blockId: "value_store_stored_10",
        blockIndex: 1,
        type: "value_store_stored",
        status: "complete",
        content: null,
        data: storedEvent as unknown as Record<string, unknown>,
      },
    }) as never,
  );
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "data",
        seq: 0,
        timestamp: 3,
        data: storedEvent,
        blockId: "value_store_stored_10",
      },
    }) as never,
  );

  // Trailing caller text, then finalize.
  textRun(acc, dispatch, "The result is ready for the writer agent.\n");
  dispatch(closeTextRun({ requestId: REQ, timestamp: 9 }) as never);
  acc.finalize(dispatch);

  // Live walker: the card gets its own slot at the chronological spot.
  const slots = selectUnifiedSlots(REQ)(store.getState() as AnyState);
  const kinds = slots.map((s) =>
    s.kind === "tool"
      ? `tool:${s.callId}`
      : s.kind === "render_block"
        ? `render_block:${(s as { blockId?: string }).blockId ?? ""}`
        : s.kind,
  );
  expect(kinds).toContain("render_block:value_store_stored_10");

  // Persist walker: committed parts carry NO value-store text — not the
  // descriptor key, not the fence, not a "context compacted" line.
  const req = (store.getState() as AnyState).activeRequests.byRequestId[
    REQ
  ] as ActiveRequest;
  const parts = assembleMessageParts(req);
  const text = committedText(parts as unknown[]);
  expect(text).toContain("Delegating the research.");
  expect(text).toContain("The result is ready for the writer agent.");
  expect(text).not.toContain("research_summary_key");
  expect(text).not.toContain("conversation_value");
  // And no non-text part of the value-store types leaked either.
  const leaked = (parts as Array<{ type?: string }>).filter(
    (p) => p.type === "value_store_stored" || p.type === "context_groomed",
  );
  expect(leaked).toHaveLength(0);
});
