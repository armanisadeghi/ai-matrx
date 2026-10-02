/**
 * A TOOL CALL WAITING ON A PERSON IS NEVER "COMPLETED" (OpenSEO Wave 1, Lane L, 2026-09-28).
 *
 * A paid tool (`seo_keywords.research`) that needs money approved parks its OWN call on an
 * `approve_spend` action request: the `chat.tool_call` row is `status='delegated'` with
 * `metadata.parked_on = {kind: "action_request", action_request_id}` (aidream
 * `action_requests/ledger.py`). The chat drew that call as "Completed. No output was captured
 * for this call." — a card that lies about a call nobody has answered yet.
 *
 * The persisted entry must say what it is: not terminal, and parked on that request.
 * The row shape below is the real one read from production (conversation 19ac9c0c…, 2026-09-28).
 */
import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";

import { persistedToolEntry } from "../cxToolCallToLifecycleEntry";

function row(over: Partial<CxToolCallRecord>): CxToolCallRecord {
  return {
    id: "row-1",
    conversationId: "19ac9c0c-0803-4ab6-9862-8b4f32cc2f8c",
    userRequestId: "5ece0e81-6212-4909-aaec-99da75c72b19",
    messageId: null,
    userId: "",
    callId: "toolu_018c26HaYp5NH7YjxGT3rpvZ",
    toolName: "seo_keywords",
    toolNameAsCalled: null,
    toolType: "local",
    iteration: 2,
    status: "delegated",
    success: false,
    isError: false,
    errorType: null,
    errorMessage: null,
    arguments: {
      action: "research",
      site_id: "2edfba58-525b-4589-b4c0-55c06bd5c5f5",
      seeds: ["data destruction"],
    },
    output: null,
    outputChars: 0,
    outputPreview: null,
    outputType: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    costUsd: null,
    durationMs: 0,
    startedAt: "2026-09-28T23:04:55.992Z",
    completedAt: "",
    parentCallId: null,
    retryCount: null,
    persistKey: null,
    filePath: null,
    executionEvents: null,
    metadata: {
      parked_on: {
        kind: "action_request",
        action_request_id: "09322c83-d5ab-403b-b29e-f38ea6149b4d",
      },
    },
    createdAt: "2026-09-28T23:04:55.992Z",
    deletedAt: null,
    ...over,
  };
}

describe("a persisted call parked on a person", () => {
  it("is not terminal and names the request it is waiting on", () => {
    const entry = persistedToolEntry({ callId: "toolu_018c26HaYp5NH7YjxGT3rpvZ", record: row({}) });
    expect(entry.status).not.toBe("completed");
    expect(entry.status).not.toBe("error");
    expect(entry.parkedOn).toEqual({
      kind: "action_request",
      actionRequestId: "09322c83-d5ab-403b-b29e-f38ea6149b4d",
    });
  });

  it("stops being parked once the call is answered, even though the marker stays on the row", () => {
    const entry = persistedToolEntry({
      callId: "toolu_018c26HaYp5NH7YjxGT3rpvZ",
      record: row({
        status: "completed",
        output: JSON.stringify({ __kind: "action_request.outcome", status: "answered" }),
      }),
    });
    expect(entry.status).toBe("completed");
    expect(entry.parkedOn ?? null).toBeNull();
  });

  it("a delegated call parked on nobody (a browser tool) carries no marker", () => {
    const entry = persistedToolEntry({
      callId: "call-2",
      record: row({ toolName: "apply_surface_write", metadata: {} }),
    });
    expect(entry.parkedOn ?? null).toBeNull();
  });

  it("a malformed marker is not a park", () => {
    const entry = persistedToolEntry({
      callId: "call-3",
      record: row({ metadata: { parked_on: { kind: "action_request" } } }),
    });
    expect(entry.parkedOn ?? null).toBeNull();
  });
});
