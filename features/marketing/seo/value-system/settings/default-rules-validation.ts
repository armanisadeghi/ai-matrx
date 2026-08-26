export interface DefaultRuleDraftForValidation {
  label: string;
  dimensionSlug: string;
  valueSlug: string;
  phrases: string[];
  effect: string;
  amount: string;
}

/** Keep incomplete authoring state in the browser instead of sending it to the RPC. */
export function defaultRuleValidationMessage(
  draft: DefaultRuleDraftForValidation,
): string | null {
  if (!draft.label.trim()) return "Give the rule a name.";
  if (draft.phrases.length === 0) return "Add at least one word or phrase.";
  if (!draft.dimensionSlug) return "Choose what the words mean.";
  if (!draft.valueSlug) return "Choose the answer this rule stamps.";
  if (draft.effect === "never") return null;

  const amount = Number.parseFloat(draft.amount);
  if (Number.isNaN(amount)) return "Give the rule a number, or set it to Never valuable.";
  if (draft.effect === "scale" && (amount < 0.05 || amount > 5)) {
    return "Use a multiplier between 0.05 and 5.";
  }
  return null;
}
