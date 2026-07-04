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
 *
 * Phase 5 adds the PERSISTED-envelope seed: envelopes stamped on message
 * parts at commit time (`core/envelope-cache.ts`) — or arriving pre-built on
 * server render_blocks — are seeded here by fingerprint. A memo miss then
 * consults the seed through `normalizeJsonRegion`'s `existing` fast path
 * (`reuseEnvelopeIfCurrent`: exact fingerprint match of the region source),
 * so a reload reuses the stream's envelope BY REFERENCE instead of parsing.
 */

import {
  IR_ENVELOPE_KEY,
  type CanonicalBlockIR,
} from "../core/ir-types";
import { normalizeJsonRegion } from "../core/normalize";
import { isIrEnvelopeCache } from "../core/envelope-cache";
import { fingerprintText } from "../core/fingerprint";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { kindRegistry } from "./kind-registry";

const memo = new Map<string, CanonicalBlockIR>();
const MEMO_CAP = 200;

// ── Persisted-envelope seed (Phase 5: reload without re-parse) ─────────────

/** fingerprint → persisted envelope, consulted on memo misses. */
const seededByFingerprint = new Map<string, CanonicalBlockIR>();
const SEED_CAP = 300;

/**
 * Cache/envelope objects already processed by the seeders below. Seeding runs
 * at read boundaries that fire per render (extractFlatText, normalize), so
 * the repeat path must be O(1) on a stable metadata reference.
 */
const seenSeedSources = new WeakSet<object>();

function seedOne(envelope: CanonicalBlockIR): void {
  if (envelope.root.status !== "complete") return;
  if (seededByFingerprint.size >= SEED_CAP) seededByFingerprint.clear();
  seededByFingerprint.set(envelope.fingerprint, envelope);
}

/**
 * Seed a single already-validated envelope (e.g. a server render_block's
 * `metadata.__ir` accepted by `sanitizeInboundEnvelopeMetadata`). Incomplete
 * envelopes are ignored — they can never be reused.
 */
export function seedEnvelope(envelope: CanonicalBlockIR): void {
  if (seenSeedSources.has(envelope)) return;
  seenSeedSources.add(envelope);
  seedOne(envelope);
}

/**
 * Seed every envelope from a message part's persisted `metadata.__ir` cache
 * (the `IrEnvelopeCache` stamped by `assembleMessageParts`). Call from the
 * read boundaries that consume text parts — the subsequent splitter pass then
 * reuses the persisted envelopes instead of re-parsing. Returns the number of
 * envelopes seeded.
 *
 * A present-but-malformed cache is a write-side bug (only our commit path and
 * aidream write this key) — it seeds NOTHING and screams via captureError,
 * never poisoning the pipeline with half-trusted envelopes.
 */
export function seedPersistedEnvelopeCache(
  metadata: Record<string, unknown> | null | undefined,
): number {
  const candidate = metadata?.[IR_ENVELOPE_KEY];
  if (candidate === undefined || candidate === null) return 0;
  if (typeof candidate !== "object") return 0;
  if (seenSeedSources.has(candidate)) return 0;
  seenSeedSources.add(candidate);

  if (!isIrEnvelopeCache(candidate)) {
    captureError({
      source: "content-ir",
      message:
        "persisted metadata.__ir envelope cache failed validation — ignored (no envelopes seeded); the writer that stamped it has a bug",
      raw: candidate,
    });
    return 0;
  }

  const envelopes = Object.values(candidate.blocks);
  for (const envelope of envelopes) seedOne(envelope);
  return envelopes.length;
}

/** Exact-match seed lookup for a detected region source (null = no seed). */
function seededEnvelopeFor(source: string): CanonicalBlockIR | undefined {
  if (seededByFingerprint.size === 0) return undefined;
  return seededByFingerprint.get(fingerprintText(source));
}

function looksLikeCompleteJsonObject(trimmed: string): boolean {
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  const opens = (trimmed.match(/\{/g) || []).length;
  const closes = (trimmed.match(/\}/g) || []).length;
  return opens > 0 && opens === closes;
}

export function memoizedRegionEnvelope(
  source: string,
): CanonicalBlockIR | null {
  const trimmed = source.trim();
  if (!looksLikeCompleteJsonObject(trimmed)) return null;

  const cached = memo.get(source);
  if (cached) return cached;

  // Kick the warm tier once (memoized, non-blocking) so user kinds resolve
  // on subsequent splits; system kinds are always available synchronously.
  void kindRegistry.ensureWarm();

  // `existing` is the persisted-envelope fast path: when a seeded envelope's
  // fingerprint exactly matches this region source, normalizeJsonRegion
  // returns it BY REFERENCE (reuseEnvelopeIfCurrent) — nothing parses.
  const envelope = normalizeJsonRegion(source, {
    schemas: kindRegistry.snapshotSchemas(),
    existing: seededEnvelopeFor(source),
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
