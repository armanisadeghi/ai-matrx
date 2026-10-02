import {
  claimSubmit,
  isDuplicateSubmittedInput,
  releaseSubmitClaim,
} from "../submit-claims";

describe("submit admission claims", () => {
  it("admits exactly one synchronous submit per conversation", () => {
    const conversationId = "double-submit-conversation";

    expect(claimSubmit(conversationId)).toBe(true);
    expect(claimSubmit(conversationId)).toBe(false);

    releaseSubmitClaim(conversationId);
    expect(claimSubmit(conversationId)).toBe(true);
    releaseSubmitClaim(conversationId);
  });

  it("does not serialize independent conversations", () => {
    expect(claimSubmit("conversation-a")).toBe(true);
    expect(claimSubmit("conversation-b")).toBe(true);
    releaseSubmitClaim("conversation-a");
    releaseSubmitClaim("conversation-b");
  });
});

describe("submitted-input duplicate detection", () => {
  it("drops the exact draft already admitted for the live turn", () => {
    expect(
      isDuplicateSubmittedInput({
        text: "Send this once",
        lastSubmittedText: "Send this once",
        submissionPhase: "pending",
      }),
    ).toBe(true);
  });

  it("allows a genuinely new draft to use the live-run queue", () => {
    expect(
      isDuplicateSubmittedInput({
        text: "This is the next message",
        lastSubmittedText: "Send this once",
        submissionPhase: "idle",
      }),
    ).toBe(false);
  });
});
