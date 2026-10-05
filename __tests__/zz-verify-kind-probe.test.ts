import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { configureServerForTest } from "@ai-matrx/chat/host/__tests__/server-test-host";
import { appChatServerApi } from "@/lib/api/chat-server-api";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { drawsKindAsRawJson } from "@/features/content-ir/render-paths/draws-raw-kind-json";
import { hasKindKey } from "@/features/content-ir/surfaces/json-kind-signal";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";

beforeAll(() => configureServerForTest(appChatServerApi));
const K = JSON.stringify({ __kind: "flashcard_set", title: "Cells", cards: [{ __kind: "flashcard", front: "A", back: "B" }] });

function run(stream: string, id: string) {
  const latest = new Map<string, RenderBlockPayload>();
  const acc = new StreamBlockAccumulator(id, (payload) => {
    const block = (payload as { block: RenderBlockPayload }).block;
    latest.set(block.blockId, block);
    return { type: "t", payload };
  });
  const d = (a: unknown) => a;
  const raw: string[] = [];
  const otherTypesWithKind = new Set<string>();
  for (const ch of stream) {
    acc.ingest(ch, d);
    for (const b of latest.values()) {
      if (drawsKindAsRawJson(b, { isStreamActive: true })) raw.push(`${b.type}: ${(b.content ?? "").slice(0, 60)}`);
      if (hasKindKey(b.content ?? "")) {
        const dec = decideBlockRender(renderBlockToContentBlock(b), { isStreamActive: true });
        if (!dec.gate && !["text", "code"].includes(dec.block.type)) otherTypesWithKind.add(dec.block.type);
        if (!dec.gate && dec.block.type === "text") otherTypesWithKind.add("text~" + (dec.block.content ?? "").slice(0, 50));
      }
    }
  }
  acc.finalize(d);
  const final = [...latest.values()].filter((b) => (b.content ?? "").trim()).sort((a, b) => a.blockIndex - b.blockIndex)
    .map((b) => { const dec = decideBlockRender(renderBlockToContentBlock(b), { isStreamActive: false }); return `${b.type}->${dec.block.type}${dec.gate ? "[gate]" : ""}${drawsKindAsRawJson(b, { isStreamActive: false }) ? " RAW" : ""}: ${(b.content ?? "").slice(0, 50).replace(/\n/g, "⏎")}`; });
  const reload = splitContentIntoBlocksV2(stream).filter((b) => b.content.trim()).map((b) => {
    const dec = decideBlockRender(b as never, { isStreamActive: false });
    return `${b.type}->${dec.block.type}${dec.gate ? "[gate]" : ""}: ${b.content.slice(0, 50).replace(/\n/g, "⏎")}`;
  });
  return { raw: [...new Set(raw)], other: [...otherTypesWithKind], final, reload };
}

const CASES: Record<string, string> = {
  link: `See [${K}](https://x.com) here.\n`,
  image: `![${K}](https://x.com/a.png)\n`,
  heading: `# ${K}\n\nmore\n`,
  h2prose: `## Result: ${K}\n`,
  thinkSameLine: `<thinking>plan</thinking>${K}\n`,
  thinkTag: `<think>\nhmm\n</think>\n${K}\n`,
  reasoningTag: `<reasoning>x</reasoning> ${K}`,
  listItem: `- item ${K}\n- two\n`,
  orderedNested: `1. one\n   - ${K}\n`,
  tableFenced: `| a | b |\n|---|---|\n| x | ${K} |\n`,
  htmlDiv: `<div>${K}</div>\n`,
  htmlSpan: `text <span>${K}</span> end\n`,
  footnote: `Text[^1]\n\n[^1]: ${K}\n`,
  emphasis: `**${K}**\n`,
  strike: `~~${K}~~\n`,
  latex: `$$\n${K}\n$$\n`,
  mermaidish: "```mermaid\n" + K + "\n```\n",
  markdownFence: "```markdown\n" + K + "\n```\n",
  mdFence: "```md\n" + K + "\n```\n",
  textFence: "```text\n" + K + "\n```\n",
  jsonlFence: "```jsonl\n" + K + "\n```\n",
  ndjson: "```ndjson\n" + K + "\n```\n",
  javascriptJson: "```javascript\n" + K + "\n```\n",
  fourBacktick: "````json\n" + K + "\n````\n",
  indentedFence: "   ```json\n   " + K + "\n   ```\n",
  fenceInList: "- a\n  ```json\n  " + K + "\n  ```\n",
  doubleEncoded: JSON.stringify(K) + "\n",
  setext: `${K}\n===\n`,
  escapedMd: K.replace(/_/g, "\\_") + "\n",
  spacedKey: `{ "__kind" : "flashcard_set", "title": "x" }\n`,
  prettyFirstKeyLater: `{\n  "title": "x",\n  "__kind": "flashcard_set"\n}\n`,
  bareArrayOfKinds: `[${K},${K}]\n`,
  twoOnOneLine: `${K} ${K}\n`,
  kindThenTool: `${K.slice(0, 30)}`,
  zeroWidth: `​${K}\n`,
  bomPrefix: `﻿${K}\n`,
  nbspIndent: `  ${K}\n`,
  pythonDict: `{'__kind': 'flashcard_set', 'title': 'x'}\n`,
  yamlFence: "```yaml\n__kind: flashcard_set\ntitle: x\n```\n",
  yamlBare: "__kind: flashcard_set\ntitle: x\n",
  xmlKindAttr: `<flashcard_set __kind="flashcard_set" title="x"/>\n`,
  admonition: `> [!NOTE]\n> ${K}\n`,
  nestedQuote: `> > ${K}\n`,
  quoteInList: `- > ${K}\n`,
  detailsMulti: `<details>\n<summary>s</summary>\n\n${K}\n\n</details>\n`,
  commentWrapped: `<!-- -->${K}\n`,
};

describe("probe", () => {
  for (const [name, s] of Object.entries(CASES)) {
    it(name, () => {
      const r = run(s, "req-" + name);
      // eslint-disable-next-line no-console
      console.log(name, JSON.stringify(r, null, 1));
    });
  }
});
