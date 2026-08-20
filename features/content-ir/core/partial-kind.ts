/**
 * Streaming partial kinds — the TS twin of the Python producer's contract.
 *
 * Cross-repo system-of-record (read it before changing anything here):
 * `common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md`.
 * Python twin: `aidream/packages/matrx-graph/matrx_graph/content_ir/partial.py`.
 *
 * WHAT THIS IS
 * ------------
 * While a structured region streams, the server announces what it thinks the
 * region IS and what has arrived so far, so the UI fills in progressively
 * instead of showing a spinner until the closing brace. Three events, a CLOSED
 * union on `state`, all riding `metadata.__ir_partial` on the `render_block`
 * events this app already receives:
 *
 *   partial     — repeatable. A provisional instance whose `root.value` is
 *                 VALID, CLOSED JSON (the server truncates and closes it, so
 *                 this side never repairs or guesses). `kindState` is
 *                 "speculative": it MAY still turn out to be something else.
 *   superseded  — TERMINAL. The region completed as the announced kind; drop
 *                 the provisional render, the block's own content/`__ir` is the
 *                 truth.
 *   retracted   — TERMINAL escape hatch. Detection was wrong; `becameKind` /
 *                 `becameBlockType` name what it actually is. Never a silent
 *                 swap.
 *
 * WHY IT IS NOT ON `__ir`
 * -----------------------
 * `__ir` means "validated against the registered schema", and a valid `__ir`
 * is SEEDED into the fingerprint-keyed envelope memo. A provisional value
 * there would poison every later read of that region. The two channels never
 * touch: `classifyInboundEnvelopeMetadata` sees `absent` for a partial and
 * passes the metadata through by reference.
 *
 * Pure kernel module: types + validators only. No React, no Redux, no IO.
 */

import { IR_VERSION } from "./ir-types";
import type { IrDiscriminator, IrPath, IrResidue } from "./ir-types";

/** The reserved metadata key carrying every event of this contract. */
export const IR_PARTIAL_KEY = "__ir_partial" as const;

export type PartialKindState = "partial" | "superseded" | "retracted";

const PARTIAL_STATES: readonly PartialKindState[] = [
  "partial",
  "superseded",
  "retracted",
];

/** The provisional node. Deliberately `IrStructuredNode`-shaped so existing IR readers work. */
export interface PartialKindNode {
  role: "structured";
  /** The server's DETECTION GUESS for this region. */
  kind: string;
  /** Always "speculative" on a partial — pre-recognition, not a resolved kind. */
  kindState: "speculative";
  discriminator: IrDiscriminator;
  path: IrPath;
  status: "streaming";
  /**
   * Valid, closed JSON carrying its own `__kind`. MAY be missing required
   * schema fields — that is what `partial_unvalidated` in `residue.notices`
   * says. A renderer that throws on an absent field is not partial-ready and
   * must not be routed a provisional value.
   */
  value: Record<string, unknown>;
  residue: IrResidue | null;
}

export interface PartialKindEvent {
  v: typeof IR_VERSION;
  engine: string;
  state: "partial";
  /** Monotonic PER BLOCK — the ordering / staleness key. Keep the highest. */
  seq: number;
  fingerprint: string;
  root: PartialKindNode;
}

export interface SupersededKindEvent {
  v: typeof IR_VERSION;
  engine: string;
  state: "superseded";
  seq: number;
  kind: string;
}

export interface RetractedKindEvent {
  v: typeof IR_VERSION;
  engine: string;
  state: "retracted";
  seq: number;
  /** The kind that was WRONGLY announced. */
  kind: string;
  reason: string;
  /** What it actually is — null when it resolved to no registered kind. */
  becameKind: string | null;
  /** The detector's final block type, so a consumer re-routes without guessing. */
  becameBlockType: string | null;
}

export type AnyPartialKindEvent =
  | PartialKindEvent
  | SupersededKindEvent
  | RetractedKindEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read + validate a partial-channel event off a block's metadata.
 *
 * Returns null for anything malformed, foreign, or of an unknown `state`. A
 * malformed partial degrades to "no live rendering" — never to a wrong render,
 * and never to a thrown error inside a stream handler.
 */
