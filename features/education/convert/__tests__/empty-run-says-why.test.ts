import { emptyRunMessage, isRefusal, pickFailureReason } from "../segmentedGenerate";

describe("a run that made nothing says why", () => {
  it("names a usage limit instead of blaming a timeout", () => {
    const reason = pickFailureReason([
      "No answer within 2 minutes for section 1 of 3",
      "You've reached your AI usage limit.",
    ]);
    expect(reason).toBe("You've reached your AI usage limit.");
    expect(emptyRunMessage({ missed: 3, sections: 3, failureReason: reason }, "cards", "x")).toBe(
      "No cards were made: You've reached your AI usage limit.",
    );
  });

  it("says 'did not answer in time' only when timeouts were the cause", () => {
    const reason = pickFailureReason(["No answer within 2 minutes for section 1 of 1"]);
    expect(reason).toBeNull();
    expect(emptyRunMessage({ missed: 1, sections: 1, failureReason: reason }, "questions", "x")).toMatch(
      /did not answer in time/,
    );
  });

  it("keeps the 'nothing new' line when sections answered", () => {
    expect(emptyRunMessage({ missed: 0, sections: 2, failureReason: null }, "cards", "Nothing new.")).toBe(
      "Nothing new.",
    );
  });

  it("treats a usage refusal as a refusal", () => {
    const e = new Error("You've reached your AI usage limit.");
    expect(isRefusal(e)).toBe(true);
    expect(isRefusal(new Error("socket hang up"))).toBe(false);
  });
});
