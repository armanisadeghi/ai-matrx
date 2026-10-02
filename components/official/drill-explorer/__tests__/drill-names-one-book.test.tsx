/**
 * EVERY ID ON THE EXPLORER IS NAMED THROUGH ONE BOOK (lane DRILL-D1; VERIFY-DRILL-FINAL "Deployed
 * re-verify" D1).
 *
 * Production, 2026-10-01: on /administration/usage?def=ai_usage_executions (7 days) 20 of 31 Findings
 * rows ("Requests that looped", "Spent and got nothing back", "Repeat bursts", "Model calls with no
 * price") read "Reading the name…" forever — after the panel opened only `drill_ask` was sent; the
 * names door was never asked for the findings' request and person ids. The rows the answer had
 * already named (conversations) were the only ones that read.
 *
 * The data: the AI usage by execution explorer grouped by source, an admin opening Findings. One
 * request looped through 14 model calls in "Quarterly vendor review"; a second request's record is
 * gone (the names door answers without it); a conversation ate 31% of the window; one person sent
 * six requests in ten minutes. Break it names: a finding row whose id never reaches the host's
 * resolver, a resolver asked for ids not on screen, a name that never stops loading after the door
 * answered, or a conversation finding whose door label is thrown away.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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
    MatrxDrillAnswerTable: () => <div data-answer-stand-in="" />,
    MatrxDrillTrail: () => null,
    MatrxDrillWindowMenu: () => null,
    MatrxDrillMeasurePicker: () => null,
    MatrxDrillGroupByMenu: () => null,
  };
});
jest.mock("@ai-matrx/design-system/data-table/drill-chart", () => ({ MatrxDrillChart: () => null }));
jest.mock("../DrillSavedViews", () => ({ DrillSavedViews: () => null }));
jest.mock("../DrillRecords", () => ({ DrillRecords: () => null }));
jest.mock("../DrillExplainButton", () => ({ DrillExplainButton: () => null }));
jest.mock("../savedViews", () => ({ drillSavedViewSurface: (k: string) => `drill/${k}`, readDrillView: jest.fn(async () => null) }));
jest.mock("../useDrillKnobs", () => ({
  ...jest.requireActual("../useDrillKnobs"),
  useDrillKnobs: () => ({ settled: true, chartTopN: 10, paretoSharePct: 80, pivotColumns: 24, grainLines: null, unread: [] }),
  useDrillStaleAfter: () => ({ minutes: null, unread: null }),
}));
jest.mock("../useDrillChart", () => ({ useDrillChart: () => ({ answers: {}, error: null }) }));

const REQ_LOOPED = "0b9f1c2e-6a4d-4f3b-8e21-5c7d9a0b1e2f";
const REQ_GONE = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const CONVO = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
const PERSON = "87a6e699-3622-4869-8843-d0867456c0dd";

const DEF = {
  key: "ai_usage_executions",
  label: "AI usage by execution",
  mode: "definer",
  dimensions: [
    { key: "source", label: "Source", from: "source", kind: "choice", choices: [{ value: "conversation", label: "Conversation turn" }] },
    { key: "conversation", label: "Conversation", from: "conversation_id", kind: "relation" },
    { key: "request", label: "Request", from: "request_id", kind: "relation" },
    { key: "person", label: "Person", from: "person_id", kind: "relation" },
    { key: "bucket_10m", label: "Ten minutes (UTC)", from: "bucket_10m", kind: "choice" },
    { key: "has_request", label: "Has a request", from: "has_request", kind: "boolean" },
    { key: "at", label: "When", from: "created_at", kind: "time", grains: ["day", "hour"] },
  ],
  measures: [
    { key: "cost", label: "Cost", op: "sum", of: "cost", unit: "usd", additive: true },
    { key: "iterations", label: "Model calls", op: "sum", of: "iterations", unit: "count", additive: true },
    { key: "distinct_requests", label: "Requests", op: "count_distinct", of: "request_id", unit: "count" },
  ],
  paths: [],
  findings: [
    { key: "looped", label: "Requests that looped", question: { by: ["request"], where: { has_request: true }, show: ["cost", "iterations"], sort: { key: "cost", direction: "desc" } }, knobs: {} },
    { key: "hogs", label: "Conversations that ate the window", question: { by: ["conversation"], show: ["cost"], sort: { key: "cost", direction: "desc" } }, knobs: {} },
    { key: "bursts", label: "Repeat bursts", question: { by: ["person", "bucket_10m"], where: { has_request: true }, show: ["cost", "distinct_requests"], sort: { key: "cost", direction: "desc" } }, knobs: {} },
  ],
  default: { by: ["source"], show: ["cost"] },
};

type Asked = { question: { by: string[] } & Record<string, unknown> };
const fakeClient = {
  drillDescribe: jest.fn(async () => ({ ok: true, data: DEF })),
  drillAsk: jest.fn(async (q: Asked) => {
    const by = q.question.by;
    const page = (rows: unknown[]) => ({ ok: true, data: { rows, says: [], total: null, as_of: null } });
    if (by[0] === "request") {
      return page([
        { kind: "group", groups: { request: REQ_LOOPED }, measures: { cost: 4.2, iterations: 14 }, row_count: 14 },
        { kind: "group", groups: { request: REQ_GONE }, measures: { cost: 1.1, iterations: 11 }, row_count: 11 },
      ]);
    }
    if (by[0] === "conversation") {
      return page([{ kind: "group", groups: { conversation: CONVO }, labels: { conversation: "Quarterly vendor review" }, measures: { cost: 9.3 }, row_count: 40 }]);
    }
    if (by[0] === "person") {
      return page([{ kind: "group", groups: { person: PERSON, bucket_10m: "2026-09-28T02:30:00Z" }, measures: { cost: 0.8, distinct_requests: 6 }, row_count: 6 }]);
    }
    if (by.length === 0) return page([{ kind: "total", groups: {}, measures: { cost: 30 }, row_count: 100 }]);
    return page([{ kind: "group", groups: { source: "conversation" }, measures: { cost: 30 }, row_count: 100 }]);
  }),
};
jest.mock("@ai-matrx/records/core", () => ({ ...jest.requireActual("@ai-matrx/records/core"), createRecordsClient: () => fakeClient }));
jest.mock("@ai-matrx/records-ui", () => ({ personActor: () => ({}), recordsDataSource: () => ({}) }));

import { DrillExplorer } from "../DrillExplorer";
import type { DrillNameResolver } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asked: Record<string, string[][]> = { request: [], person: [] };
const resolvers: Record<string, DrillNameResolver> = {
  // the names door answers the request it holds and leaves out the one whose record is gone
  request: {
    missingLabel: "Reading the name…",
    resolve: async (ids) => {
      asked.request!.push([...ids].sort());
      const names: Record<string, string> = ids.includes(REQ_LOOPED) ? { [REQ_LOOPED]: "Quarterly vendor review · Sep 28, 2:31 AM UTC" } : {};
      return { ok: true, names };
    },
  },
  person: {
    missingLabel: "Reading the name…",
    resolve: async (ids) => {
      asked.person!.push([...ids].sort());
      return { ok: true, names: Object.fromEntries(ids.map((id) => [id, "admin@admin.com"])) };
    },
  },
};

describe("Findings rows are named through the explorer's one name book", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    asked.request = [];
    asked.person = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.pushState({}, "", "/administration/usage?def=ai_usage_executions&by=source&w=7d");
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    window.history.pushState({}, "", "/");
  });

  it("asks the host's resolver for exactly the finding rows' ids and never keeps a row loading", async () => {
    await act(async () => {
      root.render(
        <DrillExplorer
          source={{ kind: "entity", token: "ai_usage_executions" }}
          lane="platform"
          organizationId="00000000-0000-0000-0000-000000000001"
          title="AI usage"
          rootLabel="All usage"
          names={resolvers}
          rowNoun="execution"
        />,
      );
    });
    await act(async () => {});
    await act(async () => (document.querySelector("[data-drill-explorer-findings]") as HTMLButtonElement).click());
    for (let i = 0; i < 5; i += 1) await act(async () => {});

    const rows = (key: string) => [...document.querySelectorAll(`[data-drill-explorer-finding="${key}"] [data-drill-explorer-finding-row]`)].map((b) => b.textContent ?? "");
    expect(rows("looped")[0]).toContain("Quarterly vendor review · Sep 28, 2:31 AM UTC");
    // the door answered without the second request: it reads as unread words, never a loading state
    expect(rows("looped")[1]).not.toMatch(/Reading the name/);
    expect(rows("looped")[1]).not.toContain(REQ_GONE.slice(0, 8));
    expect(rows("hogs")[0]).toContain("Quarterly vendor review");
    expect(rows("bursts")[0]).toContain("admin@admin.com");
    expect(document.body.textContent).not.toMatch(/Reading the name/);
    // exactly the ids on screen, each asked once
    expect(asked.request!.flat().sort()).toEqual([REQ_LOOPED, REQ_GONE].sort());
    expect(asked.person!.flat()).toEqual([PERSON]);
  });
});

