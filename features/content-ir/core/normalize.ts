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
 * reconcile passes). One library, two speeds — stream and static output are
 * structurally identical.
 */

import { fingerprintText } from "./fingerprint";
import { JSON_DISCRIMINATOR } from "./discriminator";
import {
  IR_VERSION,
  irPathKey,
  type CanonicalBlockIR,
  type IrResidue,
  type IrStructuredNode,
} from "./ir-types";
import type { KindSchema } from "./kind-schema.types";
import {
  createKindStreamParser,
  type KindStreamEvent,
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
  schemas: Record<string, KindSchema>;
  /**
   * Pass a previously persisted envelope (message metadata, artifact row);
   * when its fingerprint matches, it is returned as-is and nothing parses.
   */
  existing?: unknown;
}

/** One-shot: complete region text in → canonical envelope out. */
export function normalizeJsonRegion(
  source: string,
  options: NormalizeJsonRegionOptions,
): CanonicalBlockIR {
  const reused = reuseEnvelopeIfCurrent(source, options.existing);
  if (reused) return reused;

  const events: KindStreamEvent[] = [];
  const parser = createKindStreamParser({
    schemas: options.schemas,
    onEvent(event) {
      events.push(event);
    },
  });
  parser.push(source);
  parser.end();

  return buildEnvelopeFromEvents(source, events);
}

/**
 * Assemble a CanonicalBlockIR from a finished parse's event log. Also used by
 * the streaming session at stream end so live and one-shot envelopes are
 * built by the same code.
 */
export function buildEnvelopeFromEvents(
  source: string,
  events: KindStreamEvent[],
): CanonicalBlockIR {
  let rootValue: Record<string, unknown> = {};
  let rootResidue: IrResidue | null = null;
  let rootKind = "";
  let rootRaw = false;
  let rootRawReason: string | null = null;
  let sawComplete = false;
  let errorReason: string | null = null;

  const nodeIndex: NonNullable<CanonicalBlockIR["nodeIndex"]> = {};

  for (const event of events) {
    switch (event.type) {
      case "block_snapshot": {
        if (event.path.length === 0) {
          rootValue = event.value;
          rootResidue = event.residue;
          rootKind = event.kind;
        } else if (event.complete) {
          nodeIndex[irPathKey(event.path)] = {
            kind: event.kind,
            kindState: "resolved",
            status: "complete",
          };
        }
        break;
      }
      case "raw_object": {
        if (event.path.length === 0) {
          rootRaw = true;
          rootRawReason = event.reason;
          if (
            typeof event.value === "object" &&
            event.value !== null &&
            !Array.isArray(event.value)
          ) {
            rootValue = event.value as Record<string, unknown>;
          }
        } else {
          nodeIndex[irPathKey(event.path)] = {
            kind: "",
            kindState: "raw",
            status: "complete",
          };
        }
        break;
      }
      case "complete": {
        sawComplete = true;
        if (!rootRaw && event.kind) rootKind = event.kind;
        if (
          rootRaw &&
          typeof event.value === "object" &&
          event.value !== null &&
          !Array.isArray(event.value)
        ) {
          rootValue = event.value as Record<string, unknown>;
        }
        break;
      }
      case "error": {
        errorReason = event.reason;
        break;
      }
      default:
        break;
    }
  }

  const notices: NonNullable<IrResidue["notices"]> = [];
  if (errorReason) {
    notices.push({ code: "parse_error", message: errorReason });
  }
  if (rootRaw && rootRawReason) {
    notices.push({ code: "raw_fallback", message: rootRawReason });
  }

  let residue = rootResidue;
  if (notices.length > 0) {
    residue = {
      extra: rootResidue?.extra ?? null,
      optionalMissing: rootResidue?.optionalMissing ?? null,
      notices: [...(rootResidue?.notices ?? []), ...notices],
    };
  }

  const root: IrStructuredNode = {
    role: "structured",
    kind: rootRaw ? "" : rootKind,
    kindState: rootRaw ? "raw" : rootKind ? "resolved" : "raw",
    discriminator: JSON_DISCRIMINATOR,
    path: [],
    status: errorReason ? "error" : sawComplete ? "complete" : "error",
    value: rootValue,
    residue,
  };

  return {
    v: IR_VERSION,
    engine: "fe-kind-parser",
    fingerprint: fingerprintText(source),
    root,
    ...(Object.keys(nodeIndex).length > 0 ? { nodeIndex } : {}),
  };
}
