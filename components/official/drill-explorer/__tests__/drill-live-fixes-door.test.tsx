/**
 * THE LIVE WALK'S DOOR-SIDE FINDINGS (lane DRILL-LIVE-FIXES; VERIFY-DRILL-LIVE F5, F6, F7): what the
 * explorer ASKS the door and how it reads the answer, against a stand-in door answering as production
 * did on 2026-09-30.
 *
 *   F5 "Hours that spiked": the door lists 100 hours and says 120 meet the rule (`distinct_groups`).
 *   F6 the KG built-in view "What a successful run costs" shows no cost Measure — the header still asks
 *      its headline (`cost`) on the total, so the header never reads "—".
 *   F7 the admin workflow-runs explorer opened at `f.workflow=<Verification Desk>`: the rows below the
 *      crumb carry no workflow label (they are grouped by the next level), so the crumb's name is asked
 *      of the same door, grouped by workflow and filtered to that id.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/components/official/InfoHint", () => ({ InfoHint: ({ text }: { text: string }) => <i data-hint={text} /> }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

type Asked = { source: unknown; question: Record<string, unknown> };
const asked: Asked[] = [];
let answer: (q: Asked) => unknown = () => ({ ok: true, data: { rows: [], says: [], total: null, as_of: null } });
const fakeClient = {
  drillDescribe: jest.fn(async () => ({ ok: true, data: DEF })),
  drillAsk: jest.fn(async (q: Asked) => {
    asked.push(q);
    return answer(q);
  }),
};
jest.mock("@ai-matrx/records/core", () => ({ ...jest.requireActual("@ai-matrx/records/core"), createRecordsClient: () => fakeClient }));
jest.mock("@ai-matrx/records-ui", () => ({ personActor: () => ({}), recordsDataSource: () => ({}) }));

const WORKFLOW = "5f1d7c9a-2b3e-4a6f-9c8d-1e2f3a4b5c6d";
const DEF = {
  key: "workflow_runs",
  label: "Workflow runs",
  mode: "definer",
  grain: "one row per workflow run (archived runs are not counted)",
  dimensions: [
    { key: "workflow", label: "Workflow", from: "workflow_id", kind: "relation" },
    { key: "status", label: "Status", from: "status", kind: "choice" },
    { key: "at", label: "Started", from: "created_at", kind: "time", grains: ["hour", "day", "week", "month"] },
  ],
  measures: [
    { key: "runs", label: "Runs", op: "count", unit: "count" },
    { key: "cost", label: "Cost", op: "sum", of: "cost", unit: "usd" },
    { key: "p90", label: "p90", op: "percentile", of: "cost", unit: "usd" },
  ],
  paths: [],
  default: { by: ["workflow"], show: ["runs"] },
};

import { useDrillExplorer } from "../useDrillExplorer";
import { DrillFindings } from "../DrillFindings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  asked.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const held: { names?: Record<string, Record<string, string>> } = {};
function Probe(props: { show: string[]; where: Array<{ dim: string; value: string }>; by: string[]; headline: string }) {
  const got = useDrillExplorer({
    source: { kind: "entity", token: "workflow_runs" },
    lane: "platform",
    organizationId: "39c38960-d30c-4840-b0c1-c9960de95582",
    userId: "87a6e699-3622-4869-8843-d0867456c0dd",
    question: { by: props.by, show: props.show, where: props.where, window: "30d" },
    headlineMeasure: props.headline,
  });
  held.names = got.names;
  return null;
}

describe("F6 — the header asks its own headline Measure whatever the view shows", () => {
  it("a view showing only p90 still asks cost on the total", async () => {
    await act(async () => root.render(<Probe by={["status"]} show={["p90"]} where={[]} headline="cost" />));
    await act(async () => {});
    const total = asked.find((a) => (a.question.by as string[]).length === 0);
    expect(total?.question.show).toEqual(expect.arrayContaining(["p90", "cost"]));
    const groups = asked.find((a) => (a.question.by as string[])[0] === "status");
    expect(groups?.question.show).toEqual(["p90"]);
  });
});

describe("F7 — a relation crumb reads the name its rows do", () => {
  it("asks the door for the crumb's name, grouped by that Dimension and filtered to its id", async () => {
    answer = (q) => {
      const by = q.question.by as string[];
      if (by[0] === "workflow") {
        return { ok: true, data: { rows: [{ kind: "group", groups: { workflow: WORKFLOW }, labels: { workflow: "Verification Desk" }, measures: { runs: 12 }, row_count: 12 }], says: [], total: null, as_of: null } };
      }
      return { ok: true, data: { rows: [{ kind: "group", groups: { status: "failed" }, labels: {}, measures: { runs: 3 }, row_count: 3 }], says: [], total: null, as_of: null } };
    };
    await act(async () => root.render(<Probe by={["status"]} show={["runs"]} where={[{ dim: "workflow", value: WORKFLOW }]} headline="runs" />));
    await act(async () => {});
    await act(async () => {});
    const nameAsk = asked.find((a) => (a.question.by as string[])[0] === "workflow");
    expect(nameAsk?.question).toMatchObject({ by: ["workflow"], where: { workflow: [WORKFLOW] }, lane: "platform", limit: 1 });
    expect(nameAsk?.question.show).toEqual(["runs"]);
    expect(held.names?.workflow?.[WORKFLOW]).toBe("Verification Desk");
  });
});

describe("F5 — a finding past the group cap says so", () => {
  it("the badge is the door's true count; 'and N more' counts from it; the tooltip says what the list holds", async () => {
    const hours = Array.from({ length: 100 }, (_, i) => ({
      kind: "group",
      groups: { "at:hour": `2026-09-${String(1 + (i % 28)).padStart(2, "0")} ${String(i % 24).padStart(2, "0")}:00` },
      measures: { cost: 100 - i },
      row_count: 1,
      distinct_groups: 120,
    }));
    const client = { drillAsk: jest.fn(async () => ({ ok: true, data: { rows: [...hours, { kind: "other", groups: null, measures: { cost: 5 }, row_count: 20, distinct_groups: 120 }], says: [], total: null, as_of: null } })) };
    await act(async () =>
      root.render(
        <DrillFindings
          client={client as never}
          source={{ kind: "entity", token: "ai_usage" }}
          lane="platform"
          findings={[{ key: "spikes", label: "Hours that spiked", question: { by: ["at:hour"], show: ["cost"] }, knobs: {} } as never]}
          question={{ by: ["person"], show: ["cost"], where: [], window: "30d" }}
          dimensions={[{ key: "at", label: "When", kind: "time" }]}
          measures={[{ key: "cost", label: "Cost", additive: true }]}
          paths={[]}
          emptyLabel="None"
          onOpen={() => {}}
        />,
      ),
    );
    await act(async () => (document.querySelector("[data-drill-explorer-findings]") as HTMLButtonElement).click());
    await act(async () => {});
    const finding = document.querySelector('[data-drill-explorer-finding="spikes"]')!;
    expect(finding.querySelector("[data-drill-explorer-finding-count]")?.textContent).toBe("120");
    expect(finding.querySelector("[data-hint]")?.getAttribute("data-hint")).toBe("120 groups meet the rule; the list holds the top 100.");
    expect(finding.textContent).toMatch(/and 115 more/);
  });
});
