/**
 * Forgiving-ladder tests. The validator is an oracle that approximates mermaid
 * validity for the specific defect classes the fixers target — so these tests
 * prove the ladder DRIVES broken LLM output to a clean form, deterministically
 * and without a DOM. (The real mermaid engine is exercised in the browser.)
 */

import { parseWithLadder, type MermaidValidator } from "../sanitize";

/** Returns ok only when none of the targeted defects remain. */
const defectOracle: MermaidValidator = async (source) => {
  const lines = source.split("\n");
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith("%%")) continue;
    // bare single arrow (mermaid needs -->)
    if (/[^-=.<]->(?!>)/.test(s)) return { ok: false, error: "bare arrow" };
    // // or # comment lines
    if (/^(\/\/|#)(?!#)/.test(s)) return { ok: false, error: "bad comment" };
    // unquoted parenthesis inside a [..] label
    if (/[A-Za-z0-9_]+\[[^"\]]*[()][^\]]*\]/.test(s)) return { ok: false, error: "unquoted paren in label" };
    // reserved lowercase `end` as a node (after a pipe/arrow), not a subgraph close
    if (/(\||>)\s*end\s*$/.test(s)) return { ok: false, error: "reserved end node" };
  }
  return { ok: true };
};

const BROKEN = `flowchart TD
  A[Validate (strict) mode] -> B{ok?}
  B -->|Yes| end
  B -->|No| A
  // retry path`;

describe("mermaid forgiving ladder", () => {
  it("recovers the canonical broken sample and reports every fix", async () => {
    const result = await parseWithLadder(BROKEN, defectOracle, { streaming: false });
    expect(result.valid).toBe(true);
    expect(result.source).not.toBe(BROKEN);
    // The four defects are addressed:
    expect(result.source).toContain('A["Validate (strict) mode"]'); // quoted label
    expect(result.source).toContain("-->"); // arrow repaired
    expect(result.source).not.toMatch(/\|\s*end\s*$/m); // reserved end renamed
    expect(result.source).toContain("%% retry path"); // comment normalized
    expect(result.fixes.length).toBeGreaterThanOrEqual(3);
  });

  it("leaves already-valid source untouched (no fixes)", async () => {
    const valid = `flowchart TD\n  A["Start"] --> B["End"]`;
    const result = await parseWithLadder(valid, defectOracle, { streaming: false });
    expect(result.valid).toBe(true);
    expect(result.fixes).toHaveLength(0);
    expect(result.source).toBe(valid);
  });

  it("normalizes smart quotes and HTML-escaped arrows losslessly (Stage A)", async () => {
    // Use an oracle that only rejects smart quotes / entities.
    const stageAOracle: MermaidValidator = async (s) =>
      /[“”]|--&gt;/.test(s) ? { ok: false } : { ok: true };
    const messy = `flowchart TD\n  A[“Hi”] --&gt; B`;
    const result = await parseWithLadder(messy, stageAOracle, { streaming: false });
    expect(result.valid).toBe(true);
    expect(result.source).toContain('"Hi"');
    expect(result.source).toContain("-->");
  });

  it("stays quiet during streaming when partial text can't validate", async () => {
    const partial = `flowchart TD\n  A[Start] -->`;
    const alwaysInvalid: MermaidValidator = async () => ({ ok: false });
    const result = await parseWithLadder(partial, alwaysInvalid, { streaming: true });
    // streaming + invalid → returns the (Stage-A-normalized) source, not valid,
    // and never runs the heavy Stage B fixers.
    expect(result.valid).toBe(false);
  });
});
