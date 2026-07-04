/**
 * Shared plumbing for kind → legacy-component bridges (`toLegacyServerData`).
 *
 * Every bridge for a "renders only when complete" block type (quiz,
 * presentation, decision_tree, comparison_table, diagram, math_problem,
 * schema_proposal — all gated by a streaming loader or a fail-safe raw view)
 * follows the same recipe:
 *
 *   1. Gate on `root.status === "complete"` — partial payloads never reach
 *      these components (BlockRenderer shows the type's loading skeleton
 *      while the block streams), so deriving serverData mid-stream is waste.
 *   2. Reconstruct the ZERO-LOSS value (`reconstructRegionValue` merges every
 *      node's residue extras back in — nothing the model emitted is missing).
 *   3. Strip the injected `__kind` discriminators (deep by default; "root"
 *      for payloads whose NESTED data may legitimately contain a `__kind`
 *      key, e.g. a schema_proposal whose JSON Schema declares the
 *      discriminator property itself).
 *   4. Reshape into the exact object the legacy component consumes.
 *   5. Memoize per envelope identity — envelopes are immutable snapshots, so
 *      the derived serverData is reference-stable across re-renders and
 *      memoized components bail out (the flashcards precedent).
 *
 * Build failures (malformed complete payloads) resolve to `undefined`: the
 * routed block then falls back to its raw-content parse path, which the
 * legacy parsers' `parsed.<root_key> || parsed` fallbacks tolerate.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import { KIND_KEY } from "../core/kind-schema.types";
import {
  reconstructRegionValue,
  stripKindDeep,
} from "../redux/render-block-envelope";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Remove the injected root discriminator only — nested keys untouched. */
function stripKindRoot(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === KIND_KEY) continue;
    out[key] = child;
  }
  return out;
}

export interface CompleteEnvelopeBridgeOptions {
  /** `__kind` removal depth — "deep" (default) or "root" (see module doc). */
  strip?: "deep" | "root";
}

/**
 * Build a `toLegacyServerData` facet for a kind whose component only renders
 * complete payloads. `build` receives the reconstructed, kind-stripped value
 * and returns the component's serverData (or undefined to decline).
 */
export function makeCompleteEnvelopeBridge(
  kind: string,
  build: (
    value: Record<string, unknown>,
    envelope: CanonicalBlockIR,
  ) => Record<string, unknown> | undefined,
  options?: CompleteEnvelopeBridgeOptions,
): (envelope: CanonicalBlockIR) => Record<string, unknown> | undefined {
  const memo = new WeakMap<
    CanonicalBlockIR,
    Record<string, unknown> | undefined
  >();

  return (envelope) => {
    if (envelope.root.kind !== kind) return undefined;
    if (envelope.root.status !== "complete") return undefined;

    if (memo.has(envelope)) return memo.get(envelope);

    let out: Record<string, unknown> | undefined;
    try {
      const reconstructed = reconstructRegionValue(envelope);
      const value =
        options?.strip === "root"
          ? stripKindRoot(reconstructed)
          : (stripKindDeep(reconstructed) as Record<string, unknown>);
      out = build(value, envelope);
    } catch {
      // Malformed complete payload — decline; the raw-content parse path
      // (and its own loud error handling) takes over.
      out = undefined;
    }

    memo.set(envelope, out);
    return out;
  };
}
