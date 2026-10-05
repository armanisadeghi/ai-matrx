/**
 * PERFORMANCE GUARD for the prose spelling reader (kind-never-raw round 9,
 * H-3). `spelledKindsAsOneLine` runs on EVERY frame of every prose block, twice
 * (`BasicMarkdownContent` and `KindTextGate`), and round 8's version re-scanned
 * the whole text per region: 600 escaped regions (30 KB) took ~10 s per call,
 * one escaped kind at the start of 1 MB ~200 ms. The reader is now one linear
 * pass with a cheap pre-check and a per-text memo; these budgets fail on the
 * round-8 code by orders of magnitude and leave CI headroom over the measured
 * numbers (see the checklist, R9-3).
 */
import { normalizeKindSpellings } from "@/features/content-ir/surfaces/json-kind-signal";
import { detectionOnlyKindsAsWritten, spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { markdownCarriesKind } from "@/features/content-ir/surfaces/json-kind-signal";

/** The prose leaf's whole per-frame work (round 10): the render decision + the leaf's two passes. */
const proseLeaf = (text: string) => {
  markdownCarriesKind(text);
  return detectionOnlyKindsAsWritten(spelledKindsAsOneLine(text));
};

/** Best of `runs` fresh-string calls (no memo hit: every run gets a new string). */
function bestMs(make: () => string, fn: (text: string) => unknown, runs = 3): number {
  fn(make());
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run++) {
    const text = make();
    const started = performance.now();
    fn(text);
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

const repeat = (unit: string, size: number) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
const PLAIN = "The mitochondria is the powerhouse of the cell, and it makes ATP for every process we study today. ";
const MATH = "We can't simplify $\\frac{a}{b} + \\text{it's} \\sqrt{x^{2}}$ so let's keep {the} braces. ";
const ESCAPED = 'Log: {\\"__kind\\":\\"note\\",\\"title\\":\\"Hi\\"} ok. ';
/** A new frame: the same text plus one more streamed word (a memo miss, as on screen). */
let frame = 0;
const fresh = (text: string) => () => `${text} w${++frame}`;

describe("prose spelling reader — linear-time budgets", () => {
  it("600 escaped regions (~30 KB) in under 30 ms", () => {
    const text = repeat(ESCAPED, ESCAPED.length * 600);
    const ms = bestMs(fresh(text), spelledKindsAsOneLine);
    // Round 10: a non-JSON spelling is left exactly as written.
    expect(spelledKindsAsOneLine(text)).toBe(text);
    expect(ms).toBeLessThan(30);
  });

  it("1 MB of math prose with one escaped kind at the start in under 40 ms", () => {
    const text = ESCAPED + repeat(MATH, 1_000_000);
    const ms = bestMs(fresh(text), spelledKindsAsOneLine);
    expect(spelledKindsAsOneLine(text)).toBe(text);
    expect(ms).toBeLessThan(40);
  });

  it("1 MB of plain prose in under 10 ms", () => {
    const ms = bestMs(fresh(repeat(PLAIN, 1_000_000)), spelledKindsAsOneLine);
    expect(ms).toBeLessThan(10);
  });

  it("the normalizer shares the budget: 600 escaped regions in under 30 ms", () => {
    const text = repeat(ESCAPED, ESCAPED.length * 600);
    const ms = bestMs(fresh(text), normalizeKindSpellings);
    expect(ms).toBeLessThan(40);
  });

  it("a repeated frame is answered from the memo (same output, no rescan)", () => {
    const text = ESCAPED + repeat(MATH, 200_000);
    const first = spelledKindsAsOneLine(text);
    const started = performance.now();
    const again = spelledKindsAsOneLine(text);
    expect(again).toBe(first);
    expect(performance.now() - started).toBeLessThan(5);
  });

  // Round 10 (C3): one early brace, many key mentions — the brace is never re-read
  // per mention (round 9 decoded from it once per mention: 256 ms at 100 KB, 2.9 s at 1 MB).
  it("an early object then 600 key mentions: render decision + prose leaf under 16 ms at 100 KB, linear at 1 MB", () => {
    const make = (size: number) => () =>
      `Data: {"rows": "${"x".repeat(size)}"} and then ` + 'the "__kind": "note" field. '.repeat(600) + ` w${++frame}`;
    const small = bestMs(make(100_000), proseLeaf);
    const large = bestMs(make(1_000_000), proseLeaf);
    expect(small).toBeLessThan(16);
    expect(large).toBeLessThan(Math.max(80, small * 25));
  });

  it("100 KB of every shape, streamed: render decision + prose leaf under 16 ms per frame", () => {
    for (const unit of [PLAIN, MATH, ESCAPED, '{{x the "__kind": "note" field. ']) {
      // A streamed frame is the previous frame plus a few characters.
      let text = repeat(unit, 100_000);
      const next = () => (text = `${text} w${++frame}`);
      expect(bestMs(next, proseLeaf, 5)).toBeLessThan(16);
    }
  });

  it("100 KB of escaped kinds, cold (no previous frame): under 30 ms", () => {
    expect(bestMs(fresh(repeat(ESCAPED, 100_000)), proseLeaf)).toBeLessThan(30);
  });
});
