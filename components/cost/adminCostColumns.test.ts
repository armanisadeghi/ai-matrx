import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { adminCostColumns, splitAdminCostColumns } from "./adminCostColumns";

// the points cell is an element that subscribes to the rate (VERIFY-DRILL-FINAL L-b)
jest.mock("@/components/cost/pointsRate.client", () => ({ usePointsRate: () => 20_000 }));
const text = (node: unknown) => renderToStaticMarkup(node as ReactElement);


// The points rate is the billing.points_per_usd knob; this suite runs with no
// knob snapshot, so it pins the rate to a fixture (the platform default).
jest.mock("@/components/cost/pointsRate", () => ({
  ...jest.requireActual("@/components/cost/pointsRate"),
  currentPointsRate: () => 20_000,
  usePointsRate: () => 20_000,
}));

describe("admin cost columns", () => {
  const columns = adminCostColumns<{ cost: number | null }>({
    id: "cost",
    value: (row) => row.cost,
  });

  it("keeps dollars and points in separate sortable columns", () => {
    expect(columns).toHaveLength(2);
    expect(columns.map((column) => column.id)).toEqual(["cost", "cost_points"]);
    expect(columns.map((column) => column.header)).toEqual(["Cost (USD)", "Points"]);
    expect(columns[0].accessorFn?.({ cost: 0.004 })).toBe(0.004);
    expect(columns[1].accessorFn?.({ cost: 0.004 })).toBe(80);
    expect(columns[0].cell?.({ cost: 0.004 }, 0)).toBe("<$0.01");
    expect(text(columns[1].cell?.({ cost: 0.004 }, 0))).toBe("80 points");
  });

  it("does not report an unknown charge as zero", () => {
    expect(columns[0].cell?.({ cost: null }, 0)).toBe("—");
    expect(text(columns[1].cell?.({ cost: null }, 0))).toBe("—");
  });

  it("splits a stored numeric cost field while keeping other fields", () => {
    const expanded = splitAdminCostColumns<{ label: string; cost: string | null }>(
      [
        { accessorKey: "label", header: "Label" },
        { accessorKey: "cost", header: "Billed" },
      ],
      ["cost"],
    );
    expect(expanded.map((column) => column.header)).toEqual(["Label", "Billed (USD)", "Billed (points)"]);
    expect(expanded[1].accessorFn?.({ label: "x", cost: "0.004" })).toBe(0.004);
    expect(expanded[2].accessorFn?.({ label: "x", cost: "0.004" })).toBe(80);
    expect(expanded[1].accessorFn?.({ label: "x", cost: null })).toBeNull();
  });
});
