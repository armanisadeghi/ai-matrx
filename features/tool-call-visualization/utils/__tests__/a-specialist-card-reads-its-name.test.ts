/**
 * A SPECIALIST CARD READS ITS NAME, NEVER "CUSTOM TOOL N" (2026-09-28).
 *
 * The PR Director calls its specialists as projected agent tools named `custom_tool_N` (the model never sees
 * an agent id). Live, the Press Room showed "Custom Tool 5" for the Tough editor. The server now stamps
 * `data.display_name` on `tool_started` ("<role title> · <agent name>"); the streamed entry and the reloaded
 * call both read it.
 */
import { configureStore } from "@reduxjs/toolkit";

import activeRequestsReducer, {
  createRequest,
  upsertToolLifecycle,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";

import { cxToolCallToLifecycleEntry } from "../cxToolCallToLifecycleEntry";

const NAME = "Tough editor · The Tough Editor";

describe("a specialist card reads its name", () => {
  it("while streaming: the tool_started display_name becomes the entry's display name", () => {
    const store = configureStore({
      reducer: { activeRequests: activeRequestsReducer },
      middleware: (gDM) => gDM({ serializableCheck: false, immutableCheck: false }),
    });
    store.dispatch(createRequest({ requestId: "r1", conversationId: "c1" }));
    store.dispatch(
      upsertToolLifecycle({
        requestId: "r1",
        callId: "call-1",
        toolName: "custom_tool_5",
        status: "started",
        data: { arguments: {}, display_name: NAME },
      }),
    );
    store.dispatch(
      upsertToolLifecycle({ requestId: "r1", callId: "call-1", toolName: "custom_tool_5", status: "completed", data: {} }),
    );
    const entry = store.getState().activeRequests.byRequestId["r1"].toolLifecycle["call-1"];
    expect(entry.displayName).toBe(NAME);
  });

  it("after a reload: the persisted tool_started event names the card", () => {
    const record = {
      id: "row-1",
      callId: "call-1",
      toolName: "custom_tool_5",
      toolNameAsCalled: "custom_tool_5",
      status: "completed",
      isError: false,
      arguments: {},
      output: null,
      startedAt: "2026-09-29T00:20:00Z",
      completedAt: "2026-09-29T00:20:30Z",
      errorType: null,
      errorMessage: null,
      metadata: null,
      executionEvents: [
        { event: "tool_started", call_id: "call-1", tool_name: "custom_tool_5", data: { arguments: {}, display_name: NAME } },
      ],
    } as unknown as CxToolCallRecord;
    expect(cxToolCallToLifecycleEntry(record).displayName).toBe(NAME);
  });

  it("a tool with no display name keeps its own name", () => {
    const record = {
      callId: "c", toolName: "web", toolNameAsCalled: null, status: "completed", isError: false, arguments: {},
      output: null, startedAt: null, completedAt: null, errorType: null, errorMessage: null, metadata: null,
      executionEvents: [{ event: "tool_started", data: { arguments: {} } }],
    } as unknown as CxToolCallRecord;
    expect(cxToolCallToLifecycleEntry(record).displayName).toBe("web");
  });
});
