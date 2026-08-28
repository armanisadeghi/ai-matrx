/**
 * THE EMISSION CONTRACT, as pure functions.
 *
 * SPEC-workflow-ui-contract §3 — "a kind-carrying emission renders through the
 * ONE kind component; a custom `component_ref` exists only for kindless
 * payloads." Three routing rules and one dedupe rule, all decided here so the
 * React layer only *renders* the answer and every surface that adopts this
 * (bake-off today, the shipped RunStage at adoption) makes the same call.
 *
 * No React, no Redux, no fetch — everything in this file is a total function
 * over the wire shapes, which is what makes the contract testable at all.
 */

// ---------------------------------------------------------------------------
// The shapes, structurally typed
// ---------------------------------------------------------------------------

/**
 * The parts of a `node_emitted` event this contract reads. Structural, not
 * nominal, so `WorkflowRunEmission` (the Redux fold) and a raw wire event both
 * satisfy it without an adapter.
 */
export interface RoutableEmission {
  nodeId: string;
  /** Registered content-IR kind of the payload, or null when unkinded. */
  kind: string | null;
  /** Did the payload validate against that kind's schema? Null = not checked. */
  kindOk: boolean | null;
  /** "panel" (the stream) or "showcase" (the page-centered slot). */
  presentation: "panel" | "showcase" | null | undefined;
  /** Durable event seq — THE stable identity across refolds and refreshes. */
  seq: number | null;
}

/** The parts of a served `ResultDeliverable` the dedupe rule reads. */
export interface ClaimingDeliverable {
  nodeId: string;
  outputKind: string | null;
}

// ---------------------------------------------------------------------------
// Rules 1 + 2 — how one emission is rendered
// ---------------------------------------------------------------------------

/**
 * Where an emission renders.
 *
 * `kind` — through `KindInstanceRender`, the same component chat uses. The
 * author's `component_ref` is IGNORED on this branch, deliberately and per
 * SPEC §3.1: a registered kind's component outranks it.
 *
 * `component` — today's path: `DbEmitRenderer` resolves `component_ref`
 * against `surface` with the generic body as the immediate paint.
 */
export type EmissionRoute =
  | { via: "kind"; kind: string }
  | { via: "component"; reason: "kindless" | "kind_failed_check" };

/**
 * SPEC §3 rules 1 and 2, verbatim:
 *
 *  1. `kind` set and `kind_ok is not False` → the kind component.
 *  2. `kind` null, or `kind_ok is False` → the `component_ref` path.
 *
 * Note the asymmetry that the wire actually produces and the spec actually
 * says: `kind_ok === null` means "not checked" (a degraded verdict, an
 * unreachable registry), NOT "failed" — and an unchecked kind still routes to
 * its component. Only an explicit `false` — the payload SAID a kind and the
 * registry DISAGREED — falls back.
 */
export function routeEmission(
  emission: Pick<RoutableEmission, "kind" | "kindOk">,
): EmissionRoute {
  const kind = emission.kind?.trim();
  if (!kind) return { via: "component", reason: "kindless" };
  if (emission.kindOk === false) {
    return { via: "component", reason: "kind_failed_check" };
  }
  return { via: "kind", kind };
}

// ---------------------------------------------------------------------------
// Rule 3 — showcase vs. panel
// ---------------------------------------------------------------------------

export interface PresentationSplit<T> {
  /**
   * THE one live showcase, or null. At most one is live at a time and a newer
   * one REPLACES the older — so this is the last showcase in arrival order,
   * never a list. The replaced one does not fall back into the stream: it is
   * gone, which is what "showcase" means.
   */
  showcase: T | null;
  /** Panel emissions, arrival order preserved, newest last. */
  panel: T[];
}

/** True for the one value the wire uses to mean "page-centered". */
export function isShowcase(
  emission: Pick<RoutableEmission, "presentation">,
): boolean {
  return emission.presentation === "showcase";
}

