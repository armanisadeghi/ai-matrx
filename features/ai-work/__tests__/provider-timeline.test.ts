import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import type { ProviderConversationMessage } from "../lib/providerConversationMessage";
import { buildProviderTimeline } from "../lib/providerTimeline";

function msg(
  id: string,
  role: string,
  createdAt: string,
): ProviderConversationMessage {
  return {
    id,
    conversation_id: "conv-1",
    role,
    position: Number(id.replace(/\D/g, "")) || 0,
    status: "completed",
    created_at: createdAt,
    display: { text: `text ${id}`, activityCount: 0 },
    contentValid: true,
  };
}

function tool(id: string, startedAt: string): CxToolCallRecord {
  return {
    id,
    conversationId: "conv-1",
    userRequestId: null,
    messageId: null,
    userId: "user-1",
    callId: `call_${id}`,
    toolName: "Bash",
    toolNameAsCalled: null,
    toolType: "mcp",
    iteration: 0,
    status: "completed",
    success: true,
    isError: false,
    errorType: null,
    errorMessage: null,
    arguments: {},
    output: null,
    outputChars: 0,
    outputPreview: null,
    outputType: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    costUsd: null,
    durationMs: 0,
    startedAt,
    completedAt: startedAt,
    parentCallId: null,
    retryCount: null,
    persistKey: null,
    filePath: null,
    executionEvents: null,
    metadata: {},
    createdAt: startedAt,
    deletedAt: null,
  };
}

describe("buildProviderTimeline", () => {
  it("interleaves tool activity between the prompting user turn and the reply", () => {
    const timeline = buildProviderTimeline({
      messages: [
        msg("m1", "user", "2026-08-11T10:00:00Z"),
        msg("m2", "assistant", "2026-08-11T10:05:00Z"),
      ],
      toolCalls: [
        tool("t1", "2026-08-11T10:01:00Z"),
        tool("t2", "2026-08-11T10:02:00Z"),
      ],
      hasEarlierMessages: false,
      toolCallsHaveMore: false,
    });

    expect(timeline.items.map((item) => item.kind)).toEqual([
      "message",
      "activity",
      "message",
    ]);
    const activity = timeline.items[1];
    expect(activity.kind === "activity" && activity.records.length).toBe(2);
    expect(timeline.hiddenMessages).toBe(0);
    expect(timeline.hiddenToolCalls).toBe(0);
  });

  it("withholds tool calls older than the unloaded-message boundary", () => {
    const timeline = buildProviderTimeline({
      messages: [msg("m5", "user", "2026-08-11T12:00:00Z")],
      toolCalls: [
        tool("t1", "2026-08-11T11:00:00Z"),
        tool("t2", "2026-08-11T12:30:00Z"),
      ],
      hasEarlierMessages: true,
      toolCallsHaveMore: false,
    });

    expect(timeline.hiddenToolCalls).toBe(1);
    expect(
      timeline.items.filter((item) => item.kind === "activity"),
    ).toHaveLength(1);
  });

  it("withholds messages older than the unloaded-tool boundary", () => {
    const timeline = buildProviderTimeline({
      messages: [
        msg("m1", "user", "2026-08-11T09:00:00Z"),
        msg("m2", "assistant", "2026-08-11T11:00:00Z"),
      ],
      toolCalls: [tool("t9", "2026-08-11T10:00:00Z")],
      hasEarlierMessages: false,
      toolCallsHaveMore: true,
    });

    expect(timeline.hiddenMessages).toBe(1);
    expect(timeline.items[0]?.kind).toBe("activity");
  });

  it("orders a same-timestamp user message before the activity it triggered", () => {
    const at = "2026-08-11T10:00:00Z";
    const timeline = buildProviderTimeline({
      messages: [
        msg("m1", "user", at),
        msg("m2", "assistant", at),
      ],
      toolCalls: [tool("t1", at)],
      hasEarlierMessages: false,
      toolCallsHaveMore: false,
    });
    expect(
      timeline.items.map((item) =>
        item.kind === "message" ? item.message.role : "activity",
      ),
    ).toEqual(["user", "activity", "assistant"]);
  });
});
