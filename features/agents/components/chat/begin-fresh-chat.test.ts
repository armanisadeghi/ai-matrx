import { parseChatPath } from "./begin-fresh-chat";

describe("parseChatPath", () => {
  it("does not interpret chat utility routes as conversation ids", () => {
    expect(parseChatPath("/chat/message-templates")).toEqual({
      activeConversationId: null,
      activeAgentId: undefined,
    });
    expect(parseChatPath("/chat/voice")).toEqual({
      activeConversationId: null,
      activeAgentId: undefined,
    });
  });

  it("still resolves conversation and direct-agent routes", () => {
    expect(parseChatPath("/chat/conversation-id")).toEqual({
      activeConversationId: "conversation-id",
      activeAgentId: undefined,
    });
    expect(parseChatPath("/chat/a/agent-id")).toEqual({
      activeConversationId: null,
      activeAgentId: "agent-id",
    });
  });
});
