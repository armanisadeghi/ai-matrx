// Agent Change Impact — the batch panel's piles, the write's result index and
// the sentences a person reads before and after a move (I4 write half + I5).
//
// Every fixture is the CONTRACT's shape (common-docs/projects/agent-change-impact
// /CONTRACT.md, Amendments 1–3), never a guess at it: `blocker` and `grade`
// are two fields, a dry-run token has no target, `principal.kind` has three
// values.

jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: jest.fn(async () => 72),
}));

import {
  batchTierOf,
  countBatchTiers,
  describeAdvance,
  describeBatch,
  describeRevert,
  indexResultsByRung,
  isBatchActionable,
  mergeImpactReports,
  mergeStandingImpacts,
  revertWindowSentence,
  revertableRows,
  rungIdentityOf,
  summarizeAdvanceReport,
  type AdvanceReport,
  type ImpactReport,
  type ImpactVerdict,
} from "../impact";

function verdict(overrides: Partial<ImpactVerdict> = {}): ImpactVerdict {
  const base: ImpactVerdict = {
    holder_kind: "mandate_default",
    row_id: "row-1",
    mandate_key: "probe.alpha",
    principal: { kind: "org", organization_id: "org-1", subject_user_id: null },
    agent_id: "agent-1",
    agent_name: "Quick Test Agent",
    lineage_path: [{ agent_id: "agent-1", agent_name: "Quick Test Agent", relation: "self" }],
    pinned_version_id: "v1",
    pinned_version_number: 1,
    latest_version_id: "v15",
    latest_version_number: 15,
    grade: "green",
    blocker: null,
    findings: [],
    settings_drift: { keys: [], capability: [], capability_checked: true },
    changed_columns: ["model_id"],
    apply_token: {
      holder_kind: "mandate_default",
      row_id: "row-1",
      expected_pinned_version_id: "v1",
      target_version_id: "v15",
    },
    auto_advance_eligible: true,
  };
  return { ...base, ...overrides };
}

describe("batchTierOf — Arman's three piles plus the two a batch must name", () => {
  it("green with a clean settings check is SAFE (one button moves it)", () => {
    expect(batchTierOf(verdict())).toBe("safe");
    expect(isBatchActionable(verdict())).toBe(true);
  });

  it("green with an unexpected capability issue is DRIFT — the programmatic settings signal", () => {
    const v = verdict({
      settings_drift: {
        keys: [],
        capability: [
          { key: "temperature", action: "dropped", reason: "not supported", expected: false },
        ],
        capability_checked: true,
      },
    });
    expect(batchTierOf(v)).toBe("drift");
  });

  it("an unmeasured capability check is DRIFT, never safe (R15)", () => {
    const v = verdict({
      settings_drift: { keys: [], capability: [], capability_checked: false },
    });
    expect(batchTierOf(v)).toBe("drift");
  });

  it("orange (output changed) is DRIFT; red (variables) is RED", () => {
    expect(batchTierOf(verdict({ grade: "orange" }))).toBe("drift");
    expect(batchTierOf(verdict({ grade: "red" }))).toBe("red");
  });

  it("a blocked row is BLOCKED whatever its grade, and never actionable (R17)", () => {
    const v = verdict({ grade: "red", blocker: "set_aside", set_aside_reason: "archived workflow" });
    expect(batchTierOf(v)).toBe("blocked");
    expect(isBatchActionable(v)).toBe(false);
  });

  it("another person's pin is BLOCKED — theirs to advance, never moved on their behalf (I12/R27)", () => {
    const v = verdict({
      holder_kind: "binding",
      principal: { kind: "user", organization_id: "org-1", subject_user_id: "user-9" },
    });
    expect(batchTierOf(v)).toBe("blocked");
    expect(isBatchActionable(v)).toBe(false);
  });

  it("a global binding is an ordinary batch member (Amendment 1)", () => {
    const v = verdict({
      holder_kind: "binding",
      principal: { kind: "global", organization_id: "org-1", subject_user_id: null },
    });
    expect(batchTierOf(v)).toBe("safe");
  });

  it("a pin already on the newest version is CURRENT, not blocked", () => {
    const v = verdict({
      pinned_version_id: "v15",
      pinned_version_number: 15,
      grade: "identical",
      apply_token: { holder_kind: "mandate_default", row_id: "row-1", expected_pinned_version_id: "v15", target_version_id: "v15" },
    });
    expect(batchTierOf(v)).toBe("current");
  });

  it("a DRY-RUN verdict (no target token, R23) keeps its pile but is never actionable", () => {
    const v = verdict({
      grade: "red",
      apply_token: { holder_kind: "mandate_default", row_id: "row-1", expected_pinned_version_id: "v1", target_version_id: null },
    });
    expect(batchTierOf(v)).toBe("red");
    expect(isBatchActionable(v)).toBe(false);
  });
});

