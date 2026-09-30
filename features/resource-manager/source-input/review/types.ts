/**
 * "Review what goes in" — the caller-facing contract.
 *
 * Every host that assembles a request from a person's Sources (the one
 * `SourceInput`, a mandate window, a workflow input) calls
 * `openSourceReview(sourceSet, options)` and gets back what the person chose.
 * The wire shapes (`SourceSet`, `SourceRef`, `SourceManifest`) are the frozen
 * v1 contract in `@ai-matrx/agents/sources` — never re-declared here.
 *
 * Contract of record: common-docs `projects/unified-source-input/DESIGN.md`
 * § "The follow-up page".
 */

import type { SourceSet } from "@ai-matrx/agents/sources";
import type { SourceDelivery } from "@ai-matrx/agents/sources/runtime";
import type { SourceDescription } from "./SourceReviewRow";

/** Why the review opened — it changes the one sentence at the top. */
export type SourceReviewReason =
  /** The person pressed "Review what goes in". */
  | "requested"
  /** The host opened it because the Sources are larger than the review threshold knob. */
  | "large";

export interface SourceReviewOptions {
  /**
   * The model that will read these Sources. Its real context window sets the
   * budget. Overrides `sourceSet.target_model_id`; when neither is set the
   * review says plainly that the model is unknown and uses a labelled default.
   */
  targetModelId?: string;
  /** What the Sources are for, in the person's words ("your flashcard deck"). */
  purpose?: string;
  /** Default "requested". */
  reason?: SourceReviewReason;
  /**
   * Label of the host's "add more Sources" affordance. When set, the review
   * shows an "Add more" button that closes with `status: "add_more"` carrying
   * the tuned set, so the host reopens its own Source input. Omit on hosts
   * that cannot add Sources.
   */
  addMoreLabel?: string;
  /**
   * The deliveries the host can use. Omitted = both. A host that needs the
   * text up front passes `["direct"]`: "Let the AI look it up" is never
   * offered, and a Source handed in set to it is switched back, said on screen.
   */
  deliveries?: readonly SourceDelivery[];
  /**
   * How the host names each Source, keyed by `sourceKey(ref)`
   * ("<resource_type>:<resource_id>"): its real kind and display name. The
   * manifest only knows the stored type ("Document") and a document's own
   * title; the host knows it was a YouTube video called "Sleep video". Plain
   * data — it travels through Redux with the window.
   */
  describe?: Record<string, SourceDescription>;
}

export type SourceReviewOutcome =
  /** The person pressed "Use these". `sourceSet` is exactly what the review showed. */
  | { status: "applied"; sourceSet: SourceSet }
  /** The person wants to add Sources; `sourceSet` keeps every choice made so far. */
  | { status: "add_more"; sourceSet: SourceSet }
  /** Closed without applying — the caller keeps its original set. */
  | { status: "cancelled" };
