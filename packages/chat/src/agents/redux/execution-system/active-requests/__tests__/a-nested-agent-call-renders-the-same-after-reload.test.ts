/**
 * A nested agent_call renders the same live and after a reload.
 *
 * Live incident 2026-10-01 (PB-01 run 2, S14; conversation
 * d5fceb51-9486-485a-bb8a-975ee345ee98): the parent called the Lane Planner
 * (`agent_call`, one call). The Lane Planner itself called the Weather Desk
 * (a second `agent_call`, persisted in the CHILD conversation), and the
 * Weather Desk reasoned before answering "Fog" (persisted in the
 * GRANDCHILD conversation). All of it streams on the parent's wire with no
 * attribution, so the live transcript showed "Agent Call · 2 calls" and a
 * "Thought process" card. The parent's persisted row holds ONE agent_call
 * and no readable reasoning — so on reload the extra card and the thinking
 * vanished.
 *
 * The D209 hide already gives a child's render blocks to the owning
 * agent_call card. These pins extend it to the child's TOOL CALLS and
 * REASONING, in BOTH timeline walkers: the live one (`selectUnifiedSlots`)
 * and the commit one (`assembleMessageParts`, the record shown after the
 * stream ends and before a reload replaces it with the server's row).
 * Parity target = the persisted parent row: one agent_call, the parent's
 * own text, nothing from a descendant.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendChunk,
  appendReasoningChunk,
  markReasoningStreamStart,
  closeReasoningRun,
  markTextStreamStart,
  upsertRenderBlock,
  appendTimeline,
  upsertToolLifecycle,
  trackOperationInit,
  trackOperationCompletion,
} from "../active-requests.slice";
import { selectUnifiedSlots } from "../active-requests.selectors";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";
import { assembleMessageParts } from "../../utils/assemble-cx-content-blocks";
import type { ActiveRequest } from "../../../../types/request.types";

type AnyState = Parameters<ReturnType<typeof selectUnifiedSlots>>[0];

const REQ = "req_nested_1";
const PARENT_CALL = "toolu_01K3GbvCbEXQr7J6ScsuLpVu";
const CHILD_CALL = "gemini_f518fb789c7f4535";

function run(opts: { parallelSibling?: boolean } = {}) {
  const store = configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: "conv_parent" }));
  const acc = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload),
  );
  let ts = 1;
  const textRun = (text: string) => {
    dispatch(markTextStreamStart({ requestId: REQ, timestamp: ts++ }));
    dispatch(appendChunk({ requestId: REQ, content: text }));
    acc.ingest(text, dispatch);
    acc.breakTextBlock(dispatch);
  };
  const toolEvent = (
    callId: string,
    event: "tool_started" | "tool_completed",
    result?: Record<string, unknown>,
    toolName = "agent_call",
  ) => {
    dispatch(
      upsertToolLifecycle({
        requestId: REQ,
        callId,
        toolName,
        status: event === "tool_started" ? "started" : "completed",
        ...(event === "tool_started"
          ? { arguments: { user_input: "x" } }
          : { result }),
      }),
    );
    dispatch(
      appendTimeline({
        requestId: REQ,
        entry: {
          kind: "tool_event",
          seq: 0,
          timestamp: ts++,
          data: { event, call_id: callId, tool_name: toolName },
        },
      }),
    );
  };
  const opInit = (id: string, label: string) =>
    dispatch(
      trackOperationInit({
        requestId: REQ,
        operationId: id,
        operation: "sub_agent",
        metadata: { label },
        timestamp: ts++,
      }),
    );
  const opDone = (id: string) =>
    dispatch(
      trackOperationCompletion({
        requestId: REQ,
        operationId: id,
        operation: "sub_agent",
        status: "success",
        result: {},
        timestamp: ts++,
      }),
    );

  // The parent model's own turn: it calls the Lane Planner.
  toolEvent(PARENT_CALL, "tool_started");
  if (opts.parallelSibling) toolEvent("toolu_sibling_note", "tool_started", undefined, "note");
  opInit("op_lane_planner", "Lane Planner");
  // The Lane Planner (child) calls the Weather Desk.
  toolEvent(CHILD_CALL, "tool_started");
  opInit("op_weather_desk", "Weather Desk");
  // The Weather Desk (grandchild) reasons, then answers.
  dispatch(markReasoningStreamStart({ requestId: REQ, timestamp: ts++ }));
  dispatch(
    appendReasoningChunk({
      requestId: REQ,
      content: "The instructions say: Los Angeles -> Fog.",
    }),
  );
  dispatch(closeReasoningRun({ requestId: REQ, timestamp: ts++ }));
  textRun("Fog");
  opDone("op_weather_desk");
  toolEvent(CHILD_CALL, "tool_completed", { result: "Fog" });
  if (opts.parallelSibling) {
    toolEvent("toolu_sibling_note", "tool_completed", { id: "n1" }, "note");
  }
  textRun("hub: Los Angeles\nweather_code: Fog");
  opDone("op_lane_planner");
  toolEvent(PARENT_CALL, "tool_completed", {
    result: "hub: Los Angeles\nweather_code: Fog",
  });
  // The parent resumes with its own answer.
  textRun("Routing line filled in.");

  const state = store.getState() as AnyState;
  return {
    slots: selectUnifiedSlots(REQ)(state),
    request: state.activeRequests.byRequestId[REQ] as ActiveRequest,
  };
}

describe("a nested agent_call renders the same after reload", () => {
  it("live: one agent_call card, no descendant thinking, no descendant text", () => {
    const { slots, request } = run();
    const tools = slots.flatMap((s) => (s.kind === "tool" ? [s.callId] : []));
    expect(tools).toEqual([PARENT_CALL]);
    expect(slots.some((s) => s.kind === "thinking")).toBe(false);
    const text = slots
      .flatMap((s) =>
        s.kind === "render_block"
          ? [request.renderBlocks[s.blockId]?.content ?? ""]
          : [],
      )
      .join("");
    expect(text).toContain("Routing line filled in.");
    expect(text).not.toContain("Fog");
  });

  it("commit: the record shown before a reload equals the persisted parent row", () => {
    const { request } = run();
    const parts = assembleMessageParts(request);
    const calls = parts.flatMap((p) =>
      p.type === "tool_call" ? [(p as { call_id: string }).call_id] : [],
    );
    expect(calls).toEqual([PARENT_CALL]);
    const results = parts.flatMap((p) =>
      p.type === "tool_result" ? [(p as { call_id: string }).call_id] : [],
    );
    expect(results).toEqual([PARENT_CALL]);
    expect(parts.some((p) => p.type === "thinking")).toBe(false);
    const text = parts
      .flatMap((p) => (p.type === "text" ? [(p as { text: string }).text] : []))
      .join("");
    expect(text).toBe("Routing line filled in.");
  });

  it("a sibling call the PARENT started before the child ran keeps its card", () => {
    const { slots, request } = run({ parallelSibling: true });
    const tools = slots.flatMap((s) => (s.kind === "tool" ? [s.callId] : []));
    expect(tools).toEqual([PARENT_CALL, "toolu_sibling_note"]);
    const results = assembleMessageParts(request).flatMap((p) =>
      p.type === "tool_result" ? [(p as { call_id: string }).call_id] : [],
    );
    expect(results).toEqual(["toolu_sibling_note", PARENT_CALL]);
  });
});
