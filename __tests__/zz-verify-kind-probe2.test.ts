import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { configureServerForTest } from "@ai-matrx/chat/host/__tests__/server-test-host";
import { appChatServerApi } from "@/lib/api/chat-server-api";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { drawsKindAsRawJson } from "@/features/content-ir/render-paths/draws-raw-kind-json";
import { markdownCarriesKind, isJsonFenceLanguage } from "@/features/content-ir/surfaces/json-kind-signal";

beforeAll(() => configureServerForTest(appChatServerApi));
const K = JSON.stringify({ __kind: "flashcard_set", title: "Cells", cards: [{ __kind: "flashcard", front: "A", back: "B" }] });

function streamRaw(stream: string, id: string) {
  const latest = new Map<string, RenderBlockPayload>();
  const acc = new StreamBlockAccumulator(id, (payload) => { const b = (payload as { block: RenderBlockPayload }).block; latest.set(b.blockId, b); return { type: "t", payload }; });
  const d = (a: unknown) => a;
  let n = 0; let total = 0; let sample = "";
  for (const ch of stream) {
    acc.ingest(ch, d); total++;
    let hit = false;
    for (const b of latest.values()) if (drawsKindAsRawJson(b, { isStreamActive: true })) { hit = true; sample = (b.content ?? "").slice(0, 40); }
    if (hit) n++;
  }
  acc.finalize(d);
  let finalRaw = 0;
  for (const b of latest.values()) if (drawsKindAsRawJson(b, { isStreamActive: false })) finalRaw++;
  return { frames: `${n}/${total}`, finalRaw, sample };
}
function splitterRaw(stream: string, active: boolean) {
  let n = 0;
  for (let i = 1; i <= stream.length; i++) {
    const s = stream.slice(0, i);
    for (const b of splitContentIntoBlocksV2(s)) {
      if (!b.content.trim()) continue;
      const dec = decideBlockRender(b as never, { isStreamActive: active });
      if (dec.gate) continue;
      if (dec.block.type === "text" && markdownCarriesKind(dec.block.content ?? "")) { n++; break; }
      if (dec.block.type === "code" && isJsonFenceLanguage(dec.block.language) && /__kind/.test(dec.block.content ?? "")) { n++; break; }
    }
  }
  return `${n}/${stream.length}`;
}
const PREFIXES = ["**Result:** ", "Here is the `flashcard_set`: ", "Use `json`: ", "Done ✅ ", "Résumé: ", "<b>Cards</b>: ", "Cards<br>", "a | b ", "x ~ y ", "Price ~$5: ", "**Cards** — ", "_Cards_: ", "[link](http://a.b) ", "<kbd>x</kbd> "];
describe("prefix probe", () => {
  it("runs", () => {
    const rows: string[] = [];
    for (const p of PREFIXES) {
      const s = `${p}${K}\n`;
      const r = streamRaw(s, "r-" + p);
      rows.push(`${JSON.stringify(p).padEnd(28)} stream=${r.frames} final=${r.finalRaw} splitterLive=${splitterRaw(s, true)} splitterSettled=${splitterRaw(s + "", false).split("/")[0]} ${r.sample}`);
    }
    // eslint-disable-next-line no-console
    console.log(rows.join("\n"));
  });
});
