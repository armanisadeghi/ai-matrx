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

import { envelopeFromCompleteValue } from "../core/normalize";
import { readObjectKind } from "../core/kind-schema.types";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rehydration route for STRUCTURED persisted artifacts (Track 2B).
 *
 * A materialized kind artifact stores its zero-loss value object (carrying
 * `__kind`) as `canvas_items.content.data`. Given that stored value, derive
 * the registered kind's legacy `serverData` WITHOUT re-parsing any text: the
 * value wraps into a complete envelope and runs through the same
 * `toLegacyServerData` bridge the live stream uses. Returns null for
 * non-objects, unregistered kinds, or kinds without a legacy bridge — callers
 * fall back to the string-payload path (which legacy rows keep forever).
 */
export function kindServerDataFromStoredValue(
  value: unknown,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const kind = readObjectKind(value);
  if (!kind) return null;

  const def = kindRegistry.getDefinition(kind);
  if (!def?.toLegacyServerData) return null;

  return def.toLegacyServerData(envelopeFromCompleteValue(value, kind)) ?? null;
}
