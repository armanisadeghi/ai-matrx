/**
 * Envelope helpers for hosts (accumulator / splitter / renderers):
 * reading `metadata.__ir` off render blocks, reconstructing the full source
 * object (schema values + residues merged back), and the Phase-2 shadow
 * parity check that proves the kind parser and JSON.parse agree byte-for-
 * byte on real traffic before any rendering flips.
 */

import {
  IR_ENVELOPE_KEY,
  isEmptyResidue,
  type CanonicalBlockIR,
} from "../core/ir-types";
import { KIND_KEY } from "../core/kind-schema.types";
import { isCanonicalBlockIR } from "../core/normalize";
import { seedEnvelope } from "../registry/region-envelope-memo";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

/** Read a CanonicalBlockIR envelope off a block's metadata (or anything). */
export function readEnvelope(
  metadata: Record<string, unknown> | null | undefined,
): CanonicalBlockIR | null {
  const candidate = metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

/**
 * Ingest guard for SERVER-BUILT envelopes (Phase 5, engine
 * "py-block-detector") riding `metadata.__ir` on a `render_block` event.
 * Contract: features/content-ir/docs/PYTHON_ENVELOPE_CONTRACT.md.
 *
 * - No `__ir` key → the SAME metadata reference back (zero-touch pass).
 * - Valid CanonicalBlockIR → the SAME metadata reference back (reuse-by-
 *   reference — the idempotence law; the envelope flows into Redux untouched)
 *   AND the envelope is seeded into the region-envelope memo so any later
 *   re-split of the same region source reuses it instead of parsing.
 * - Malformed/foreign `__ir` → a COPY with `__ir` stripped, plus a loud
 *   captureError naming the engine + blockId. A bad envelope must never
 *   poison kind routing or the persistence cache; dropping it degrades that
 *   block to the ordinary content-driven path, nothing more.
 */
export function sanitizeInboundEnvelopeMetadata(
  metadata: Record<string, unknown> | null | undefined,
  context: { blockId: string },
): Record<string, unknown> | undefined {
  if (!metadata || !(IR_ENVELOPE_KEY in metadata)) {
    return metadata ?? undefined;
  }

  const candidate = metadata[IR_ENVELOPE_KEY];
  if (isCanonicalBlockIR(candidate)) {
    seedEnvelope(candidate);
    return metadata;
  }

  const engine =
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { engine?: unknown }).engine === "string"
      ? (candidate as { engine: string }).engine
      : "unknown";
  captureError({
    source: "content-ir",
    message: `render_block "${context.blockId}" carried a malformed metadata.__ir envelope (engine "${engine}") — dropped before Redux so it can't poison the pipeline`,
    relation: engine,
    raw: candidate,
  });

  const { [IR_ENVELOPE_KEY]: _dropped, ...rest } = metadata;
  void _dropped;
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rebuild the region's full data: walk the root value and merge each node's
 * residue extras back in (root residue + nodeIndex residues). This is the
 * zero-data-loss read: nothing the model emitted is missing, whether or not
 * a schema knew about it.
 */
export function reconstructRegionValue(
  envelope: CanonicalBlockIR,
): Record<string, unknown> {
  const cloned = structuredClone(envelope.root.value);

  const applyExtras = (
    target: Record<string, unknown>,
    extras: Record<string, unknown> | null | undefined,
  ) => {
    if (!extras) return;
    for (const [key, value] of Object.entries(extras)) {
      target[key] = structuredClone(value);
    }
  };

  applyExtras(cloned, envelope.root.residue?.extra);

  for (const [pathKey, meta] of Object.entries(envelope.nodeIndex ?? {})) {
    const residue = meta.residue;
    if (!residue || isEmptyResidue(residue) || !residue.extra) continue;

    const segments = pathKey.split(".");
    let cursor: unknown = cloned;
    for (const segment of segments) {
      if (Array.isArray(cursor)) {
        cursor = cursor[Number(segment)];
      } else if (isRecord(cursor)) {
        cursor = cursor[segment];
      } else {
        cursor = undefined;
        break;
      }
    }
    if (isRecord(cursor)) {
      applyExtras(cursor, residue.extra);
    }
  }

  return cloned;
}

/** Deep-remove the __kind discriminator (the parser injects it into snapshots). */
export function stripKindDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripKindDeep);
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === KIND_KEY) continue;
      out[key] = stripKindDeep(child);
    }
    return out;
  }
  return value;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (!deepEqual(left[i], right[i])) return false;
    }
    return true;
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!(key in right)) return false;
      if (!deepEqual(left[key], right[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Phase-2 shadow parity: does the envelope, reconstructed and stripped of
 * injected __kind discriminators, deep-equal what JSON.parse sees? Sources
 * that legitimately carry __kind are stripped on both sides, so injection
 * (speculation / expectedRootKind) never reads as a mismatch.
 */
export function envelopeMatchesParsedSource(
  envelope: CanonicalBlockIR,
  parsedSource: unknown,
): boolean {
  if (!isRecord(parsedSource)) return false;
  return deepEqual(
    stripKindDeep(reconstructRegionValue(envelope)),
    stripKindDeep(parsedSource),
  );
}
