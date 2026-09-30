/**
 * THE EXPLORER ADOPTS THE PUBLISHED PACKAGES (lane DRILL-ADOPT; PROGRESS-DRILL-EXPLORER "After publish";
 * VERIFY-DRILL-WAVE2 W2-1, W2-3, W2-5).
 *
 * The data: the AI usage explorer, last 30 days by provider, admin@admin.com drilled into one person,
 * with the built-in Saved view "Anthropic and OpenAI by model" open from its link.
 *
 * Break it names: the chart missing above the answer, or not fed the knob's Top N / the auto grain;
 * the answer not given the Pareto share, the pivot cap, row actions, export or coverage; the unit switch
 * saying "Credits" while the cells say points; Explain this leaving out the open view's conditions;
 * a knob that cannot be read going unsaid; the reconciliation words not built from the two numbers.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DrillDefinition } from "@ai-matrx/records";

const captured: { table?: Record<string, unknown>; chart?: Record<string, unknown>; explain?: Record<string, unknown>; reconcile?: Record<string, unknown> } = {};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel({}),
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/components/cost/costUnit", () => ({ selectCostUnit: () => "points", selectCanToggleCostUnit: () => true }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "87a6e699-3622-4869-8843-d0867456c0dd" }));
jest.mock("@/lib/redux/preferences/userPreferencesSlice", () => ({ setModulePreferences: (p: unknown) => ({ type: "prefs", payload: p }) }));
jest.mock("@/lib/knobs/featureKnobs", () => ({ knobNumber: jest.fn(async () => 20) }));
jest.mock("@/components/navigation/AppLink", () => ({ __esModule: true, default: ({ children }: { children: unknown }) => <a>{children as never}</a> }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

jest.mock("@ai-matrx/design-system/data-table", () => {
  const actual = jest.requireActual("@ai-matrx/design-system/data-table");
  return {
    ...actual,
    MatrxDrillAnswerTable: (p: Record<string, unknown>) => {
      captured.table = p;
      return <div data-answer-stand-in="">{p.note as never}</div>;
    },
    MatrxDrillTrail: () => null,
    MatrxDrillWindowMenu: () => null,
    MatrxDrillMeasurePicker: () => null,
    MatrxDrillGroupByMenu: () => null,
  };
});
jest.mock("@ai-matrx/design-system/data-table/drill-chart", () => ({
  MatrxDrillChart: (p: Record<string, unknown>) => {
    captured.chart = p;
    return <div data-chart-stand-in="" />;
  },
}));
jest.mock("../DrillSavedViews", () => ({ DrillSavedViews: () => null }));
jest.mock("../DrillFindings", () => ({ DrillFindings: () => null }));
jest.mock("../DrillRecords", () => ({ DrillRecords: () => null }));
jest.mock("../DrillExplainButton", () => ({
  DrillExplainButton: ({ input }: { input: Record<string, unknown> }) => {
    captured.explain = input;
    return null;
  },
}));
jest.mock("../savedViews", () => ({ drillSavedViewSurface: (k: string) => `drill/${k}`, readDrillView: jest.fn(async () => null) }));
jest.mock("../useDrillKnobs", () => ({
  ...jest.requireActual("../useDrillKnobs"),
  useDrillKnobs: () => ({
    settled: true,
    chartTopN: 10,
    paretoSharePct: 80,
    pivotColumns: 24,
    grainLines: null,
    says: ["The setting drill.auto_grain.hour_max_days could not be read (Missing feature knob), so time reads at the package's own grain lines."],
  }),
}));
jest.mock("../useDrillChart", () => ({ useDrillChart: () => ({ answers: {}, error: null }) }));
jest.mock("../useDrillReconcile", () => ({
  ...jest.requireActual("../useDrillReconcile"),
  useDrillReconcile: (args: Record<string, unknown>) => {
    captured.reconcile = args;
    return { state: "counted", label: "AI model calls", value: 1500 };
  },
}));

const DEF = {
  key: "ai_usage",
  label: "AI usage",
  dimensions: [
    { key: "person", label: "Person", from: "person_id", kind: "relation" },
    { key: "provider", label: "Provider", from: "provider", kind: "choice" },
    { key: "model", label: "Model", from: "model", kind: "choice" },
    { key: "at", label: "When", from: "bucket", kind: "time", grains: ["hour", "day", "week", "month"] },
  ],
  measures: [
    { key: "cost", label: "Cost", op: "sum", of: "cost", unit: "usd", additive: true },
    { key: "requests", label: "Requests", op: "sum", of: "requests", unit: "count", additive: true },
  ],
  paths: [],
  views: [{ key: "big_two", label: "Anthropic and OpenAI by model", question: { by: ["model"], show: ["cost"], where: { provider: ["anthropic", "openai"] } } }],
} as unknown as DrillDefinition;

const total = { groups: {}, measures: { cost: 2000, requests: 10 }, row_count: 10 };
jest.mock("../useDrillExplorer", () => {
  const actual = jest.requireActual("../useDrillExplorer");
  return {
    ...actual,
    useDrillExplorer: () => ({
      def: DEF,
      answers: { "∅": [total], provider: [{ groups: { provider: "anthropic" }, measures: { cost: 1200, requests: 6 }, row_count: 6 }] },
      whole: { groups: {}, measures: { cost: 4000, requests: 20 }, row_count: 20 },
      names: {},
      says: [],
      error: null,
      asOf: null,
      client: {},
    }),
  };
});

import { DrillExplorer } from "../DrillExplorer";
import { drillKnobsOf } from "../useDrillKnobs";
import { drillReconcileSentence } from "../useDrillReconcile";
import { formatPoints } from "@ai-matrx/kit/format";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the explorer on the published packages", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.pushState({}, "", "/administration/usage?by=provider&f.person=87a6e699-3622-4869-8843-d0867456c0dd&w=30d&view=builtin:big_two");
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    window.history.pushState({}, "", "/");
  });

  const mount = async () => {
    await act(async () => {
      root.render(
        <DrillExplorer
          source={{ kind: "entity", token: "ai_usage" }}
          lane="platform"
          organizationId="00000000-0000-0000-0000-000000000001"
          title="AI usage"
          rootLabel="All usage"
          headline={{ measure: "cost" }}
          rowNoun="request"
          location="Administration › AI usage"
          reconcile={{ source: { kind: "entity", token: "ai_calls" }, measure: "cost", shared: ["organization", "person", "agent", "at"] }}
        />,
      );
    });
  };

  it("draws the chart above the answer, fed the knob's Top N and the window's grain", async () => {
    await mount();
    const chart = host.querySelector("[data-chart-stand-in]");
    const answer = host.querySelector("[data-answer-stand-in]");
    expect(chart).not.toBeNull();
    expect(chart!.compareDocumentPosition(answer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(captured.chart).toMatchObject({ seriesLimit: 10, time: "at:day", measure: "cost" });
    expect((captured.chart!.question as { by: string[] }).by).toEqual(["provider"]);
  });

  it("hands the answer the Pareto share, the pivot cap, row actions, export and coverage", async () => {
    await mount();
    expect(captured.table).toMatchObject({
      pareto: { measure: "cost", sharePct: 80 },
      pivotColumnCap: 24,
      rowActions: { label: "AI usage group", location: "Administration › AI usage", kind: "drill-group", selectable: true },
      exportTitle: "AI usage",
      coverage: { whole: 4000, measure: "cost" },
    });
  });

  it("the unit switch says Points, the word every cost cell prints", async () => {
    await mount();
    expect(host.querySelector('[data-drill-explorer-unit="points"]')?.textContent).toBe("Points");
  });

  it("an address naming a Saved view reopens it whole, and Explain this carries its conditions", async () => {
    await mount();
    await act(async () => {});
    const conditions = captured.explain!.conditions as string[];
    expect(conditions[0]).toBe('Saved view "Anthropic and OpenAI by model" is open.');
    expect(conditions.join(" ")).toMatch(/Provider is anthropic or openai/);
    expect(host.querySelector("[data-drill-explorer-carried]")?.textContent).toMatch(/Anthropic and OpenAI by model/);
  });

  it("says a knob it could not read, and the reconciliation in words from the two numbers", async () => {
    await mount();
    expect(host.querySelector("[data-drill-explorer-knob-said]")?.textContent).toMatch(/drill\.auto_grain\.hour_max_days could not be read/);
    expect(host.querySelector("[data-drill-explorer-reconcile]")?.textContent).toMatch(/of these .* are AI model calls; .* is spend with no AI model call behind it\./);
    expect(captured.reconcile).toMatchObject({ lane: "platform" });
  });
});

describe("the explorer's settings and words", () => {
  it("reads every knob it can and says each one it cannot, the grain lines once", () => {
    const ok = (value: number) => ({ ok: true as const, value });
    const no = { ok: false as const, message: "Missing feature knob drill.chart top_n" };
    expect(drillKnobsOf([ok(10), ok(80), ok(24), ok(2), ok(90), ok(366)])).toEqual({
      chartTopN: 10, paretoSharePct: 80, pivotColumns: 24, grainLines: { hourMaxDays: 2, dayMaxDays: 90, weekMaxDays: 366 }, says: [],
    });
    const some = drillKnobsOf([no, ok(80), ok(24), no, no, ok(366)]);
    expect(some.chartTopN).toBeNull();
    expect(some.grainLines).toBeNull();
    expect(some.says).toHaveLength(2);
    expect(some.says[0]).toBe("The setting drill.chart.top_n is not on this database yet, so the chart draws the package's 10 series before Other.");
  });

  it("builds the reconciliation from the measured parts", () => {
    const f = (v: number) => formatPoints(v);
    expect(drillReconcileSentence(2000, 1500, "AI model calls", f)).toBe("1,500 points of these 2,000 points are AI model calls; 500 points (25%) is spend with no AI model call behind it.");
    expect(drillReconcileSentence(2000, 2100, "Model calls", f)).toMatch(/^The model calls count 2,100 points, 100 points more than these 2,000 points/);
  });
});
