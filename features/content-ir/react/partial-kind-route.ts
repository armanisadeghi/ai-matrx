/**
 * Routing the PROVISIONAL half of the streaming partial-kinds contract.
 *
 * Cross-repo system-of-record (read it before changing anything here):
 * `common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md` §8.
 * The reader/validator half lives in `../core/partial-kind.ts`; the wire gate
 * runs in the execution system's `process-stream.ts`.
 *
 * WHAT THIS DOES
 * --------------
 * While a structured region streams, the server announces what it thinks the
 * region IS and what has arrived so far (`metadata.__ir_partial`). This module
 * turns that provisional event into a routed block that renders through the
 * EXACT SAME component the final value renders in — which is the entire point:
 * a bespoke skeleton renderer would be a second render path and is banned
 * (features/content-ir/FEATURE.md § No bespoke stream renderers).
 *
 * HOW, without touching the verified channel
 * ------------------------------------------
 * `root` is deliberately `IrStructuredNode`-shaped, so the event wraps into a
 * `CanonicalBlockIR` and every existing reader — the compiled bridge, the
 * component registry, the db-component flip, the generic viewer — works
 * unchanged. That provisional envelope is placed on a RENDER-LOCAL COPY of the
 * block's metadata under `__ir`, never on the wire and never in Redux:
 * `seedEnvelope` (the fingerprint-keyed memo) fires ONLY at the wire boundary
 * in `sanitizeInboundEnvelopeMetadata`, so a render-local envelope can poison
 * nothing. The block also carries `__ir_provisional: true` so any downstream
 * reader can tell a provisional render from a verified one.
 *
 * THE POSTURE: WITHHOLD BY DEFAULT, OPT IN PER KIND
 * -------------------------------------------------
 * A provisional value MAY be missing required fields — that is what the
 * `partial_unvalidated` notice declares — and §8 of the contract requires that
 * a component which throws on an absent field is not routed one. Rather than
 * audit every component, the default is WITHHOLD: nothing changes and the
 * block keeps its loading skeleton. A kind opts in with `partialReady: true`
 * on its registry definition (plus `{ provisional: true }` on its
 * `makeCompleteEnvelopeBridge`, pinned by a test). If an opted-in component
 * throws anyway, `ProvisionalKindBoundary` screams and calls
 * `markKindPartialUnsafe`, which drops that kind back to withhold for the rest
 * of the session — loud recovery, never a broken surface.
 *
 * TERMINALS
 * ---------
 * `superseded` and `retracted` produce NO provisional render, so the swap to
 * the final value happens in the same frame the terminal arrives — never a
 * flicker through an empty state. Both are explicit EVENTS: the terminal is
 * never inferred from the arrival of `__ir`, because a completed block often
 * has no `__ir` at all (unregistered kind, schema drift, cold catalog) and
 * inferring it would leave the skeleton up forever in exactly those cases.
 */

import { IR_ENVELOPE_KEY, IR_VERSION } from "../core/ir-types";
import type { CanonicalBlockIR } from "../core/ir-types";
import {
  IR_PARTIAL_KEY,
  isProvisionalKind,
  readPartialKindEvent,
} from "../core/partial-kind";
import type { PartialKindEvent } from "../core/partial-kind";
import { kindRegistry } from "../registry/kind-registry";
import { readEnvelope } from "../redux/render-block-envelope";
import { applyIrKindRoute } from "./kind-route";
import type { IrRoutableBlock } from "./kind-route";

/**
 * Marker stamped on a render-local block whose `__ir` is PROVISIONAL. Never
 * emitted by a producer, never persisted, never on the wire.
 */
export const IR_PROVISIONAL_KEY = "__ir_provisional" as const;

/** True when this block's metadata carries a provisional (not verified) envelope. */
export function isProvisionalBlock(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.[IR_PROVISIONAL_KEY] === true;
}

/** Wrap a validated `partial` event into the envelope shape every IR reader consumes. */
export function envelopeFromPartialKind(
  event: PartialKindEvent,
): CanonicalBlockIR {
  return {
    v: IR_VERSION,
    // The partial channel is only ever produced by the Python detector; the
    // envelope's `engine` union has no third member and inventing one would
    // break every existing reader.
    engine: "py-block-detector",
    fingerprint: event.fingerprint,
    root: event.root,
  };
}

/**
 * Kinds whose component threw while rendering a provisional value. Session-
 * scoped: the kind falls back to withhold (its loading skeleton) until a
 * reload, so one bad component cannot keep re-throwing on every block.
 */
