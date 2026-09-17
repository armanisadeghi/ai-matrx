// features/marketing/seo/topical-map/knobs.ts
//
// The 27 organization-configurable opinions behind every topical-map screen
// (requirements §0.1 and §5, law 6: opinions become knobs). Feature key
// `seo.topical_map` in `platform.feature_knob`; every row is overridable by
// organization, brand, site and user.
//
// "Default" in this file ALWAYS means the knob row's system default, never the
// only way. Nothing here may become a constant: `lib/knobs/featureKnobs` RAISES
// on a missing row precisely so a frozen fallback can never silently replace an
// admin's choice. A screen that cannot read its knobs says so and offers the
// remedy — it does not quietly render the shape this file happens to describe.

"use client";

import { useEffect, useState } from "react";

import { knobBool, knobInt, knobString } from "@/lib/knobs/featureKnobs";
import { createClient } from "@/utils/supabase/client";

export const TOPICAL_MAP_KNOB_FEATURE = "seo.topical_map";

// ── The vocabularies, typed ────────────────────────────────────────────────

export type MapDefaultView = "outline" | "table" | "graph" | "text";
export type MapOutlineDetail = "labels" | "counts" | "counts_snippet";
export type MapDetailPanel = "window" | "drawer";
export type MapAgentChangeMode = "apply" | "propose" | "ask";
export type MapProposalMode = "auto_apply_initial" | "propose" | "apply";
export type MapProposalReviewMode =
  | "one_by_one"
  | "accept_all"
  | "reject_all"
  | "batch";
export type MapIntentReviewMode = "one_by_one" | "accept_all" | "batch";
export type MapBulkActionConfirm = "always" | "above_n";
export type MapDescriptionRegenerationMode = "queued" | "immediate" | "off";

/** `graph_encoding` — what shape and color mean in the graph view (§2.2). */
export interface MapGraphEncoding {
  size: string;
  fill: string;
  ring: string;
  hue: string;
}

/** `intent_colors` — the convergence palette of §2.7. */
export interface MapIntentColors {
  in_place: string;
  leaving: string;
  arriving: string;
  delete: string;
  missing: string;
  planned: string;
}

/** Every knob of `seo.topical_map`, read. */
export interface TopicalMapKnobs {
  // Views (§2.1)
  default_view: MapDefaultView;
  outline_detail: MapOutlineDetail;
  outline_hover_popover: boolean;
  outline_description_max_chars: number;
  outline_max_chars: number;
  // The graph's bands (§2.2)
  graph_band_card_max: number;
  graph_band_compact_max: number;
  graph_band_line_max: number;
  graph_encoding: MapGraphEncoding;
  // The detail panel (§2.3)
  detail_panel: MapDetailPanel;
  // Agents (§2.4)
  topic_agent_change_mode: MapAgentChangeMode;
  map_agent_change_mode: MapAgentChangeMode;
  description_regeneration_mode: MapDescriptionRegenerationMode;
  mapping_batch_size: number;
  // Proposals (§2.5)
  proposal_mode: MapProposalMode;
  proposal_review_mode: MapProposalReviewMode;
  // Convergence (§2.7, U5)
  intent_review_mode: MapIntentReviewMode;
  bulk_action_confirm: MapBulkActionConfirm;
  bulk_action_confirm_threshold: number;
  intent_colors: MapIntentColors;
  performance_window_days: number;
  // Builder shape ceilings (the map builder's own knobs, read by screens that
  // explain what a generation run will produce)
  overview_min_nodes: number;
  overview_max_nodes: number;
  neighborhood_min_nodes: number;
  neighborhood_max_nodes: number;
  topic_description_max_chars: number;
  page_summary_max_words: number;
}

/** Every key this feature declares. The length of this list IS the count. */
export const TOPICAL_MAP_KNOB_KEYS = [
  "bulk_action_confirm",
  "bulk_action_confirm_threshold",
  "default_view",
  "description_regeneration_mode",
  "detail_panel",
  "graph_band_card_max",
  "graph_band_compact_max",
  "graph_band_line_max",
  "graph_encoding",
  "intent_colors",
  "intent_review_mode",
  "map_agent_change_mode",
  "mapping_batch_size",
  "neighborhood_max_nodes",
  "neighborhood_min_nodes",
  "outline_description_max_chars",
  "outline_detail",
  "outline_hover_popover",
  "outline_max_chars",
  "overview_max_nodes",
  "overview_min_nodes",
  "page_summary_max_words",
  "performance_window_days",
  "proposal_mode",
  "proposal_review_mode",
  "topic_agent_change_mode",
  "topic_description_max_chars",
] as const satisfies readonly (keyof TopicalMapKnobs)[];

