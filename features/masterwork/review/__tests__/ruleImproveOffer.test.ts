import { ruleImproveOfferVariables } from "../ruleImproveOffer";
import type { Rulebook, RulebookRule } from "../../types";

const RULEBOOK = {
  name: "Pallet grading",
  description: "How we grade pallets",
  sections: { G: { label: "General" }, Q: { label: "Quality" } },
  rules: [
    { id: "r1", name: "Weigh first", statement: "Weigh every pallet.", section: "G", severity: "major" },
    { id: "r2", name: "Old", statement: "Retired.", section: "Q", severity: "minor", retired: true },
  ] as unknown as RulebookRule[],
  source: { title: "The Pallet Book", author: "J. Smith", year: 2019 },
} as unknown as Rulebook;

describe("ruleImproveOfferVariables", () => {
  it("renders the Rulebook facts the caller holds", () => {
    const v = ruleImproveOfferVariables({ rulebook: RULEBOOK });
    expect(v.rulebook_name).toBe("Pallet grading");
    expect(v.rulebook_description).toBe("How we grade pallets");
    expect(v.rulebook_sections).toBe("- G: General\n- Q: Quality");
    expect(v.rulebook_rules).toContain("**Weigh first** [r1] (approved, section G): Weigh every pallet.");
    expect(v.rulebook_rules).toContain("(retired, section Q)");
    expect(v.rulebook_source).toBe("The Pallet Book by J. Smith (2019)");
  });

  it("carries the rule's review state and a checkup suggestion's evidence", () => {
    const v = ruleImproveOfferVariables({
      rule: { feedback: " too strict ", rejected: true, chapter: "Ch. 3" },
      suggestion: { evidence: "I always weigh first", reason: "Said twice" },
    });
    expect(v).toEqual({
      rule_feedback: "too strict",
      rule_was_rejected: true,
      rule_chapter: "Ch. 3",
      source_evidence: "I always weigh first",
      suggestion_reason: "Said twice",
    });
  });

  it("sends nothing it does not hold, and never a by-name key", () => {
    expect(ruleImproveOfferVariables({})).toEqual({});
    const v = ruleImproveOfferVariables({
      rulebook: { ...RULEBOOK, description: "", sections: {}, rules: [], source: {} } as unknown as Rulebook,
      rule: { feedback: "" },
    }) as Record<string, unknown>;
    expect(v).toEqual({ rulebook_name: "Pallet grading" });
    for (const k of ["rule", "expert_input", "rulebook_context"]) expect(k in v).toBe(false);
  });
});
