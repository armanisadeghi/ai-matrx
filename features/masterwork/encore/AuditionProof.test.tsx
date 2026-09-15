/**
 * THE SCREEN NEVER CALLS A TWO-ARM CHECK THE PROOF.
 *
 * The defect (census 2026-09-14; doctrine CORE.md §6 and §9's standing verdict
 * of 2026-09-14): this component rendered "Expert match 62/100", described
 * itself as THE PROOF and called the vanilla arm "the head-to-head against a
 * plain AI". An Audition compares two or three arms against one reference. The
 * thing that can prove a win is a logged five-arm Bench run with a blind panel,
 * cost and seconds per arm, naming the arm and the budget.
 *
 * Four legs, each proven red against the pre-fix component:
 *   (a) the score is labelled a QUICK CHECK, and the words "Expert match" and
 *       "THE PROOF" appear nowhere in the rendered output or the source;
 *   (b) with no bench record the panel SAYS "No bench proof yet" and where the
 *       Bench runs — it never leaves the question unanswered;
 *   (c) with a record it shows the claim, the arm, the budget, the panel and
 *       the money — the server's own headline, not a re-written one;
 *   (d) no dead control: `can_run_here` is false today, so the panel renders no
 *       button that would do nothing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AuditionProof, auditionSentence } from "./AuditionProof";
import type { BenchProofState, BenchProofWire } from "./benchProof";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RECORD: BenchProofWire = {
  record_id: "TB-watson-shoes-01",
  trial_id: "TB-watson-shoes-01",
  subject: "John B. Watson",
  domain: "parenting",
  finished_at: "2026-09-15T02:00:00Z",
  passed: true,
  void: false,
  void_reason: "",
  win_claimed: "quality",
  win_rationale: "C beat A2 on 4 of the seven including heterodoxy retention.",
  arm: "a2",
  budget_multiple: 100,
  panel_winner: "gt",
  gt_in_pool: true,
  gt_won: true,
  panel_votes: 3,
  c_cost_usd: 0.42,
  c_seconds: 96,
  spec_sha256: "abc123",
  corpus_sha256: "def456",
  record_path: "/trials/TB-watson-shoes-01.json",
  report_path: "/trials/TB-watson-shoes-01.md",
  source: "file index",
  headline:
    "Bench trial TB-watson-shoes-01: quality win claimed against arm A2 at 100× our cost.",
};

const NONE: BenchProofState = {
  status: "none",
  reason:
    "No bench proof yet. Proof is a five-arm Bench run (A0/A1/A2/B/C/GT) with a blind panel, " +
    "judged cost and time on every arm, and a claim naming the arm and the budget it was made " +
    "against. The Bench runs from the command line today — there is no button for it in the app yet.",
  canRunHere: false,
};

describe("the Audition score is presented as a quick check, never as proof", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (bench: BenchProofState | undefined) =>
    act(() => {
      root.render(
        <AuditionProof
          variant="panel"
          score={62}
          verdict="Quick check: 62/100 against the published work. Not a proof; run the Bench."
          auditionedAt="2026-09-14T12:00:00Z"
          bench={bench}
        />,
      );
    });

  it("(a) labels the number a quick check and never claims a match with proof", () => {
    render(NONE);
    const text = host.textContent ?? "";
    expect(text).toContain("Quick check: 62/100");
    expect(text).not.toContain("Expert match");
    expect(text.toLowerCase()).not.toContain("the proof");
  });

  it("(b) says plainly that there is no bench proof, and where the Bench runs", () => {
    render(NONE);
    const text = host.textContent ?? "";
    expect(text).toContain("No bench proof yet");
    expect(text).toContain("five-arm Bench run");
    expect(text).toContain("command line");
  });

  it("(c) shows the record's own claim, arm, budget, panel and cost", () => {
    render({ status: "record", proof: RECORD, canRunHere: false });
    const text = host.textContent ?? "";
    expect(text).toContain(RECORD.headline);
    expect(text).toContain("blind panel of 3");
    expect(text).toContain("the expert's own work won it");
    expect(text).toContain("42.0¢");
    expect(text).toContain("TB-watson-shoes-01.md");
  });

  it("(d) renders no control for a Bench that cannot be started here", () => {
    render(NONE);
    expect(host.querySelectorAll("button").length).toBe(0);
    expect(host.querySelectorAll("a").length).toBe(0);
  });

  it("says 'can't tell from here' rather than a false no", () => {
    render({
      status: "unavailable",
      reason: "Only people who can open this Masterwork's Rulebook can see it.",
      canRunHere: false,
    });
    const text = host.textContent ?? "";
    expect(text).toContain("can't tell from here");
    expect(text).not.toContain("No bench proof yet");
  });
});

describe("a stored pre-2026-09-15 verdict never repeats its win claim", () => {
  it("sets the legacy sentence aside and says why", () => {
    const legacy = auditionSentence(
      "The Masterwork beat vanilla AI on 2 of 4 rules. Overall against your reference: Masterwork 25, vanilla 0 (0-100).",
    );
    expect(legacy?.legacy).toBe(true);
    expect(legacy?.text).not.toContain("beat vanilla AI on 2 of 4");
    expect(legacy?.text).toContain("cannot establish");
  });

  it("passes a current sentence through untouched", () => {
    const current =
      "Quick check: 62.5/100 against the published work. Not a proof; run the Bench.";
    expect(auditionSentence(current)).toEqual({ text: current, legacy: false });
    expect(auditionSentence(null)).toBeNull();
  });
});

describe("the source itself carries no proof claim", () => {
  it("never says THE PROOF or Expert match", () => {
    const source = readFileSync(
      join(process.cwd(), "features/masterwork/encore/AuditionProof.tsx"),
      "utf8",
    );
    expect(source).not.toContain("Expert match ${");
    expect(source).not.toMatch(/THE PROOF, in Operator words/);
  });
});
