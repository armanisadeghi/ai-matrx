import { domFrameVerdict, sampleKindFrames } from "./dom-frame-judge";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { drawsKindAsRawJson } from "../draws-raw-kind-json";

const KIND = '{"__kind":"flashcard_set","title":"Cells","cards":[{"__kind":"flashcard","front":"Q","back":"A"}]}';
function frames(stream: string) {
  const out: { block: RenderBlockPayload; final: boolean }[] = [];
  const acc = new StreamBlockAccumulator("r", (payload: any) => { out.push({ block: payload.block, final: false }); return { type: "x", payload }; });
  const d = (a: unknown) => a;
  for (const ch of stream) acc.ingest(ch, d);
  const n = out.length;
  acc.finalize(d);
  for (let i = n; i < out.length; i++) out[i].final = true;
  return out;
}
const CASES: Record<string, string> = {
  html: `<b>Cards</b>: ${KIND}\n\nAfter.`,
  code: "`x` " + KIND + "\n\nAfter.",
  comment: `<!-- c -->${KIND}\n\nAfter.`,
  img: `<img src=x>${KIND}\n\nAfter.`,
  strike: `~~old~~ ${KIND}\n\nAfter.`,
  pipe: `a | ${KIND}\n\nAfter.`,
  tableHeader: `| ${KIND} | b |\n|---|---|\n| 1 | 2 |\n\nAfter.`,
  tableCell: `| a | b |\n|---|---|\n| x | Some prose ${KIND} |\n\nAfter.`,
  answer: `<answer>${KIND}</answer>\n\nAfter.`,
  imgAlt: `![${KIND}](https://x.test/a.png)\n\nAfter.`,
};
it("explore", async () => {
  for (const [name, stream] of Object.entries(CASES)) {
    const fs = frames(stream);
    const sample = sampleKindFrames(fs, 6);
    let domRaw = 0, pureRaw = 0, dis: string[] = [];
    for (const f of sample) {
      const live = !f.final;
      const v = await domFrameVerdict(f.block, { isStreamActive: live });
      const p = drawsKindAsRawJson(f.block, { isStreamActive: live });
      if (v.raw) domRaw++;
      if (p) pureRaw++;
      if (v.raw !== p && dis.length < 2) dis.push(`${f.block.type}${f.final ? "/final" : ""} pure=${p} dom=${v.raw} src=${JSON.stringify((f.block.content ?? "").slice(0, 70))} text=${JSON.stringify(v.text.replace(/\s+/g, " ").slice(0, 90))}`);
    }
    console.log(`${name}: sampled=${sample.length}/${fs.length} dom=${domRaw} pure=${pureRaw}\n  ${dis.join("\n  ")}`);
  }
}, 600000);
