/**
 * Memoized one-shot envelopes for the STATIC path (content-splitter-v2).
 *
 * The splitter runs on DB-loaded messages AND on the hot re-split path while
 * a message streams, so this must be cheap and idempotent:
 * - Only COMPLETE JSON regions are normalized (balanced-brace guard) — live
 *   partials are the accumulator's job (it has the streaming session).
 * - Results are memoized by source text, so repeated re-splits of the same
 *   message return the SAME envelope object (reference equality → React
 *   bail-outs) and never re-parse.
 */

import { CONTENT_IR_STREAM_ENABLED } from "../config";
import {
  IR_ENVELOPE_KEY,
  type CanonicalBlockIR,
} from "../core/ir-types";
import { normalizeJsonRegion } from "../core/normalize";
import { kindRegistry } from "./kind-registry";

const memo = new Map<string, CanonicalBlockIR>();
const MEMO_CAP = 200;

function looksLikeCompleteJsonObject(trimmed: string): boolean {
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  const opens = (trimmed.match(/\{/g) || []).length;
  const closes = (trimmed.match(/\}/g) || []).length;
  return opens > 0 && opens === closes;
}

export function memoizedRegionEnvelope(
  source: string,
): CanonicalBlockIR | null {
  if (!CONTENT_IR_STREAM_ENABLED) return null;

  const trimmed = source.trim();
  if (!looksLikeCompleteJsonObject(trimmed)) return null;

  const cached = memo.get(source);
  if (cached) return cached;

  // Kick the warm tier once (memoized, non-blocking) so user kinds resolve
  // on subsequent splits; system kinds are always available synchronously.
  void kindRegistry.ensureWarm();

  const envelope = normalizeJsonRegion(source, {
    schemas: kindRegistry.snapshotSchemas(),
  });

  if (memo.size >= MEMO_CAP) memo.clear();
  memo.set(source, envelope);
  return envelope;
}

/** Merge an envelope into a block's metadata (no-op when not attachable). */
export function withIrEnvelope(
  source: string,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const envelope = memoizedRegionEnvelope(source);
  if (!envelope) return metadata;
  return { ...(metadata ?? {}), [IR_ENVELOPE_KEY]: envelope };
}
