import fs from "node:fs";
import path from "node:path";

describe("page GSC read contract", () => {
  const source = fs.readFileSync(path.join(__dirname, "data.ts"), "utf8");

  it("routes page query evidence through the canonical set-based RPC", () => {
    expect(source).toContain("getGscBreakdown(");
    expect(source).toContain("{ page_eq: pageId }");
    expect(source).toContain("{ page_eq: pageId, query_eq: normalized }");
  });

  it("does not scan the raw GSC fact table for page query evidence", () => {
    expect(source).not.toMatch(/from\(["']search_performance_daily["']\)/);
  });
});
