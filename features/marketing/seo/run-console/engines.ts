/**
 * The engine registry the console drives.
 *
 * KI-049 requires the SHAPE to accept the other coverage engines (facets
 * KI-013, gazetteer KI-015, situational KI-016) "without a second console", so
 * an engine is a ROW here, never a hard-coded branch in the component. Adding
 * one is: add the row, and the console gains a tab.
 *
 * 🚨 THE SAME ROW GOVERNS THE UNATTENDED PASS. `slug` is the `engine_slug` on
 * `seo.engine_schedule`, so the row an operator saves in the Schedule tab, the
 * cascade (`seo.engine_schedule_resolve`), the due test
 * (`seo.engine_schedules_due`) and aidream's `ENGINE_RUNNERS` all name the same
 * engine. Adding an engine here without its owed-work branch in
 * `engine_schedules_due` and its runner in the dispatcher gives you a console
 * that can author a schedule nothing will ever fire.
 */

import type { paths } from "@/types/python-generated/api-types";

/**
 * HOW a pass is started. Two shapes, because the engines genuinely differ:
 *
 *   `aidream_command` — a paid, multi-minute, streaming pass. Goes to the
 *     deployed Python command through `useSeoCommandRun` and narrates itself in
 *     the floating live-run window.
 *   `rpc` — the whole engine is a database function. Zero AI spend, seconds not
 *     minutes, and there is no stream to watch because there is nothing to
 *     narrate. Wrapping it in a command endpoint purely to look like the other
 *     one would be ceremony that buys nothing and adds a hop.
 */
export type ConsoleEngineRunner =
  | {
      kind: "aidream_command";
      /** The deployed aidream command this engine runs. */
      path: keyof paths;
      /** The wire kind carrying the finished result. */
      finalKind: string;
      /** Wire stage kind → the sentence a human reads. */
      stageLabels: Record<string, string>;
      /** What the live-run window is called while this engine works. */
      liveLabel: string;
    }
  | { kind: "rpc" };

export interface ConsoleEngine {
  /** Stable slug — also the `engine_slug` stored on `seo.engine_schedule`. */
  slug: string;
  label: string;
  /** One sentence, in the operator's language, about what a pass does. */
  what: string;
  /** The knob feature whose ceilings bound every run. */
  knobFeature: string;
  /** How the console starts a pass. */
  runner: ConsoleEngineRunner;
  /** The knob key that caps ONE pass — the console's cap is bounded by it. */
  capKnobKey: string;
  /** What the cap input is called, in the operator's words. */
  capLabel: string;
  /**
   * The `seo.ai_capability` slug whose autonomy mode this engine obeys
   * (KI-044). The console shows the mode beside the engine, so nobody presses
   * Run now and then wonders why nothing was written.
   */
  autonomyCapability: string;
  /** The agents this engine runs, named on the page (NO SECRET AI). */
  agents: Array<{ mandateKey: string; does: string }>;
}

export const TOPIC_PLACEMENT_ENGINE: ConsoleEngine = {
  slug: "seo.topic_placement",
  label: "Topic placement",
  what: "Places this brand's highest-demand unplaced keywords onto its Offering tree. A keyword with no topic can never resolve a value.",
  knobFeature: "seo.topic_placement",
  runner: {
    kind: "aidream_command",
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
    liveLabel: "Topic assigner",
  },
  capKnobKey: "batch_keywords",
  capLabel: "Max keywords per brand",
  autonomyCapability: "topic_assigner",
  agents: [
    {
      mandateKey: "seo.topic_assigner",
      does: "places keywords onto the Offering tree",
    },
  ],
};

