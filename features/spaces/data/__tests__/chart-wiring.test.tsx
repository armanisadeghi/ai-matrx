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
jest.mock("@ai-matrx/records-ui", () => ({
  ChartBlock: (props: { block: { rows: Array<{ groups: Record<string, unknown> }> } }) => (
    <ol data-testid="bars">{props.block.rows.map((r) => <li key={String(r.groups.status)}>{String(r.groups.status)}</li>)}</ol>
  ),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { ChartView } from "../ChartView";

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
          { groups: { status: "Onboarding" }, measures: { count: 1 }, row_count: 1 },
          { groups: { status: "Active" }, measures: { count: 2 }, row_count: 2 },
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

  it("orders the groups the chart draws by the view's sort on the grouped field", async () => {
    const bars = { ...settings, type: "bar" as const };
    await act(async () => {
      root.render(<ChartView tableId="t1" settings={bars} title="Status" filter={{}} sorts={[{ field: "status", direction: "asc" }]} />);
    });
    await flush();
    expect([...host.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Active", "Onboarding"]);
    await act(async () => {
      root.render(<ChartView tableId="t1" settings={bars} title="Status" filter={{}} sorts={[{ field: "status", direction: "desc" }]} />);
    });
    await flush();
    expect([...host.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Onboarding", "Active"]);
  });
});