export function readPartialKindEvent(
  metadata: Record<string, unknown> | null | undefined,
): AnyPartialKindEvent | null {
  if (!isRecord(metadata)) return null;
  const candidate = metadata[IR_PARTIAL_KEY];
  if (!isRecord(candidate)) return null;
  if (candidate.v !== IR_VERSION) return null;
  if (typeof candidate.engine !== "string") return null;
  if (typeof candidate.seq !== "number" || !Number.isFinite(candidate.seq)) {
    return null;
  }

  const state = candidate.state;
  if (typeof state !== "string") return null;
  if (!PARTIAL_STATES.includes(state as PartialKindState)) return null;

  if (state === "partial") {
    const root = candidate.root;
    if (!isRecord(root)) return null;
    if (root.role !== "structured") return null;
    if (root.status !== "streaming") return null;
    if (root.kindState !== "speculative") return null;
    if (typeof root.kind !== "string" || !root.kind) return null;
    if (!isRecord(root.value)) return null;
    return candidate as unknown as PartialKindEvent;
  }

  if (typeof candidate.kind !== "string" || !candidate.kind) return null;

  if (state === "superseded") {
    return candidate as unknown as SupersededKindEvent;
  }

  if (typeof candidate.reason !== "string" || !candidate.reason) return null;
  return candidate as unknown as RetractedKindEvent;
}

/**
 * Ingest guard for the partial channel on a `render_block` event — the twin of
 * `sanitizeInboundEnvelopeMetadata` for `__ir`, and it exists for the same
 * reason: a malformed server event must be stripped at the wire boundary, not
 * carried into Redux where every later reader has to re-decide whether to
 * trust it.
 *
 * - no `__ir_partial` key → the SAME metadata reference back (zero-touch).
 * - valid event → the SAME metadata reference back (idempotence law).
 * - malformed → a COPY with the key stripped, plus a loud `reportMalformed`.
 *   Dropping it degrades that block to "no live rendering" and nothing more.
 *
 * Pure: the host injects the reporter, exactly like the envelope gate, so
 * aidream's Workflow Studio can bind its own.
 */
export function sanitizeInboundPartialKindMetadata(
  metadata: Record<string, unknown> | null | undefined,
  context: { blockId: string },
  hooks: {
    reportMalformed?: (info: { blockId: string; raw: unknown }) => void;
  } = {},
): Record<string, unknown> | undefined {
  if (!isRecord(metadata) || !(IR_PARTIAL_KEY in metadata)) {
    return metadata ?? undefined;
  }
  if (readPartialKindEvent(metadata) !== null) return metadata;

  const { [IR_PARTIAL_KEY]: raw, ...rest } = metadata;
  hooks.reportMalformed?.({ blockId: context.blockId, raw });
  return rest;
}

/** Narrowing helper: is this the repeatable provisional event? */
export function isProvisionalKind(
  event: AnyPartialKindEvent | null,
): event is PartialKindEvent {
  return event !== null && event.state === "partial";
}

/**
 * Narrowing helper: is this a TERMINAL event? Every partial ends in exactly
 * one of these — that law is what makes a stuck skeleton impossible, so a
 * consumer clears its provisional render here and nowhere else.
 */
export function isTerminalKindEvent(
  event: AnyPartialKindEvent | null,
): event is SupersededKindEvent | RetractedKindEvent {
  return (
    event !== null && (event.state === "superseded" || event.state === "retracted")
  );
}

/**
 * Per-block staleness gate. Events can be re-dispatched, replayed on reconnect,
 * or arrive out of order; only a strictly higher `seq` advances a block.
 * Returns null when the event should be ignored.
 *
 * Pure: the caller owns the `seen` map, so this composes into a reducer
 * without hiding module state.
 */
export function advancePartialKind(
  seen: Record<string, number>,
  blockId: string,
  event: AnyPartialKindEvent | null,
): AnyPartialKindEvent | null {
  if (event === null) return null;
  const last = seen[blockId];
  if (last !== undefined && event.seq <= last) return null;
  return event;
}
