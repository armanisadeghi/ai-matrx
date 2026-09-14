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
  IMPACT_RULE_SENTENCES,
  GRADE_META,
  batchTierOf,
  newestLabelOf,
  pinnedLabelOf,
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

  it("a DRY-RUN verdict (no target token, R23) takes its pile from the grade alone and is never actionable", () => {
    const v = verdict({
      grade: "red",
      latest_version_id: null,
      latest_version_number: null,
      apply_token: { holder_kind: "mandate_default", row_id: "row-1", expected_pinned_version_id: "v1", target_version_id: null },
    });
    expect(batchTierOf(v, { dryRun: true })).toBe("red");
    expect(isBatchActionable(v)).toBe(false);
    // Live 2026-09-14: the dry run returns no newest version, so without the
    // flag the green probes read "current" and the preview said nothing.
    const green = verdict({ latest_version_id: null, latest_version_number: null, apply_token: { ...v.apply_token } });
    expect(batchTierOf(green, { dryRun: true })).toBe("safe");
    expect(batchTierOf(green)).toBe("current");
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

describe("mergeImpactReports — what the read withheld is summed BY REASON into one sentence (R31, D1, D4)", () => {
  const page = (n: number): ImpactReport => ({
    verdicts: [verdict({ row_id: `row-${n}` })],
    withheld: {
      total: n === 1 ? 1 : 2,
      by_principal_kind:
        n === 1
          ? [{ principal_kind: "global", count: 1, explanation: "global rungs you are not entitled to read" }]
          : [
              { principal_kind: "system", count: 1, explanation: "platform default rungs in organizations you do not belong to" },
              { principal_kind: "user", count: 1, explanation: "personal pins owned by other people — theirs to advance" },
            ],
      sentence: n === 1 ? "1 rung withheld: 1 global rungs you are not entitled to read" : "2 rungs withheld: 1 platform default rungs in organizations you do not belong to; 1 personal pins owned by other people — theirs to advance",
    },
    agents_examined: 1,
    unknown_agent_ids: n === 2 ? ["ghost"] : [],
    unknown_sentence: n === 2 ? "1 of the agent ids you sent is not an agent you can see — …: ghost" : null,
    dry_run: true,
    computed_at: `2026-09-14T00:0${n}:00Z`,
  });

  it("renders ONE sentence whose count equals the summed total, never the pages' own sentences", () => {
    const merged = mergeImpactReports([page(1), page(2)]);
    expect(merged.withheldTotal).toBe(3);
    expect(merged.withheldGroups.map((g) => [g.principalKind, g.count])).toEqual([
      ["global", 1],
      ["system", 1],
      ["user", 1],
    ]);
    expect(merged.withheldSentences).toEqual([
      "3 rungs withheld: 1 global rungs you are not entitled to read; 1 platform default rungs in organizations you do not belong to; 1 personal pins owned by other people — theirs to advance",
    ]);
    expect(merged.unknownAgentIds).toEqual(["ghost"]);
    expect(merged.unknownSentences).toHaveLength(1);
    expect(merged.unknownSentences[0]).toMatch(/^1 of the agent ids you sent is not an agent you can see — .*: ghost$/);
    expect(merged.dryRun).toBe(true);
    expect(merged.computedAt).toBe("2026-09-14T00:02:00Z");
  });

  it("a second merge (one dry run per replaced model) sums the same kind together and lists each unknown id once", () => {
    const one = mergeImpactReports([page(2)]);
    const twice = mergeStandingImpacts([one, one]);
    expect(twice.withheldTotal).toBe(4);
    expect(twice.withheldGroups.map((g) => [g.principalKind, g.count])).toEqual([
      ["system", 2],
      ["user", 2],
    ]);
    expect(twice.withheldSentences).toEqual([
      "4 rungs withheld: 2 platform default rungs in organizations you do not belong to; 2 personal pins owned by other people — theirs to advance",
    ]);
    expect(twice.unknownAgentIds).toEqual(["ghost"]);
    expect(twice.unknownSentences).toHaveLength(1);
    // The id appears exactly once in the one sentence (D4 printed it twice).
    expect(twice.unknownSentences[0].split("ghost").length - 1).toBe(1);
  });
});

describe("version labels never lie about a pin (D3)", () => {
  it("a set-aside rung with null numbers but a pin id says 'pinned (version unknown)', never 'latest'", () => {
    const v = verdict({
      blocker: "set_aside",
      pinned_version_number: null,
      latest_version_number: null,
      pinned_version_id: "v1",
      latest_version_id: null,
    });
    expect(pinnedLabelOf(v)).toBe("pinned (version unknown)");
    expect(newestLabelOf(v)).toBe("unknown");
  });

  it("'latest' only when the rung tracks latest; 'no saved version' when unreachable", () => {
    const tracks = verdict({
      blocker: "tracks_latest",
      pinned_version_number: null,
      pinned_version_id: null,
      apply_token: { holder_kind: "mandate_default", row_id: "row-1", expected_pinned_version_id: null, target_version_id: null },
    });
    expect(pinnedLabelOf(tracks)).toBe("latest");
    const unreachable = verdict({ blocker: "unreachable", latest_version_number: null, latest_version_id: null });
    expect(newestLabelOf(unreachable)).toBe("no saved version");
    expect(pinnedLabelOf(verdict())).toBe("v1");
    expect(newestLabelOf(verdict())).toBe("v15");
  });
});

describe("the legend is derived from the rules (D8)", () => {
  it("names every red rule, including the action-policy change the hand summary missed", () => {
    expect(IMPACT_RULE_SENTENCES.red.map((r) => r.ruleId)).toContain("actions.apply_policy_changed");
    expect(GRADE_META.red.meaning).toContain("the actions apply policy changed");
    expect(GRADE_META.orange.meaning).toContain("the model moved to a different provider");
    expect(GRADE_META.green.meaning).toContain("the model changed on the same provider");
  });

  it("lists every rule id the server emits exactly once across the grades", () => {
    const all = (["red", "orange", "green", "identical"] as const).flatMap((g) =>
      IMPACT_RULE_SENTENCES[g].map((r) => r.ruleId),
    );
    expect(new Set(all).size).toBe(all.length);
    for (const id of [
      "var.added", "var.removed", "var.renamed", "var.required_flipped", "var.required_default_changed",
      "slot.added", "slot.removed", "slot.config_changed",
      "actions.apply_policy_changed", "actions.allowlist_grew", "actions.allowlist_shrank",
      "schema.root_shape_changed", "schema.key_removed", "schema.key_newly_required", "schema.key_redefined",
      "schema.additive_only", "schema.output_kind_changed",
      "contract.required_output_keys_unsatisfied", "contract.required_context_policies_unsatisfied",
      "input_kind.changed", "input_kind.stamped", "model.changed_same_provider", "model.provider_changed",
      "tools.changed", "mcp_servers.changed", "custom_tools.changed", "tool_config.changed", "skill_config.changed",
      "prompt.changed", "metadata.changed", "is_active.changed",
    ]) {
      expect(all).toContain(id);
    }
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

  it("a row a later revert already put back is not offered again (D5)", () => {
    const later: AdvanceReport = {
      batch_id: "batch-2",
      action: "revert",
      reverts_batch_id: "batch-1",
      results: [{ token: report.results![0].token, mandate_key: "probe.alpha", status: "reverted" }],
      counts: { total: 1, reverted: 1 },
      computed_at: "2026-09-14T00:01:00Z",
    };
    expect(revertableRows(report, [later])).toEqual([]);
    // A revert of ANOTHER batch does not count.
    expect(revertableRows(report, [{ ...later, reverts_batch_id: "batch-9" }])).toHaveLength(1);
  });

  it("the revert dialog names the versions AND the rung kind (D6)", () => {
    const bindingReport: AdvanceReport = {
      ...report,
      results: [
        report.results![0],
        { token: { holder_kind: "binding", row_id: "row-2", expected_pinned_version_id: "v1", target_version_id: "v15" }, mandate_key: "probe.alpha", status: "advanced" },
      ],
    };
    const byRung = new Map([
      ["mandate_default:row-1", verdict()],
      ["binding:row-2", verdict({ holder_kind: "binding", row_id: "row-2", apply_token: { holder_kind: "binding", row_id: "row-2", expected_pinned_version_id: "v1", target_version_id: "v15" } })],
    ]);
    const { title, moves } = describeRevert(revertableRows(bindingReport), "batch", byRung);
    expect(title).toBe("Put 2 pins back?");
    expect(moves).toEqual(["probe.alpha: v15 → v1", "probe.alpha (org binding): v15 → v1"]);
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
    expect(description).toContain("1 is green or identical with a clean settings check");
    expect(description).toContain("1 is orange or red and you are choosing to advance it anyway");
    expect(description).toContain("put back for 72 hours");
  });

  it("a green row whose settings check found something is its own line, never 'green or identical' (D7)", () => {
    const warned = verdict({
      row_id: "row-3",
      mandate_key: "probe.gamma",
      settings_drift: { keys: [], capability: [], capability_checked: false },
    });
    const { description, moves } = describeAdvance([warned], { state: "known", hours: 72 });
    expect(description).not.toContain("green or identical");
    expect(description).toContain("1 is low-risk but the settings check found something (or could not run) and you are choosing to advance it anyway");
    expect(moves[0]).toContain("· settings unmeasured");
  });

  it("speaks in the singular for one pin (D9)", () => {
    const { description } = describeAdvance([verdict()], { state: "known", hours: 72 });
    expect(description).toMatch(/^This moves 1 mandate pin from the version it runs now to the newest saved version of its agent — every run of that job/);
  });

  it("is honest when the window could not be read", () => {
    expect(revertWindowSentence({ state: "unknown", why: "offline" })).toContain(
      "could not read the platform default (offline)",
    );
  });
});
