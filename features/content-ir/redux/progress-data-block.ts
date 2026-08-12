import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { isJsonObject } from "@/types/json";

import { IR_ENVELOPE_KEY } from "../core/ir-types";
import { envelopeFromCompleteValue } from "../core/normalize";
import { applyIrKindRoute } from "../react/kind-route";

/**
 * Promote a server progress event's canonical `content_ir` value into the
 * render block consumed by MarkdownStream/LiveRunDisplay.
 *
 * Pipeline endpoints still need their ordinary typed `data` event for domain
 * state. When that event also carries `content_ir`, this adapter gives the
 * exact same event a canonical visual representation without asking each
 * feature to parse or route it itself.
 */
export function progressDataRenderBlock(
  data: unknown,
  eventIndex: number,
  blockIndex: number,
): RenderBlockPayload | null {
  if (!isJsonObject(data) || !isJsonObject(data.content_ir)) return null;

  const value = data.content_ir;
  const kind = value.__kind;
  if (typeof kind !== "string" || kind.trim().length === 0) return null;

  const source = JSON.stringify(value);
  const metadata = {
    [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(value, kind),
  };
  // Route before Redux storage so the render block carries the canonical
  // component projection in `data`. Some LiveRunDisplay hops reconstruct a
  // content block from the Redux payload and cannot preserve serverData added
  // only by a later render-time transform.
  const routed = applyIrKindRoute({
    type: "code",
    serverData: { language: "json" },
    metadata,
  });
  const projectedContent = (
    routed.serverData as Record<string, unknown> | undefined
  )?.content;
  return {
    blockId: `progress_content_ir_${eventIndex}`,
    blockIndex,
    type: routed.type,
    status: "complete",
    // The unified artifact stage consumes RenderBlockPayload.content directly
    // for structured_info. Preserve the JSON in the envelope fingerprint; put
    // the registered component's canonical projection on the visible channel.
    content: typeof projectedContent === "string" ? projectedContent : source,
    data: routed.serverData ?? null,
    metadata: routed.metadata,
  };
}