const partialUnsafeKinds = new Set<string>();

/** Loud recovery hook — called by ProvisionalKindBoundary when a render throws. */
export function markKindPartialUnsafe(kind: string): void {
  partialUnsafeKinds.add(kind);
}

/** Test-only reset of the session latch. */
export function resetPartialUnsafeKinds(): void {
  partialUnsafeKinds.clear();
}

/**
 * Has this kind opted in to being handed a provisional value? Withhold is the
 * default; see the module doc.
 */
export function isPartialReadyKind(kind: string): boolean {
  if (!kind || partialUnsafeKinds.has(kind)) return false;
  return kindRegistry.getDefinition(kind)?.partialReady === true;
}

export interface ProvisionalKindRender<T> {
  /** The routed block — same type/serverData shape the final value produces. */
  block: T;
  /** The announced (speculative) kind. */
  kind: string;
  /** Per-block ordering key, for diagnostics. */
  seq: number;
  /** The provisional envelope — feeds the loading skeleton used as the throw fallback. */
  envelope: CanonicalBlockIR;
}

/**
 * Resolve a block's provisional render, or null when there is nothing to show
 * provisionally (no event, a terminal event, a withheld kind, a kind nothing
 * can route, or a verified envelope that already won).
 *
 * Pure: no React, no Redux, no side effects beyond the registry read.
 */
export function resolveProvisionalKindRender<
  T extends IrRoutableBlock & { metadata?: Record<string, unknown> },
>(
  block: T,
  options?: {
    /**
     * Is the STREAM still running? Message-wide, deliberately — not this
     * block's own completion.
     *
     * 🚨 THE ANTI-STUCK-SKELETON BACKSTOP. Law 1 of the contract says every
     * partial ends in exactly one terminal, and that law is the ONLY thing
     * standing between a user and a "Still arriving" skeleton that never
     * resolves. It is a producer guarantee with at least three ways to not
     * fire: the drain skips a block missing from the final block list, the
     * emitter early-returns once the stream ended or was cancelled (so a
     * client abort drops every retraction), and a flush failure is swallowed
     * so it never kills a run.
     *
     * Once the stream is over, no terminal can ever arrive, so a still-open
     * provisional is stuck by definition — drop it and let the block's own
     * content and `__ir` be the truth. Correct to be message-wide: a terminal
     * for THIS block may still be in flight while the block itself looks
     * finished.
     *
     * `undefined` reads as active, so a caller that does not thread stream
     * state keeps today's behaviour rather than silently losing live rendering.
     */
    streamActive?: boolean;
  },
): ProvisionalKindRender<T> | null {
  if (options?.streamActive === false) return null;

  const event = readPartialKindEvent(block.metadata);
  // Terminal (superseded / retracted) → no provisional render, in this frame.
  if (!isProvisionalKind(event)) return null;

  const kind = event.root.kind;
  if (!isPartialReadyKind(kind)) return null;

  // A verified envelope that has already completed is the truth — a late or
  // duplicated partial must never displace it.
  const verified = readEnvelope(block.metadata);
  if (verified && verified.root.status === "complete") return null;

  const { [IR_PARTIAL_KEY]: _partial, ...rest } = block.metadata ?? {};
  void _partial;

  const envelope = envelopeFromPartialKind(event);

  const provisionalBlock = {
    ...block,
    // The raw region annotation (`{ language: "json" }`) is not kind data —
    // same poison rule the verified route follows.
    serverData: undefined,
    metadata: {
      ...rest,
      [IR_ENVELOPE_KEY]: envelope,
      [IR_PROVISIONAL_KEY]: true,
    },
  } as T;

  const routed = applyIrKindRoute(provisionalBlock);
  // Nothing claimed it (unknown kind, no component) — `applyIrKindRoute`
  // returns the SAME reference. Withhold rather than render raw partial JSON.
  if (routed === provisionalBlock) return null;
  // A bridged kind whose bridge DECLINED this value (too thin to render — a
  // quiz with no answerable question yet) routed on type alone, which would
  // hand the component the partial JSON text to parse. Withhold: the loading
  // skeleton stays up for this frame and the next `seq` tries again.
  if (
    kindRegistry.getDefinition(kind)?.toLegacyServerData &&
    !(routed as { serverData?: unknown }).serverData
  ) {
    return null;
  }

  return { block: routed, kind, seq: event.seq, envelope };
}
