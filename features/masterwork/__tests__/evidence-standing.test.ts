/**
 * 🚨 THE EVIDENCE STANDING — the counters never ask for 416 decisions.
 *
 * THE INCIDENT (2026-09-12, live, Rulebook b4ebbfb4-ccb3-46ac-9bde-2741891b46e8):
 * the body-of-work lane turned 20 published pieces into 416 per-piece draft
 * rules plus 4 synthesized cross-piece rules, and the KPI strip counted all 420
 * as "Waiting on you". No Expert reviews 416 rules one at a time, and the page
 * offered only Approve-all or one-by-one — so the Expert pressed Approve-all,
 * which is the failure the review lane exists to prevent.
 *
 * Per-piece rules now carry `standing: "evidence"`. These tests drive the REAL
 * `computeKpis`, the REAL `ruleState`, and the REAL evidence helpers.
 *
 * Plant the bug to see them go red (all proven 2026-09-12):
 *  - `types.ts` — drop the `standing === "evidence"` branch from `ruleState`:
 *    "the counters exclude evidence" fails with drafts = 21 instead of 1.
 *  - `RulebookKpiStrip.computeKpis` — fold `evidence` back into `drafts`: same.
 */

import { computeKpis } from "../components/detail/RulebookKpiStrip";
import {
  evidenceFor,
  evidenceSupport,
  isEvidenceRule,
  promoteEvidenceRule,
  ruleState,
  type RulebookRule,
} from "../types";

const PIECES = Array.from({ length: 4 }, (_, i) => `https://example.org/p${i + 1}`);

function evidenceRule(n: number, piece: string, pieces = [piece]): RulebookRule {
  return {
    id: `observation-${n}`,
    name: `Observation ${n}`,
    section: "G",
    statement: `Piece observation ${n}.`,
    severity: "major",
    draft: true,
    standing: "evidence",
    source_ref: { approach: "body_of_work", corpus_piece: piece, evidence_pieces: pieces },
  };
}

const SYNTHESIZED: RulebookRule = {
  id: "you-never-publish-an-unsourced-number",
  name: "You never publish an unsourced number",
  section: "G",
  statement: "A number appears only with a source the reader can reach.",
  severity: "critical",
  draft: true,
  source_ref: { approach: "body_of_work", synthesis: true, pieces: PIECES.slice(0, 3) },
};

const APPROVED: RulebookRule = {
  id: "say-what-you-do-not-know",
  name: "Say what you do not know",
  section: "G",
  statement: "State the limits of the reporting before the conclusions.",
  severity: "major",
};

/** Five pieces' worth of observations plus one synthesized rule. */
const RULES: RulebookRule[] = [
  ...Array.from({ length: 20 }, (_, i) => evidenceRule(i + 1, PIECES[i % PIECES.length])),
  SYNTHESIZED,
  APPROVED,
];

describe("the evidence standing", () => {
  it("reads as its own review state, above draft", () => {
    expect(ruleState(evidenceRule(1, PIECES[0]))).toBe("evidence");
    expect(ruleState(SYNTHESIZED)).toBe("draft");
    expect(ruleState(APPROVED)).toBe("approved");
    // Retired and rejected still outrank it — an evidence rule the Expert
    // retired is retired.
    expect(ruleState({ ...evidenceRule(1, PIECES[0]), retired: true })).toBe("retired");
    expect(ruleState({ ...evidenceRule(1, PIECES[0]), rejected: true })).toBe("rejected");
  });

  it("the counters exclude evidence rules", () => {
    const kpis = computeKpis({ rules: RULES });
    // BEFORE the fix: drafts = 21 and Rules = 22 — the screen asking the Expert
    // for 21 decisions after one body-of-work run.
    expect(kpis.drafts).toBe(1);
    expect(kpis.approved).toBe(1);
    expect(kpis.evidence).toBe(20);
    expect(kpis.total).toBe(2);
    // "Rules" is what the strip prints: approved + drafts + rejected.
    expect(kpis.approved + kpis.drafts + kpis.rejected).toBe(2);
    expect(kpis.progressPct).toBe(50);
  });

  it("a change request on an evidence rule is not a change request", () => {
    const kpis = computeKpis({
      rules: [{ ...evidenceRule(1, PIECES[0]), feedback: "not this one" }],
    });
    expect(kpis.changeRequests).toBe(0);
    expect(kpis.drafts).toBe(0);
  });

  it("a synthesized rule finds exactly the evidence it cites", () => {
    const behind = evidenceFor(SYNTHESIZED, RULES);
    expect(behind.length).toBeGreaterThan(0);
    expect(behind.every(isEvidenceRule)).toBe(true);
    // The fourth piece is not cited, so its observations are not claimed as proof.
    expect(
      behind.some((rule) => rule.source_ref?.corpus_piece === PIECES[3]),
    ).toBe(false);
    // A rule that cites nothing shows nothing — never a guess.
    expect(evidenceFor(APPROVED, RULES)).toEqual([]);
  });

  it("support is the DISTINCT pieces that produced the observation", () => {
    expect(evidenceSupport(evidenceRule(1, PIECES[0], [PIECES[0], PIECES[1], PIECES[0]]))).toBe(2);
  });

  it("promoting raises standing and changes nothing else", () => {
    const before = evidenceRule(1, PIECES[0]);
    const after = promoteEvidenceRule(before);
    expect(after.standing).toBeUndefined();
    expect(ruleState(after)).toBe("draft");
    expect(after.draft).toBe(true);
    expect(after.statement).toBe(before.statement);
    expect(after.severity).toBe(before.severity);
    expect(after.source_ref).toEqual(before.source_ref);
    // And it now counts as exactly one question for the Expert.
    expect(computeKpis({ rules: [after] }).drafts).toBe(1);
  });
});
