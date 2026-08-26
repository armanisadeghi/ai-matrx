import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "../AiModelTable.tsx"), "utf8");

describe("AiModelTable mobile scroll contract", () => {
  it("keeps the wrapper as the only horizontal scrollport", () => {
    expect(source).toContain(
      '"table overflow-visible caption-bottom text-xs border-collapse"',
    );
    expect(source).toContain(
      '<div className="relative min-h-0 flex-1 overflow-auto">',
    );
  });
});