/**
 * KI-016 — the situational refresh.
 *
 * A situational stamp ("parked — 1 impression or fewer in 28 days") is a claim
 * about NOW and carries an `as_of`. Nothing ever re-derived it unattended, so
 * the as-of aged while still printing as current — a lie with a timestamp on
 * it. This engine re-runs every condition matcher's Dig Here rule over the
 * site's current window through the ONE engine
 * (`seo.fn_evaluate_condition_matchers`): fresh matches gain an as-of, keywords
 * that stopped matching are released, and human-pinned stamps are never
 * touched.
 *
 * No AI, no dollars, no stream — hence `runner: rpc`.
 */
export const SITUATIONAL_REFRESH_ENGINE: ConsoleEngine = {
  slug: "seo.situational_refresh",
  label: "Situational refresh",
  what: "Re-works out every 'right now on this site' segment against the current window, so an as-of never ages into a claim about last month. Releases keywords that stopped matching; never touches a stamp a person pinned.",
  knobFeature: "seo.situational_stamps",
  runner: { kind: "rpc" },
  capKnobKey: "writes_per_pass",
  capLabel: "Max keywords stamped per pass",
  autonomyCapability: "matcher_engine",
  // A condition matcher IS a matcher, so it answers to the matcher engine's
  // mode — there is no separate "situational" capability and inventing one
  // would split one rule across two settings.
  agents: [],
};

/**
 * KI-015 — gazetteer place detection.
 *
 * The deterministic place pass (51 US states + 1,000 largest cities + "near
 * me" grammar) already existed as a bench button
 * (`PlaceDetectionStrip.tsx` → `seo.fn_backfill_keyword_places`) driving ~300
 * keywords per press. Arman's ruling (KI-049, register): "the scheduling
 * needs to go on the same page" — a standalone chat-approved nightly task is
 * not the way to run this, the run console is. This engine ROW drives the
 * SAME function the bench button already presses.
 *
 * ZERO AI spend — the pass is pure SQL (a gazetteer lookup), so `runner: rpc`
 * exactly like situational refresh: no dollars, seconds not minutes, nothing
 * to narrate in a stream.
 *
 * NO AGENT. `autonomyCapability: "place_detection"` exists in
 * `seo.ai_capability` and is treated as deterministic everywhere else in this
 * codebase (`AutonomyModesEditor.tsx`: "Deterministic · no mandate or agent",
 * the same line `matcher_engine` gets) — the console shows that mode so
 * nobody presses Run now wondering why nothing wrote, but `agents: []` is the
 * honest answer: no model reasons about a single keyword here.
 *
 * UNLIKE THE OTHER TWO ENGINES, this one has no per-brand "owed work" —
 * `fn_backfill_keyword_places` scans ONE shared keyword corpus across every
 * site, not a brand's own queue (`seo.keyword_classification_queue` carries
 * no `site_id` at all). The console body therefore renders a single global
 * scoreboard instead of a brand table to tick — see
 * `GazetteerPlaceDetectionConsole.tsx`.
 */
export const GAZETTEER_PLACE_DETECTION_ENGINE: ConsoleEngine = {
  slug: "seo.place_detection",
  label: "Place detection",
  what: "Scans the shared keyword corpus for place mentions — states, cities, \"near me\" grammar — and stamps detected places plus local intent. One pass covers every brand; there is no per-brand queue.",
  knobFeature: "seo.keyword_place_detection",
  runner: { kind: "rpc" },
  capKnobKey: "batch_keywords",
  capLabel: "Max keywords per pass",
  autonomyCapability: "place_detection",
  // Deterministic gazetteer matching — no model reasons about a keyword here.
  agents: [],
};

/** Every engine the console can drive today. */
export const CONSOLE_ENGINES: readonly ConsoleEngine[] = [
  TOPIC_PLACEMENT_ENGINE,
  SITUATIONAL_REFRESH_ENGINE,
  GAZETTEER_PLACE_DETECTION_ENGINE,
];

export function consoleEngineBySlug(slug: string): ConsoleEngine {
  const engine = CONSOLE_ENGINES.find((candidate) => candidate.slug === slug);
  if (!engine) {
    throw new Error(`No console engine is registered as "${slug}".`);
  }
  return engine;
}
