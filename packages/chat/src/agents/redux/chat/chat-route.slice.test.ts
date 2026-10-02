import reducer, {
  acknowledgeDraftHandoff,
  stageDraftHandoff,
} from "./chat-route.slice";

describe("chat route draft handoff", () => {
  it("keeps the original source through a rapid A to B to C switch", () => {
    const stagedForB = reducer(
      undefined,
      stageDraftHandoff({
        sourceConversationId: "conversation-a",
        targetAgentId: "agent-b",
      }),
    );
    const stagedForC = reducer(
      stagedForB,
      stageDraftHandoff({
        sourceConversationId: "conversation-b-not-ready",
        targetAgentId: "agent-c",
      }),
    );

    expect(stagedForC.draftHandoff).toEqual({
      sourceConversationId: "conversation-b-not-ready",
      resourceSourceConversationId: "conversation-a",
      connectorSourceConversationId: "conversation-a",
      pinnedSourceConversationIds: [
        "conversation-a",
        "conversation-b-not-ready",
      ],
      targetAgentId: "agent-c",
    });
    expect(
      reducer(stagedForC, acknowledgeDraftHandoff({ targetAgentId: "agent-b" }))
        .draftHandoff,
    ).toEqual(stagedForC.draftHandoff);
    expect(
      reducer(stagedForC, acknowledgeDraftHandoff({ targetAgentId: "agent-c" }))
        .draftHandoff,
    ).toBeNull();
  });
});
