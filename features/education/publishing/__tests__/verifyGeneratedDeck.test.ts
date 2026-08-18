import { currentStoredVerdict } from "../verifyGeneratedDeck";

describe("currentStoredVerdict", () => {
  const metadata = {
    trust_verification: {
      status: "verified",
      explanation: "The source supports this answer.",
      suggestedFix: null,
      verifiedBack: "Supported answer",
      verifiedAt: "2026-08-18T12:00:00.000Z",
      appliedAt: null,
    },
  };

  it("reuses a persisted verdict for the exact checked answer", () => {
    expect(currentStoredVerdict(metadata, "Supported answer")).toEqual({
      status: "verified",
      explanation: "The source supports this answer.",
      suggestedFix: null,
    });
  });

  it("refuses a stored verdict after the answer changes", () => {
    expect(currentStoredVerdict(metadata, "Edited answer")).toBeNull();
  });
});
