/**
 * PURE envelope ingestion — reading `metadata.__ir` off a block's metadata
 * and gating SERVER-BUILT envelopes at the wire boundary. Twin-safe: no
 * React / Redux / Supabase / host diagnostics — side effects (seeding the
 * region-envelope memo, screaming to the Error Inspector) are injected by
 * the host through `InboundEnvelopeHooks`.
 *
 * The frontend host shell is `redux/render-block-envelope.ts` (binds the
 * hooks to `seedEnvelope` + `captureError`); aidream's Workflow Studio binds
 * its own. Contract: features/content-ir/docs/PYTHON_ENVELOPE_CONTRACT.md.
 */

import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "./ir-types";
import { isCanonicalBlockIR } from "./normalize";

/** Read a CanonicalBlockIR envelope off a block's metadata (or anything). */
export function readEnvelope(
  metadata: Record<string, unknown> | null | undefined,
): CanonicalBlockIR | null {
  const candidate = metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

/** Pure classification of inbound metadata carrying (or not) an envelope. */
export type InboundEnvelopeVerdict =
  | {
      /** No `__ir` key — zero-touch pass, same reference back. */
      outcome: "absent";
      metadata: Record<string, unknown> | undefined;
    }
  | {
      /** Valid CanonicalBlockIR — same reference back (idempotence law). */
      outcome: "valid";
      metadata: Record<string, unknown>;
      envelope: CanonicalBlockIR;
    }
  | {
      /** Malformed/foreign `__ir` — a COPY with `__ir` stripped. */
      outcome: "malformed";
      metadata: Record<string, unknown>;
      engine: string;
      raw: unknown;
    };

export function classifyInboundEnvelopeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): InboundEnvelopeVerdict {
  if (!metadata || !(IR_ENVELOPE_KEY in metadata)) {
    return { outcome: "absent", metadata: metadata ?? undefined };
  }

  const candidate = metadata[IR_ENVELOPE_KEY];
  if (isCanonicalBlockIR(candidate)) {
    return { outcome: "valid", metadata, envelope: candidate };
  }

  const engine =
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { engine?: unknown }).engine === "string"
      ? (candidate as { engine: string }).engine
      : "unknown";

  const { [IR_ENVELOPE_KEY]: _dropped, ...rest } = metadata;
  void _dropped;
  return { outcome: "malformed", metadata: rest, engine, raw: candidate };
}

/** Host-injected side effects for the inbound gate. */
export interface InboundEnvelopeHooks {
  /** Called with every VALID envelope so later re-splits reuse it by reference. */
  seedEnvelope?: (envelope: CanonicalBlockIR) => void;
  /** Called LOUDLY for every malformed envelope — a bad envelope is a defect. */
  reportMalformed?: (info: {
    blockId: string;
    engine: string;
    raw: unknown;
  }) => void;
}

/**
 * Ingest guard for SERVER-BUILT envelopes riding `metadata.__ir` on a
 * `render_block` event.
 *
 * - No `__ir` key → the SAME metadata reference back (zero-touch pass).
 * - Valid CanonicalBlockIR → the SAME metadata reference back (reuse-by-
 *   reference — the idempotence law) AND `hooks.seedEnvelope` fires so any
 *   later re-split of the same region source reuses it instead of parsing.
 * - Malformed/foreign `__ir` → a COPY with `__ir` stripped, plus a loud
 *   `hooks.reportMalformed`. A bad envelope must never poison kind routing
 *   or the persistence cache; dropping it degrades that block to the
 *   ordinary content-driven path, nothing more.
 */
export function sanitizeInboundEnvelopeMetadata(
  metadata: Record<string, unknown> | null | undefined,
  context: { blockId: string },
  hooks: InboundEnvelopeHooks = {},
): Record<string, unknown> | undefined {
  const verdict = classifyInboundEnvelopeMetadata(metadata);
  if (verdict.outcome === "valid") {
    hooks.seedEnvelope?.(verdict.envelope);
    return verdict.metadata;
  }
  if (verdict.outcome === "malformed") {
    hooks.reportMalformed?.({
      blockId: context.blockId,
      engine: verdict.engine,
      raw: verdict.raw,
    });
    return verdict.metadata;
  }
  return verdict.metadata;
}
