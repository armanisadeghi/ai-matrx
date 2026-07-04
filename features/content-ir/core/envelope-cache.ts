/**
 * IrEnvelopeCache — the persisted envelope cache carried on MESSAGE PARTS.
 *
 * Phase 5 (reload without re-parse): at stream end, `assembleMessageParts`
 * stamps every completed JSON region's CanonicalBlockIR onto the committed
 * `CxTextContent.metadata.__ir` as this cache — keyed by fingerprint, because
 * one text part can embed several regions. On reload the splitter's envelope
 * memo consults the seeded cache (`registry/region-envelope-memo.ts`) and
 * reuses the persisted envelope BY REFERENCE via `reuseEnvelopeIfCurrent`
 * (exact fingerprint match of the detected region source) — zero re-parse.
 *
 * Shape discipline: the SAME `__ir` metadata key carries two shapes at two
 * levels, disambiguated by validators that reject each other —
 *   - render block metadata → a single CanonicalBlockIR (`isCanonicalBlockIR`)
 *   - message part metadata → this cache (`isIrEnvelopeCache`)
 *
 * Pure kernel module: types + validators only. No React/Redux/Supabase.
 */

import type { CanonicalBlockIR } from "./ir-types";
import { isCanonicalBlockIR } from "./normalize";

/** Cache version. Bump = migration point for persisted part caches. */
export const IR_ENVELOPE_CACHE_VERSION = 1 as const;

/**
 * The envelope cache persisted on a message part's `metadata.__ir`.
 * `blocks` maps each region-source fingerprint to its complete envelope.
 */
export interface IrEnvelopeCache {
  v: typeof IR_ENVELOPE_CACHE_VERSION;
  blocks: Record<string, CanonicalBlockIR>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict whole-cache validation: every entry must be a complete
 * CanonicalBlockIR keyed by its OWN fingerprint. A cache failing this guard
 * came from a buggy or foreign writer — callers surface that loudly and seed
 * nothing (a half-trusted cache is how poisoned envelopes reach renderers).
 */
export function isIrEnvelopeCache(value: unknown): value is IrEnvelopeCache {
  if (!isRecord(value)) return false;
  if (value.v !== IR_ENVELOPE_CACHE_VERSION) return false;
  if (!isRecord(value.blocks)) return false;

  const entries = Object.entries(value.blocks);
  if (entries.length === 0) return false;
  for (const [fingerprint, envelope] of entries) {
    if (!isCanonicalBlockIR(envelope)) return false;
    if (envelope.fingerprint !== fingerprint) return false;
    if (envelope.root.status !== "complete") return false;
  }
  return true;
}

/**
 * Build the persistable cache from a run's collected envelopes. Only
 * complete envelopes are cacheable (a streaming/error envelope can never be
 * reused — its fingerprint doesn't describe a finished region). Duplicate
 * regions (same fingerprint) collapse to one entry. Engine-agnostic by
 * design: an aidream-built `engine: "py-block-detector"` envelope is cached
 * identically to an FE-parsed one. Returns null when nothing qualifies so
 * callers skip the metadata stamp entirely.
 */
export function envelopeCacheFromEnvelopes(
  envelopes: readonly CanonicalBlockIR[],
): IrEnvelopeCache | null {
  let blocks: Record<string, CanonicalBlockIR> | null = null;
  for (const envelope of envelopes) {
    if (!isCanonicalBlockIR(envelope)) continue;
    if (envelope.root.status !== "complete") continue;
    (blocks ??= {})[envelope.fingerprint] = envelope;
  }
  return blocks ? { v: IR_ENVELOPE_CACHE_VERSION, blocks } : null;
}
