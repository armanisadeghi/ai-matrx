// features/marketing/seo/topical-map/knobs.ts
//
// The 53 organization-configurable opinions behind every topical-map screen
// (requirements §0.1 and §5, law 6: opinions become knobs). Feature key
// `seo.topical_map` in `platform.feature_knob`; every row is overridable by
// organization, brand, site and user.
//
// "Default" in this file ALWAYS means the knob row's system default, never the
// only way. Nothing here may become a constant: `lib/knobs/featureKnobs` RAISES
// on a missing row precisely so a frozen fallback can never silently replace an
// admin's choice. A screen that cannot read its knobs says so and offers the
// remedy — it does not quietly render the shape this file happens to describe.
//
// 🚨 THE COUNT IS THE ROW SET, NOT A NUMBER SOMEBODY TYPED. `TOPICAL_MAP_KNOB_KEYS`
// is every `seo.topical_map` key the database holds (measured live 2026-09-18,
// 53 rows). This file used to read 27 of them, and the 26 it skipped — every
// mapper, intent and region ceiling, the geography policy, the table's default
// column set — were read nowhere in this repo at all, so an admin turning them
// changed nothing a person could see. A lane that needs a knob this file lacks
// escalates to the coordinator (one migration, one edit here); it never reads
// `platform.feature_knob` itself (CONTRACTS §7).

"use client";

import { useQuery } from "@tanstack/react-query";

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  asKnobEnumValue,
  KNOB_ENUM_VOCABULARIES,
  type KnobEnumAddress,
  type KnobEnumValue,
} from "@/features/settings/universal/knobEnumVocabularies.generated";
import {
  knobBool,
  knobInts,
  knobString,
  knobStringList,
} from "@/lib/knobs/featureKnobs";
import { createClient } from "@/utils/supabase/client";

import { topicalMapKeys } from "./hooks";

export const TOPICAL_MAP_KNOB_FEATURE = "seo.topical_map";

// ── The vocabularies, typed ────────────────────────────────────────────────
//
// 🚨 NOT RETYPED — DERIVED. Every union below comes from
// `knobEnumVocabularies.generated.ts`, which IS the live `allowed_values` of
// each `platform.feature_knob` row (regenerate: `pnpm
// generate:knob-enum-vocabularies`; staleness guard: `pnpm
// check:knob-enum-vocabularies`).
//
// They used to be hand-written here, and on 2026-09-17 three of the nine had
// drifted from their rows — `proposal_mode` said `auto_apply_initial | propose
// | apply` where the row says `auto_apply | approval | auto_apply_initial`,
// `description_regeneration_mode` said `queued | immediate | off` where the
// row says `automatic | queued | manual`, and `bulk_action_confirm` was
// missing `never` entirely. Only the defaults overlapped, so nothing looked
// broken — until an admin picked one of the values the settings picker
// legitimately offers, at which point the reader below RAISED and every map
// screen went blank. The picker offers the ROW; so does this file now, by
// construction.

type MapKnobEnum<K extends string> = `${typeof TOPICAL_MAP_KNOB_FEATURE}.${K}` extends
  KnobEnumAddress
  ? KnobEnumValue<`${typeof TOPICAL_MAP_KNOB_FEATURE}.${K}`>
  : never;

