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

import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import type { RenderBlock } from "./block-registry/BlockRenderer";

/**
 * THE ARTIFACT BODY. The accumulator keeps an `<artifact …>` block's tag lines
 * in `content` (its `metadata.rawXml` must round-trip the source verbatim);
 * the reload splitter hands the renderer only the body between the tags.
 * ArtifactBlock parses `content` AS the payload, so the live block drew
 * "No flashcards available yet" settled and the raw `__kind` JSON mid-stream
 * while a reload drew the cards. Same body on both paths, by construction:
 * the opening tag, the closing tag (or the closer's partial tail mid-stream)
 * and the blank edges go; the body is untouched.
 */
export function artifactBodyOf(content: string): string {
  let body = content;
  const open = /^\s*<artifact\b[^>]*>/i.exec(body);
  if (open) body = body.slice(open[0].length);
  else if (/^\s*<artifact\b/i.test(body)) return ""; // the opening tag is still arriving
  const close = body.lastIndexOf("</artifact>");
  if (close !== -1) {
    body = body.slice(0, close);
  } else {
    // Mid-stream: a closer that has only partly arrived ("</arti") is chrome.
    const tail = /<\/?[a-z]*$/i.exec(body);
    if (tail && "</artifact>".startsWith(tail[0].toLowerCase())) {
      body = body.slice(0, tail.index);
    }
  }
  return body.replace(/^\s*\n/, "").trimEnd();
}

export function renderBlockToContentBlock(rb: RenderBlockPayload): RenderBlock {
  return {
    type: rb.type,
    content:
      rb.type === "artifact" ? artifactBodyOf(rb.content ?? "") : (rb.content ?? ""),
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
