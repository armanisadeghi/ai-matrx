import * as fs from "fs";
import { normalizeMathDelimiters } from "@/components/markdown-core/math-normalizer";
import { guardMarkdownDelimiters } from "@ai-matrx/kit/delimiter-guard";
import { spelledKindsAsOneLine, nonJsonKindsAsCode } from "@/features/content-ir/surfaces/kind-one-line";
const LOG = process.env.ZZ_LOG!;
const r = (u: string, n: number) => u.repeat(n);
const C: Record<string, (n: number) => string> = {
  manyLinks: (n) => r("See [the source](https://example.com/page) for detail. ", n),
  citations: (n) => r("Claim [1](https://e.com/1) and more text here. ", n),
  bracketWs1k: () => "Array [" + r(" ", 1000) + "end",
  bracketIndent: (n) => "Data [\n" + r("        \n", n) + "x",
  braceKind: (n) => r('{"a":[1,{"__kind":"x" 1 [ ', n),
  braceOpenKind: (n) => r('{ "__kind": "x", ', n),
};
it("t", () => {
  for (const [name, make] of Object.entries(C)) for (const n of [250, 1000, 2000]) {
    const text = make(n) + Math.random();
    for (const [s, fn] of Object.entries({ math: normalizeMathDelimiters, guard: guardMarkdownDelimiters, leaf: (t: string) => nonJsonKindsAsCode(spelledKindsAsOneLine(t)) })) {
      const t0 = performance.now(); (fn as (t: string) => unknown)(text);
      fs.appendFileSync(LOG, `${name} n=${n} len=${text.length} ${s} ${(performance.now() - t0).toFixed(1)}ms\n`);
    }
  }
});
