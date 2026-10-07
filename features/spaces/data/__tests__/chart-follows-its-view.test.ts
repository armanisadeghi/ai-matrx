// A chart counts and orders what its view shows (Notion's chart view): the view's "is" and "is any of"
// filters decide the rows, a manual chart follows the view's sort on the grouped field, and the chart's
// own Ascending / Descending wins over the view's sort.
import type { ReadRow } from "@ai-matrx/records/react";

import { hasListFilter, orderPoints, passes } from "../chart-rules";

const row = (document: Record<string, unknown>) => ({ id: "r", document }) as unknown as ReadRow;

describe("a chart follows its view", () => {
  const clients = [
    row({ status: "Active" }),
    row({ status: "Active" }),
    row({ status: "Onboarding" }),
    row({ status: "Churned" }),
    row({ status: null }),
  ];

  it("counts only the rows an 'is' filter keeps (Status = Active)", () => {
    expect(clients.filter((r) => passes(r, { status: "Active" }))).toHaveLength(2);
  });

  it("matches a choice stored as its slug", () => {
    expect(passes(row({ status: "on-hold" }), { status: "On hold" })).toBe(true);
  });

  it("counts the rows an 'is any of' filter keeps, and reads it over rows", () => {
    const f = { status: ["Active", "Onboarding"] };
    expect(clients.filter((r) => passes(r, f))).toHaveLength(3);
    expect(hasListFilter(f)).toBe(true);
    expect(hasListFilter({ status: "Active" })).toBe(false);
  });

  it("an empty value never passes an equality, and null means unset", () => {
    expect(passes(row({ status: null }), { status: "Active" })).toBe(false);
    expect(passes(row({ status: "" }), { status: null })).toBe(true);
  });

  const pts = [
    { label: "Onboarding", value: 1 },
    { label: "Active", value: 5 },
    { label: "Churned", value: 2 },
  ];

  it("a manual chart orders its groups by the view's sort on the grouped field", () => {
    expect(orderPoints(pts, "manual", [{ field: "status", direction: "asc" }], "status").map((p) => p.label)).toEqual(["Active", "Churned", "Onboarding"]);
    expect(orderPoints(pts, undefined, [{ field: "status", direction: "desc" }], "status").map((p) => p.label)).toEqual(["Onboarding", "Churned", "Active"]);
  });

  it("a sort on another field leaves the store's order", () => {
    expect(orderPoints(pts, "manual", [{ field: "date_started", direction: "asc" }], "status")).toEqual(pts);
  });

  it("the chart's own sort wins over the view's", () => {
    expect(orderPoints(pts, "desc", [{ field: "status", direction: "asc" }], "status").map((p) => p.value)).toEqual([5, 2, 1]);
  });
});
