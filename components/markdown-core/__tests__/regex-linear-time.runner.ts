/**
 * Child-process runner for `regex-linear-time.guard.test.ts` (kind-never-raw
 * round 11, F1/F2). Runs every adversarial case once to warm up, then best of
 * three fresh strings, and prints one JSON line per case AS IT FINISHES — a
 * super-linear regex never prints its line, and the guard's timeout kills it.
 *
 *   tsx components/markdown-core/__tests__/regex-linear-time.runner.ts [case…]
 */
import { normalizeMathDelimiters } from "@/components/markdown-core/math-normalizer";
import { computeDocumentNumbering } from "@/components/markdown-core/syntax/document-numbering";
import { scanKindSpellingRegions, normalizeKindSpellings } from "@/features/content-ir/surfaces/json-kind-signal";
import { nonJsonKindsAsCode, spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { REGEX_LINEAR_TIME_CASES } from "./regex-linear-time.cases";

const FUNCTIONS: Record<string, (text: string) => unknown> = {
  math: normalizeMathDelimiters,
  numbering: computeDocumentNumbering,
  kindScan: (text) => scanKindSpellingRegions(text, { families: "all" }),
  kindProseLeaf: (text) => nonJsonKindsAsCode(spelledKindsAsOneLine(normalizeKindSpellings(text))),
};

let serial = 0;
const only = new Set(process.argv.slice(2));
for (const c of REGEX_LINEAR_TIME_CASES) {
  if (only.size && !only.has(c.name)) continue;
  const fn = FUNCTIONS[c.fn];
  if (!fn) throw new Error(`unknown function ${c.fn}`);
  const make = () => `${c.input}${c.suffix ?? ""}${c.salt === false ? "" : ` w${++serial}`}`;
  fn(make());
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 3; run++) {
    const text = make();
    const started = performance.now();
    fn(text);
    best = Math.min(best, performance.now() - started);
  }
  process.stdout.write(`${JSON.stringify({ name: c.name, ms: Math.round(best * 10) / 10 })}\n`);
}