export type MapDefaultView = MapKnobEnum<"default_view">;
export type MapOutlineDetail = MapKnobEnum<"outline_detail">;
export type MapDetailPanel = MapKnobEnum<"detail_panel">;
export type MapAgentChangeMode = MapKnobEnum<"map_agent_change_mode">;
export type MapProposalMode = MapKnobEnum<"proposal_mode">;
export type MapProposalReviewMode = MapKnobEnum<"proposal_review_mode">;
export type MapIntentReviewMode = MapKnobEnum<"intent_review_mode">;
export type MapBulkActionConfirm = MapKnobEnum<"bulk_action_confirm">;
export type MapDescriptionRegenerationMode = MapKnobEnum<"description_regeneration_mode">;
/** `geography_branch_policy` — what happens when an author proposes a PLACE as a topic. */
export type MapGeographyBranchPolicy = MapKnobEnum<"geography_branch_policy">;
/** `region_value_evidence` — how sure the region pass must be before it writes a place. */
export type MapRegionValueEvidence = MapKnobEnum<"region_value_evidence">;

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
  outline_intent_dots: boolean;
  outline_description_max_chars: number;
  outline_max_chars: number;
  // The graph's bands (§2.2)
  graph_band_card_max: number;
  graph_band_compact_max: number;
  graph_band_line_max: number;
  graph_encoding: MapGraphEncoding;
  graph_auto_layout: boolean;
  // The table (§2.6)
  table_default_columns: string[];
  // The detail panel (§2.3)
  detail_panel: MapDetailPanel;
  // Agents (§2.4)
  topic_agent_change_mode: MapAgentChangeMode;
  map_agent_change_mode: MapAgentChangeMode;
  description_regeneration_mode: MapDescriptionRegenerationMode;
  // Proposals (§2.5)
  proposal_mode: MapProposalMode;
  proposal_review_mode: MapProposalReviewMode;
  // Home (§1)
  home_single_map_opens_workspace: boolean;
  // Convergence (§2.7, U5)
  intent_review_mode: MapIntentReviewMode;
  bulk_action_confirm: MapBulkActionConfirm;
  bulk_action_confirm_threshold: number;
  intent_colors: MapIntentColors;
  performance_window_days: number;
  pages_low_traffic_clicks_max: number;
  // The page mapper's own ceilings (`POST /seo/sites/{site_id}/map/pages`)
  mapping_batch_size: number;
  mapping_concurrent_batches: number;
  mapping_confidence_floor: number;
  mapping_consecutive_failure_stop: number;
  mapping_daily_page_ceiling: number;
  mapping_max_attempts: number;
  mapping_max_topics_per_page: number;
  mapping_stale_claim_minutes: number;
  // The intent proposer's own ceilings (`POST /seo/sites/{site_id}/map/intents`)
  intent_batch_size: number;
  intent_concurrent_batches: number;
  intent_confidence_floor: number;
  intent_consecutive_failure_stop: number;
  intent_daily_page_ceiling: number;
  intent_max_attempts: number;
  intent_sibling_roster_max: number;
  intent_stale_claim_minutes: number;
  intent_summary_max_words: number;
  // The region pass (`POST /seo/sites/{site_id}/map/regions`)
  region_binding_batch_size: number;
  region_daily_page_ceiling: number;
  region_min_pages_per_value: number;
  region_value_evidence: MapRegionValueEvidence;
  geography_branch_policy: MapGeographyBranchPolicy;
  // Builder shape ceilings (the map builder's own knobs, read by screens that
  // explain what a generation run will produce)
  overview_min_nodes: number;
  overview_max_nodes: number;
  neighborhood_min_nodes: number;
  neighborhood_max_nodes: number;
  topic_description_max_chars: number;
  page_summary_max_words: number;
}

/**
 * The integer knobs. `knobInts` reads them out of the ONE cached
 * `platform.feature_knob` window, so this list costs no extra round trips.
 */
const INT_KNOB_KEYS = [
  "bulk_action_confirm_threshold",
  "graph_band_card_max",
  "graph_band_compact_max",
  "graph_band_line_max",
  "intent_batch_size",
  "intent_concurrent_batches",
  "intent_confidence_floor",
  "intent_consecutive_failure_stop",
  "intent_daily_page_ceiling",
  "intent_max_attempts",
  "intent_sibling_roster_max",
  "intent_stale_claim_minutes",
  "intent_summary_max_words",
  "mapping_batch_size",
  "mapping_concurrent_batches",
  "mapping_confidence_floor",
  "mapping_consecutive_failure_stop",
  "mapping_daily_page_ceiling",
  "mapping_max_attempts",
  "mapping_max_topics_per_page",
  "mapping_stale_claim_minutes",
  "neighborhood_max_nodes",
  "neighborhood_min_nodes",
  "outline_description_max_chars",
  "outline_max_chars",
  "overview_max_nodes",
  "overview_min_nodes",
  "page_summary_max_words",
  "pages_low_traffic_clicks_max",
  "performance_window_days",
  "region_binding_batch_size",
  "region_daily_page_ceiling",
  "region_min_pages_per_value",
  "topic_description_max_chars",
] as const satisfies readonly (keyof TopicalMapKnobs)[];

