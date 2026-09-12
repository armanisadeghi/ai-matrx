import type { RulebookDraftSnapshot } from "./rulebookSurfaceScope";
import { ruleFieldValues } from "../types";
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

const SAVED_VALUES = ruleFieldValues(RULE, { defaultSection: "G" });

const DRAFT: RulebookDraftSnapshot = {
  mode: "edit",
  rule_id: "R1",
  ...SAVED_VALUES,
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

const DECISION_RULE: RulebookRule = {
  ...RULE,
  id: "R2",
  kind: "policy",
  precondition: "chest pain and the ECG is not yet done",
  next_action: "record a 12-lead ECG",
  action_kind: "test",
  cost: "low",
  risk: "low",
};

describe("rule improve keeps the decision shape (Bugbot on W58: a rewrite is of the judgment, not only the sentence)", () => {
  it("lands the rewritten decision fields when the AI returns them", () => {
    const result = coerceRuleImproveResult(
      {
        ...REVISED,
        kind: "policy",
        precondition: "chest pain, ECG not yet recorded",
        next_action: "record a 12-lead ECG within ten minutes",
        action_kind: "test",
        cost: "low",
        risk: "medium",
      },
      { sections: SECTIONS, fallbackSection: "G" },
    );
    const next = applyRuleImprove(DECISION_RULE, result);
    expect(next.kind).toBe("policy");
    expect(next.precondition).toBe("chest pain, ECG not yet recorded");
    expect(next.next_action).toBe("record a 12-lead ECG within ten minutes");
    expect(next.risk).toBe("medium");
    expect(next.draft).toBe(true);
  });

  it("never demotes a decision rule to a statement when the AI returns prose only", () => {
    const result = coerceRuleImproveResult(REVISED, {
      sections: SECTIONS,
      fallbackSection: "G",
    });
    expect(result.policy).toBeUndefined();
    const next = applyRuleImprove(DECISION_RULE, result);
    expect(next.kind).toBe("policy");
    expect(next.precondition).toBe(DECISION_RULE.precondition);
    expect(next.next_action).toBe(DECISION_RULE.next_action);
    expect(next.action_kind).toBe("test");
    expect(next.cost).toBe("low");
    expect(next.risk).toBe("low");
  });

  it("leaves an ordinary rule ordinary", () => {
    const next = applyRuleImprove(
      RULE,
      coerceRuleImproveResult(REVISED, { sections: SECTIONS, fallbackSection: "G" }),
    );
    expect(next.kind).toBeUndefined();
    expect(next.precondition).toBeUndefined();
  });

  it("refuses a half-judgment: a decision rule missing a field, or a value outside the closed sets", () => {
    expect(() =>
      coerceRuleImproveResult(
        { ...REVISED, kind: "policy", precondition: "x", next_action: "y" },
        { sections: SECTIONS, fallbackSection: "G" },
      ),
    ).toThrow(/action_kind, cost, risk/);
    expect(() =>
      coerceRuleImproveResult(
        {
          ...REVISED,
          precondition: "x",
          next_action: "y",
          action_kind: "operate",
          cost: "low",
          risk: "low",
        },
        { sections: SECTIONS, fallbackSection: "G" },
      ),
    ).toThrow(/action_kind/);
    expect(() =>
      coerceRuleImproveResult(
        {
          ...REVISED,
          precondition: "x",
          next_action: "y",
          action_kind: "test",
          cost: "enormous",
          risk: "low",
        },
        { sections: SECTIONS, fallbackSection: "G" },
      ),
    ).toThrow(/cost or risk/);
  });

  it("tidy polishes the precondition and next action but freezes kind, cost and risk", () => {
    const decisionDraft: RulebookDraftSnapshot = {
      mode: "edit",
      rule_id: "R2",
      ...ruleFieldValues(DECISION_RULE, { defaultSection: "G" }),
    };
    const result = coerceRuleImproveResult(
      {
        ...REVISED,
        precondition: "Chest pain; ECG not yet recorded.",
        next_action: "Record a 12-lead ECG.",
        action_kind: "treat",
        cost: "high",
        risk: "high",
      },
      { sections: SECTIONS, fallbackSection: "G" },
    );
    const next = applyRuleTidy(decisionDraft, result);
    expect(next.isPolicy).toBe(true);
    expect(next.precondition).toBe("Chest pain; ECG not yet recorded.");
    expect(next.nextAction).toBe("Record a 12-lead ECG.");
    expect(next.actionKind).toBe("test");
    expect(next.cost).toBe("low");
    expect(next.risk).toBe("low");
    // Prose-only reply: the decision prose stays exactly as it was.
    const prose = applyRuleTidy(
      decisionDraft,
      coerceRuleImproveResult(REVISED, { sections: SECTIONS, fallbackSection: "G" }),
    );
    expect(prose.precondition).toBe(DECISION_RULE.precondition);
    expect(prose.isPolicy).toBe(true);
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
        fallback: SAVED_VALUES,
      }),
    ).toEqual({ fields: DRAFT, beforeTidy: null });
    expect(
      readRuleEditorDraft(stored, {
        rulebookVersion: 9,
        mode: "edit",
        ruleId: "R1",
        fallback: SAVED_VALUES,
      }),
    ).toBeNull();
  });
});
