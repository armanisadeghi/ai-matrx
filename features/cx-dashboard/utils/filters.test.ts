import { clearCxTableFilters, hasActiveCxSourceFilters } from "./filters";

describe("CX source and canonical table filter reset", () => {
  it("does not treat default timeframe, page size or sorting as active filters", () => {
    expect(hasActiveCxSourceFilters(new URLSearchParams("timeframe=month&page=2&per_page=50&sort_by=created_at"))).toBe(false);
    expect(hasActiveCxSourceFilters(new URLSearchParams("timeframe=week"))).toBe(true);
    expect(hasActiveCxSourceFilters(new URLSearchParams("status=active"))).toBe(true);
  });

  it.each(["cx-conversations", "cx-requests"])("clears both query layers for %s without losing view settings", (id) => {
    const params = new URLSearchParams(`status=error&timeframe=week&search=test&page=3&per_page=50&sort_by=created_at&table.${id}.q=needle&table.${id}.f=%7B%7D&table.${id}.p=2&table.${id}.ps=100&table.${id}.sort=title.asc&table.other.q=keep&active=all`);
    const result = clearCxTableFilters(params, id);
    expect(result.has("status")).toBe(false);
    expect(result.has("timeframe")).toBe(false);
    expect(result.has("search")).toBe(false);
    expect(result.has("page")).toBe(false);
    expect(result.has(`table.${id}.q`)).toBe(false);
    expect(result.has(`table.${id}.f`)).toBe(false);
    expect(result.has(`table.${id}.p`)).toBe(false);
    expect(result.get(`table.${id}.ps`)).toBe("100");
    expect(result.get(`table.${id}.sort`)).toBe("title.asc");
    expect(result.get("per_page")).toBe("50");
    expect(result.get("sort_by")).toBe("created_at");
    expect(result.get("table.other.q")).toBe("keep");
    expect(result.get("active")).toBe("all");
    expect(params.get("status")).toBe("error");
  });
});
