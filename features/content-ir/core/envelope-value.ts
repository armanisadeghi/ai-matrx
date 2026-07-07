/**
 * Pure envelope→value functions (the zero-data-loss wire round-trip).
 *
 * These live in core/ (the pure kernel) because every layer needs them —
 * including kinds/legacy-bridge-utils, whose bridges are built at MODULE
 * SCOPE inside kinds/<slug>.ts files that system-kinds.ts imports. When these
 * functions lived in redux/render-block-envelope.ts, that file's memo/capture
 * imports closed a module cycle (kinds → bridge-utils → render-block-envelope
 * → region-envelope-memo → kind-registry → system-kinds → kinds), which made
 * SYSTEM_KIND_DEFINITIONS entry-point-fragile (undefined defs when a kinds
 * module was the import entry). Keeping them here makes every kinds module
 * cycle-free BY CONSTRUCTION. redux/render-block-envelope re-exports them for
 * its existing consumers.
 */

import { isEmptyResidue, type CanonicalBlockIR } from "./ir-types";
import { KIND_KEY } from "./kind-schema.types";

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
