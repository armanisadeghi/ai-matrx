/**
 * Idempotent normalizer — the "recognizes its own work" property.
 *
 * THE LAW: anything already carrying a current CanonicalBlockIR envelope is
 * returned BY REFERENCE — zero reprocessing, reference equality holds, React
 * bails out. Only raw text (a detected region's source) is ever parsed, and
 * it is parsed exactly once per fingerprint.
 *
 * `normalizeJsonRegion` is the one-shot mode: the same KindStreamParser that
 * powers live streams, run over a complete region string (DB reloads,
 * reconcile passes), assembled through the same IrTree the live session uses
 * — stream and static output are structurally identical by construction.
 */

import { fingerprintText } from "./fingerprint";
import { IR_VERSION, type CanonicalBlockIR, type IrStructuredNode } from "./ir-types";
import { KIND_KEY, type KindSchema } from "./kind-schema.types";
import { IrTree } from "./ir-tree";
import {
  createKindStreamParser,
  type SchemaResolver,
} from "./kind-parser";

export function isCanonicalBlockIR(value: unknown): value is CanonicalBlockIR {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CanonicalBlockIR>;
  return (
    candidate.v === IR_VERSION &&
    typeof candidate.fingerprint === "string" &&
    typeof candidate.engine === "string" &&
    typeof candidate.root === "object" &&
    candidate.root !== null &&
    (candidate.root as IrStructuredNode).role === "structured"
  );
}

/**
 * The idempotence fast path: return the existing envelope by reference when
 * it still describes this source text; null means "parse needed".
 */
export function reuseEnvelopeIfCurrent(
  source: string,
  candidate: unknown,
): CanonicalBlockIR | null {
  if (!isCanonicalBlockIR(candidate)) return null;
  return candidate.fingerprint === fingerprintText(source) ? candidate : null;
}

export interface NormalizeJsonRegionOptions {
  schemas: Record<string, KindSchema> | SchemaResolver;
  /** Known-context root prediction (agent output schema, fence hint). */
  expectedRootKind?: string;
  /**
   * Pass a previously persisted envelope (message metadata, artifact row);
   * when its fingerprint matches, it is returned as-is and nothing parses.
   */
  existing?: unknown;
}

/**
 * Build a resolved, complete envelope directly from an already-structured
 * value (a persisted artifact's `content.data` object). This is the
 * zero-reprocessing rehydration path: the stored value IS the reconstructed
 * region value (schema fields + residue extras merged at persist time), so no
 * tokenizer/parser run is needed — the envelope wraps it verbatim.
 */
export function envelopeFromCompleteValue(
  value: Record<string, unknown>,
  kind: string,
): CanonicalBlockIR {
  return {
    v: IR_VERSION,
    engine: "fe-kind-parser",
    fingerprint: fingerprintText(JSON.stringify(value)),
    root: {
      role: "structured",
      kind,
      kindState: "resolved",
      discriminator: { format: "json", key: KIND_KEY },
      path: [],
      status: "complete",
      value,
      residue: null,
    },
  };
}

/** One-shot: complete region text in → canonical envelope out. */
export function normalizeJsonRegion(
  source: string,
  options: NormalizeJsonRegionOptions,
): CanonicalBlockIR {
  const reused = reuseEnvelopeIfCurrent(source, options.existing);
  if (reused) return reused;

  const tree = new IrTree();
  const parser = createKindStreamParser({
    schemas: options.schemas,
    expectedRootKind: options.expectedRootKind,
    onEvent(event) {
      tree.applyEvent(event);
    },
  });
  parser.push(source);
  parser.end();

  return tree.buildEnvelope(fingerprintText(source));
}
