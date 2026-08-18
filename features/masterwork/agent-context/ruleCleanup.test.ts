import type { RulebookDraftSnapshot } from "./rulebookSurfaceScope";
import {
  applyRuleCleanup,
  coerceRuleCleanupResult,
  readRuleEditorDraft,
} from "./ruleCleanup";

const CURRENT: RulebookDraftSnapshot = {
  mode: "edit",
  rule_id: "R1",
  name: "rough name",
  statement: "put benefit first",
  rationale: "reader needs it",
  detection: "feature comes first",
  quote: "Exact source words.",
  severity: "major",
  section: "G",
};

const CLEANED = {
  name: "Lead with the benefit",
  statement: "Lead with the customer benefit before describing features.",
  rationale: "Readers need to understand the value immediately.",
  detection: "The opening describes a feature before stating its benefit.",
  quote: CURRENT.quote,
  severity: CURRENT.severity,
  section: CURRENT.section,
};

describe("rule cleanup contract", () => {
  it("accepts a cleaned rule and applies it without changing identity", () => {
    const result = coerceRuleCleanupResult(CLEANED, CURRENT);
    expect(applyRuleCleanup(CURRENT, result)).toEqual({
      ...CURRENT,
      ...CLEANED,
    });
  });

  it.each([
    ["quote", "Changed source words."],
    ["severity", "critical"],
    ["section", "U"],
  ])("rejects a changed protected %s", (field, changed) => {
    expect(() =>
      coerceRuleCleanupResult({ ...CLEANED, [field]: changed }, CURRENT),
    ).toThrow();
  });

  it("restores only a draft from the same Rulebook version and rule", () => {
    const stored = {
      baseVersion: 8,
      fields: CURRENT,
      beforeCleanup: null,
    };
    expect(
      readRuleEditorDraft(stored, {
        rulebookVersion: 8,
        mode: "edit",
        ruleId: "R1",
      }),
    ).toEqual({ fields: CURRENT, beforeCleanup: null });
    expect(
      readRuleEditorDraft(stored, {
        rulebookVersion: 9,
        mode: "edit",
        ruleId: "R1",
      }),
    ).toBeNull();
  });
});
