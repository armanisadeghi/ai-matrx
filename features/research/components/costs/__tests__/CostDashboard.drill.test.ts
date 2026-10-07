import {
  drillAnswerLocally,
  drillConfigFromColumns,
  drillLevelProblems,
  emptyDrillQuestion,
} from "@ai-matrx/design-system/data-table";
import { buildTopicCostLedger, type CostLedgerInput } from "../../../costs";
import { LEDGER_COLUMNS, ledgerDrill, toLedgerRow } from "../CostDashboard";

// The canonical token_usage shape: { total, by_model } (lib/token-usage/normalize.ts).
const usage = (model: string, api: string, inp: number, out: number, cost: number) => ({
  total: { input_tokens: inp, output_tokens: out, total_tokens: inp + out, total_requests: 1, total_cost: cost },
  by_model: { [model]: { input_tokens: inp, output_tokens: out, cost, api, request_count: 1 } },
});

const row = (id: string, status: string, token_usage: unknown, at: string) => ({
  id,
  agent_type: "page_summary",
  agent_id: null,
  model_id: null,
  status,
  created_at: at,
  token_usage,
});

const input: CostLedgerInput = {
  analyses: [
    row("a1", "success", usage("gemini-flash", "google", 1000, 100, 0.01), "2026-07-26T10:00:00Z"),
    row("a2", "success", usage("gemini-flash", "google", 2000, 200, 0.02), "2026-07-26T11:00:00Z"),
    // A failed call burned tokens, but the page's rollups do not bill it.
    row("a3", "failed", usage("gemini-flash", "google", 500, 0, 0.005), "2026-07-27T11:00:00Z"),
  ],
  syntheses: [
    { ...row("s1", "success", usage("claude-opus", "anthropic", 5000, 700, 0.5), "2026-07-27T12:00:00Z"), scope: "topic", keyword_id: null, tag_id: null },
  ],
  documents: [],
};

describe("research cost drill (levels read the page's own totals)", () => {
  const ledger = buildTopicCostLedger(input);
  const rows = ledger.entries.map(toLedgerRow);
  const config = drillConfigFromColumns(LEDGER_COLUMNS, rows, ledgerDrill((usd) => String(usd)));

  it("declares only levels the Dimensions and Measures can honour", () => {
    expect(drillLevelProblems(config.dimensions, config.measures, { attributeKeys: config.fields?.map((f) => f.key) })).toEqual([]);
  });

  it("offers phase, agent type, model and status as Dimensions", () => {
    const keys = config.dimensions.map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining(["phaseLabel", "agentType", "models", "status", "created-at"]));
  });

  it("a phase's groups equal the phase rollup the page used to print by hand", () => {
    const question = { ...emptyDrillQuestion(["sum_billedCalls", "sum_billedIn", "sum_billedOut", "sum_billedCost"]), by: ["phaseLabel"] };
    const answers = drillAnswerLocally(rows, question, config);
    const groups = (answers.phaseLabel ?? []) as unknown as {
      groups: { phaseLabel: string };
      measures: Record<string, number>;
    }[];
    for (const phase of ledger.phases.filter((p) => p.calls > 0)) {
      const g = groups.find((x) => x.groups.phaseLabel === phase.label);
      if (!g) throw new Error(`no group for ${phase.label}`);
      expect(g.measures.sum_billedCalls).toBe(phase.calls);
      expect(g.measures.sum_billedIn).toBe(phase.input_tokens);
      expect(g.measures.sum_billedOut).toBe(phase.output_tokens);
      expect(g.measures.sum_billedCost).toBeCloseTo(phase.estimated_cost_usd, 6);
    }
  });

  it("does not bill a failed call, and counts it as failed", () => {
    const failed = rows.find((r) => r.id === "a3");
    if (!failed) throw new Error("fixture row a3 missing");
    expect(failed.billedCalls).toBe(0);
    expect(failed.billedCost).toBe(0);
    expect(failed.failed).toBe(1);
  });
});
