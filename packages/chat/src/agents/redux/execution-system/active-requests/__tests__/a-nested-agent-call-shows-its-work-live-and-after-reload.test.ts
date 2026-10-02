/**
 * A nested agent_call SHOWS its sub-agent's work, live and after a reload,
 * with the identical structure (Arman, 2026-10-01: nested work is shown in the
 * parent transcript after a reload, the same as live).
 *
 * Scenario (PB-01 S14): Compass Dispatch Assistant asks the Lane Planner
 * (agent_call #1) for a hub and weather code. The Lane Planner thinks, then
 * calls the Weather Desk (its own agent_call #2). The Weather Desk thinks and
 * answers "Fog". Live, all of it streams on the parent's wire; after a reload
 * it comes from the child conversations, which the server now links
 * (`parent_call_id` on every child tool row, `child_conversation_id` on every
 * agent_call answer — aidream 764aafbf9d).
 *
 * Under card #1, both sources must give: [thinking, tool:agent_call]. Under
 * card #2 (rendered by recursion inside the first list): [thinking]. Live comes
 * from the REAL reducers + `selectAgentCallTrace`; reload from the REAL
 * `hydrateMessages`/`hydrateObservability` + the ONE persisted walker
 * (`selectMessagesInterleavedRuns`).
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
import { selectAgentCallTrace } from "../active-requests.selectors";
import messagesReducer, {
  hydrateMessages,
  type MessageRecord,
} from "../../messages/messages.slice";
import observabilityReducer, {
  hydrateObservability,
} from "../../observability/observability.slice";
import { selectMessagesInterleavedRuns } from "../../messages/messages.selectors";
import { toolCallRowToRecord, type CxToolCallRow } from "../../thunks/conversation-bundle";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";
import {
  agentCallTraceShape,
  childConversationIdFromResult,
  persistedAgentCallTrace,
} from "../../utils/agent-call-trace";
import type { RootState } from "@host/lib/redux/store";

const REQ = "req_compass_dispatch";
const PARENT_CALL = "toolu_dispatch_to_lane_planner";
const CHILD_CALL = "gemini_lane_planner_to_weather_desk";
const LANE_CONV = "6a1d1e0b-0000-4000-8000-00000000c001";
const WEATHER_CONV = "6a1d1e0b-0000-4000-8000-00000000c002";

function store() {
  return configureStore({
    reducer: {
      activeRequests: activeRequestsReducer,
      messages: messagesReducer,
      observability: observabilityReducer,
    },
    middleware: (gDM) => gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

function live() {
  const s = store();
  const dispatch = (a: unknown) => s.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: "conv_compass" }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));
  let ts = 1;
  const think = (text: string) => {
    dispatch(markReasoningStreamStart({ requestId: REQ, timestamp: ts++ }));
    dispatch(appendReasoningChunk({ requestId: REQ, content: text }));
    dispatch(closeReasoningRun({ requestId: REQ, timestamp: ts++ }));
  };
  const say = (text: string) => {
    dispatch(markTextStreamStart({ requestId: REQ, timestamp: ts++ }));
    dispatch(appendChunk({ requestId: REQ, content: text }));
    acc.ingest(text, dispatch);
    acc.breakTextBlock(dispatch);
  };
  const tool = (callId: string, done?: Record<string, unknown>) => {
    dispatch(
      upsertToolLifecycle({
        requestId: REQ,
        callId,
        toolName: "agent_call",
        status: done ? "completed" : "started",
        ...(done ? { result: done } : { arguments: { user_input: "x" } }),
      }),
    );
    dispatch(
      appendTimeline({
        requestId: REQ,
        entry: {
          kind: "tool_event",
          seq: 0,
          timestamp: ts++,
          data: {
            event: done ? "tool_completed" : "tool_started",
            call_id: callId,
            tool_name: "agent_call",
          },
        },
      }),
    );
  };
  const op = (id: string, conversationId: string) =>
    dispatch(
      trackOperationInit({
        requestId: REQ,
        operationId: id,
        operation: "sub_agent",
        metadata: { label: id, conversation_id: conversationId },
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

  tool(PARENT_CALL);
  op("op_lane", LANE_CONV);
  think("Mexico City routes through the MEX hub; I need the weather code.");
  tool(CHILD_CALL);
  op("op_weather", WEATHER_CONV);
  think("Mexico City -> Haze.");
  say("Haze");
  opDone("op_weather");
  tool(CHILD_CALL, { result: "Haze", child_conversation_id: WEATHER_CONV });
  say("hub: MEX\nweather_code: Haze");
  opDone("op_lane");
  tool(PARENT_CALL, { result: "hub: MEX", child_conversation_id: LANE_CONV });
  say("Mexico City: hub MEX, weather Haze.");

  const state = s.getState() as unknown as RootState;
  return {
    parent: selectAgentCallTrace(REQ, PARENT_CALL)(state),
    child: selectAgentCallTrace(REQ, CHILD_CALL)(state),
  };
}

let position = 0;
function msg(conversationId: string, role: string, content: unknown[]): MessageRecord {
  position += 1;
  return {
    id: `${conversationId.slice(-4)}-m${position}`,
    conversationId,
    role,
    content,
    position,
    status: "complete",
    createdAt: new Date(2026, 9, 1, 9, 0, position).toISOString(),
  } as unknown as MessageRecord;
}

function reloaded() {
  const s = store();
  const lane = [
    msg(LANE_CONV, "user", [{ type: "text", text: "Hub and weather code for Mexico City" }]),
    msg(LANE_CONV, "assistant", [
      { type: "thinking", text: "Mexico City routes through the MEX hub; I need the weather code." },
      { type: "tool_call", call_id: CHILD_CALL, name: "agent_call", arguments: { user_input: "x" } },
    ]),
    msg(LANE_CONV, "tool", [{ type: "tool_result", call_id: CHILD_CALL }]),
    msg(LANE_CONV, "assistant", [{ type: "text", text: "hub: MEX\nweather_code: Haze" }]),
  ];
  const weather = [
    msg(WEATHER_CONV, "user", [{ type: "text", text: "Weather code?" }]),
    msg(WEATHER_CONV, "assistant", [
      { type: "thinking", text: "Mexico City -> Haze." },
      { type: "text", text: "Haze" },
    ]),
  ];
  s.dispatch(hydrateMessages({ conversationId: LANE_CONV, messages: lane }));
  s.dispatch(hydrateMessages({ conversationId: WEATHER_CONV, messages: weather }));
  const row = toolCallRowToRecord({
    id: "row-lane-to-weather",
    conversation_id: LANE_CONV,
    message_id: lane[1].id,
    call_id: CHILD_CALL,
    tool_name: "agent_call",
    status: "completed",
    success: true,
    arguments: { user_input: "x" },
    output: JSON.stringify({ result: "Haze", child_conversation_id: WEATHER_CONV }),
    parent_call_id: "row-dispatch-to-lane",
    started_at: "2026-10-01T09:00:00Z",
    completed_at: "2026-10-01T09:00:03Z",
    metadata: {},
  } as unknown as CxToolCallRow);
  s.dispatch(
    hydrateObservability({ conversationId: LANE_CONV, userRequests: [], requests: [], toolCalls: [row] }),
  );
  const state = s.getState() as unknown as RootState;
  const runs = (conv: string, rows: MessageRecord[]) =>
    selectMessagesInterleavedRuns(
      conv,
      rows.filter((m) => m.role === "assistant").map((m) => m.id),
    )(state);
  const parent = persistedAgentCallTrace(runs(LANE_CONV, lane));
  const child = persistedAgentCallTrace(runs(WEATHER_CONV, weather));
  return { parent, child };
}

describe("a nested agent_call shows its work live and after a reload", () => {
  it("live: the Lane Planner's thinking and its own agent_call sit under card #1", () => {
    const { parent, child } = live();
    expect(agentCallTraceShape(parent?.items ?? [])).toEqual(["thinking", "tool:agent_call"]);
    expect(parent?.childConversationId).toBe(LANE_CONV);
    // The Weather Desk's thinking is ITS card's, one level down — never doubled.
    expect(agentCallTraceShape(child?.items ?? [])).toEqual(["thinking"]);
    expect(child?.childConversationId).toBe(WEATHER_CONV);
  });

  it("reload: the child conversations give the identical structure at every level", () => {
    const l = live();
    const r = reloaded();
    expect(agentCallTraceShape(r.parent)).toEqual(agentCallTraceShape(l.parent?.items ?? []));
    expect(agentCallTraceShape(r.child)).toEqual(agentCallTraceShape(l.child?.items ?? []));
    // The nested card can find ITS child conversation from the stored answer.
    const nested = r.parent.find((i) => i.kind === "tool");
    expect(nested && "segment" in nested ? nested.segment.record?.parentCallId : null).toBe(
      "row-dispatch-to-lane",
    );
    expect(childConversationIdFromResult({ child_conversation_id: WEATHER_CONV })).toBe(WEATHER_CONV);
  });
});
