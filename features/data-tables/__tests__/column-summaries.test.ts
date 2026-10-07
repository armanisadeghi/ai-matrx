import {
  parseColumnSummaries,
  serializeColumnSummaries,
} from "../column-summaries";

describe("column summaries", () => {
  it("round-trips the URL form and drops unknown kinds", () => {
    expect(parseColumnSummaries("budget:sum,status:filled,x:nonsense,:sum")).toEqual({
      budget: "sum",
      status: "filled",
    });
    expect(serializeColumnSummaries({ status: "filled", budget: "sum" })).toBe("budget:sum,status:filled");
    expect(serializeColumnSummaries({})).toBeNull();
  });
});
