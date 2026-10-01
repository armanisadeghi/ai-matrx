/**
 * @jest-environment node
 */
// Guard for the "04" bug class (verify-6 #3, 2026-10-01). A number field whose
// onChange coerces the keystroke straight into state with a fallback —
// `set(parseInt(e.target.value) || 0)`, `Number(e.target.value) || 10` — snaps a
// cleared field to the fallback and the next keystroke paints "04" / "101".
// The one input that keeps a text draft is components/official/ClampedNumberInput;
// use it. This fails on any tracked .tsx that reintroduces the pattern.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

// NUMBER_GUARD_ROOT lets the red proof point the scan at a scratch checkout.
const ROOT = process.env.NUMBER_GUARD_ROOT ?? path.resolve(__dirname, "../../..");

// The coercion of an event value followed by a `||` / `??` fallback. Multi-line
// safe (the callee, argument and fallback may be split across lines).
export const BARE_NUMBER_BINDING =
  /\b(?:Number\.)?(?:parseInt|parseFloat|Number)\(\s*(?:e|ev|event|evt)\.(?:target|currentTarget)\.value\b[^)]*\)\s*(?:\|\||\?\?)/g;

// The test that DEMONSTRATES the old binding is the only legitimate holder.
const ALLOWED = new Set(["components/official/__tests__/clamped-number-input.test.tsx"]);

export function findBareNumberBindings(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(BARE_NUMBER_BINDING)) {
    lines.push(source.slice(0, match.index).split("\n").length);
  }
  return lines;
}

describe("no bare number-field binding", () => {
  it("detects the old binding (the guard can fail)", () => {
    expect(findBareNumberBindings("onChange={(e) => setN(parseInt(e.target.value) || 0)}")).toEqual([1]);
    expect(findBareNumberBindings("x(\n Math.max(1, Number(event.target.value) || 1))")).toEqual([2]);
    expect(findBareNumberBindings("setC(Number.parseInt(e.target.value, 10) || 0)")).toEqual([1]);
    expect(findBareNumberBindings("onChange={(n) => setN(n)}")).toEqual([]);
  });

  it("no tracked .tsx coerces an input event value with a || fallback", () => {
    const files = execFileSync("git", ["ls-files", "-z", "--", "*.tsx"], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString()
      .split("\0")
      .filter(Boolean);
    const offenders: string[] = [];
    for (const file of files) {
      if (ALLOWED.has(file)) continue;
      let source: string;
      try {
        source = readFileSync(path.join(ROOT, file), "utf8");
      } catch {
        continue; // tracked but deleted in the working tree
      }
      for (const line of findBareNumberBindings(source)) offenders.push(`${file}:${line}`);
    }
    expect(offenders).toEqual([]);
  });
});
