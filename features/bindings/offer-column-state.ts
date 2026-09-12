/**
 * WHAT THE OFFERED COLUMN IS SAYING — status and sentence, decided ONCE.
 *
 * 🚨 THE DEFECT THIS CLOSES (FIX-Q8, 2026-09-11, read off the deployed admin
 * panel). `OneBindingWorkspace` derived the offer's condition TWICE, from two
 * different expressions:
 *
 *   · the sentence knew three conditions — loading, ready, and
 *     `surfaceState.status === "error"`;
 *   · the column's `status` prop knew two — `offerPending ? "loading" :
 *     "ready"`.
 *
 * So a failed read reached `<OfferedInventoryColumn>` labelled **"ready" with
 * zero values**, and the column printed its empty-state copy — *"This job
 * offers nothing yet. Describe its inputs in the INPUT section above"* —
 * directly beneath a header saying the inputs could not be read. Two
 * contradictory answers to one question, on one screen, three inches apart.
 * The fourth law: a screen is absent or honest, never both at once.
 *
 * A second derivation is the whole bug, so there is now exactly one. Both the
 * sentence and the status come out of THIS function, and a consumer cannot
 * take one without the other.
 *
 * The sentence for a failure is NOT written here either: it is
 * `surfaceState.message`, already a complete sentence with a remedy from
 * `describeInputSurfaceFailure`. Printed, never interpolated — interpolating
 * it into a prefix is what produced "The job's inputs could not be read:
 * HTTP 400".
 */

import type { MandateInputSurfaceState } from "@/features/mandates/input-surface";

export type OfferColumnStatus = "loading" | "ready" | "error";

export interface OfferColumnState {
  status: OfferColumnStatus;
  /** The ONE sentence under the column's heading. Always printable as-is. */
  sourceLine: string;
  /** The provision key's mono chip, when there is a provision (W10-2). */
  sourceSlug: string | null;
}

export interface OfferColumnInput {
  /** The provision key the call site declares, when the offer is code-given. */
  provisionKey: string | null;
  /** True when a code provision already handed us a resolved offer. */
  hasResolvedOffer: boolean;
  /** True when an offer — code-given or described — is in hand. */
  hasOffer: boolean;
  /** The served input surface's own three states. */
  surface: MandateInputSurfaceState;
}

export function offerColumnState(input: OfferColumnInput): OfferColumnState {
  const { provisionKey, hasResolvedOffer, hasOffer, surface } = input;

  // A code provision answers on its own; the served surface is not consulted,
  // so neither its loading nor its failure can speak for this column.
  const surfaceAnswers = !provisionKey && !hasResolvedOffer;

  if (surfaceAnswers && surface.status === "loading") {
    return {
      status: "loading",
      sourceLine: "Reading what this job offers…",
      sourceSlug: null,
    };
  }

  if (surfaceAnswers && surface.status === "error") {
    return {
      // 🚨 THE STATE THAT USED TO BE CALLED "ready". The column MUST know, or
      // it prints "offers nothing yet" over a read that never happened.
      status: "error",
      sourceLine: surface.message,
      sourceSlug: null,
    };
  }

  if (provisionKey) {
    return {
      status: "ready",
      // W10-2 — the provision's key is a SLUG; it rides the mono chip beside
      // this sentence, never inside it.
      sourceLine:
        "The call site supplies these every launch — declared by the provision",
      sourceSlug: provisionKey,
    };
  }

  return {
    status: "ready",
    sourceLine: hasOffer
      ? "This job's own described inputs. They ARE its provision."
      : "Nothing described yet.",
    sourceSlug: null,
  };
}
