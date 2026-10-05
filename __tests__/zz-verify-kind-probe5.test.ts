import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { configureServerForTest } from "@ai-matrx/chat/host/__tests__/server-test-host";
import { appChatServerApi } from "@/lib/api/chat-server-api";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { hasKindKey } from "@/features/content-ir/surfaces/json-kind-signal";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
beforeAll(() => configureServerForTest(appChatServerApi));
const K = JSON.stringify({ __kind: "flashcard_set", title: "Cells", cards: [{ __kind: "flashcard", front: "A", back: "B" }] });
function run(stream: string, id: string) {
  const latest = new Map<string, RenderBlockPayload>();
  const acc = new StreamBlockAccumulator(id, (payload) => { const b = (payload as { block: RenderBlockPayload }).block; latest.set(b.blockId, b); return { type: "t", payload }; });
  const d = (a: unknown) => a;
  let frames = 0; const samples = new Set<string>();
  for (const ch of stream) {
    acc.ingest(ch, d);
    let hit = false;
    for (const b of latest.values()) {
      if (!hasKindKey(b.content ?? "")) continue;
      const dec = decideBlockRender(renderBlockToContentBlock(b), { isStreamActive: true });
      if (dec.gate) continue;
      if (!["text", "code"].includes(dec.block.type) && !/flashcard/.test(dec.block.type)) { hit = true; samples.add(dec.block.type + ": " + JSON.stringify(dec.block.content).slice(0, 90)); }
    }
    if (hit) frames++;
  }
  return { frames: `${frames}/${stream.length}`, samples: [...samples].slice(-3) };
}
const CASES: Record<string, string> = {
  tableCell: `| a | b |\n|---|---|\n| x | ${K} |\n`,
  tableCellMid: `| a | b |\n|---|---|\n| x | see ${K} here |\n| y | z |\n`,
  tableHeader: `| ${K} | b |\n|---|---|\n| x | y |\n`,
  taskList: `- [ ] ${K}\n`,
  imageAltOnly: `![${K}]\n`,
  mathInline: `$${K}$\n`,
};
it("other-type frames", () => {
  const out: string[] = [];
  for (const [n, s] of Object.entries(CASES)) out.push(n + " " + JSON.stringify(run(s, "r5" + n)));
  console.log(out.join("\n"));
});
