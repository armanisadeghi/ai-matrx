import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
const TEXT = process.env.DBG_FENCE ? "Here are 6 flashcards covering common polyatomic ions.\n\n```json\n{\"__kind\":\"flashcard_set\",\"cards\":[{\"__kind\":\"flashcard\",\"front\":\"What is nitrate?\",\"back\":\"NO3-\"}],\"title\":\"Polyatomic Ions\"}\n```" : "Here are 6 flashcards covering common polyatomic ions.\n\n<artifact type=\"flashcards\" id=\"fd4a56a0-360a-47f2-a101-f1e7c8978a0d\" version=\"1\" title=\"Polyatomic Ions\">\n{\"__kind\":\"flashcard_set\",\"cards\":[{\"__kind\":\"flashcard\",\"front\":\"What is nitrate?\",\"back\":\"NO3-\"},{\"__kind\":\"flashcard\",\"back\":\"OH-\",\"front\":\"What is hydroxide?\"}],\"title\":\"Polyatomic Ions\"}\n</artifact>";
it("dbg", () => {
  const ups: any[] = [];
  const acc = new StreamBlockAccumulator("r", (p: any) => { ups.push(p); return { type: "x", payload: p }; });
  const d = (a: unknown) => a;
  const step = Number(process.env.DBG_STEP ?? 1);
  for (let i = 0; i < TEXT.length; i += step) acc.ingest(TEXT.slice(i, i + step), d);
  acc.finalize(d);
  const seen = new Set<string>();
  for (const u of ups) {
    const b = u.block;
    let routed = "";
    try { const dec = decideBlockRender(renderBlockToContentBlock(b) as never, { isStreamActive: b.status === "streaming" }); routed = (dec.block as any).type + "/" + ((dec.block as any).language ?? ""); } catch (e) { routed = "threw " + e; }
    const sig = `${b.blockId} ${b.type} ${b.status} -> ${routed} | ${JSON.stringify((b.content ?? "").slice(0, 60))}`;
    const key = `${b.blockId} ${b.type} ${b.status} ${routed}`;
    if (!seen.has(key)) { seen.add(key); console.log(sig + " len=" + (b.content ?? "").length + " data=" + JSON.stringify(b.data).slice(0,120)); }
  }
});