/** The boolean knobs. */
const BOOL_KNOB_KEYS = [
  "graph_auto_layout",
  "home_single_map_opens_workspace",
  "outline_hover_popover",
  "outline_intent_dots",
] as const satisfies readonly (keyof TopicalMapKnobs)[];

/** The enum knobs, every one narrowed onto its OWN row's `allowed_values`. */
const ENUM_KNOB_KEYS = [
  "bulk_action_confirm",
  "default_view",
  "description_regeneration_mode",
  "detail_panel",
  "geography_branch_policy",
  "intent_review_mode",
  "map_agent_change_mode",
  "outline_detail",
  "proposal_mode",
  "proposal_review_mode",
  "region_value_evidence",
  "topic_agent_change_mode",
] as const satisfies readonly (keyof TopicalMapKnobs)[];

/**
 * The `value_type = 'json'` knobs: two objects and one ordered list of column
 * ids. They are NOT readable through the int/bool/string helpers.
 */
const JSON_KNOB_KEYS = [
  "graph_encoding",
  "intent_colors",
  "table_default_columns",
] as const satisfies readonly (keyof TopicalMapKnobs)[];

/** Every key this feature declares. The length of this list IS the count. */
export const TOPICAL_MAP_KNOB_KEYS = [
  ...INT_KNOB_KEYS,
  ...BOOL_KNOB_KEYS,
  ...ENUM_KNOB_KEYS,
  ...JSON_KNOB_KEYS,
]
  .slice()
  .sort() as readonly (keyof TopicalMapKnobs)[];

/**
 * `featureKnobs` has readers for numbers, booleans, strings and string LISTS,
 * but not for an object-shaped `value_type = 'json'` knob — and `graph_encoding`
 * and `intent_colors` are both objects. Rather than grow a variant reader per
 * shape, this reads the two rows through the same client the cached reader uses
 * and validates their keys. A malformed row RAISES, exactly like a missing one:
 * a half-read legend silently drawn in the wrong colors is the failure mode the
 * knob system exists to prevent.
 */
