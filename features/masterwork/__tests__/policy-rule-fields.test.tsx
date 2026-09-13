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
  RuleMove,
  ruleMoveIsEmpty,
} from "../components/detail/RuleMove";
import {
  EMPTY_RULE_MOVE_FIELDS,
  ruleMoveFieldsFromRule,
  ruleMoveFromFields,
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
  move: {
    when: {
      summary:
        "adult, fever + headache + neck stiffness, meningitis not excluded",
      known: ["fever", "headache"],
      unknown: ["CSF result"],
    },
    next: {
      kind: "test",
      target: "lumbar puncture (CT first if focal signs)",
      buys: "excludes the worst thing first",
      cost: 3,
      risk: 2,
      urgency: "now",
    },
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

describe("RuleMove — the When/Next block", () => {
  it("renders both halves, the chips and the numbers", () => {
    const out = renderToText(<RuleMove rule={POLICY_RULE} />);
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
    const out = renderToText(<RuleMove rule={STATIC_RULE} />);
    expect(out.html).toBe("");
    expect(ruleMoveIsEmpty(STATIC_RULE)).toBe(true);
    expect(ruleMoveIsEmpty(POLICY_RULE)).toBe(false);
    out.cleanup();
  });
});

describe("the rule form's move fields", () => {
  it("round-trips a rule through the form values unchanged", () => {
    const values = ruleMoveFieldsFromRule(POLICY_RULE);
    expect(values.preconditionKnown).toBe("fever\nheadache");
    expect(values.nextActionCost).toBe("3");
    expect(ruleMoveFromFields(values)).toEqual({ move: POLICY_RULE.move });
  });

  it("emits nothing from an empty form — a rule the Expert did not annotate", () => {
    expect(ruleMoveFromFields(EMPTY_RULE_MOVE_FIELDS)).toEqual({});
  });

  it("treats a half-filled next action as absent, never as 'Next: —'", () => {
    expect(
      ruleMoveFromFields({
        ...EMPTY_RULE_MOVE_FIELDS,
        nextActionKind: "test",
      }),
    ).toEqual({});
    expect(
      ruleMoveFromFields({
        ...EMPTY_RULE_MOVE_FIELDS,
        preconditionKnown: "fever",
      }),
    ).toEqual({});
  });

  it("drops a cost or risk outside 1–5 rather than clamping it to a lie", () => {
    const out = ruleMoveFromFields({
      ...EMPTY_RULE_MOVE_FIELDS,
      nextActionKind: "ask",
      nextActionTarget: "the client",
      nextActionCost: "9",
    });
    expect(out.move?.next).toEqual({ kind: "ask", target: "the client" });
  });
});

/**
 * THE ELICITATION HALF SURVIVES AN EDIT.
 *
 * `move` carries more than the two fields this form owns: the distillers write
 * `ask`, `rules_in`, `rules_out`, `information_value`, `frame` and `order`
 * (`distill.py::Move`), and the Rulebook document prints `move.ask`. The
 * converter used to REBUILD `move` from the two halves it knows, so every save
 * — including one that only touched prose — destroyed the other six fields
 * silently. Found by review on PR #222 before it could eat a real Rulebook.
 */
describe("a save never destroys the move fields the form does not own", () => {
  const ELICITING: RulebookRule = {
    ...STATIC_RULE,
    id: "R3",
    move: {
      when: { summary: "the client has not named the loss yet" },
      next: { kind: "ask", target: "what changed first" },
      ask: "What was the first thing you noticed changing?",
      rules_in: [{ answer_class: "a date", settles: "acute onset" }],
      rules_out: [{ answer_class: "'always been this way'", settles: "acute onset" }],
      information_value: "separates acute from chronic before anything else",
      frame: "open, no diagnosis words",
      order: 1,
    },
  };

  it("carries ask/rules_in/rules_out/information_value/frame/order through an untouched round-trip", () => {
    const values = ruleMoveFieldsFromRule(ELICITING);
    expect(ruleMoveFromFields(values, ELICITING.move)).toEqual({
      move: ELICITING.move,
    });
  });

  it("keeps them when the Expert edits the When/Next halves", () => {
    const out = ruleMoveFromFields(
      {
        ...ruleMoveFieldsFromRule(ELICITING),
        preconditionSummary: "the client has not named the loss yet, session 2",
      },
      ELICITING.move,
    );
    expect(out.move?.when?.summary).toContain("session 2");
    expect(out.move?.ask).toBe(ELICITING.move?.ask);
    expect(out.move?.rules_in).toEqual(ELICITING.move?.rules_in);
    expect(out.move?.information_value).toBe(ELICITING.move?.information_value);
    expect(out.move?.order).toBe(1);
  });

  it("keeps them even when the Expert CLEARS both halves — and deletes the halves", () => {
    const out = ruleMoveFromFields(EMPTY_RULE_MOVE_FIELDS, ELICITING.move);
    expect(out.move?.when).toBeUndefined();
    expect(out.move?.next).toBeUndefined();
    expect(out.move?.ask).toBe(ELICITING.move?.ask);
  });

  it("still deletes the whole move when there was nothing else to keep", () => {
    const out = ruleMoveFromFields(EMPTY_RULE_MOVE_FIELDS, POLICY_RULE.move);
    expect("move" in out).toBe(true);
    expect(out.move).toBeUndefined();
  });
});

/**
 * THE SAME LAW, ONE LEVEL DOWN. `move.when` also carries a field no form field
 * owns — `counterparty_state`, which `rulebookDocument` prints as "they are:" —
 * and rebuilding `when` from the three the form DOES own dropped it. Found by
 * review on the very commit that fixed the outer case: the fix is the class
 * (carry every key the form does not own), not the key.
 */
describe("a save never destroys the WHEN fields the form does not own", () => {
  const STATEFUL: RulebookRule = {
    ...STATIC_RULE,
    id: "R4",
    move: {
      when: {
        summary: "first session, the client came because someone sent them",
        known: ["referred by the court"],
        counterparty_state: ["ambivalent", "not here by choice"],
      },
      next: { kind: "ask", target: "what would make this worth their time" },
    },
  };

  it("keeps counterparty_state when the Expert edits the summary", () => {
    const out = ruleMoveFromFields(
      {
        ...ruleMoveFieldsFromRule(STATEFUL),
        preconditionSummary: "first session, court-referred",
      },
      STATEFUL.move,
    );
    expect(out.move?.when?.summary).toBe("first session, court-referred");
    expect(out.move?.when?.counterparty_state).toEqual([
      "ambivalent",
      "not here by choice",
    ]);
  });

  it("drops the whole when — counterparty_state included — when the summary is cleared", () => {
    const out = ruleMoveFromFields(
      { ...ruleMoveFieldsFromRule(STATEFUL), preconditionSummary: "" },
      STATEFUL.move,
    );
    expect(out.move?.when).toBeUndefined();
  });
});
