import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
const J = '{"__kind":"flashcard_set","title":"Polyatomic Ions","cards":[{"__kind":"flashcard","front":"What is the formula and charge of the nitrate ion?","back":"NO3-"}]}';
const TEXT = "Here are 6 flashcards covering common polyatomic ions.\n\n```json\n" + J + "\n```";
it("dbg slot", () => {
  for (const step of [1, 3, 8, 20]) {
  const ups: any[] = [];
  const acc = new StreamBlockAccumulator("r", (p: any) => { ups.push(p); return { type: "x", payload: p }; });
  const d = (a: unknown) => a;
  for (let i = 0; i < TEXT.length; i += step) acc.ingest(TEXT.slice(i, i + step), d);
  acc.finalize(d);
  const seen = new Set<string>();
  for (const u of ups) {
    const b = u.block; if (b.type !== "text" || !b.content?.trim()) continue;
    const sub = splitContentIntoBlocksV2(b.content).map((x: any) => `${x.type}${x.language ? "/" + x.language : ""}:${JSON.stringify(x.content.slice(0, 30))}`).join(" | ");
    const key = b.status + sub.replace(/:".*?"/g, "");
    if (seen.has(key)) continue; seen.add(key);
    console.log(`step=${step} ${b.blockId} ${b.status} content=${JSON.stringify(b.content.slice(-20))} -> ${sub}`);
  }}
});
