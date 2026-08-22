/**
 * THE inbound `render_block` funnel — one implementation, every transport.
 *
 * A server-built render block reaches this app two ways now: the chat/agent
 * NDJSON stream (`thunks/process-stream.ts`) and a workflow run's ephemeral
 * `node_stream` channel (`features/workflow-runtime`, where the same events
 * arrive sliced into frames). Both must apply the SAME wire-boundary rules
 * before anything reaches Redux, or one surface renders a block the other
 * would have rejected:
 *
 *   1. `metadata.__ir` — the VERIFIED envelope. A valid one passes through by
 *      reference (the idempotence law, and the guard seeds the memo); a
 *      malformed one is stripped LOUDLY so it can never poison kind routing
 *      or the persistence cache.
 *   2. `metadata.__ir_partial` — the PROVISIONAL channel. Malformed is
 *      stripped at the same boundary and for the same reason: a bad event is
 *      decided ONCE here, not re-decided by every later reader.
 *   3. Staleness / carry-forward. The producer clears the partial key on
 *      every non-advancing event, so most events carry none — a consumer that
 *      stores blocks by replacement must carry an OPEN block's last accepted
 *      partial forward or the render flickers back to a skeleton on every
 *      token. One gate per stream; see `makePartialKindStalenessGate`.
 *   4. Image blocks route through the canonical `UnifiedImageBlock` adapter so
 *      the rest of the system sees one shape.
 *
 * Contract: `common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md`.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { sanitizeInboundEnvelopeMetadata } from "@/features/content-ir/redux/render-block-envelope";
import { sanitizeInboundPartialKindMetadata } from "@/features/content-ir/core/partial-kind";
import { fromRenderBlock } from "@/features/files/blocks/image/adapters/from-render-block";

/** Per-stream staleness gate, as returned by `makePartialKindStalenessGate`. */
export type PartialKindGate = (
  blockId: string,
  metadata: Record<string, unknown> | undefined,
) => Record<string, unknown> | undefined;

/**
 * Apply every wire-boundary rule to one inbound render block.
 *
 * Returns `{ block, sanitized }` — `block` is what to store (image blocks are
 * adapted), `sanitized` is the pre-adapter block for the timeline, which must
 * never carry an envelope the pipeline rejected. Both are the SAME reference
 * as the input when nothing needed changing.
 */
export function prepareInboundRenderBlock(
  data: RenderBlockPayload,
  gatePartialKindStaleness: PartialKindGate,
): { block: RenderBlockPayload; sanitized: RenderBlockPayload } {
  const sanitizedMetadata = sanitizeInboundPartialKindMetadata(
    sanitizeInboundEnvelopeMetadata(data.metadata, { blockId: data.blockId }),
    { blockId: data.blockId },
    {
      reportMalformed: ({ blockId, raw }) => {
        captureError({
          source: "content-ir",
          message: `render_block "${blockId}" carried a malformed metadata.__ir_partial event — dropped before Redux so it can never drive a provisional render`,
          relation: "partial-kind",
          raw,
        });
      },
    },
  );
  const gatedMetadata = gatePartialKindStaleness(data.blockId, sanitizedMetadata);
  const sanitized =
    gatedMetadata === data.metadata ? data : { ...data, metadata: gatedMetadata };

  if (sanitized.type !== "image") return { block: sanitized, sanitized };

  // The adapter takes the loose payload directly and validates internally —
  // no force-cast needed.
  const unified = fromRenderBlock(sanitized);
  return {
    block: {
      ...sanitized,
      type: "image_output",
      data: unified as unknown as Record<string, unknown>,
    },
    sanitized,
  };
}
