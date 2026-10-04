/**
 * The owner reads rules in words, never JSON or build codes (settings-translation
 * screen, V1 verifier §1). These pin the phrasing the queue shows.
 */
import { plainRule, plainSetting } from "../model";

describe("plain words for the review queue", () => {
  it("names settings in words", () => {
    expect(plainSetting("reasoning_effort")).toBe("Reasoning effort");
  });

  it("says what off sends without JSON", () => {
    const rule = { off: { send: { type: "disabled" } }, provider_key: "thinking" };
    expect(plainRule(rule, "reasoning_effort")).toBe("Off → sends thinking disabled");
  });

  it("reads a number ladder as ranges", () => {
    const rule = {
      from_number: [
        { lte: 4999, to: "low" },
        { lte: 11000, to: "medium" },
        { lte: null, to: "high" },
      ],
    };
    expect(plainRule(rule, "thinking_budget")).toBe("up to 4,999 → low · 5,000–11,000 → medium · over 11,000 → high");
  });

  it("an empty rule is the engine guessing, never 'Dropped'", () => {
    expect(plainRule({}, "reasoning_effort")).toBe("No rule — the engine guesses");
    expect(plainRule(null, "reasoning_effort")).toBe("No rule — the engine guesses");
    expect(plainRule({ drop: true }, "reasoning_effort")).toBe("Not sent");
  });
});
