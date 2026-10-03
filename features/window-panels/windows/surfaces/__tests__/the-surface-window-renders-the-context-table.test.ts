/**
 * ONE RENDERER FOR A PAGE'S VALUES.
 *
 * The Surface Context window's list is the context rules table — the same
 * component, hierarchy and rows as the composer's chip and full view — never
 * its own list of grouped buttons (that second renderer drifted: raw keys on
 * every row, its own "Other" and "Undeclared" sections, no rules).
 *
 * Breaks this catches: a hand-rolled list returning to the window, or the
 * window deriving its own rows instead of `surfaceContextRows`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.join(__dirname, "..", "SurfaceContextWindow.tsx"), "utf8");

describe("the Surface Context window's value list", () => {
  it("renders through ContextRulesTable over surfaceContextRows", () => {
    expect(source).toMatch(/<ContextRulesTable\b/);
    expect(source).toMatch(/surfaceContextRows\(/);
    // The one placement the chip and the full view use — never an inspector-only placer.
    expect(source).toMatch(/contextRowPlacer\(/);
    expect(source).not.toMatch(/surfaceInspectorPlacer/);
  });

  it("has no list of its own", () => {
    expect(source).not.toMatch(/sections\.map\(/);
    expect(source).not.toMatch(/Undeclared \(runtime only\)/);
    expect(source).not.toMatch(/label: "Other"/);
  });

  it("shows a machine name only in the admin slot", () => {
    expect(source).toMatch(/renderRowTrail=\{\s*isAdmin \?/);
  });
});