/**
 * SPEC §3 rule 3: `presentation:"showcase"` renders in the page-centered
 * showcase slot and **not also** in the emissions stream; at most one showcase
 * live, a newer one replaces it. `"panel"` → the stream, arrival order, newest
 * last, never displacing what is on screen.
 *
 * Arrival order is the input's order — the Redux fold appends, and `seq` is
 * only used to break a tie the fold cannot (a replay landing out of order).
 */
export function splitByPresentation<T extends RoutableEmission>(
  emissions: readonly T[],
): PresentationSplit<T> {
  const panel: T[] = [];
  let showcase: T | null = null;
  for (const emission of emissions) {
    if (!isShowcase(emission)) {
      panel.push(emission);
      continue;
    }
    // Newer replaces. "Newer" is arrival order, except that a durable `seq`
    // beats it when both sides have one — a refold can hand us a replayed
    // event after a live one.
    if (
      showcase === null ||
      showcase.seq === null ||
      emission.seq === null ||
      emission.seq >= showcase.seq
    ) {
      showcase = emission;
    }
  }
  return { showcase, panel };
}

// ---------------------------------------------------------------------------
// The emit / deliverable dedupe
// ---------------------------------------------------------------------------

/**
 * SPEC §3: "A node that is BOTH an `output.*` deliverable and fires
 * `node_emitted` renders **once** — dedupe key `(node_id, kind)`, the
 * deliverable slot wins, the emission is suppressed rather than duplicated
 * into a second card."
 *
 * 🚨 THE NULL-KIND WIDENING, and why it is not a liberty taken.
 * The literal key `(node_id, kind)` can never match for the exact node class
 * the rule exists for. `output.to_frontend` declares `dynamic_output=True`
 * (`matrx_graph/nodes/output/to_frontend.py`), so `CompiledNode.output_kind`
 * is None and `GET /result-schema` serves that deliverable with
 * `output_kind: null` — while its emission carries a real, verified kind
 * (proven live: `emit_quiz` → `quiz_set`, `kind_ok: true`). A strict
 * two-part-key comparison therefore fires on NOTHING and every showcase-and-
 * deliverable node renders twice, which is precisely the outcome the rule
 * forbids.
 *
 * So: a declared deliverable with NO declared kind claims any emission from
 * its own node. A declared deliverable WITH a kind claims only an emission of
 * that kind — the strict key, where the server can actually supply one. The
 * node id is the part the server always knows; the kind is the part it
 * sometimes cannot.
 */
export function deliverableClaims(
  deliverable: ClaimingDeliverable,
  emission: Pick<RoutableEmission, "nodeId" | "kind">,
): boolean {
  if (deliverable.nodeId !== emission.nodeId) return false;
  if (deliverable.outputKind === null) return true;
  return deliverable.outputKind === emission.kind;
}

/**
 * The emissions that still belong in the stream: everything no declared
 * deliverable has claimed. Order is preserved — suppression never reshuffles
 * what is already on screen.
 */
export function suppressClaimedEmissions<T extends RoutableEmission>(
  emissions: readonly T[],
  deliverables: readonly ClaimingDeliverable[],
): T[] {
  if (deliverables.length === 0) return [...emissions];
  return emissions.filter(
    (emission) => !deliverables.some((d) => deliverableClaims(d, emission)),
  );
}

/**
 * The emission each declared deliverable is settled BY — keyed by node id,
 * the LAST claimed emission winning (a node that emits twice shows its most
 * recent reveal in its one reserved slot, never two).
 *
 * This is the other half of "the deliverable slot wins": the slot cannot win
 * and then render nothing. For an `output.to_frontend` deliverable the node's
 * own settled output is the untouched PASS-THROUGH payload — not the shaped,
 * kind-verified thing the author chose to show — so the emission is the only
 * honest content for that slot.
 */
export function emissionsByDeliverable<T extends RoutableEmission>(
  emissions: readonly T[],
  deliverables: readonly ClaimingDeliverable[],
): Record<string, T> {
  const claimed: Record<string, T> = {};
  for (const emission of emissions) {
    for (const deliverable of deliverables) {
      if (deliverableClaims(deliverable, emission)) {
        claimed[deliverable.nodeId] = emission;
      }
    }
  }
  return claimed;
}
