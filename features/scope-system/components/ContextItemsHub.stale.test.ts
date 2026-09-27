import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(__dirname, "ContextItemsHub.tsx"), "utf8");

describe("ContextItemsHub cached-read failures", () => {
  it("shows a stale-data notice for cached scope types and keeps the zero-row read failure", () => {
    expect(source).toMatch(/treeError && scopeTypes\.length > 0[\s\S]*?<StaleDataNotice[\s\S]*?detail=\{treeError\}[\s\S]*?ensureScopeTree\(\{ refresh: true \}\)/);
    expect(source).toMatch(/treeError && scopeTypes\.length === 0[\s\S]*?<ReadFailure/);
  });

  it("shows a stale-data notice for cached items and keeps the zero-row read failure", () => {
    expect(source).toMatch(/itemsError && items\.length > 0[\s\S]*?<StaleDataNotice[\s\S]*?detail=\{itemsError\}[\s\S]*?listScopeTypeItems\(type\.id\)/);
    expect(source).toMatch(/itemsError && items\.length === 0[\s\S]*?<ReadFailure/);
  });
});
