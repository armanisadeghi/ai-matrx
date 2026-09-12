import type { RulebookDraftSnapshot } from "./rulebookSurfaceScope";
import type { RulebookRule, RulebookSections } from "../types";
import {
  applyRuleImprove,
  applyRuleTidy,
  coerceRuleImproveResult,
  readRuleEditorDraft,
} from "./ruleImprove";

const SECTIONS: RulebookSections = {
  G: { label: "General" },
  U: { label: "Usage" },
};

const RULE: RulebookRule = {
  id: "R1",
  name: "rough name",
  statement: "put benefit first",
  rationale: "reader needs it",
  detection: "feature comes first",
  quote: "Exact source words.",
  severity: "major",
  section: "G",
  draft: true,
  rejected: true,
  feedback: "say it stronger",
};

const REVISED = {
  name: "Lead with the benefit",
  statement: "Lead with the customer benefit before describing features.",
  rationale: "Readers need to understand the value immediately.",
  detection: "The opening describes a feature before stating its benefit.",
  severity: "critical",
  section: "U",
};

const DRAFT: RulebookDraftSnapshot = {
  mode: "edit",
  rule_id: "R1",
  name: RULE.name,
  statement: RULE.statement,
  rationale: RULE.rationale ?? "",
  detection: RULE.detection ?? "",
  quote: RULE.quote ?? "",
  severity: RULE.severity,
  section: RULE.section,
};

describe("rule improve contract", () => {
  it("applies the rewrite as a draft, consuming review state, keeping id and quote", () => {
    const result = coerceRuleImproveResult(REVISED, {
      sections: SECTIONS,
      fallbackSection: RULE.section,
    });
    const next = applyRuleImprove(RULE, result);
    expect(next.id).toBe("R1");
    expect(next.quote).toBe(RULE.quote);
    expect(next.draft).toBe(true);
    expect(next.rejected).toBeUndefined();
    expect(next.feedback).toBeUndefined();
    expect(next.severity).toBe("critical");
    expect(next.section).toBe("U");
  });

  it("falls back to the current section when the agent invents one", () => {
    const result = coerceRuleImproveResult(
      { ...REVISED, section: "ZZ" },
      { sections: SECTIONS, fallbackSection: "G" },
    );
    expect(result.section).toBe("G");
  });

  it("rejects a result missing the rule itself", () => {
    expect(() =>
      coerceRuleImproveResult(
        { ...REVISED, statement: 7 },
        { sections: SECTIONS, fallbackSection: "G" },
      ),
    ).toThrow();
  });
});

describe("rule tidy contract (empty expert_input — the editor's Clean up with AI)", () => {
  it("polishes prose but mechanically freezes quote, severity, and section", () => {
    const result = coerceRuleImproveResult(REVISED, {
      sections: SECTIONS,
      fallbackSection: DRAFT.section,
    });
    const next = applyRuleTidy(DRAFT, result);
    expect(next.name).toBe(REVISED.name);
    expect(next.statement).toBe(REVISED.statement);
    // No feedback authorized changing the Expert's classifications:
    expect(next.quote).toBe(DRAFT.quote);
    expect(next.severity).toBe(DRAFT.severity);
    expect(next.section).toBe(DRAFT.section);
  });

  it("refuses a tidy that erased the rule name or statement", () => {
    expect(() =>
      applyRuleTidy(DRAFT, {
        ...REVISED,
        statement: "   ",
        severity: "major",
        section: "G",
      }),
    ).toThrow();
  });
});

describe("rule editor persisted draft", () => {
  it("restores only a draft from the same Rulebook version and rule", () => {
    const stored = {
      baseVersion: 8,
      fields: DRAFT,
      beforeTidy: null,
    };
    expect(
      readRuleEditorDraft(stored, {
        rulebookVersion: 8,
        mode: "edit",
        ruleId: "R1",
      }),
    ).toEqual({ fields: DRAFT, beforeTidy: null, policy: null });
    expect(
      readRuleEditorDraft(stored, {
        rulebookVersion: 9,
        mode: "edit",
        ruleId: "R1",
      }),
    ).toBeNull();
  });
});

/**
 * THE POLICY HALF SURVIVES A RELOAD (Bugbot, PR #222, 2026-09-12).
 *
 * `precondition` / `next_action` are persisted BESIDE `fields` — they are not
 * part of `RulebookDraftSnapshot`, which is the prose an agent writes. Until
 * this they were persisted nowhere, so the editor's reopen path restored the
 * name and the statement from the draft and reset "When:" and "Next:" from the
 * live rule: everything the Expert had typed into them was gone.
 *
 * ONE-LINE BUG EACH TEST CATCHES:
 *  · first  — dropping `policy` from the restore path;
 *  · second — trusting a stored policy without checking it, so a corrupted
 *    half puts words in the Expert's mouth.
 */
describe("rule editor persisted policy fields", () => {
  const POLICY = {
    preconditionSummary: "Fever plus a stiff neck, within the hour",
    preconditionKnown: "temp 39.1\nneck stiffness",
    preconditionUnknown: "CSF result",
    nextActionKind: "test" as const,
    nextActionTarget: "Lumbar puncture",
    nextActionBuys: "Rules meningitis in or out",
    nextActionCost: "3",
    nextActionRisk: "2",
    nextActionUrgency: "now" as const,
  };

  it("restores what was typed into When: and Next:", () => {
    const restored = readRuleEditorDraft(
      { baseVersion: 8, fields: DRAFT, beforeTidy: null, policy: POLICY },
      { rulebookVersion: 8, mode: "edit", ruleId: "R1" },
    );
    expect(restored?.policy).toEqual(POLICY);
  });

  it("treats an unreadable stored policy as absent rather than half-applying it", () => {
    const restored = readRuleEditorDraft(
      {
        baseVersion: 8,
        fields: DRAFT,
        beforeTidy: null,
        policy: { ...POLICY, nextActionKind: "teleport" },
      },
      { rulebookVersion: 8, mode: "edit", ruleId: "R1" },
    );
    // The prose still restores; the policy falls back to the live rule.
    expect(restored?.fields).toEqual(DRAFT);
    expect(restored?.policy).toBeNull();
  });

  it("fills the fields a stored policy simply does not carry", () => {
    const restored = readRuleEditorDraft(
      {
        baseVersion: 8,
        fields: DRAFT,
        beforeTidy: null,
        policy: { preconditionSummary: "Just this much" },
      },
      { rulebookVersion: 8, mode: "edit", ruleId: "R1" },
    );
    expect(restored?.policy?.preconditionSummary).toBe("Just this much");
    expect(restored?.policy?.nextActionKind).toBe("");
  });
});
