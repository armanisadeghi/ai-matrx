import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { pendingStructuredEnvelope } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { applyIrKindRoute } from "../react/kind-route";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";

const K = JSON.stringify({ __kind: "flashcard_set", title: "T", cards: [{ __kind: "flashcard", front: "a", back: "b" }] });
function run(stream: string, fin = true) {
  const ups: RenderBlockPayload[] = [];
  const acc = new StreamBlockAccumulator("probe", (p) => { ups.push((p as any).block); return p; });
  const d = (a: unknown) => a;
  for (const ch of stream) acc.ingest(ch, d);
  if (fin) acc.finalize(d);
  const last = new Map<string, RenderBlockPayload>();
  for (const b of ups) last.set(b.blockId, b);
  return [...last.values()].filter(b => b.content).map(b => {
    const routed = applyIrKindRoute(renderBlockToContentBlock(b));
    const env = readEnvelope(b.metadata);
    return { id: b.blockId, type: b.type, status: b.status, routed: routed.type, kind: env?.root.kind, ks: env?.root.kindState, st: env?.root.status, pend: !!pendingStructuredEnvelope(routed), content: (b.content ?? "").slice(0, 50) };
  });
}
const cases: Record<string, string> = {
  tilde: `Here:\n\n~~~json\n${K}\n~~~\n\nAfter.`,
  sameLine: `Here: ${K}\nAfter.`,
  array: `Here:\n\n[${K},${K}]\n\nAfter.`,
  arrayFence: "Here:\n\n```json\n[" + K + "," + K + "]\n```\nAfter.",
  nested: `Here:\n\n{"result":${K},"note":"x"}\n\nAfter.`,
  nestedFence: "Here:\n\n```json\n{\"result\":" + K + ",\"note\":\"x\"}\n```\nAfter.",
  xml: `<info>\n${K}\n</info>\nAfter.`,
  truncFence: "Here:\n\n```json\n" + K.slice(0, 60) + "\n```\nAfter.",
};
test("probe", () => {
  for (const [name, s] of Object.entries(cases)) {
    // eslint-disable-next-line no-console
    console.log(name, JSON.stringify(run(s), null, 1));
  }
});
