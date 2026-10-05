import * as fs from "fs";
import { guardMarkdownDelimiters } from "@ai-matrx/kit/delimiter-guard";
import { preprocessProse } from "@/components/rich-content/prose/prose-prepare";
import { normalizeMathDelimiters } from "@/components/markdown-core/math-normalizer";
import { nonJsonKindsAsCode, spelledKindsAsOneLine, inlineKindText } from "@/features/content-ir/surfaces/kind-one-line";
import { markdownCarriesKind, normalizeKindSpellings } from "@/features/content-ir/surfaces/json-kind-signal";

const LOG = process.env.ZZ_LOG!;
const only = process.env.ZZ_ONLY;
const r = (u: string, n: number) => u.repeat(n);
const INPUTS: Record<string, (n: number) => string> = {
  bracketSpaces: (n) => "See [" + r(" ", n) + "x and more",
  bracketsOpen: (n) => r("[a ", n),
  escBracketOpen: (n) => r("\\[ x ", n),
  escParenOpen: (n) => r("\\( x ", n),
  dollarsOdd: (n) => r("$$ a ", n) + "$",
  singleDollar: (n) => r("$a ", n),
  backslashes: (n) => r("\\", n) + "\"__kind\\\":",
  backslashKind: (n) => r('{\\"__kind\\":\\"note\\", \\\\\\" ', n),
  entityKind: (n) => r("{&quot;__kind&quot;: &quot;n&#95; &amp;&#x5F;", n),
  braceKind: (n) => r('{"a":[1,{"__kind":"x" 1 [ ', n),
  braceOpenKind: (n) => r('{ "__kind": "x", ', n),
  nested: (n) => r("{[", n) + '"__kind":"x"' + r("]}", n),
  backticks: (n) => r("``a", n),
  backtickRun: (n) => r("`", n) + "x",
  tags: (n) => r("<a ", n),
  linkTail: (n) => r("[", n),
  zwKind: (n) => r('{"_​_kind": "a", "t":"​', n),
  mdEscKind: (n) => r('{"\\_\\_kind": "x", "\\_\\_kind": ', n),
  starRuns: (n) => r("* ** *** ", n),
  underscores: (n) => r("_a_ __", n),
  pipes: (n) => "| a | b |\n|---|---|\n" + r("| `x` | {\\\"__kind\\\":\\\"n\\\"} |\n", n),
};
const steps: Record<string, (s: string) => unknown> = {
  spelled: spelledKindsAsOneLine,
  asCode: nonJsonKindsAsCode,
  preprocess: preprocessProse,
  guard: guardMarkdownDelimiters,
  math: normalizeMathDelimiters,
  carries: markdownCarriesKind,
  normalize: normalizeKindSpellings,
  inline: (s) => inlineKindText(s),
};
it("timing", () => {
  for (const [name, make] of Object.entries(INPUTS)) {
    if (only && name !== only) continue;
    const slow = new Set<string>();
    for (const n of [1000, 4000, 16000]) {
      const text = make(n) + ` w${Math.random()}`;
      for (const [step, fn] of Object.entries(steps)) {
        if (slow.has(step)) continue;
        fs.appendFileSync(LOG, `START ${name} n=${n} len=${text.length} ${step}\n`);
        const t = performance.now();
        fn(text);
        const ms = performance.now() - t;
        if (ms > 1500) slow.add(step);
        fs.appendFileSync(LOG, `  ${ms.toFixed(1)}ms\n`);
      }
    }
  }
});
