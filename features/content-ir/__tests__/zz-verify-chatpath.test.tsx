// eslint-disable-next-line import/order
import { domElementVerdict, domFrameVerdict } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

const E = '{\\"__kind\\":\\"flashcard_set\\",\\"title\\":\\"Cells\\"}';
const Z = '{"__​kind":"flashcard_set","title":"Cells"}';
const CASES: Array<[string, string]> = [
  ["escaped-in-prose", `The tool returned ${E} for you.`],
  ["escaped-alone", `Here you go:\n\n${E}\n\nDone.`],
  ["zw-in-prose", `Here are your cards: ${Z} enjoy.`],
  ["zw-alone", `Here you go:\n\n${Z}\n\nDone.`],
  ["smart-quotes", 'Here: {“__kind”: “flashcard_set”, “title”: “Cells”}'],
  ["html-entities", 'Here:\n\n{&quot;__kind&quot;: &quot;flashcard_set&quot;, &quot;title&quot;: &quot;Cells&quot;}'],
];

function liveSettled(text: string): RenderBlockPayload[] {
  const byIdx = new Map<number, RenderBlockPayload>();
  const acc = new StreamBlockAccumulator("req-zz", (payload) => {
    const b = (payload as { block: RenderBlockPayload }).block;
    byIdx.set(b.blockIndex ?? 0, b);
    return { type: "t", payload };
  });
  const d = (a: unknown) => a;
  for (let i = 0; i < text.length; i += 7) acc.ingest(text.slice(i, i + 7), d);
  acc.finalize(d);
  return [...byIdx.values()];
}

it("chat paths", async () => {
  const out: string[] = [];
  for (const [label, text] of CASES) {
    for (const b of liveSettled(text)) {
      const v = await domFrameVerdict(b, { isStreamActive: false });
      out.push(`${v.raw ? "RAW" : "ok "} live ${label} [${b.type}] :: ${v.text.replace(/\s+/g, " ").slice(0, 160)}`);
    }
    for (const [i, block] of splitContentIntoBlocksV2(text).entries()) {
      const v = await domElementVerdict(React.createElement(BlockRenderer, { block: block as never, index: i, isStreamActive: false, replaceBlockContent: () => undefined, handleOpenEditor: () => undefined }));
      out.push(`${v.raw ? "RAW" : "ok "} reload ${label} [${(block as { type: string }).type}] :: ${v.text.replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }
  require("fs").writeFileSync(process.env.ZZ_OUT!, out.join("\n"));
}, 600_000);
