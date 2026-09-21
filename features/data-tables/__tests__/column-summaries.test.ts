import {
  computeColumnSummary,
  parseColumnSummaries,
  serializeColumnSummaries,
  summaryKindsFor,
} from "../column-summaries";

/** A budget column in a project tracker: the sums people actually put in a footer. */
const rows = [
  { data: { budget: 84000, status: "Done" } },
  { data: { budget: 126500, status: "In progress" } },
  { data: { budget: 38000, status: "Done" } },
  { data: { budget: null, status: "" } },
];

describe("column summaries", () => {
  it("round-trips the URL form and drops unknown kinds", () => {
    expect(parseColumnSummaries("budget:sum,status:filled,x:nonsense,:sum")).toEqual({
      budget: "sum",
      status: "filled",
    });
    expect(serializeColumnSummaries({ status: "filled", budget: "sum" })).toBe("budget:sum,status:filled");
    expect(serializeColumnSummaries({})).toBeNull();
  });

  it("offers arithmetic only to number columns", () => {
    expect(summaryKindsFor("number")).toContain("sum");
    expect(summaryKindsFor("string")).not.toContain("sum");
    expect(summaryKindsFor("string")).toContain("unique");
  });

  it("computes over the rows it is given and formats through the column's format", () => {
    const currency = { id: "currency" as const, options: { currency: "USD", precision: 0 } };
    expect(computeColumnSummary(rows, "budget", "sum", "number", currency).text).toBe("$248,500");
    expect(computeColumnSummary(rows, "budget", "avg", "number", null).text).toBe("82,833.33");
    expect(computeColumnSummary(rows, "budget", "median", "number", null).text).toBe("84,000");
    expect(computeColumnSummary(rows, "budget", "min", "number", null).text).toBe("38,000");
    expect(computeColumnSummary(rows, "budget", "filled", "number", null).text).toBe("3 / 4");
    expect(computeColumnSummary(rows, "status", "empty", "string", null).text).toBe("1 / 4");
    expect(computeColumnSummary(rows, "status", "unique", "string", null).text).toBe("2");
    expect(computeColumnSummary(rows, "status", "count", "string", null).text).toBe("4");
  });

  it("says so when a column holds no numbers instead of showing 0", () => {
    expect(computeColumnSummary(rows, "status", "sum", "string", null)).toEqual({
      text: "—",
      detail: "No numbers in this column",
    });
  });
});
