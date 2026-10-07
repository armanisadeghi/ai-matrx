// ChartView hands its view's filters and sort to its data request — not just the helper functions.
// The real ChartView is rendered over a fake records client: the aggregate asks (grouped and total) carry
// the view's "is" filter, an "is any of" filter is answered over read rows, and the view's sort orders
// the groups the ring draws.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const recordAggregate = jest.fn();
const readRows = jest.fn();
// Stable identities, as the real hooks give: a new client or field list each render would re-ask forever.
const CLIENT = { recordAggregate: (...a: unknown[]) => recordAggregate(...a) };
const FIELDS = { data: [{ key: "status", label: "Status", type: "choice" }] };

jest.mock("@ai-matrx/records/react", () => {
  const actual = jest.requireActual("@ai-matrx/records/react");
  return {
    ...actual,
    useRecordsClient: () => CLIENT,
    useFields: () => FIELDS,
    useRecords: (tableId: string | null) => {
      if (tableId) readRows(tableId);
      return tableId ? READ : NO_READ;
    },
  };
});
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { ChartView } from "../ChartView";

// recharts measures its container through ResizeObserver; jsdom has none.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const doc = (status: string) => ({ id: status + Math.random(), document: { status } });
const ROWS = [doc("Active"), doc("Active"), doc("Onboarding"), doc("Churned")];
const READ = { data: { rows: ROWS }, error: null };
const NO_READ = { data: null, error: null };
const settings = { type: "donut" as const, groupBy: "status", op: "count" as const, centerValue: true };

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  recordAggregate.mockReset();
  readRows.mockReset();
  recordAggregate.mockImplementation(async (ask: { groupBy?: string[] }) => ({
    ok: true,
    data: ask.groupBy?.length
      ? [
          // The store's native order: neither A→Z nor Z→A, neither by value up nor down, so a chart that
          // ignores its sort draws this order and fails every ordering test below.
          { groups: { status: "Onboarding" }, measures: { count: 3 }, row_count: 3 },
          { groups: { status: "Active" }, measures: { count: 1 }, row_count: 1 },
          { groups: { status: "Churned" }, measures: { count: 5 }, row_count: 5 },
        ]
      : [{ groups: {}, measures: { count: 3 }, row_count: 3 }],
  }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("ChartView passes its view to its data request", () => {
  it("sends the view's 'is' filter with both the grouped and the total aggregate", async () => {
    await act(async () => {
      root.render(<ChartView tableId="t1" settings={settings} title="Active clients" filter={{ status: "Active" }} sorts={[]} />);
    });
    await flush();
    expect(recordAggregate).toHaveBeenCalledTimes(2);
    for (const [ask] of recordAggregate.mock.calls) expect(ask).toMatchObject({ table_id: "t1", filter: { status: "Active" } });
    expect(readRows).not.toHaveBeenCalled();
  });

  it("sends no filter key when the view has none", async () => {
    await act(async () => {
      root.render(<ChartView tableId="t1" settings={settings} title="All" filter={{}} sorts={[]} />);
    });
    await flush();
    for (const [ask] of recordAggregate.mock.calls) expect("filter" in ask).toBe(false);
  });

  it("answers an 'is any of' filter over read rows, never asking the aggregate", async () => {
    await act(async () => {
      root.render(<ChartView tableId="t1" settings={settings} title="Some" filter={{ status: ["Active", "Onboarding"] }} sorts={[]} />);
    });
    await flush();
    expect(recordAggregate).not.toHaveBeenCalled();
    expect(readRows).toHaveBeenCalledWith("t1");
    // 3 of the 4 rows pass the filter: the ring's middle number is 3, not the table's 4.
    expect(host.querySelector("svg")?.getAttribute("aria-label")).toBe("3");
  });

  // What the chart draws, read from the DOM it produced (not from what ChartView hands over):
  // a donut's slices are circles titled "<group>: <value>"; the real ChartBlock's bars are rectangles,
  // read left to right, each as tall as its value (3 groups: values 1, 3, 5 give distinct heights).
  const slices = () => [...host.querySelectorAll("svg circle title")].map((t) => t.textContent);
  const bars = () => {
    const rects = [...host.querySelectorAll("path.recharts-rectangle")].map((r) => ({ x: Number(r.getAttribute("x")), h: Number(r.getAttribute("height")) }));
    const tallest = Math.max(...rects.map((r) => r.h));
    return rects.sort((a, b) => a.x - b.x).map((r) => Math.round((r.h / tallest) * 5));
  };
  const draw = async (type: "bar" | "donut", sort: "asc" | "desc" | undefined, sorts: Array<{ field: string; direction: "asc" | "desc" }>) => {
    await act(async () => {
      root.render(<ChartView tableId="t1" settings={{ ...settings, type, sort }} title="Status" filter={{}} sorts={sorts} />);
    });
    await flush();
  };

  it("orders bars by the view's sort on the grouped field (A to Z, then Z to A)", async () => {
    await draw("bar", undefined, [{ field: "status", direction: "asc" }]);
    expect(bars()).toEqual([1, 5, 3]); // Active, Churned, Onboarding
    await draw("bar", undefined, [{ field: "status", direction: "desc" }]);
    expect(bars()).toEqual([3, 5, 1]); // Onboarding, Churned, Active
  });

  it("orders bars by value when the chart's own sort says so", async () => {
    await draw("bar", "asc", []);
    expect(bars()).toEqual([1, 3, 5]);
    await draw("bar", "desc", []);
    expect(bars()).toEqual([5, 3, 1]);
  });

  it("draws bars in the store's order when nothing sorts", async () => {
    await draw("bar", undefined, []);
    expect(bars()).toEqual([3, 1, 5]);
  });

  it("orders the donut's slices by the view's sort and by value", async () => {
    await draw("donut", undefined, [{ field: "status", direction: "asc" }]);
    expect(slices()).toEqual(["Active: 1", "Churned: 5", "Onboarding: 3"]);
    await draw("donut", undefined, [{ field: "status", direction: "desc" }]);
    expect(slices()).toEqual(["Onboarding: 3", "Churned: 5", "Active: 1"]);
    await draw("donut", "desc", []);
    expect(slices()).toEqual(["Churned: 5", "Onboarding: 3", "Active: 1"]);
    await draw("donut", "asc", []);
    expect(slices()).toEqual(["Active: 1", "Onboarding: 3", "Churned: 5"]);
    await draw("donut", undefined, []);
    expect(slices()).toEqual(["Onboarding: 3", "Active: 1", "Churned: 5"]);
  });
});
