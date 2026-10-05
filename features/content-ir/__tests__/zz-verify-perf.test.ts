import { normalizeKindSpellings, markdownCarriesKind, hasKindKeyAnySpelling } from "@/features/content-ir/surfaces/json-kind-signal";
import { spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
jest.setTimeout(900_000);
const t = (f: () => unknown, n = 3) => { f(); const s = performance.now(); for (let i = 0; i < n; i++) f(); return +((performance.now() - s) / n).toFixed(2); };
const rep = (u: string, size: number) => u.repeat(Math.ceil(size / u.length)).slice(0, size);
const PLAIN = "The mitochondria is the powerhouse of the cell, and it makes ATP for every process we study today. ";
const MATH = "We can't simplify $\\frac{a}{b} + \\text{it's} \\sqrt{x^{2}}$ so let's keep {the} braces. ";
const KIND = 'Here: {"__kind":"note","title":"Hi"} ok. ';
const ESC = 'Log: {\\"__kind\\":\\"note\\",\\"title\\":\\"Hi\\"} ok. ';
it("perf", () => {
  for (const size of [10_000, 100_000, 1_000_000]) {
    for (const [name, body] of [["plain", rep(PLAIN, size)], ["math+apostrophes", rep(MATH, size)], ["math + kind at start", KIND + rep(MATH, size)], ["math + escaped kind at start", ESC + rep(MATH, size)], ["many escaped kinds", rep(ESC, size)]] as const) {
      const n = size >= 1_000_000 ? 1 : 3;
      const r = { size, name, spelledOneLine: t(() => spelledKindsAsOneLine(body), n), normalize: t(() => normalizeKindSpellings(body), n), mdCarries: t(() => markdownCarriesKind(body), n), anySpelling: t(() => hasKindKeyAnySpelling(body), n) };
      console.log("PERF " + JSON.stringify(r));
    }
  }
});
it("accumulator stream 1MB math prose in 40-char chunks", () => {
  const body = KIND + rep(MATH, 1_000_000);
  let frames = 0;
  const acc = new StreamBlockAccumulator("r", (p) => { frames++; return { type: "t", payload: p }; });
  const d = (a: unknown) => a;
  const s = performance.now();
  for (let i = 0; i < body.length; i += 40) acc.ingest(body.slice(i, i + 40), d);
  acc.finalize(d);
  console.log("ACC " + JSON.stringify({ ms: Math.round(performance.now() - s), frames }));
});
