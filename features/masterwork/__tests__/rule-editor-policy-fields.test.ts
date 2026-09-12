/**
 * 🚨 THE ONE RULE-FORM FIELD SET (W58 follow-up, 2026-09-12).
 *
 * Three defects, one class: the rule editor kept the decision fields
 * (`isPolicy`, precondition, next action, action kind, cost, risk) as a second
 * set of state beside the prose. They were missing from the draft snapshot,
 * from the draft restore, from the open/reset effect, and from the
 * context-menu's hand-written list of replaceable field ids (Bugbot on
 * c016fe96). So Cancel-then-reopen kept a cancelled toggle, a later Save
 * silently converted or stripped a policy rule, and a replacement inside a
 * decision field threw.
 *
 * The editor no longer enumerates fields anywhere: it derives from
 * `ruleFieldValues`, `mergeRuleFieldValues` and `ruleFieldForElementId`, which
 * is what this suite holds. The last case is the forcing function — a field
 * added to the form that does not ride the enumeration fails here.
 */

import { readRuleEditorDraft } from "../agent-context/ruleImprove";
import { improveFieldsFrom } from "../components/detail/RuleFields";
import { RULE_CONTENT_FIELDS } from "../types";
import type { RulebookDraftSnapshot } from "../agent-context/rulebookSurfaceScope";
import {
  mergeRuleFieldValues,
  RULE_FIELD_KEYS,
  ruleFieldForElementId,
  ruleFieldValues,
  type RulebookRule,
} from "../types";

const POLICY_RULE: RulebookRule = {
  id: "R1",
  name: "Ask before you test",
  section: "G",
  statement: "When the history is thin, ask one more question first.",
  severity: "major",
  kind: "policy",
  precondition: "The history is thin and nothing rules out the obvious cause.",
  next_action: "Ask what changed in the last week.",
  action_kind: "ask",
  cost: "low",
  risk: "medium",
};

const SAVED = ruleFieldValues(POLICY_RULE, { defaultSection: "G" });

describe("the rule editor's form values", () => {
  it("reads a saved policy rule's decision shape, not the ordinary defaults", () => {
    expect(SAVED.isPolicy).toBe(true);
    expect(SAVED.precondition).toBe(POLICY_RULE.precondition);
    expect(SAVED.nextAction).toBe(POLICY_RULE.next_action);
    expect(SAVED.actionKind).toBe("ask");
    expect(SAVED.cost).toBe("low");
    expect(SAVED.risk).toBe("medium");
  });

  it("reopening after Cancel restores the SAVED policy state, not the cancelled edit", () => {
    // The Expert turns the decision shape off and rewrites the next action…
    const edited = mergeRuleFieldValues(SAVED, {
      isPolicy: false,
      nextAction: "Order the panel immediately.",
    });
    expect(edited.isPolicy).toBe(false);

    // …then cancels, which clears the draft. Reopen re-derives from the rule.
    const reopened = mergeRuleFieldValues(SAVED, undefined);
    expect(reopened).toEqual(SAVED);
    expect(reopened.isPolicy).toBe(true);
    expect(reopened.nextAction).toBe(POLICY_RULE.next_action);
  });

  it("hands the improve / tidy Mandate the decision shape under its STORED names", () => {
    // Bugbot on 1d692d66: Clean up with AI sent the camelCase form values to
    // a hook that reads RULE_CONTENT_FIELDS, so a decision rule reached the
    // model with an empty kind and next action.
    const fields = improveFieldsFrom(SAVED);
    expect(fields.kind).toBe("policy");
    expect(fields.precondition).toBe(POLICY_RULE.precondition);
    expect(fields.next_action).toBe(POLICY_RULE.next_action);
    expect(fields.action_kind).toBe("ask");
    expect(fields.cost).toBe("low");
    expect(fields.risk).toBe("medium");
    // Every content field the hook enumerates is present by its stored name.
    for (const key of RULE_CONTENT_FIELDS) expect(key in fields).toBe(true);
    // An ordinary rule clears the shape rather than carrying stale values.
    const ordinary = improveFieldsFrom(
      mergeRuleFieldValues(SAVED, { isPolicy: false }),
    );
    expect(ordinary.kind).toBeUndefined();
    expect(ordinary.next_action).toBeUndefined();
  });

  it("keeps an ordinary rule ordinary when nothing is staged", () => {
    const plain = ruleFieldValues(
      { ...POLICY_RULE, kind: undefined, precondition: undefined },
      { defaultSection: "G" },
    );
    expect(plain.isPolicy).toBe(false);
    expect(plain.precondition).toBe("");
  });
});

