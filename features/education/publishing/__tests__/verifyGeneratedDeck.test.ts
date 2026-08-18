import {
  assertGeneratedDeckHasCards,
  currentStoredVerdict,
} from "../verifyGeneratedDeck";

describe("assertGeneratedDeckHasCards", () => {
  it("refuses an interrupted draft shell with no cards", () => {
    expect(() => assertGeneratedDeckHasCards(0)).toThrow(
      "The generated draft contains no cards",
    );
  });

  it("accepts a populated draft", () => {
    expect(() => assertGeneratedDeckHasCards(1)).not.toThrow();
  });
});

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

  it("reruns a non-verified verdict even when its answer is unchanged", () => {
    expect(
      currentStoredVerdict(
        {
          trust_verification: {
            ...metadata.trust_verification,
            status: "drifted",
          },
        },
        "Supported answer",
      ),
    ).toBeNull();
  });
});
