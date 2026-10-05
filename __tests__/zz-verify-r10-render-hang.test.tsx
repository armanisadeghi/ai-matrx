// eslint-disable-next-line import/order
import { domElementVerdict } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import * as fs from "fs";
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
jest.setTimeout(3_600_000);
const LOG = process.env.ZZ_LOG!;
const log = (s: string) => fs.appendFileSync(LOG, s + "\n");
const r = (u: string, n: number) => u.repeat(n);
const INPUTS: Record<string, (n: number) => string> = {
  bracketSpaces: (n) => "See [" + r(" ", n) + "x and more",
  bracketNewlines: (n) => "See [" + r(" \n", n) + "x and more",
  bracketsOpen: (n) => r("[a ", n),
  escBracketOpen: (n) => r("\\[ x ", n),
  escParenOpen: (n) => r("\\( x ", n),
  dollarsOdd: (n) => r("$$ a ", n) + "$",
  singleDollar: (n) => r("$a ", n),
  backslashes: (n) => r("\\", n) + '"__kind\\":',
  backslashKind: (n) => r('{\\"__kind\\":\\"note\\", \\\\\\" ', n),
  entityKind: (n) => r("{&quot;__kind&quot;: &quot;n&#95; &amp;&#x5F;", n),
  braceKind: (n) => r('{"a":[1,{"__kind":"x" 1 [ ', n),
  braceOpenKind: (n) => r('{ "__kind": "x", ', n),
  nested: (n) => r("{[", n) + '"__kind":"x"' + r("]}", n),
  backticks: (n) => r("``a", n),
  tags: (n) => r("<a ", n),
  linkTail: (n) => r("[", n),
  starRuns: (n) => r("* ** *** ", n),
  pipesTable: (n) => "| a | b |\n|---|---|\n" + r('| `x` | {\\"__kind\\":\\"n\\"} |\n', n),
  realKindsMany: (n) => r('Text {"__kind":"note","title":"T"} and ', n),
  pyRepr: (n) => r("{'__kind': 'note', 'x': ", n),
};
const SIZES = (process.env.ZZ_SIZES ?? "500,2000,6000").split(",").map(Number);
async function viaBlocks(text: string) {
  for (const [index, b] of splitContentIntoBlocksV2(text).entries()) {
    await domElementVerdict(React.createElement(BlockRenderer, { block: b as never, index, isStreamActive: false, replaceBlockContent: () => undefined, handleOpenEditor: () => undefined }));
  }
}
it("render hangs", async () => {
  for (const [name, make] of Object.entries(INPUTS)) {
    if (process.env.ZZ_ONLY && !process.env.ZZ_ONLY.split(",").includes(name)) continue;
    const slow = new Set<string>();
    for (const n of SIZES) {
      const text = make(n);
      for (const [path, fn] of [
        ["blocks", viaBlocks],
        ["basic", (t: string) => domElementVerdict(React.createElement(BasicMarkdownContent, { content: t, isStreamActive: false }))],
        ["basicStreaming", (t: string) => domElementVerdict(React.createElement(BasicMarkdownContent, { content: t, isStreamActive: true }))],
      ] as const) {
        if (slow.has(path)) continue;
        log(`START ${name} n=${n} len=${text.length} ${path}`);
        const t = performance.now();
        await fn(text);
        const ms = performance.now() - t;
        if (ms > 4000) slow.add(path);
        log(`  ${ms.toFixed(0)}ms`);
      }
    }
  }
});
