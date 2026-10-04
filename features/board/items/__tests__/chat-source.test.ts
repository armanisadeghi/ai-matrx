// A chat tile must never save the id of a conversation the server does not have yet: after a
// reload the tile reopened it and showed "Couldn't load this conversation" forever. The old
// behaviour (save every new id at once) fails the first two cases.

import { chatSource, chatSourceToSave } from "../work-sources";

const ID = "7b1c4a52-1f0e-4c43-9a61-0d2f9c3e8a10";

describe("chatSourceToSave", () => {
  it("saves nothing for a new chat that was never sent", () => {
    expect(
      chatSourceToSave({ conversationId: ID, serverHasIt: false, savedId: null, agentId: null, chosenAgentId: null }),
    ).toBeNull();
  });

  it("saves only the agent, never the id, when an unsent chat switches agent", () => {
    const next = chatSourceToSave({
      conversationId: ID,
      serverHasIt: false,
      savedId: null,
      agentId: "agent-2",
      chosenAgentId: null,
    });
    expect(next).toEqual(chatSource(null, "agent-2"));
  });

  it("saves the id once the first message made the server own the conversation", () => {
    const next = chatSourceToSave({
      conversationId: ID,
      serverHasIt: true,
      savedId: null,
      agentId: "agent-1",
      chosenAgentId: null,
    });
    expect(next).toEqual(chatSource(ID, "agent-1"));
  });

  it("leaves a reopened conversation alone while it is still coming up", () => {
    expect(
      chatSourceToSave({ conversationId: ID, serverHasIt: false, savedId: ID, agentId: null, chosenAgentId: null }),
    ).toBeNull();
  });

  it("forgets a saved id when the person starts a different, unsent chat", () => {
    const next = chatSourceToSave({
      conversationId: "11111111-1111-4111-8111-111111111111",
      serverHasIt: false,
      savedId: ID,
      agentId: "agent-1",
      chosenAgentId: "agent-1",
    });
    expect(next).toEqual(chatSource(null, "agent-1"));
  });
});
