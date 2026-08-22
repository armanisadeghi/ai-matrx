import fs from "node:fs";
import path from "node:path";

describe("Notes loading hydration", () => {
  it("renders deterministic skeleton widths", () => {
    const source = fs.readFileSync(path.join(__dirname, "loading.tsx"), "utf8");
    expect(source).not.toContain("Math.random");
    expect(source).toContain("nestedWidths[(i + j) % nestedWidths.length]");
  });
});
