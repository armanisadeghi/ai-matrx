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
 * The ledger is CUMULATIVE, so the LAST disclosure is the whole path — which
 * is why `latestCaseDisclosure` is what a surface renders. Pure module: no
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
 * Every disclosure this run has produced so far, in arrival order. Emissions
 * come first (they are seq-ordered by the slice) and stored outputs follow —
 * a run never carries both for the same turn, and de-duplication by identity
 * would be a guess about which copy is fresher.
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

/** The whole story: the most recent cumulative ledger, or null. */
export function latestCaseDisclosure(
  disclosures: readonly Record<string, unknown>[],
): Record<string, unknown> | null {
  return disclosures.length > 0
    ? (disclosures[disclosures.length - 1] ?? null)
    : null;
}
