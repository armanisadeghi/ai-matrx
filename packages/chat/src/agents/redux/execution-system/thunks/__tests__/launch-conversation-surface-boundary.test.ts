import type { ConversationInvocation } from "@/features/agents/types/conversation-invocation.types";
import { invocationToManagedOptions } from "../launch-conversation.thunk";

function invocation(surfaceName?: string | null): ConversationInvocation {
  return {
    identity: { surfaceKey: "test-surface" },
    engine: { kind: "agent", agentId: "agent-id" },
    routing: { apiEndpointMode: "agent" },
    origin: { origin: "manual", sourceFeature: "agent-runner" },
    ...(surfaceName !== undefined ? { scope: { surfaceName } } : {}),
  };
}

describe("ConversationInvocation surface boundary", () => {
  it("preserves the explicit primary-surface opt-out", () => {
    expect(invocationToManagedOptions(invocation(null)).runtime).toEqual({
      surfaceName: null,
    });
  });

  it("keeps omission distinct so normal launches may adopt a mounted surface", () => {
    expect(invocationToManagedOptions(invocation()).runtime).toEqual({});
  });
});
