/**
 * A DELEGATED CALL THE SERVER ALREADY RESOLVED IS NEVER RUN AGAIN.
 *
 * Clone, conversation beb271db, 2026-10-03: the canvas edit was approved and
 * applied (tool_results 19:45:29 → "resolved"); the run then stalled behind a
 * draining server for six minutes. At 19:51:58 the page posted a result for the
 * SAME call again (server log: "already_resolved") — the delegated call had been
 * routed a second time on a fresh page (the routed-call memory is per page), so
 * the write ran again against the already-changed page and its result was a
 * failure: the turn showed "failed" for a call that had succeeded.
 *
 * The door (`surfaceDelegatedToolCall`) now reads the conversation's own record
 * of the call: one already completed or failed is never routed again.
 */

const mockRouted: string[] = [];
jest.mock("../dispatch-surface-write.thunk", () => ({
  dispatchSurfaceWrite: () => {
    mockRouted.push("surfaceWrite");
    return () => undefined;
  },
}));
jest.mock("../../../../api/submit-tool-results", () => ({
  submitToolResult: () => () => undefined,
}));

import { configureStore } from "@reduxjs/toolkit";
import { createChatTestReducer } from "../../../../../testing/chat-test-reducer";
import { createInstance } from "../../conversations/conversations.slice";
import { createRequest } from "../../active-requests/active-requests.slice";
import { upsertToolCall } from "../../observability/observability.slice";
import type { CxToolCallRecord } from "../../observability/observability.slice";
import {
  resetRoutedDelegatedCallsForTests,
  surfaceDelegatedToolCall,
} from "../surface-delegated-tool-call.thunk";

const CONVERSATION_ID = "conv-beb271db";
const CALL_ID = "toolu_01URsRakinpz3yWc5cJ5pCPL";
const REQUEST_ID = "req-after-reload";

function makeStore(recordStatus: string | null) {
  const store = configureStore({
    reducer: createChatTestReducer(),
    middleware: (d) => d({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    createInstance({
      conversationId: CONVERSATION_ID,
      agentId: "agent-1",
      agentType: "user",
      origin: "manual",
      status: "streaming",
    }),
  );
  store.dispatch(createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }));
  if (recordStatus) {
    store.dispatch(
      upsertToolCall({
        id: "row-1",
        conversationId: CONVERSATION_ID,
        callId: CALL_ID,
        toolName: "apply_surface_write",
        status: recordStatus,
        success: recordStatus === "completed",
        isError: recordStatus === "completed" ? false : true,
      } as unknown as CxToolCallRecord),
    );
  }
  return store;
}

function replayDelegation(store: ReturnType<typeof makeStore>) {
  store.dispatch(
    surfaceDelegatedToolCall({
      conversationId: CONVERSATION_ID,
      requestId: REQUEST_ID,
      callId: CALL_ID,
      toolName: "apply_surface_write",
      data: { arguments: { target: "canvas_item_content", value: "x" } },
      source: "live",
    }),
  );
}

describe("a delegated call the server already resolved is never run again", () => {
  beforeEach(() => {
    resetRoutedDelegatedCallsForTests();
    mockRouted.length = 0;
  });

  it.each(["completed", "failed"])("a %s call is not routed, and the run is not paused for it", (status) => {
    const store = makeStore(status);
    replayDelegation(store);
    expect(mockRouted).toEqual([]);
    expect(store.getState().conversations.byConversationId[CONVERSATION_ID]?.status).not.toBe("paused");
    expect(store.getState().activeRequests.byRequestId[REQUEST_ID]?.toolLifecycle[CALL_ID]).toBeUndefined();
  });

  it("a call still waiting (delegated) is routed as before", () => {
    const store = makeStore("delegated");
    replayDelegation(store);
    expect(mockRouted).toEqual(["surfaceWrite"]);
  });

  it("a call the page has no record of is routed as before", () => {
    const store = makeStore(null);
    replayDelegation(store);
    expect(mockRouted).toEqual(["surfaceWrite"]);
  });
});
