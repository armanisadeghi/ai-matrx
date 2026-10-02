import { isImageGenerationAgentCall } from "./agentCallKind";

describe("isImageGenerationAgentCall", () => {
  it("detects image generation from the child agent variable contract", () => {
    expect(
      isImageGenerationAgentCall({
        toolName: "agent_call",
        arguments: {
          agent_id: "replaceable-agent-id",
          variables: { image_description: "A moonlit mountain lake" },
        },
      }),
    ).toBe(true);
  });

  it("does not classify ordinary agent calls from prompt language", () => {
    expect(
      isImageGenerationAgentCall({
        toolName: "agent_call",
        arguments: {
          agent_id: "another-agent-id",
          user_input: "Describe how image generation works",
        },
      }),
    ).toBe(false);
  });

  it("does not classify another tool with a similarly named argument", () => {
    expect(
      isImageGenerationAgentCall({
        toolName: "document",
        arguments: {
          variables: { image_description: "Cover art" },
        },
      }),
    ).toBe(false);
  });
});
