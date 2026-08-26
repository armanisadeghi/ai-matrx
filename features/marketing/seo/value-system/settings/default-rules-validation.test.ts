import { defaultRuleValidationMessage } from "./default-rules-validation";

const completeDraft = {
  label: "Wants it free",
  dimensionSlug: "purchase_intent",
  valueSlug: "free",
  phrases: ["free"],
  effect: "add",
  amount: "-60",
};

describe("defaultRuleValidationMessage", () => {
  it.each([
    [{ label: "" }, "Give the rule a name."],
    [{ phrases: [] }, "Add at least one word or phrase."],
    [{ dimensionSlug: "" }, "Choose what the words mean."],
    [{ valueSlug: "" }, "Choose the answer this rule stamps."],
    [{ amount: "" }, "Give the rule a number, or set it to Never valuable."],
    [{ effect: "scale", amount: "0.01" }, "Use a multiplier between 0.05 and 5."],
  ])("blocks an incomplete draft", (patch, expected) => {
    expect(defaultRuleValidationMessage({ ...completeDraft, ...patch })).toBe(expected);
  });

  it("accepts complete numeric and never-value rules", () => {
    expect(defaultRuleValidationMessage(completeDraft)).toBeNull();
    expect(
      defaultRuleValidationMessage({ ...completeDraft, effect: "never", amount: "" }),
    ).toBeNull();
  });
});
