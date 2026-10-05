import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { configureServerForTest } from "@ai-matrx/chat/host/__tests__/server-test-host";
import { appChatServerApi } from "@/lib/api/chat-server-api";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { markdownCarriesKind, isJsonFenceLanguage } from "@/features/content-ir/surfaces/json-kind-signal";
beforeAll(() => configureServerForTest(appChatServerApi));
const K = JSON.stringify({ __kind: "flashcard_set", title: "Cells", cards: [{ __kind: "flashcard", front: "A", back: "B" }] });
it("x", () => {
  const out: string[] = [];
  for (const s of [K, "```json\n" + K + "\n```", "Here:\n\n" + K, "#" + K]) {
    for (const i of [12, 20, 40, 60, 90, s.length]) {
      const p = s.slice(0, i);
      const bl = splitContentIntoBlocksV2(p).filter((b) => b.content.trim()).map((b) => {
        const dec = decideBlockRender(b as never, { isStreamActive: true });
        const raw = !dec.gate && ((dec.block.type === "text" && markdownCarriesKind(dec.block.content ?? "")) || (dec.block.type === "code" && isJsonFenceLanguage(dec.block.language) && /__kind/.test(dec.block.content ?? "")));
        return `${b.type}/${(b as {language?:string}).language ?? ""}->${dec.block.type}/${dec.block.language ?? ""}${dec.gate ? "[" + dec.gate.kind + "]" : ""}${raw ? " RAW" : ""}`;
      });
      out.push(`${JSON.stringify(p.slice(0, 25))}@${i}: ${bl.join(" | ")}`);
    }
  }
  console.log(out.join("\n"));
});
