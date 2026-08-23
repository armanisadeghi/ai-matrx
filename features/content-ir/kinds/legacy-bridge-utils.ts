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
 *   3. Reshape into the exact object the legacy component consumes.
 *   4. Memoize per envelope identity — envelopes are immutable snapshots, so
 *      the derived serverData is reference-stable across re-renders and
 *      memoized components bail out (the flashcards precedent).
 *
 * Build failures (malformed complete payloads) resolve to `undefined`: the
 * routed block then falls back to its raw-content parse path, which the
 * legacy parsers' `parsed.<root_key> || parsed` fallbacks tolerate.
 *
 * THERE IS NO STRIP STEP (removed 2026-08-23). This bridge used to delete the
 * `__kind` discriminators — deep by default — before `build` ever saw the
 * value, which is the storage/render stripping the platform annihilated:
 * `__kind` is PART OF THE DATA (KINDS_EVERYWHERE_PLAN §4.2), and a bridge that
 * hides it from `build` is a bridge that cannot tell WHAT it is reshaping.
 * `build` now receives the value verbatim. A build that copies unknown keys
 * through (the zero-data-loss "extras" collectors) must list the marker among
 * its mapped keys so identity never surfaces as a data field — see
 * `MARKER_KEY` below.
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { reconstructRegionValue } from "@ai-matrx/content-ir";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The discriminator key, re-exported for the extras collectors: identity is
 * never an "unknown extra field" to copy into a component's serverData.
 */
export const MARKER_KEY = KIND_KEY;

export interface CompleteEnvelopeBridgeOptions {
  /**
   * PARTIAL-READY opt-in: also build from a `status: "streaming"` envelope.
   *
   * Step 1 of the recipe above gates on `complete` because, historically,
   * partial payloads never reached these components — BlockRenderer showed
   * the type's loading skeleton for the whole stream. The streaming
   * partial-kinds contract changes that premise for kinds that opt in: the
   * server closes the JSON, the provisional value is routed to the SAME
   * component, and it fills in as tokens arrive. Set this ONLY together with
   * `partialReady: true` on the kind's registry definition — a test pins the
   * two together (`__tests__/partial-kind-route.test.ts`), because a facet
   * saying "partial-ready" over a bridge that declines every streaming
   * envelope is a skeleton that never fills.
   *
   * A bridge accepting a provisional value MUST tolerate missing required
   * fields; returning `undefined` for a value too thin to render is the
   * correct decline (the loading skeleton stays up for that frame).
   * Contract: common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md
   */
  provisional?: boolean;
}

/**
 * Build a `toLegacyServerData` facet for a kind whose component only renders
 * complete payloads. `build` receives the reconstructed value verbatim (markers included)
 * and returns the component's serverData (or undefined to decline).
 */
export function makeCompleteEnvelopeBridge<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  kind: string,
  build: (
    value: Record<string, unknown>,
    envelope: CanonicalBlockIR,
  ) => T | undefined,
  options?: CompleteEnvelopeBridgeOptions,
): (envelope: CanonicalBlockIR) => T | undefined {
  const memo = new WeakMap<CanonicalBlockIR, T | undefined>();

  return (envelope) => {
    if (envelope.root.kind !== kind) return undefined;
    if (
      envelope.root.status !== "complete" &&
      !(options?.provisional && envelope.root.status === "streaming")
    ) {
      return undefined;
    }

    if (memo.has(envelope)) return memo.get(envelope);

    let out: T | undefined;
    try {
      // Verbatim — markers included, at every depth.
      out = build(reconstructRegionValue(envelope), envelope);
    } catch {
      // Malformed complete payload — decline; the raw-content parse path
      // (and its own loud error handling) takes over.
      out = undefined;
    }

    memo.set(envelope, out);
    return out;
  };
}
