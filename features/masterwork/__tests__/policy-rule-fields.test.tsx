/**
 * THE POLICY FIELDS (unfolding-case contract §2) — the two optional rule
 * fields, from the form the Expert types in to the block the card draws.
 *
 * What these force:
 *   1. A rule carrying both fields renders the When/Next block, with the
 *      known/unknown chips and the cost/risk/urgency numbers.
 *   2. A rule carrying NEITHER renders exactly as before — nothing at all.
 *      Every rule every other Distillation lane has ever written is that rule,
 *      so a regression here is a change to the whole product, not this lane.
 *   3. A HALF-FILLED next action (a kind with no target) is the same as absent.
 *      "Next: —" is the misleading half-rule the anti-misleading law kills.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  RulePolicy,
  rulePolicyIsEmpty,
} from "../components/detail/RulePolicy";
import {
  EMPTY_RULE_POLICY_FIELDS,
  rulePolicyFieldsFromRule,
  rulePolicyFromFields,
  type RulebookRule,
} from "../types";

const STATIC_RULE: RulebookRule = {
  id: "R1",
  name: "Lead with the benefit",
  section: "U",
  statement: "Open every page with what the reader gets.",
  severity: "major",
};

const POLICY_RULE: RulebookRule = {
  ...STATIC_RULE,
  id: "R2",
  precondition: {
    summary: "adult, fever + headache + neck stiffness, meningitis not excluded",
    known: ["fever", "headache"],
    unknown: ["CSF result"],
  },
  next_action: {
    kind: "test",
    target: "lumbar puncture (CT first if focal signs)",
    buys: "excludes the worst thing first",
    cost: 3,
    risk: 2,
    urgency: "now",
  },
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function renderToText(node: React.ReactElement): {
  html: string;
  text: string;
  cleanup: () => void;
} {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root;
  act(() => {
    root = createRoot(host);
    root.render(node);
  });
  return {
    html: host.innerHTML,
    text: host.textContent ?? "",
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("RulePolicy — the When/Next block", () => {
  it("renders both halves, the chips and the numbers", () => {
    const out = renderToText(<RulePolicy rule={POLICY_RULE} />);
    expect(out.text).toContain("When:");
    expect(out.text).toContain("meningitis not excluded");
    expect(out.text).toContain("fever");
    expect(out.text).toContain("CSF result — not known yet");
    expect(out.text).toContain("Next:");
    expect(out.text).toContain("Test");
    expect(out.text).toContain("lumbar puncture (CT first if focal signs)");
    expect(out.text).toContain("buys excludes the worst thing first");
    expect(out.text).toContain("cost 3 of 5 · risk 2 of 5 · right now");
    out.cleanup();
  });

  it("renders NOTHING for a rule without the fields — every other lane's rule", () => {
    const out = renderToText(<RulePolicy rule={STATIC_RULE} />);
    expect(out.html).toBe("");
    expect(rulePolicyIsEmpty(STATIC_RULE)).toBe(true);
    expect(rulePolicyIsEmpty(POLICY_RULE)).toBe(false);
    out.cleanup();
  });
});

describe("the rule form's policy fields", () => {
  it("round-trips a rule through the form values unchanged", () => {
    const values = rulePolicyFieldsFromRule(POLICY_RULE);
    expect(values.preconditionKnown).toBe("fever\nheadache");
    expect(values.nextActionCost).toBe("3");
    expect(rulePolicyFromFields(values)).toEqual({
      precondition: POLICY_RULE.precondition,
      next_action: POLICY_RULE.next_action,
    });
  });

  it("emits nothing from an empty form — a rule the Expert did not annotate", () => {
    expect(rulePolicyFromFields(EMPTY_RULE_POLICY_FIELDS)).toEqual({});
  });

  it("treats a half-filled next action as absent, never as 'Next: —'", () => {
    expect(
      rulePolicyFromFields({
        ...EMPTY_RULE_POLICY_FIELDS,
        nextActionKind: "test",
      }),
    ).toEqual({});
    expect(
      rulePolicyFromFields({
        ...EMPTY_RULE_POLICY_FIELDS,
        preconditionKnown: "fever",
      }),
    ).toEqual({});
  });

  it("drops a cost or risk outside 1–5 rather than clamping it to a lie", () => {
    const out = rulePolicyFromFields({
      ...EMPTY_RULE_POLICY_FIELDS,
      nextActionKind: "ask",
      nextActionTarget: "the client",
      nextActionCost: "9",
    });
    expect(out.next_action).toEqual({ kind: "ask", target: "the client" });
  });
});