export async function readJsonObjectKnobs(): Promise<{
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
 * One enum knob, narrowed onto ITS OWN ROW's `allowed_values`.
 *
 * 🚨 AN UNKNOWN VALUE NEVER BLANKS A SCREEN. This used to throw, and a throw
 * here takes the whole `readTopicalMapKnobs()` promise down, which leaves
 * `useTopicalMapKnobs` with `knobs: null` and every map screen rendering its
 * failure state. That is the wrong trade twice over: the value came from a
 * picker that OFFERED it, so the admin did nothing wrong; and the knob it
 * belongs to usually decides one detail, not whether the map can be seen at
 * all.
 *
 * So it degrades and SCREAMS (law 4 — nothing fails silently, and every
 * stand-in announces itself): the offending value and its knob address go to
 * the Error Inspector and, at red tier, to the server's `system_error` sink,
 * and the reader falls back to the row's own `default_value` — the value the
 * database itself calls correct, never a constant frozen in this file.
 */
function enumKnob<K extends string>(key: K, value: string): MapKnobEnum<K> {
  const address = `${TOPICAL_MAP_KNOB_FEATURE}.${key}` as KnobEnumAddress;
  const narrowed = asKnobEnumValue(address, value);
  if (narrowed !== null) return narrowed as MapKnobEnum<K>;

  const vocabulary = KNOB_ENUM_VOCABULARIES[address];
  // A key this build does not know as an enum at all is NOT a degradation
  // case: there is no row-declared default to fall back to, so it raises like
  // any other malformed knob rather than handing the screen `undefined`.
  if (!vocabulary) {
    throw new Error(
      `feature knob "${address}" is read as an enum, but no vocabulary for it exists in ` +
        "knobEnumVocabularies.generated.ts. Run `pnpm generate:knob-enum-vocabularies`.",
    );
  }
  try {
    captureError({
      source: "feature-knob-vocabulary",
      relation: address,
      message:
        `feature knob "${address}" is "${value}", which this build does not implement. ` +
        `Its row allows: ${vocabulary.allowed.join(", ")}.`,
      userMessage:
        "One of this map's settings is set to a value this version does not " +
        "support yet, so the default is being used for it. Everything else on " +
        "this screen is unaffected.",
      code: "knob_value_not_implemented",
      details:
        `Fell back to this row's own default_value, "${vocabulary.default}". ` +
        "Either implement the value here, or change the knob. If this file and " +
        "the row disagree, run `pnpm generate:knob-enum-vocabularies`.",
      recoverable: true,
      raw: {
        knob: address,
        offending_value: value,
        allowed_values: [...vocabulary.allowed],
        fell_back_to: vocabulary.default,
      },
      callSite: "features/marketing/seo/topical-map/knobs.ts enumKnob",
    });
  } catch {
    // Capture never breaks the caller.
  }
  return vocabulary.default as MapKnobEnum<K>;
}

async function readBoolKnobs<K extends string>(
  keys: readonly K[],
): Promise<{ [P in K]: boolean }> {
  const out = {} as { [P in K]: boolean };
  for (const key of keys) {
    out[key] = await knobBool(TOPICAL_MAP_KNOB_FEATURE, key);
  }
  return out;
}

async function readEnumKnobs<K extends string>(
  keys: readonly K[],
): Promise<{ [P in K]: MapKnobEnum<P> }> {
  const out = {} as { [P in K]: MapKnobEnum<P> };
  for (const key of keys) {
    const raw = await knobString(TOPICAL_MAP_KNOB_FEATURE, key);
    out[key] = enumKnob(key, raw) as { [P in K]: MapKnobEnum<P> }[K];
  }
  return out;
}

/** Reads all 53. One cached fetch backs every call (see `featureKnobs`). */
export async function readTopicalMapKnobs(): Promise<TopicalMapKnobs> {
  const f = TOPICAL_MAP_KNOB_FEATURE;
  const [ints, bools, enums, json, tableDefaultColumns] = await Promise.all([
    knobInts(f, INT_KNOB_KEYS),
    readBoolKnobs(BOOL_KNOB_KEYS),
    readEnumKnobs(ENUM_KNOB_KEYS),
    readJsonObjectKnobs(),
    // `table_default_columns` is an ORDERED LIST of column ids, so it goes
    // through the list reader: a non-array row, or a member that is not a
    // string, raises instead of becoming a column set that matches nothing.
    knobStringList(f, "table_default_columns"),
  ]);

  return {
    ...ints,
    ...bools,
    ...enums,
    graph_encoding: json.graph_encoding,
    intent_colors: json.intent_colors,
    table_default_columns: tableDefaultColumns,
  };
}

export interface TopicalMapKnobsState {
  knobs: TopicalMapKnobs | null;
  loading: boolean;
  /** Never swallowed: a screen that cannot read its settings must say which one failed. */
  error: Error | null;
}

/**
 * The 53 knobs, for a client screen. `knobs` is null until they load and stays
 * null on failure — a caller renders the failure, never a guessed default.
 *
 * It is a TanStack query (`topicalMapKeys.knobs`, 60s fresh) rather than the
 * `useEffect` + `useState` pair it used to be, so that every map surface
 * mounted at once — the body, the topic panel, a peek, a window — shares ONE
 * in-flight read and ONE cache entry instead of each running its own effect.
 * The returned SHAPE is unchanged on purpose: no consumer has to know.
 */
export function useTopicalMapKnobs(): TopicalMapKnobsState {
  const query = useQuery({
    queryKey: topicalMapKeys.knobs,
    queryFn: readTopicalMapKnobs,
    staleTime: 60_000,
  });

  return {
    knobs: query.data ?? null,
    loading: query.isPending,
    error:
      query.error === null
        ? null
        : query.error instanceof Error
          ? query.error
          : new Error("Could not read the topical map settings."),
  };
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
  // `never` is a value of this knob's row that this file did not know about
  // until 2026-09-17. It turns off the SETTING's confirmation, and nothing
  // else: a destructive or expensive click still states its consequence, which
  // is a law (`destructive-and-expensive-actions`), not a preference an
  // organization can switch off.
  if (knobs.bulk_action_confirm === "never") return false;
  return count > knobs.bulk_action_confirm_threshold;
}