describe("the persisted rule-editor draft", () => {
  it("round-trips the decision fields", () => {
    const draft: RulebookDraftSnapshot = {
      mode: "edit",
      rule_id: "R1",
      ...mergeRuleFieldValues(SAVED, {
        nextAction: "Ask what changed since the last visit.",
        risk: "high",
      }),
    };
    const restored = readRuleEditorDraft(
      { baseVersion: 3, fields: draft, beforeTidy: null },
      {
        rulebookVersion: 3,
        mode: "edit",
        ruleId: "R1",
        fallback: SAVED,
      },
    );
    expect(restored?.fields).toEqual(draft);
    expect(restored?.fields.isPolicy).toBe(true);
    expect(restored?.fields.nextAction).toBe(
      "Ask what changed since the last visit.",
    );
    expect(restored?.fields.risk).toBe("high");
  });

  it("falls back to the saved rule for decision fields an older draft never carried", () => {
    const legacy = {
      baseVersion: 3,
      fields: {
        mode: "edit",
        rule_id: "R1",
        name: SAVED.name,
        statement: "A reworded statement.",
        rationale: SAVED.rationale,
        detection: SAVED.detection,
        quote: SAVED.quote,
        severity: SAVED.severity,
        section: SAVED.section,
      },
      beforeTidy: null,
    };
    const restored = readRuleEditorDraft(legacy, {
      rulebookVersion: 3,
      mode: "edit",
      ruleId: "R1",
      fallback: SAVED,
    });
    // The prose edit survives and the rule stays a decision rule — a draft
    // written before the fields existed must never silently strip the shape.
    expect(restored?.fields.statement).toBe("A reworded statement.");
    expect(restored?.fields.isPolicy).toBe(true);
    expect(restored?.fields.nextAction).toBe(POLICY_RULE.next_action);
  });
});

describe("the context menu's replaceable fields", () => {
  it("resolves every text field, decision fields included", () => {
    expect(ruleFieldForElementId("rule-name")).toBe("name");
    expect(ruleFieldForElementId("rule-statement")).toBe("statement");
    expect(ruleFieldForElementId("rule-rationale")).toBe("rationale");
    expect(ruleFieldForElementId("rule-detection")).toBe("detection");
    expect(ruleFieldForElementId("rule-quote")).toBe("quote");
    // These two threw before the fix.
    expect(ruleFieldForElementId("rule-precondition")).toBe("precondition");
    expect(ruleFieldForElementId("rule-next-action")).toBe("nextAction");
  });

  it("applies a replacement to the focused decision field", () => {
    const field = ruleFieldForElementId("rule-precondition");
    expect(field).not.toBeNull();
    const next = mergeRuleFieldValues(SAVED, {
      [field as "precondition"]: "The history is thin AND the pain is new.",
    });
    expect(next.precondition).toBe("The history is thin AND the pain is new.");
    // Nothing else moved.
    expect(next.nextAction).toBe(SAVED.nextAction);
  });

  it("still refuses a focus that is not a rule text field", () => {
    expect(ruleFieldForElementId("rule-is-policy")).toBeNull();
    expect(ruleFieldForElementId("some-other-input")).toBeNull();
    expect(ruleFieldForElementId(undefined)).toBeNull();
  });
});

describe("the enumeration is the guarantee", () => {
  it("covers every field the form owns", () => {
    // Adding a field to `RuleFieldValues` forces it into `ruleFieldValues`;
    // this fails until it also rides `RULE_FIELD_KEYS`, which is what the
    // snapshot, the restore and every merge walk.
    expect([...RULE_FIELD_KEYS].sort()).toEqual(Object.keys(SAVED).sort());
  });
});
