import { resolveAgentAppMarkdownStreamProps } from "./AgentAppMarkdownStreamBridge";

describe("resolveAgentAppMarkdownStreamProps", () => {
  const runtime = {
    response: "partial response",
    requestId: "request-1",
    conversationId: "conversation-1",
    isStreaming: true,
  };

  it("adds live request context to the current generated response", () => {
    expect(
      resolveAgentAppMarkdownStreamProps(
        { content: "partial response" },
        runtime,
      ),
    ).toEqual({
      content: "partial response",
      requestId: "request-1",
      conversationId: "conversation-1",
      isStreamActive: true,
    });
  });

  it("does not attach the active request to historical content", () => {
    const props = { content: "older message" };
    expect(resolveAgentAppMarkdownStreamProps(props, runtime)).toBe(props);
  });
});
