import {
  consumeChatDraftTransfer,
  stashChatDraftTransfer,
} from "./chat-draft-transfer";

const identity = { userId: "user-a", organizationId: "org-a" };

describe("chat draft transfer", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns an identity-bound prepared text resource once", () => {
    stashChatDraftTransfer({
      targetAgentId: "agent-a",
      text: "",
      resources: [
        {
          type: "text",
          data: { id: "prepared-1", label: "Prepared content", text: "exact bytes\n" },
        },
      ],
      ...identity,
    });

    expect(consumeChatDraftTransfer("agent-a", identity)).toMatchObject({
      text: "",
      resources: [{ type: "text" }],
    });
    expect(consumeChatDraftTransfer("agent-a", identity)).toBeNull();
  });

  it("rejects a transfer after an identity switch", () => {
    stashChatDraftTransfer({
      targetAgentId: "agent-a",
      text: "",
      resources: [
        {
          type: "text",
          data: { id: "prepared-1", label: "Prepared content", text: "exact bytes" },
        },
      ],
      ...identity,
    });

    expect(() =>
      consumeChatDraftTransfer("agent-a", {
        userId: "user-b",
        organizationId: "org-a",
      }),
    ).toThrow(/different account or organization/i);
    expect(consumeChatDraftTransfer("agent-a", identity)).toBeNull();
  });

  it("rejects malformed prepared resources", () => {
    sessionStorage.setItem(
      "matrx:chat-draft-transfer",
      JSON.stringify({
        targetAgentId: "agent-a",
        text: "",
        resources: [{ type: "note", data: { id: "note-a" } }],
        ...identity,
      }),
    );

    expect(() => consumeChatDraftTransfer("agent-a", identity)).toThrow(
      /invalid/i,
    );
  });
});
