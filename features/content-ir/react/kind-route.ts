/**
 * The Phase-4 render flip, as a pure block transform.
 *
 * A block whose `metadata.__ir` envelope resolved a REGISTERED kind is
 * routed to that kind's component: today via the legacy-bridge facet
 * (`legacyBlockType` + `toLegacyServerData`), so the block enters the
 * existing unified renderer as its real type with envelope-derived
 * serverData. Blocks with no envelope, an unregistered kind, or no bridge
 * facet pass through UNTOUCHED — the strangler seam.
 *
 * This is where a bare/fenced JSON flashcard_set — which the legacy
 * detectors could only ever call "code" — becomes real flashcards, live
 * while streaming (the accumulator refreshes the envelope every flush).
 */

import { kindRegistry } from "../registry/kind-registry";
import { readEnvelope } from "../redux/render-block-envelope";

export interface IrRoutableBlock {
  type: string;
  serverData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function applyIrKindRoute<T extends IrRoutableBlock>(block: T): T {
  const envelope = readEnvelope(block.metadata);
  if (!envelope) return block;

  const kind = envelope.root.kind;
  if (!kind) return block; // raw / pending — legacy rendering stands

  const def = kindRegistry.getDefinition(kind);
  if (!def?.legacyBlockType) return block;

  // Explicit server-provided data always wins over envelope derivation.
  const serverData = block.serverData ?? def.toLegacyServerData?.(envelope);

  if (block.type === def.legacyBlockType && block.serverData) {
    return block;
  }

  return {
    ...block,
    type: def.legacyBlockType,
    ...(serverData ? { serverData } : {}),
  };
}
