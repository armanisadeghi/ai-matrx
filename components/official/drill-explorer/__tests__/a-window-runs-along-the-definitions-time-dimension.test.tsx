/**
 * A WINDOW RUNS ALONG THE DEFINITION'S OWN TIME DIMENSION (lane DRILL-LIVE-FIX-2 #1; live verifier on
 * release 13e0b6fafe): /administration/users/acquisition's explorer refused every ask with 400 "A window
 * runs along a time dimension, and "at" is not one." — user_acquisition's time is `created_at`, and the
 * explorer hard-coded "at" in every window it sent (the answer, the chart, the glance columns, the
 * findings, the records, the reconciliation). The key now comes from the definition (describe).
 * Red on HEAD: the answer's asks carried window.key "at".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/components/official/InfoHint", () => ({ InfoHint: ({ text }: { text: string }) => <i data-hint={text} /> }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

type Asked = { source: unknown; question: Record<string, unknown> };
const asked: Asked[] = [];
const fakeClient = {
  drillDescribe: jest.fn(async () => ({ ok: true, data: DEF })),
  drillAsk: jest.fn(async (q: Asked) => {
    asked.push(q);
    return { ok: true, data: { rows: [], says: [], total: null, as_of: null } };
  }),
};
jest.mock("@ai-matrx/records/core", () => ({ ...jest.requireActual("@ai-matrx/records/core"), createRecordsClient: () => fakeClient }));
jest.mock("@ai-matrx/records-ui", () => ({ personActor: () => ({}), recordsDataSource: () => ({}) }));

const DEF = {
  key: "user_acquisition",
  label: "User acquisition",
  mode: "definer",
  grain: "one row per acquired identity",
  dimensions: [
    { key: "traffic_kind", label: "Traffic", from: "traffic_kind", kind: "choice" },
    { key: "created_at", label: "Arrived", from: "created_at", kind: "time", grains: ["day", "week", "month"] },
  ],
  measures: [{ key: "people", label: "People", op: "count", unit: "count" }],
  paths: [],
  default: { by: ["traffic_kind"], show: ["people"] },
};

import { doorWindow, drillWindowKey, useDrillExplorer } from "../useDrillExplorer";

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

function Probe() {
  useDrillExplorer({
    source: { kind: "entity", token: "user_acquisition" },
    lane: "platform",
    organizationId: "39c38960-d30c-4840-b0c1-c9960de95582",
    userId: "87a6e699-3622-4869-8843-d0867456c0dd",
    question: { by: ["traffic_kind"], show: ["people"], where: [], window: "30d" },
  });
  return null;
}

describe("every ask the explorer sends runs its window along the definition's time Dimension", () => {
  it("user_acquisition (time = created_at): no ask names 'at'", async () => {
    await act(async () => root.render(<Probe />));
    await act(async () => {});
    expect(asked.length).toBeGreaterThan(0);
    for (const a of asked) expect((a.question.window as { key?: string } | undefined)?.key).toBe("created_at");
  });
});

describe("drillWindowKey", () => {
  it("the question's declared key wins; else the definition's 'at'; else its first time Dimension; none = no window", () => {
    const dims = [
      { key: "x", kind: "choice" },
      { key: "created_at", kind: "time" },
      { key: "at", kind: "time" },
    ];
    expect(drillWindowKey(dims, { windowKey: "last_seen" })).toBe("last_seen");
    expect(drillWindowKey(dims)).toBe("at");
    expect(drillWindowKey(dims.slice(0, 2))).toBe("created_at");
    expect(drillWindowKey([{ key: "x", kind: "choice" }])).toBeNull();
    expect(doorWindow({ by: [], show: [], where: [], window: "30d" }, { key: null })).toEqual({});
  });
});
