// eslint-disable-next-line import/order -- the judge's mocks must register first
import { domElementVerdict, domFrameVerdict } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
jest.setTimeout(600_000);
const C: Array<[string, string]> = [
  ["esc unclosed", 'Example: {\\"__kind\\":\\"note\\", and then the rest of my long answer which must stay visible. Thanks.'],
  ["esc x2", 'See {\\\\\\"__kind\\\\\\":\\\\\\"note\\\\\\",\\\\\\"title\\\\\\":\\\\\\"Hi\\\\\\"} and then more text here. Thanks.'],
  ["literal unclosed", 'Example {"__kind":"note","title":"Hi" and then the rest of my answer. Thanks.'],
];
async function reload(text: string) {
  const parts: string[] = [];
  for (const [index, block] of splitContentIntoBlocksV2(text).entries()) {
    const v = await domElementVerdict(React.createElement(BlockRenderer, { block: block as never, index, isStreamActive: false, replaceBlockContent: () => undefined, handleOpenEditor: () => undefined }));
    parts.push((v.raw ? "RAW:" : "") + v.text);
  }
  return parts.join("|");
}
async function live(text: string) {
  const settled = new Map<string, RenderBlockPayload>();
  const acc = new StreamBlockAccumulator("r", (p) => { const b = (p as { block: RenderBlockPayload }).block; settled.set(b.blockId, b); return { type: "t", payload: p }; });
  const d = (a: unknown) => a;
  for (const ch of text) acc.ingest(ch, d);
  acc.finalize(d);
  const out: string[] = [];
  for (const b of [...settled.values()].sort((a, b) => a.blockIndex - b.blockIndex)) {
    const v = await domFrameVerdict(b, { isStreamActive: false });
    out.push(`[${b.type}]` + (v.raw ? "RAW:" : "") + v.text);
  }
  return out.join("|");
}
it.each(C)("%s", async (name, text) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ name, one: spelledKindsAsOneLine(text), reload: (await reload(text)).replace(/\s+/g, " "), live: (await live(text)).replace(/\s+/g, " ") }, null, 1));
});
