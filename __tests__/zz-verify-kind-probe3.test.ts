import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { configureServerForTest } from "@ai-matrx/chat/host/__tests__/server-test-host";
import { appChatServerApi } from "@/lib/api/chat-server-api";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { markdownCarriesKind, isJsonFenceLanguage, isKindJsonText, hasKindKey } from "@/features/content-ir/surfaces/json-kind-signal";
beforeAll(() => configureServerForTest(appChatServerApi));
const K = JSON.stringify({ __kind: "flashcard_set", title: "Cells", cards: [{ __kind: "flashcard", front: "A", back: "B" }] });
// One content-prop MarkdownStream render (static splitter), the leaf gate modelled: returns raw sample or null.
function engine(content: string, active: boolean, rerouted: string[], depth = 0): string | null {
  for (const b of splitContentIntoBlocksV2(content)) {
    if (!b.content.trim()) continue;
    const dec = decideBlockRender(b as never, { isStreamActive: active });
    if (dec.gate) continue;
    const t = dec.block.type; const c = dec.block.content ?? "";
    if (t === "code" && isJsonFenceLanguage(dec.block.language) && hasKindKey(c)) return "JSONCARD " + c.slice(0, 40);
    if (t === "text" && markdownCarriesKind(c)) {
      const own = c.trim();
      if (rerouted.some((r) => r.includes(own)) || depth > 3) return "PROSE " + c.slice(0, 40);
      const pipe = isKindJsonText(own) ? "```json\n" + own + "\n```" : c;
      const r = engine(pipe, active, [...rerouted, own, pipe.trim()], depth + 1);
      if (r) return r;
    }
  }
  return null;
}
it("content-prop streaming", () => {
  const out: string[] = [];
  const cases: Record<string, string> = { bare: K, fenced: "```json\n" + K + "\n```", proseBlankLine: "Here are your cards:\n\n" + K, proseSameLine: "Here are your cards: " + K, proseNextLine: "Here are your cards:\n" + K, heading: "## Cards\n\n" + K, pretty: JSON.stringify(JSON.parse(K), null, 2), prosePretty: "Cards:\n\n" + JSON.stringify(JSON.parse(K), null, 2) };
  for (const [n, s] of Object.entries(cases)) {
    let raw = 0; let sample = "";
    for (let i = 1; i <= s.length; i++) { const r = engine(s.slice(0, i), true, []); if (r) { raw++; sample = r; } }
    out.push(`${n.padEnd(16)} raw=${raw}/${s.length} final=${engine(s, false, []) ?? "ok"} ${sample}`);
  }
  console.log(out.join("\n"));
});
