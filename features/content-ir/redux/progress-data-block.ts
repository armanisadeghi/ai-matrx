import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { isJsonObject } from "@/types/json";

import { IR_ENVELOPE_KEY } from "../core/ir-types";
import { envelopeFromCompleteValue } from "../core/normalize";

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
  return {
    blockId: `progress_content_ir_${eventIndex}`,
    blockIndex,
    type: kind,
    status: "complete",
    content: source,
    data: null,
    metadata: {
      [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(value, kind),
    },
  };
}