/**
 * `featureKnobs` has readers for numbers, booleans, strings and string LISTS,
 * but not for an object-shaped `value_type = 'json'` knob — and `graph_encoding`
 * and `intent_colors` are both objects. Rather than grow a variant reader per
 * shape, this reads the two rows through the same client the cached reader uses
 * and validates their keys. A malformed row RAISES, exactly like a missing one:
 * a half-read legend silently drawn in the wrong colors is the failure mode the
 * knob system exists to prevent.
 */
async function readJsonObjectKnobs(): Promise<{
  graph_encoding: MapGraphEncoding;
  intent_colors: MapIntentColors;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("feature_knob")
    .select("key, value")
    .eq("feature", TOPICAL_MAP_KNOB_FEATURE)
    .in("key", ["graph_encoding", "intent_colors"]);
  if (error) {
    throw new Error(
      `Could not read the topical map's graph and intent legends: ${error.message}`,
    );
  }
  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

  function object(key: string, fields: readonly string[]): Record<string, string> {
    const value = byKey.get(key);
    if (value === undefined) {
      throw new Error(
        `Missing feature knob "${TOPICAL_MAP_KNOB_FEATURE}.${key}". Knobs have no ` +
          `code fallback by design: seed the row in a migration and apply it live.`,
      );
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(
        `feature knob "${TOPICAL_MAP_KNOB_FEATURE}.${key}" is not a JSON object: ${String(value)}`,
      );
    }
    const record = value as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const field of fields) {
      const entry = record[field];
      if (typeof entry !== "string") {
        throw new Error(
          `feature knob "${TOPICAL_MAP_KNOB_FEATURE}.${key}" is missing "${field}".`,
        );
      }
      out[field] = entry;
    }
    return out;
  }

  return {
    graph_encoding: object("graph_encoding", [
      "size",
      "fill",
      "ring",
      "hue",
    ]) as unknown as MapGraphEncoding,
    intent_colors: object("intent_colors", [
      "in_place",
      "leaving",
      "arriving",
      "delete",
      "missing",
      "planned",
    ]) as unknown as MapIntentColors,
  };
}

/**
 * An enum knob whose live value is outside the vocabulary this build knows is
 * a REAL problem, not something to shrug at with a default: it means an admin
 * (or a migration) set a value no screen implements. Raise and name both.
 */
function enumKnob<T extends string>(
  key: string,
  value: string,
  allowed: readonly T[],
): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(
    `feature knob "${TOPICAL_MAP_KNOB_FEATURE}.${key}" is "${value}", which this ` +
      `build does not implement. Expected one of: ${allowed.join(", ")}.`,
  );
}

