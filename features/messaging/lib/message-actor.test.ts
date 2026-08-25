import { messageActorPresentation } from "@/features/messaging/lib/message-actor";

describe("messageActorPresentation", () => {
  it("identifies a Codex reviewer and preserves its task id", () => {
    expect(
      messageActorPresentation(
        {
          actor_kind: "agent",
          actor_label:
            "agent-review-first-pass:01a03a47-9b35-7f42-87c0-f89fe0b022f8",
        },
        "Arman Sadeghi",
      ),
    ).toEqual({
      kind: "agent",
      label: "Codex · 01a03a47-9b35-7f42-87c0-f89fe0b022f8",
      usesSenderProfile: false,
    });
  });

  it("keeps named non-Codex agents distinct from the audit principal", () => {
    expect(
      messageActorPresentation(
        { actor_kind: "agent", actor_label: "matrx-frontend" },
        "Arman Sadeghi",
      ),
    ).toEqual({
      kind: "agent",
      label: "Agent · matrx-frontend",
      usesSenderProfile: false,
    });
  });

  it("uses the human profile only for human-authored messages", () => {
    expect(
      messageActorPresentation(
        { actor_kind: "human", actor_label: "Arman" },
        "Arman Sadeghi",
      ),
    ).toEqual({
      kind: "human",
      label: "Arman",
      usesSenderProfile: true,
    });
  });
});
