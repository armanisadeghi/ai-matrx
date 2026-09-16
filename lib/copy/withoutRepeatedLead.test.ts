import { withoutRepeatedLead } from "./withoutRepeatedLead";

/**
 * Forcing function for jobs-bar-2026-09-16, items 5 and 11 — both screens
 * printed their own label and then the model's or the server's repeat of it.
 */
describe("withoutRepeatedLead", () => {
  it("drops the server's repeat of the panel's own headline", () => {
    expect(
      withoutRepeatedLead(
        "No bench proof yet. Proof is a five-arm Bench run with a blind panel.",
        "No bench proof yet",
      ),
    ).toBe("Proof is a five-arm Bench run with a blind panel.");
  });

  it("drops a model's repeat of the field's own label", () => {
    expect(
      withoutRepeatedLead(
        "Still missing the complete list of all intake tags.",
        "Still missing",
      ),
    ).toBe("the complete list of all intake tags.");
  });

  it("ignores the label's own trailing colon", () => {
    expect(withoutRepeatedLead("Still missing the list.", "Still missing:")).toBe(
      "the list.",
    );
  });

  it("leaves a sentence that does not repeat the label untouched", () => {
    const sentence = "Nobody has run that trial for this Masterwork yet.";
    expect(withoutRepeatedLead(sentence, "No bench proof yet")).toBe(sentence);
  });

  it("never returns nothing at all", () => {
    expect(withoutRepeatedLead("Still missing", "Still missing")).toBe(
      "Still missing",
    );
  });
});
