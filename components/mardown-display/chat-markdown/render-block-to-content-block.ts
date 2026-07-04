/**
 * The live-stream hop: a Redux `RenderBlockPayload` (StreamBlockAccumulator
 * output, `state.activeRequests[requestId].renderBlocks`) becomes the flat
 * `RenderBlock` shape BlockRenderer consumes.
 *
 * LOAD-BEARING MAPPING: `rb.data` → `block.serverData`. For untyped code
 * blocks (fenced ```json / bare JSON) the accumulator emits
 * `data: { language: "json" }` — that annotation object arrives here as a
 * TRUTHY `serverData`. Downstream consumers must therefore never treat "has
 * serverData" as "has kind/typed data" for a block that still needs routing
 * (see `applyIrKindRoute`, which derives routed serverData from the
 * `metadata.__ir` envelope and discards this annotation).
 *
 * Extracted from EnhancedChatMarkdown so tests can drive the REAL hop —
 * the 2026-07-04 "No flashcards available yet" bug lived exactly on this
 * seam and was invisible to tests that built blocks by hand.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import type { RenderBlock } from "./block-registry/BlockRenderer";

export function renderBlockToContentBlock(rb: RenderBlockPayload): RenderBlock {
  return {
    type: rb.type,
    content: rb.content ?? "",
    serverData: (rb.data as Record<string, unknown>) ?? undefined,
    metadata: rb.metadata,
    language: (rb.data as Record<string, unknown>)?.language as
      | string
      | undefined,
    src: (rb.data as Record<string, unknown>)?.src as string | undefined,
    alt: (rb.data as Record<string, unknown>)?.alt as string | undefined,
    isStreamingBlock: rb.status === "streaming",
  };
}