describe("countBatchTiers / describeBatch — the headline sentence", () => {
  it("counts agents, mandates and pins, and names the piles a batch must not hide", () => {
    const verdicts = [
      verdict(),
      verdict({ row_id: "row-2", mandate_key: "probe.beta", grade: "red", agent_id: "agent-2" }),
      verdict({ row_id: "row-3", mandate_key: "probe.beta", holder_kind: "binding", blocker: "tracks_latest" }),
    ];
    const counts = countBatchTiers(verdicts);
    expect(counts).toEqual({
      agents: 2,
      mandates: 2,
      rungs: 3,
      byTier: { safe: 1, drift: 0, red: 1, blocked: 1, current: 0 },
    });
    expect(describeBatch(counts)).toBe(
      "2 agents, 2 mandates (3 pins): 1 safe / 0 to check / 1 red / 1 not in this batch",
    );
  });
});

describe("mergeImpactReports — what the read withheld is summed, never dropped (R31)", () => {
  it("sums withheld counts, keeps the server's sentences once, and lists unknown ids", () => {
    const page = (n: number): ImpactReport => ({
      verdicts: [verdict({ row_id: `row-${n}` })],
      withheld: { total: n, sentence: "personal pins, theirs to advance" },
      agents_examined: 1,
      unknown_agent_ids: n === 2 ? ["ghost"] : [],
      unknown_sentence: n === 2 ? "1 id is not an agent you can read." : null,
      dry_run: true,
      computed_at: `2026-09-14T00:0${n}:00Z`,
    });
    const merged = mergeImpactReports([page(1), page(2)]);
    expect(merged.verdicts).toHaveLength(2);
    expect(merged.withheldTotal).toBe(3);
    expect(merged.withheldSentences).toEqual(["personal pins, theirs to advance"]);
    expect(merged.unknownAgentIds).toEqual(["ghost"]);
    expect(merged.unknownSentences).toEqual(["1 id is not an agent you can read."]);
    expect(merged.dryRun).toBe(true);
    expect(merged.computedAt).toBe("2026-09-14T00:02:00Z");
    // A second merge (one dry run per replaced model) sums again.
    const twice = mergeStandingImpacts([merged, merged]);
    expect(twice.withheldTotal).toBe(6);
    expect(twice.unknownAgentIds).toEqual(["ghost"]);
  });
});

describe("the write's results", () => {
  const report: AdvanceReport = {
    batch_id: "batch-1",
    batch_label: "Standing table: 2 selected",
    action: "advance",
    results: [
      {
        token: { holder_kind: "mandate_default", row_id: "row-1", expected_pinned_version_id: "v1", target_version_id: "v15" },
        mandate_key: "probe.alpha",
        status: "advanced",
        prior_pinned_version_id: "v1",
        new_pinned_version_id: "v15",
        ledger_row_id: "ledger-1",
      },
      {
        token: { holder_kind: "binding", row_id: "row-2", expected_pinned_version_id: "v1", target_version_id: "v15" },
        mandate_key: "probe.beta",
        status: "refused",
        reason: "probe.beta's pin moved since this page read it (now v3) — re-read and try again.",
      },
    ],
    counts: { total: 2, advanced: 1, reverted: 0, refused: 1, excluded: 0 },
    computed_at: "2026-09-14T00:00:00Z",
  };

  it("indexes results by rung identity so a row finds its own sentence", () => {
    const index = indexResultsByRung(report);
    expect(index.get("mandate_default:row-1")?.status).toBe("advanced");
    expect(index.get("binding:row-2")?.reason).toContain("moved since this page read it");
    expect(rungIdentityOf({ holder_kind: "binding", row_id: "row-2" })).toBe("binding:row-2");
  });

  it("summarizes with the server's counts and names refusals", () => {
    expect(summarizeAdvanceReport(report)).toBe("1 of 2 advanced, 1 refused.");
    expect(summarizeAdvanceReport({ ...report, action: "revert", counts: { total: 1, reverted: 1 } })).toBe(
      "1 of 1 put back.",
    );
  });

  it("only rows that actually moved are revertable", () => {
    expect(revertableRows(report).map((row) => row.mandate_key)).toEqual(["probe.alpha"]);
  });

  it("the revert dialog names the versions it moves between", () => {
    const byRung = new Map([["mandate_default:row-1", verdict()]]);
    const { title, moves } = describeRevert(revertableRows(report), "batch", byRung);
    expect(title).toBe("Put 1 pin back?");
    expect(moves).toEqual(["probe.alpha: v15 → v1"]);
  });
});

describe("describeAdvance — consequence before the click", () => {
  it("names every pin from → to, counts the ones chosen despite a warning, and states the undo window", () => {
    const { title, description, moves } = describeAdvance(
      [verdict(), verdict({ row_id: "row-2", mandate_key: "probe.beta", grade: "red" })],
      { state: "known", hours: 72 },
    );
    expect(title).toBe("Advance 2 mandate pins?");
    expect(moves).toEqual([
      "probe.alpha: Quick Test Agent v1 → v15 · Green",
      "probe.beta: Quick Test Agent v1 → v15 · Red",
    ]);
    expect(description).toContain("1 is orange or red and you are choosing to advance it anyway");
    expect(description).toContain("put back for 72 hours");
  });

  it("is honest when the window could not be read", () => {
    expect(revertWindowSentence({ state: "unknown", why: "offline" })).toContain(
      "could not read the platform default (offline)",
    );
  });
});
