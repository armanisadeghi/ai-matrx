import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { withTerminalEnvelope, settleBrokenKindRoute } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { applyIrKindRoute } from "../react/kind-route";
import { componentRegistry } from "../registry/component-registry";
import { readEnvelope } from "../redux/render-block-envelope";
test("probe", () => {
  jest.spyOn(componentRegistry, "hasSettled").mockReturnValue(false);
  for (const body of ['{"__kind":"zz_unregistered_kind","rows":[1,2]}','{"__kind":"zz_unregistered_kind","rows":[1,2']) {
    const b = splitContentIntoBlocksV2("```json\n" + body + "\n```")[0]!;
    const r = settleBrokenKindRoute(applyIrKindRoute(withTerminalEnvelope({ type: b.type, content: b.content, metadata: b.metadata, isStreamingBlock: false }, false) as never) as never) as { type: string; metadata?: Record<string, unknown> };
    console.log(r.type, readEnvelope(r.metadata)?.root.kind, readEnvelope(r.metadata)?.root.status);
  }
});
