import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { drawsKindAsRawJson } from "../render-paths/draws-raw-kind-json";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));
const K = JSON.stringify({ __kind: "flashcard_set", title: "Cells", cards: [{ __kind: "flashcard", front: "Q", back: "A" }] });
function frames(text: string) {
  const out: RenderBlockPayload[] = [];
  const acc = new StreamBlockAccumulator("r", (p) => { out.push((p as { block: RenderBlockPayload }).block); return p; });
  const d = (a: unknown) => a;
  for (const c of text) acc.ingest(c, d);
  return out;
}
it("print", () => {
  const log: string[] = [];
  for (const t of [`<answer>${K}</answer>\nok`, `<div>\n${K}\n</div>\n`, "```jsonc\n// note\n" + K + "\n```\n", `| a | b |\n|---|---|\n| x | ${K} |\n`]) {
    const fs = frames(t);
    const kinds = fs.filter((f) => (f.content ?? "").includes('"__kind":"flashcard_set","title"'));
    const f = kinds[0];
    log.push(`${JSON.stringify(t.slice(0, 12))} type=${f?.type} data=${JSON.stringify(f?.data)} judge=${f ? drawsKindAsRawJson(f, { isStreamActive: true }) : "-"} rawFrames=${fs.filter((x) => drawsKindAsRawJson(x, { isStreamActive: true })).length}/${fs.length}`);
  }
  for (const t of [`---\n${K}\n---\n`, `Hi\n\n---\n${K}\n\nAfter`, `Hi\n\n---\n\n${K}\n\n---\n`, `---\ntitle: x\n---\n${K}\n`]) {
    log.push(`static ${JSON.stringify(t.slice(0, 14))}: ` + JSON.stringify(splitContentIntoBlocksV2(t).map((b) => [b.type, b.language, b.content.slice(0, 30)])));
  }
  console.log(log.join("\n"));
});
