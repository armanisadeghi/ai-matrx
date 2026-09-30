/**
 * THE EXPLORER'S CONTRACT HALF (lane DRILL-EXPLORER): what it reads from `platform.drill_describe`
 * when the contract carries built-in views, findings and records, how a declared question becomes
 * an address question, and the Saved-view save path — unit-tested here because the browser walk
 * runs on the live database and never saves a view there.
 *
 * The data: the `ai_usage` definition as the door describes it (Dimensions person / model / at).
 */
import type { DrillDefinition } from "@ai-matrx/records";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { saveDrillView, drillSavedViewSurface, drillQuestionJson } from "../savedViews";
import { withAutoGrain, drillExplorerAutoGrain } from "../grain";
import { asOfAnswer, builtInViewsOf, explorerQuestionOf, findingQuestion, findingsOf, recordsOf, staleAfterKnobOf } from "../types";

const DEF = {
  key: "ai_usage",
  label: "AI usage",
  source: { kind: "entity", token: "ai_usage" },
  grain: "one row per hour, organization, person, model",
  lanes: ["platform", "organization", "mine"],
  dimensions: [
    { key: "person", label: "Person", from: "user_id", kind: "relation" },
    { key: "model", label: "Model", from: "model", kind: "choice" },
    { key: "at", label: "When", from: "bucket", kind: "time", grains: ["hour", "day", "week", "month"] },
  ],
  measures: [{ key: "cost", label: "Cost", op: "sum", of: "cost", unit: "usd", additive: true }],
  paths: [],
  detail: { columns: [] },
  default: { by: ["person"], show: ["cost"], sort: { key: "cost", direction: "desc" }, window: { preset: "30d" } },
} as unknown as DrillDefinition;

describe("the contract additions are optional", () => {
  it("reads nothing when describe does not carry them (today's door)", () => {
    expect(builtInViewsOf(DEF)).toEqual([]);
    expect(findingsOf(DEF)).toEqual([]);
    expect(recordsOf(DEF)).toBeNull();
    expect(staleAfterKnobOf(DEF)).toBeNull();
    expect(asOfAnswer({ rows: [], says: [], total: null })).toBeNull();
  });

  it("reads built-in views, findings, records and the stale knob when it does, dropping malformed entries", () => {
    const def = {
      ...DEF,
      views: [
        { key: "by_model", label: "Spend by model", question: { by: ["model"], show: ["cost"] } },
        { key: "broken", label: "No question" },
      ],
      findings: [{ key: "hogs", label: "Conversations that ate the budget", question: { by: ["person"], show: ["cost"], having: [{ measure: "cost", op: ">=", share_of_total: 0.1, knob: "drill.finding.ai_usage.hogs.hog_share_pct" }] }, knobs: { hog_share_pct: { default: 10, label: "Share of the window", unit: "%" } } }],
      records: { fact: "ai_usage_executions", columns: ["created_at", "person", "model", "cost"] },
      stale_after_knob: "drill.usage.stale_after_minutes",
    } as unknown as DrillDefinition;
    expect(builtInViewsOf(def).map((v) => v.key)).toEqual(["by_model"]);
    expect(findingsOf(def)[0]!.question.having?.[0]?.knob).toBe("drill.finding.ai_usage.hogs.hog_share_pct");
    expect(recordsOf(def)).toEqual({ fact: "ai_usage_executions", columns: ["created_at", "person", "model", "cost"] });
    expect(staleAfterKnobOf(def)).toBe("drill.usage.stale_after_minutes");
    expect(asOfAnswer({ rows: [{ as_of: "2026-09-30T05:00:00Z" } as never], says: [], total: null })).toBe("2026-09-30T05:00:00Z");
  });
});

describe("a declared question becomes the address's question", () => {
  it("carries the grouping, equality crumbs, a preset or day range, the comparison and the sort", () => {
    expect(explorerQuestionOf(DEF.default)).toEqual({ by: ["person"], show: ["cost"], where: [], window: "30d", sort: { key: "cost", direction: "desc" } });
    expect(
      explorerQuestionOf({
        by: ["model"],
        show: ["cost", { op: "sum", of: "tokens_in" }],
        where: { provider: "anthropic", person: null, origin: ["chat", "api"] },
        window: { from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z" },
        compare: { against: "previous_period" },
      }),
    ).toEqual({
      by: ["model"],
      show: ["cost"],
      where: [
        { dim: "provider", value: "anthropic" },
        { dim: "person", value: null },
      ],
      window: "2026-09-01..2026-09-30",
      compare: "previous_period",
    });
  });

  it("a finding without its own window is asked in the explorer's", () => {
    const f = { key: "spikes", label: "Hours that spiked", question: { by: ["at:hour"], show: ["cost"] } };
    expect(findingQuestion(f, { by: [], show: [], where: [], window: "7d" }).window).toBe("7d");
    expect(findingQuestion({ ...f, question: { ...f.question, window: { preset: "24h" } } }, { by: [], show: [], where: [], window: "7d" }).window).toBe("24h");
  });

  it("a time group with no grain reads at the grain its window reads best at", () => {
    expect(drillExplorerAutoGrain("30d")).toBe("day");
    expect(drillExplorerAutoGrain("365d")).toBe("week");
    expect(drillExplorerAutoGrain(null)).toBe("month");
    expect(withAutoGrain(DEF, { by: ["at", "model"], across: "at", show: ["cost"], where: [], window: "365d" })).toMatchObject({ by: ["at:week", "model"], across: "at:week" });
    expect(withAutoGrain(DEF, { by: ["at:month"], show: ["cost"], where: [], window: "30d" }).by).toEqual(["at:month"]);
  });
});

describe("saving a question as the person's own Saved view", () => {
  beforeEach(() => rpc.mockReset());

  it("writes through saved_view_save on the definition's surface, personal, the question as the address carries it", async () => {
    rpc.mockResolvedValue({ error: null });
    const question = { by: ["model"], show: ["cost"], where: [{ dim: "person", value: "7d1f3c2e-0000-4000-8000-000000000001" }], window: "90d", sort: { key: "cost", direction: "desc" as const } };
    const done = await saveDrillView({ surfaceKey: drillSavedViewSurface("ai_usage"), organizationId: "org-1", name: "  One person's models, 90 days ", question });
    expect(done).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("saved_view_save", {
      p_surface_key: "drill/ai_usage",
      p_organization_id: "org-1",
      p_name: "One person's models, 90 days",
      p_definition: { question: drillQuestionJson(question) },
      p_visibility: "personal",
      p_touch: true,
    });
    expect(drillQuestionJson(question)).toEqual({ by: ["model"], show: ["cost"], where: [{ dim: "person", value: "7d1f3c2e-0000-4000-8000-000000000001" }], window: "90d", sort: { key: "cost", direction: "desc" } });
  });

  it("says a duplicate name in words", async () => {
    rpc.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const done = await saveDrillView({ surfaceKey: "drill/ai_usage", organizationId: "org-1", name: "Spend by model", question: { by: ["model"], show: ["cost"], where: [] } });
    expect(done).toEqual({ ok: false, message: 'You already have a view called "Spend by model"' });
  });
});
