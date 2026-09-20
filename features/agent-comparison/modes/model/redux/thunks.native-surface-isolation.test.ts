import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "thunks.ts"), "utf8");

describe("Model Battle native conversation isolation", () => {
  it("keeps subject model columns on their native agent-comparison source", () => {
    expect(source).toContain('const MODEL_SOURCE_FEATURE = "agent-comparison"');
    expect(source).toContain("sourceFeature: MODEL_SOURCE_FEATURE");
    expect(source).not.toMatch(/surfaceName\s*:/);
  });
});
