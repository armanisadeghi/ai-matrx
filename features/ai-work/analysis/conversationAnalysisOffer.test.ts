import { buildConversationAnalysisOffer } from "./conversationAnalysisOffer";

describe("buildConversationAnalysisOffer", () => {
  it("maps the loaded row with native types and omits absent facts", () => {
    expect(
      buildConversationAnalysisOffer({
        title: "Pricing page rewrite",
        description: null,
        conversation_type: "coding_session",
        source_app: "claude_code",
        message_count: 42,
        created_at: "2026-09-27T10:00:00Z",
        updated_at: "2026-09-28T09:00:00Z",
        initial_agent_id: null,
      }),
    ).toEqual({
      conversation_title: "Pricing page rewrite",
      conversation_type: "coding_session",
      source_app: "claude_code",
      message_count: 42,
      created_at: "2026-09-27T10:00:00Z",
      updated_at: "2026-09-28T09:00:00Z",
    });
    expect(buildConversationAnalysisOffer(undefined)).toEqual({});
  });
});