/** Reads all 27. One cached fetch backs every call (see `featureKnobs`). */
export async function readTopicalMapKnobs(): Promise<TopicalMapKnobs> {
  const f = TOPICAL_MAP_KNOB_FEATURE;
  const [
    json,
    defaultView,
    outlineDetail,
    outlineHoverPopover,
    outlineDescriptionMaxChars,
    outlineMaxChars,
    graphBandCardMax,
    graphBandCompactMax,
    graphBandLineMax,
    detailPanel,
    topicAgentChangeMode,
    mapAgentChangeMode,
    descriptionRegenerationMode,
    mappingBatchSize,
    proposalMode,
    proposalReviewMode,
    intentReviewMode,
    bulkActionConfirm,
    bulkActionConfirmThreshold,
    performanceWindowDays,
    overviewMinNodes,
    overviewMaxNodes,
    neighborhoodMinNodes,
    neighborhoodMaxNodes,
    topicDescriptionMaxChars,
    pageSummaryMaxWords,
  ] = await Promise.all([
    readJsonObjectKnobs(),
    knobString(f, "default_view"),
    knobString(f, "outline_detail"),
    knobBool(f, "outline_hover_popover"),
    knobInt(f, "outline_description_max_chars"),
    knobInt(f, "outline_max_chars"),
    knobInt(f, "graph_band_card_max"),
    knobInt(f, "graph_band_compact_max"),
    knobInt(f, "graph_band_line_max"),
    knobString(f, "detail_panel"),
    knobString(f, "topic_agent_change_mode"),
    knobString(f, "map_agent_change_mode"),
    knobString(f, "description_regeneration_mode"),
    knobInt(f, "mapping_batch_size"),
    knobString(f, "proposal_mode"),
    knobString(f, "proposal_review_mode"),
    knobString(f, "intent_review_mode"),
    knobString(f, "bulk_action_confirm"),
    knobInt(f, "bulk_action_confirm_threshold"),
    knobInt(f, "performance_window_days"),
    knobInt(f, "overview_min_nodes"),
    knobInt(f, "overview_max_nodes"),
    knobInt(f, "neighborhood_min_nodes"),
    knobInt(f, "neighborhood_max_nodes"),
    knobInt(f, "topic_description_max_chars"),
    knobInt(f, "page_summary_max_words"),
  ]);

  return {
    default_view: enumKnob("default_view", defaultView, [
      "outline",
      "table",
      "graph",
      "text",
    ] as const),
    outline_detail: enumKnob("outline_detail", outlineDetail, [
      "labels",
      "counts",
      "counts_snippet",
    ] as const),
    outline_hover_popover: outlineHoverPopover,
    outline_description_max_chars: outlineDescriptionMaxChars,
    outline_max_chars: outlineMaxChars,
    graph_band_card_max: graphBandCardMax,
    graph_band_compact_max: graphBandCompactMax,
    graph_band_line_max: graphBandLineMax,
    graph_encoding: json.graph_encoding,
    detail_panel: enumKnob("detail_panel", detailPanel, ["window", "drawer"] as const),
    topic_agent_change_mode: enumKnob("topic_agent_change_mode", topicAgentChangeMode, [
      "apply",
      "propose",
      "ask",
    ] as const),
    map_agent_change_mode: enumKnob("map_agent_change_mode", mapAgentChangeMode, [
      "apply",
      "propose",
      "ask",
    ] as const),
    description_regeneration_mode: enumKnob(
      "description_regeneration_mode",
      descriptionRegenerationMode,
      ["queued", "immediate", "off"] as const,
    ),
    mapping_batch_size: mappingBatchSize,
    proposal_mode: enumKnob("proposal_mode", proposalMode, [
      "auto_apply_initial",
      "propose",
      "apply",
    ] as const),
    proposal_review_mode: enumKnob("proposal_review_mode", proposalReviewMode, [
      "one_by_one",
      "accept_all",
      "reject_all",
      "batch",
    ] as const),
    intent_review_mode: enumKnob("intent_review_mode", intentReviewMode, [
      "one_by_one",
      "accept_all",
      "batch",
    ] as const),
    bulk_action_confirm: enumKnob("bulk_action_confirm", bulkActionConfirm, [
      "always",
      "above_n",
    ] as const),
    bulk_action_confirm_threshold: bulkActionConfirmThreshold,
    intent_colors: json.intent_colors,
    performance_window_days: performanceWindowDays,
    overview_min_nodes: overviewMinNodes,
    overview_max_nodes: overviewMaxNodes,
    neighborhood_min_nodes: neighborhoodMinNodes,
    neighborhood_max_nodes: neighborhoodMaxNodes,
    topic_description_max_chars: topicDescriptionMaxChars,
    page_summary_max_words: pageSummaryMaxWords,
  };
}

export interface TopicalMapKnobsState {
  knobs: TopicalMapKnobs | null;
  loading: boolean;
  /** Never swallowed: a screen that cannot read its settings must say which one failed. */
  error: Error | null;
}

/**
 * The 27 knobs, for a client screen. `knobs` is null until they load and stays
 * null on failure — a caller renders the failure, never a guessed default.
 */
export function useTopicalMapKnobs(): TopicalMapKnobsState {
  const [state, setState] = useState<TopicalMapKnobsState>({
    knobs: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const knobs = await readTopicalMapKnobs();
        if (!cancelled) setState({ knobs, loading: false, error: null });
      } catch (cause) {
        if (cancelled) return;
        setState({
          knobs: null,
          loading: false,
          error:
            cause instanceof Error
              ? cause
              : new Error("Could not read the topical map settings."),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * Whether a bulk action of `count` items must stop and state its consequence
 * before running (`bulk_action_confirm` + its threshold). `always` means every
 * one; `above_n` means once the batch passes the threshold.
 */
export function bulkActionNeedsConfirmation(
  knobs: TopicalMapKnobs,
  count: number,
): boolean {
  if (knobs.bulk_action_confirm === "always") return true;
  return count > knobs.bulk_action_confirm_threshold;
}
