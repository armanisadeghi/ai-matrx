/**
 * Envelope helpers for hosts (accumulator / splitter / renderers):
 * reading `metadata.__ir` off render blocks, reconstructing the full source
 * object (schema values + residues merged back), and the Phase-2 shadow
 * parity check that proves the kind parser and JSON.parse agree byte-for-
 * byte on real traffic before any rendering flips.
 */

import { type CanonicalBlockIR } from "../core/ir-types";
import {
  readEnvelope,
  sanitizeInboundEnvelopeMetadata as sanitizeInboundEnvelopeMetadataPure,
} from "../core/envelope-read";
import { seedEnvelope } from "../registry/region-envelope-memo";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

// The PURE gate lives in core/envelope-read.ts (twin-safe — aidream's
// Workflow Studio consumes it with its own hooks). This module is the
// frontend HOST SHELL: it binds the memo seed + Error Inspector hooks and
// keeps the historical import path stable.
export { readEnvelope };

/**
 * Ingest guard for SERVER-BUILT envelopes (Phase 5, engine
 * "py-block-detector") riding `metadata.__ir` on a `render_block` event —
 * the frontend binding of `core/envelope-read.ts#sanitizeInboundEnvelopeMetadata`:
 * valid → same reference back + seeded into the region-envelope memo;
 * malformed → stripped copy + loud captureError. Semantics documented on the
 * pure function; contract: docs/PYTHON_ENVELOPE_CONTRACT.md.
 */
export function sanitizeInboundEnvelopeMetadata(
  metadata: Record<string, unknown> | null | undefined,
  context: { blockId: string },
): Record<string, unknown> | undefined {
  return sanitizeInboundEnvelopeMetadataPure(metadata, context, {
    seedEnvelope,
    reportMalformed: ({ blockId, engine, raw }) => {
      captureError({
        source: "content-ir",
        message: `render_block "${blockId}" carried a malformed metadata.__ir envelope (engine "${engine}") — dropped before Redux so it can't poison the pipeline`,
        relation: engine,
        raw,
      });
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// reconstructRegionValue + stripKindDeep moved to ../core/envelope-value
// (pure kernel) so kinds/legacy-bridge-utils never re-enters the registry
// cycle through this module. Imported for the shadow parity check below and
// re-exported for existing consumers.
import { reconstructRegionValue, stripKindDeep } from "../core/envelope-value";

export { reconstructRegionValue, stripKindDeep };

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
