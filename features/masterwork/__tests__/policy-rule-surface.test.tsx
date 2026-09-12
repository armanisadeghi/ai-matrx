/**
 * THE DECISION-HALF GUARD (2026-09-12).
 *
 * The Masterwork overview census found that the distillers have written the
 * DECISION shape onto rules since W58 — `kind`, `precondition`, `next_action`,
 * `action_kind`, `cost`, `risk` (aidream
 * `services/distillation/distill.py`) — that 592 live rules carried it, and
 * that NOT ONE frontend surface declared the fields or rendered them. An
 * Expert approving a decision rule saw the statement alone and was asked to
 * say yes to half a rule; every Rulebook-reading agent received the same half.
 *
 * This suite is the proof it cannot happen again, and it is deliberately three
 * separate forcing functions:
 *
 *   1. THE REAL RULE CARD (`RuleRow`, the row the Rulebook page renders) shows
 *      the whole decision. Delete `<RuleDecision rule={rule} />` from
 *      `RulebookDetailPage.tsx` and this fails.
 *   2. THE REAL REVIEW QUEUE (`RuleReviewWizard`, one rule per screen) shows it
 *      too — the surface where the Expert actually says yes.
 *   3. THE AGENTS' DOCUMENT (`renderRulebookDocument`) carries it, so the
 *      Conductor and the Scout are never handed a commandment where the Expert
 *      taught a judgment.
 *
 * Plus the VOCABULARY GUARD: `RULE_ACTION_KINDS` / `RULE_POLICY_LEVELS` are
 * parsed out of the real `distill.py` and compared. Either list drifting — on
 * either side — fails here rather than on a screen showing a verb the server
 * never meant.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  RULE_ACTION_KINDS,
  RULE_POLICY_LEVELS,
  type Rulebook,
  type RulebookRule,
} from "../types";
import { renderRulebookDocument } from "../agent-context/rulebookDocument";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Transport only. Nothing below stubs a rendering decision.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/masterwork/rb-1",
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => undefined,
  useAppDispatch: () => jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { RuleRow } = require("../components/detail/RulebookDetailPage");
const { RuleReviewWizard } = require("../components/detail/RuleReviewWizard");
/* eslint-enable @typescript-eslint/no-require-imports */

/** One rule carrying the COMPLETE decision half, shaped exactly as the server writes it. */
const POLICY_RULE: RulebookRule = {
  id: "r-policy-1",
  name: "Third visit for the same complaint",
  section: "A",
  statement:
    "Admit on the third emergency visit for the same unresolved complaint.",
  severity: "critical",
  draft: true,
  kind: "policy",
  precondition:
    "the patient is back a third time with the same complaint and nothing has been ruled out",
  next_action: "admit for observation rather than discharging again",
  action_kind: "treat",
  cost: "high",
  risk: "low",
};

/** The control: an ordinary rule must gain NO decision furniture at all. */
const PLAIN_RULE: RulebookRule = {
  id: "r-plain-1",
  name: "Lead with the benefit",
  section: "A",
  statement: "Open every summary with what the reader gains.",
  severity: "minor",
};

const RULEBOOK: Rulebook = {
  id: "rb-1",
  name: "Emergency triage",
  status: "draft",
  version: 3,
  sections: { A: { label: "Judgment calls" } },
  rules: [POLICY_RULE, PLAIN_RULE],
} as unknown as Rulebook;

let container: HTMLDivElement;
let root: Root;

function mount(node: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

const noop = () => {};

function ruleRow(rule: RulebookRule) {
  return (
    <RuleRow
      rule={rule}
      allRules={RULEBOOK.rules}
      canEdit
      onEdit={noop}
      onToggleRetired={noop}
      onApprove={noop}
      onReject={noop}
      onImprove={noop}
      onRequestChanges={noop}
      onReconsider={noop}
      onPromoteEvidence={noop}
    />
  );
}

/** Expand the row the way the Expert does — a real bubbling click. */
function expandRow() {
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-expanded]',
  );
  if (!toggle) throw new Error("rule row has no disclosure button");
  act(() => {
    toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("the rule card renders the decision half", () => {
  it("shows precondition, next action, action kind, cost and risk", () => {
    mount(ruleRow(POLICY_RULE));
    expandRow();
    const text = container.textContent ?? "";
    expect(text).toContain(POLICY_RULE.precondition);
    expect(text).toContain(POLICY_RULE.next_action);
    expect(text).toMatch(/Treat/);
    expect(text).toMatch(/Cost:\s*High/);
    expect(text).toMatch(/Risk:\s*Low/);
  });

  it("marks it as a decision in the collapsed header", () => {
    mount(ruleRow(POLICY_RULE));
    expect(container.textContent ?? "").toContain("Decision");
  });

  it("adds nothing at all to an ordinary rule", () => {
    mount(ruleRow(PLAIN_RULE));
    expandRow();
    const text = container.textContent ?? "";
    expect(text).not.toContain("Decision");
    expect(text).not.toContain("The call you make");
    expect(text).not.toMatch(/Cost:/);
  });
});

describe("the review queue renders the decision half", () => {
  it("shows the whole judgment on the screen where the Expert approves it", () => {
    mount(
      <RuleReviewWizard
        open
        onOpenChange={noop}
        rulebook={{ ...RULEBOOK, rules: [POLICY_RULE] }}
        onApprove={async () => true}
        onReject={async () => {}}
        onImprove={noop}
        requeue={null}
        onEdit={noop}
      />,
    );
    const text = (document.body.textContent ?? "") + (container.textContent ?? "");
    expect(text).toContain(POLICY_RULE.precondition);
    expect(text).toContain(POLICY_RULE.next_action);
    expect(text).toMatch(/Cost:\s*High/);
    expect(text).toMatch(/Risk:\s*Low/);
  });
});

describe("the agents' Rulebook document carries the decision half", () => {
  it("gives a Rulebook-reading agent the if → then, not just the statement", () => {
    const doc = renderRulebookDocument(RULEBOOK);
    expect(doc).toContain(`When: ${POLICY_RULE.precondition}`);
    expect(doc).toContain(`Then do: ${POLICY_RULE.next_action}`);
    expect(doc).toContain("Kind of move: treat");
    expect(doc).toContain("Cost of the action: high");
    expect(doc).toContain("Risk of the action: low");
    expect(doc).toContain("Kind: a DECISION, not a standing rule");
  });

  it("says nothing about decisions for an ordinary rule", () => {
    const doc = renderRulebookDocument({
      ...RULEBOOK,
      rules: [PLAIN_RULE],
    } as Rulebook);
    expect(doc).not.toContain("When:");
    expect(doc).not.toContain("Then do:");
  });
});

describe("the vocabularies mirror the server byte-for-byte", () => {
  const DISTILL = path.resolve(
    __dirname,
    "../../../../aidream/aidream/services/distillation/distill.py",
  );

  function pythonTuple(name: string): string[] {
    const source = readFileSync(DISTILL, "utf8");
    const match = new RegExp(`^${name}\\s*=\\s*\\(([^)]*)\\)`, "m").exec(source);
    if (!match) throw new Error(`${name} not found in ${DISTILL}`);
    return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  }

  it("RULE_ACTION_KINDS === distill.ACTION_KINDS", () => {
    expect([...RULE_ACTION_KINDS]).toEqual(pythonTuple("ACTION_KINDS"));
  });

  it("RULE_POLICY_LEVELS === distill.POLICY_LEVELS", () => {
    expect([...RULE_POLICY_LEVELS]).toEqual(pythonTuple("POLICY_LEVELS"));
  });
});
