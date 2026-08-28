import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "../AgentTextarea.tsx"), "utf8");

describe("AgentTextarea auto-resize", () => {
  it("measures content from zero instead of reusing a flex-stretched auto height", () => {
    const resetIndex = source.indexOf('el.style.height = "0px";');
    const measureIndex = source.indexOf("el.scrollHeight", resetIndex);

    expect(resetIndex).toBeGreaterThan(-1);
    expect(measureIndex).toBeGreaterThan(resetIndex);
    expect(source).not.toContain('el.style.height = "auto";');
  });
});
