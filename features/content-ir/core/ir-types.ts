/**
 * The canonical IR contract for structured content.
 *
 * Every source (live agent stream, DB reload, Python-preprocessed results,
 * notes, any future surface) is normalized into these shapes exactly once.
 * Anything already carrying this IR passes through downstream layers by
 * reference — see `core/normalize.ts` for the idempotence law.
 *
 * This file is pure types + path helpers. No React, no Redux, no IO.
 */

/** Path of a value inside a parsed region (object keys + array indices). */
export type IrPath = Array<string | number>;

/** How a node's kind was (or wasn't) established. */
export type IrKindState =
  | "resolved" // __kind seen + schema validated
  | "speculative" // committed from parent itemKinds before __kind arrived
  | "pending_kind" // object open, no __kind yet, no speculation possible
  | "pending_schema" // kind known, registry cold-fetch in flight
  | "raw"; // fell back — plain data, no schema claims

/**
 * System-level zero-data-loss channel. Unknown keys are NEVER merged into a
 * node's `value` (they'd be indistinguishable from schema fields); they are
 * carried here verbatim — Protobuf unknown-fields discipline. Distinct from
 * any domain-level `additionalDetails` field, which is an ordinary schema
 * field inside `value`.
 */
export interface IrResidue {
  /** Keys present in the source object but absent from the kind schema. */
  extra: Record<string, unknown> | null;
  /** Optional schema fields the source never provided. */
  optionalMissing: string[] | null;
  /** Structured warnings attached during parsing (speculation backtracks, truncation, …). */
  notices: Array<{ code: string; message: string; at?: number }> | null;
}

/** Which wire syntax carried the kind discriminator for a node. */
export type IrDiscriminator =
  | { format: "json"; key: "__kind" }
  | { format: "xml"; tag: string };

/** A schema-shaped structured node. Children live inside `value` (and carry their own metadata via `nodeIndex`). */
export interface IrStructuredNode {
  role: "structured";
  /** Canonical kind slug. Empty string while pending. */
  kind: string;
  kindState: IrKindState;
  discriminator: IrDiscriminator;
  /** Region-relative path ([] = region root). */
  path: IrPath;
  status: "streaming" | "complete" | "error";
  /** Compliant snapshot: schema fields + __kind ONLY. Unknown keys → residue. */
  value: Record<string, unknown>;
  residue: IrResidue | null;
}

/** Envelope version. Bump = migration point for persisted envelopes. */
export const IR_VERSION = 1 as const;

/** Reserved key carrying the envelope inside RenderBlockPayload.data. */
export const IR_ENVELOPE_KEY = "__ir" as const;

/**
 * One parsed region's canonical form. Serializable (plain JSON), carried on
 * render blocks (`data.__ir`), persisted on artifacts and message metadata,
 * and — with `engine: "py-block-detector"` — accepted pre-built from Python.
 */
export interface CanonicalBlockIR {
  v: typeof IR_VERSION;
  /** Provenance: which implementation produced this envelope. */
  engine: "fe-kind-parser" | "py-block-detector";
  /** Stable hash of the region source text — the idempotence / cache key. */
  fingerprint: string;
  root: IrStructuredNode;
  /** pathKey → node metadata for per-path readers (child kinds under root). */
  nodeIndex?: Record<
    string,
    Pick<IrStructuredNode, "kind" | "kindState" | "status">
  >;
}

/** Normalizer output segment: prose stays raw text; structured regions carry IR. */
export type CanonicalSegment =
  | { role: "text"; content: string }
  | {
      role: "block";
      blockType: string;
      content: string;
      ir: CanonicalBlockIR | null;
    };

export interface CanonicalContent {
  v: typeof IR_VERSION;
  segments: CanonicalSegment[];
}

// ---------------------------------------------------------------------------
// Path helpers — the ONE implementation. Consumers must not roll their own.
// ---------------------------------------------------------------------------

export function irPathKey(path: IrPath): string {
  return path.map((segment) => String(segment)).join(".");
}

export function irPathsEqual(left: IrPath, right: IrPath): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function irPathIsUnderOrEqual(path: IrPath, prefix: IrPath): boolean {
  if (path.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

/** Human label for a path ("root", "cards[2].front"). */
export function irPathLabel(path: IrPath): string {
  if (path.length === 0) return "root";

  const parts: string[] = [];
  for (const segment of path) {
    if (typeof segment === "number") {
      parts[parts.length - 1] += `[${segment}]`;
    } else {
      parts.push(String(segment));
    }
  }
  return parts.join(".");
}

/** True when every residue channel is empty — normalize to null instead. */
export function isEmptyResidue(residue: IrResidue): boolean {
  return (
    (residue.extra === null || Object.keys(residue.extra).length === 0) &&
    (residue.optionalMissing === null ||
      residue.optionalMissing.length === 0) &&
    (residue.notices === null || residue.notices.length === 0)
  );
}
