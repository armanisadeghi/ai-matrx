/**
 * THE DISCLOSURES OF A RUN — the pure reader behind the live ledger.
 *
 * The case oracle runs once per loop turn, so a desk's run carries one
 * `case_disclosure` per disclosure step. Two places can carry it, and both are
 * read here for the same reason `readPresentedResult` reads both (wall W33): a
 * node's STORED output is where the oracle's own return lands, and a
 * `node_emitted` frame is where a presenting step puts it. A surface that
 * reads one of the two goes blank on the other.
 *
 * The ledger is CUMULATIVE, so the FURTHEST-ALONG disclosure is the whole path
 * — which is why `latestCaseDisclosure` is what a surface renders. Pure module: no
 * React, no Redux, so the rule is testable without a browser.
 */

import type { WorkflowRunEmission } from "@/features/workflow-runtime/redux/workflow-runs.slice";
import { CASE_DISCLOSURE_KIND } from "@/features/content-ir/kinds/masterwork-unfolding";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A `case_disclosure` value, recognised by ITS OWN MARKER — never by the node
 * it came from. `__kind` is part of the data (the kind-marker law), so it is
 * also the only honest way to answer "is this a disclosure".
 */
export function isCaseDisclosureValue(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value) && value.__kind === CASE_DISCLOSURE_KIND;
}

/** One invocation of the disclose node, as the run slice records it. */
export interface DiscloseInvocationLike {
  output?: unknown;
}

/**
 * Every disclosure this run has produced so far. Emissions come first (they
 * are seq-ordered by the slice) and stored outputs follow — a run never
 * carries both for the same turn, and de-duplication by identity would be a
 * guess about which copy is fresher. This ORDER IS NOT RECENCY across the two
 * sources, which is why `latestCaseDisclosure` ranks by the ledger's own step
 * count rather than taking the last element.
 */
export function readCaseDisclosures({
  nodeId,
  emissions,
  invocations,
}: {
  /** The disclose node's id, when the definition named one. */
  nodeId: string | null;
  emissions: readonly WorkflowRunEmission[];
  invocations: readonly DiscloseInvocationLike[];
}): Record<string, unknown>[] {
  const fromEmissions = emissions
    .filter(
      (emission) =>
        (nodeId === null || emission.nodeId === nodeId) &&
        isCaseDisclosureValue(emission.payload),
    )
    .map((emission) => emission.payload as Record<string, unknown>);
  const fromOutputs = invocations
    .map((invocation) => invocation.output)
    .filter(isCaseDisclosureValue);
  return [...fromEmissions, ...fromOutputs];
}

/**
 * How many disclosure steps a ledger has consumed — the oracle's own
 * monotonic counter, and the only ordering fact a disclosure carries.
 * Null when the payload has no ledger (an older or partial frame).
 */
function ledgerSteps(disclosure: Record<string, unknown>): number | null {
  const ledger = disclosure.ledger;
  if (!isRecord(ledger)) return null;
  const steps = ledger.steps;
  return typeof steps === "number" && Number.isFinite(steps) ? steps : null;
}

/**
 * The whole story: the most recent cumulative ledger, or null.
 *
 * ORDERED BY THE LEDGER, NEVER BY ARRAY POSITION (Bugbot, PR #222,
 * 2026-09-12). `readCaseDisclosures` concatenates live emissions first and
 * stored node outputs last, so a run holding a fresh emission for turn 5 and a
 * stored output for turn 2 handed this function the OLDER row last — and the
 * box drew an earlier ledger, hiding steps the case had already released. The
 * ledger's `steps` is the oracle's own monotonic counter, so the highest wins;
 * ties (and rows with no ledger at all) fall back to the later position, which
 * is the previous behaviour for a run that carries only one source.
 */
export function latestCaseDisclosure(
  disclosures: readonly Record<string, unknown>[],
): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestSteps = Number.NEGATIVE_INFINITY;
  for (const disclosure of disclosures) {
    const steps = ledgerSteps(disclosure) ?? Number.NEGATIVE_INFINITY;
    if (best === null || steps >= bestSteps) {
      best = disclosure;
      bestSteps = steps;
    }
  }
  return best;
}
