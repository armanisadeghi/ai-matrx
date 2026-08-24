/**
 * The engine registry the console drives.
 *
 * KI-049 requires the SHAPE to accept the other coverage engines (facets
 * KI-013, gazetteer KI-015, situational KI-016) "without a second console", so
 * an engine is a ROW here, never a hard-coded branch in the component. Adding
 * one is: add the row, and the console gains a tab.
 *
 * Only topic placement is wired today — and the registry says so out loud
 * rather than rendering a tab that does nothing.
 */

import type { paths } from "@/types/python-generated/api-types";

export interface ConsoleEngine {
  /** Stable slug — also the `engine_slug` stored on `seo.engine_schedule`. */
  slug: string;
  label: string;
  /** One sentence, in the operator's language, about what a pass does. */
  what: string;
  /** The knob feature whose ceilings bound every run. */
  knobFeature: string;
  /** The deployed aidream command this engine runs. */
  path: keyof paths;
  /** The wire kind carrying the finished result. */
  finalKind: string;
  /** Wire stage kind → the sentence a human reads. */
  stageLabels: Record<string, string>;
  /** The knob key that caps keywords per pass — the console's cap is bounded by it. */
  capKnobKey: string;
  /** What the live-run window is called while this engine works. */
  liveLabel: string;
}

export const TOPIC_PLACEMENT_ENGINE: ConsoleEngine = {
  slug: "seo.topic_placement",
  label: "Topic placement",
  what: "Places this brand's highest-demand unplaced keywords onto its Offering tree. A keyword with no topic can never resolve a value.",
  knobFeature: "seo.topic_placement",
  path: "/seo/keywords/topics/backfill",
  finalKind: "seo.placement_completed",
  stageLabels: {
    "seo.placement_refreshed": "Measuring this site's Search Console demand…",
    "seo.placement_claimed": "Claiming the highest-demand unplaced keywords…",
    "seo.assign_topics_started": "Reading the keywords…",
    "seo.assign_topics_tree_loaded": "Reading the shared topic tree…",
    "seo.assign_topics_agent_completed": "Placing keywords on the tree…",
    "seo.assign_topics_applied": "Saving placements…",
    "seo.placement_settled": "Settling the batch…",
    "seo.placement_ceiling_reached": "Daily ceiling reached",
    "seo.placement_completed": "Placement pass complete",
  },
  capKnobKey: "batch_keywords",
  liveLabel: "Topic assigner",
};

/** Every engine the console can drive today. */
export const CONSOLE_ENGINES: readonly ConsoleEngine[] = [
  TOPIC_PLACEMENT_ENGINE,
];
