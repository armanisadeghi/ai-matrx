import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { resolveAssistantEditTarget } from "../resolveAssistantEditTarget";

function assistantMessage(id: string, text?: string): MessageRecord {
  return {
    id,
    conversationId: "conversation-1",
    agentId: null,
    role: "assistant",
    content: text ? [{ type: "text", text }] : [{ type: "tool_call" }],
    contentHistory: null,
    userContent: null,
    position: 1,
    source: "test",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-08-21T00:00:00.000Z",
    deletedAt: null,
    _clientStatus: "complete",
  };
}

test("edits the last text-bearing row when a turn ends with a tool-only row", () => {
  const records = {
    answer: assistantMessage("answer", "The completed answer"),
    trailingTool: assistantMessage("trailingTool"),
  };

  expect(
    resolveAssistantEditTarget(
      ["answer", "trailingTool"],
      records,
      "trailingTool",
      "",
    ),
  ).toEqual({
    messageId: "answer",
    content: "The completed answer",
  });
});

test("keeps the normal single-message edit target unchanged", () => {
  expect(
    resolveAssistantEditTarget(undefined, undefined, "answer", "One answer"),
  ).toEqual({
    messageId: "answer",
    content: "One answer",
  });
});
