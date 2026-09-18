import { analyzeDiff } from "./diffAnalysis";

describe("analyzeDiff summary", () => {
  it("counts changed characters from the changed lines, not by position", () => {
    // The old positional compare called every character after a deleted line
    // "different" — "2 lines changed · 6428 chars different" for one deletion.
    const lines = Array.from({ length: 80 }, (_, i) => `line ${i} of a fairly long recipe body`);
    const remote = [...lines.slice(0, 4), "> This easy recipe includes chicken", ...lines.slice(4)].join("\n");
    const local = lines.join("\n");
    const result = analyzeDiff(local, remote);
    expect(result.linesChanged).toBe(1);
    expect(result.charsChanged).toBe("> This easy recipe includes chicken".length);
    expect(result.summary).toContain("1 line changed");
    expect(result.summary).not.toMatch(/\d{4} chars/);
  });
});
