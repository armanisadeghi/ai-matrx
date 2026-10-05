import { domFrameVerdict } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
const J = '{"__kind":"flashcard_set","title":"Polyatomic Ions","cards":[{"__kind":"flashcard","front":"What is the formula and charge of the nitrate ion?","back":"NO3-"},{"__kind":"flashcard","front":"What is the formula and charge of the sulfate ion?","back":"SO4^2-"},{"__kind":"flashcard","front":"What is the formula and charge of the hydroxide ion?","back":"OH-"}]}';
const TEXT = "Here are 6 flashcards covering common polyatomic ions.\n\n```json\n" + J + "\n```";
jest.setTimeout(300000);
it("dbg dom", async () => {
  const ups: any[] = [];
  const acc = new StreamBlockAccumulator("r", (p: any) => { ups.push(p); return { type: "x", payload: p }; });
  const d = (a: unknown) => a;
  const step = Number(process.env.DBG_STEP ?? 1);
  for (let i = 0; i < TEXT.length; i += step) acc.ingest(TEXT.slice(i, i + step), d);
  acc.finalize(d);
  const seen = new Set<string>();
  for (const u of ups) {
    const b = u.block;
    const dec = decideBlockRender(renderBlockToContentBlock(b) as never, { isStreamActive: b.status === "streaming" });
    const key = `${b.blockId} ${b.type} ${b.status} ${(dec.block as any).type}`;
    if (seen.has(key)) continue; seen.add(key);
    const v = await domFrameVerdict(b);
    console.log(`${key} len=${(b.content??"").length} raw=${v.raw} TEXT=${JSON.stringify(v.text.slice(0,250))}`);
  }
});
