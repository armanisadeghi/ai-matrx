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
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/components/cost/costUnit", () => ({ selectCostUnit: () => "points", selectCanToggleCostUnit: () => true }));
// the points rate is the billing.points_per_usd knob (subscribed since lane DRILL-CLOSE); pinned here
jest.mock("@/components/cost/pointsRate.client", () => ({ usePointsRate: () => 20_000 }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "87a6e699-3622-4869-8843-d0867456c0dd" }));
jest.mock("@/lib/redux/preferences/userPreferencesSlice", () => ({ setModulePreferences: (p: unknown) => ({ type: "prefs", payload: p }) }));
jest.mock("@/components/official/InfoHint", () => ({ InfoHint: ({ text }: { text: string }) => <i data-hint={text} /> }));
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
    unread: [{ name: "drill.auto_grain.hour_max_days", label: "Time grain", why: "no knob is registered" }],
  }),
  useDrillStaleAfter: () => ({ minutes: 20, unread: null }),
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
import { drillReconcileChip } from "../useDrillReconcile";
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

  it("follows the page's window — on mount and when the page's control moves it (DRILL-LIVE-FIX-2 #4)", async () => {
    const at = async (pageWindow: string | null) => {
      await act(async () => {
        root.render(
          <DrillExplorer source={{ kind: "entity", token: "ai_usage" }} lane="platform" organizationId="00000000-0000-0000-0000-000000000001" title="AI usage" rootLabel="All usage" headline={{ measure: "cost" }} rowNoun="request" pageWindow={pageWindow} />,
        );
      });
      await act(async () => {});
    };
    await at("7d");
    expect((captured.table!.question as { window?: string | null }).window).toBe("7d");
    await at("90d");
    expect((captured.table!.question as { window?: string | null }).window).toBe("90d");
  });

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
    const chip = host.querySelector("[data-drill-explorer-carried]");
    expect(chip?.textContent).toMatch(/^View: Anthropic and OpenAI by model/);
    expect(chip?.querySelector("[data-hint]")?.getAttribute("data-hint")).toMatch(/Provider is anthropic or openai/);
  });

  it("says a knob it could not read, and the reconciliation from the two numbers — as state, not sentences", async () => {
    await mount();
    const defaults = host.querySelector("[data-drill-explorer-knob-said]");
    expect(defaults?.textContent).toBe("Defaults");
    expect(defaults?.querySelector("[data-hint]")?.getAttribute("data-hint")).toBe("Not read: Time grain. Built-in lines in use.");
    const reconcile = host.querySelector("[data-drill-explorer-reconcile]");
    expect(reconcile?.textContent).toBe("AI model calls 75%");
    expect(reconcile?.querySelector("[data-hint]")?.getAttribute("data-hint")).toMatch(/^.+ of .+; .+ \(25%\) with no AI model call$/);
    expect(captured.reconcile).toMatchObject({ lane: "platform" });
  });

  it("F8/F9: the calendar said once as a chip, times in it; the toolbar's controls never shrink", async () => {
    await act(async () => {
      root.render(
        <DrillExplorer
          source={{ kind: "entity", token: "ai_usage" }}
          lane="platform"
          organizationId="00000000-0000-0000-0000-000000000001"
          title="AI usage"
          rootLabel="All usage"
          headline={{ measure: "cost" }}
          windowAlign="hour"
          timeZone="UTC"
        />,
      );
    });
    expect(host.querySelectorAll("[data-drill-explorer-time-zone]")).toHaveLength(1);
    expect(host.querySelector("[data-drill-explorer-time-zone]")?.textContent).toMatch(/^(· )?UTC$/);
    const controls = host.querySelector("[data-drill-explorer-controls]");
    expect(controls?.className).toMatch(/flex-wrap/);
    expect(controls?.className).toMatch(/\[&>\*\]:shrink-0/);
  });
});

describe("the explorer's settings and words", () => {
  it("reads every knob it can and names each one it cannot", () => {
    const ok = (value: number) => ({ ok: true as const, value });
    const no = { ok: false as const, message: "no knob is registered for feature='drill.chart', key='top_n'" };
    expect(drillKnobsOf([ok(10), ok(80), ok(24), ok(2), ok(90), ok(366)])).toEqual({
      chartTopN: 10, paretoSharePct: 80, pivotColumns: 24, grainLines: { hourMaxDays: 2, dayMaxDays: 90, weekMaxDays: 366 }, unread: [],
    });
    const some = drillKnobsOf([no, ok(80), ok(24), no, no, ok(366)]);
    expect(some.chartTopN).toBeNull();
    expect(some.grainLines).toBeNull();
    expect(some.unread.map((u) => u.name)).toEqual(["drill.chart.top_n", "drill.auto_grain.hour_max_days", "drill.auto_grain.day_max_days"]);
  });

  it("builds the reconciliation from the measured parts", () => {
    const f = (v: number) => formatPoints(v);
    expect(drillReconcileChip(2000, 1500, "AI model calls", f)).toEqual({ label: "AI model calls 75%", tip: "1,500 points of 2,000 points; 500 points (25%) with no AI model call" });
    expect(drillReconcileChip(2000, 2100, "Model calls", f).tip).toMatch(/^2,100 points of 2,000 points: 100 points more than the ledger holds$/);
  });
});

// The stale line's setting address (lane DRILL-PRESETS-RETIRE found the first-dot split) is now the
// explorer's one knob rule: drill-live-fixes.test.tsx, "F1".
