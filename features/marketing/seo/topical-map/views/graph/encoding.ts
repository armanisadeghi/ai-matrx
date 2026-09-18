// features/marketing/seo/topical-map/views/graph/encoding.ts
//
// WHAT SIZE, FILL, RING AND HUE MEAN — read off the `graph_encoding` knob, and
// the convergence colouring that overrides fill in the second mode.
//
// 🚨 AN UNRECOGNISED ENCODING VALUE IS NEVER A BLANK LEGEND. `graph_encoding`
// is a row in `platform.feature_knob`; an admin can put anything in it and a
// migration can add a value this build has never heard of. A silent `??` there
// draws a legend line the person cannot act on and a drawing whose colours mean
// nothing. So an unknown value renders a legend line that SAYS it is unknown,
// captures for the Error Inspector, and the channel it names draws nothing —
// exactly the grammar `ui/intentColorClasses.ts` already uses for a colour name.
//
// Pure: no React, no xy-flow, no store. Tested directly.

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

import type { MapGraphEncoding } from "../../knobs";
import { pageIntentTone } from "../../redux/selectors";
import type { PageIntentDisposition, PageIntentState } from "../../types";

/** The two modes of CONTRACTS §3's `graph.encodingMode`. */
export type GraphEncodingMode = "structure" | "convergence";

/** What the `size` channel may say. */
export type GraphSizeChannel = "pages" | "planned" | "keywords" | "none";
/** What the `fill` channel may say. */
export type GraphFillChannel = "status" | "none";
/** What the `ring` channel may say. `tier` is the topic's depth. */
export type GraphRingChannel = "tier" | "none";
/** What the `hue` channel may say. */
export type GraphHueChannel = "grouped_facet" | "none";

const SIZE_VALUES: readonly string[] = ["pages", "planned", "keywords", "none"];
const FILL_VALUES: readonly string[] = ["status", "none"];
const RING_VALUES: readonly string[] = ["tier", "none"];
const HUE_VALUES: readonly string[] = ["grouped_facet", "none"];

export type GraphEncodingChannelKey = "size" | "fill" | "ring" | "hue";

/** One readable line of the legend. `known: false` is the honest refusal. */
export interface GraphLegendLine {
  channel: GraphEncodingChannelKey;
  /** The raw knob value, printed verbatim when it is not one we know. */
  value: string;
  /** A full sentence for the person. Never a code word on its own. */
  text: string;
  known: boolean;
}

/** The resolved encoding: every unknown channel has already become `none`. */
export interface ResolvedGraphEncoding {
  size: GraphSizeChannel;
  fill: GraphFillChannel;
  ring: GraphRingChannel;
  hue: GraphHueChannel;
  lines: GraphLegendLine[];
}

function captureUnknownEncoding(channel: GraphEncodingChannelKey, value: string): void {
  try {
    captureError({
      source: "topical-map-rpc",
      relation: "seo.topical_map.graph_encoding",
      operation: "unknown",
      message: `Unknown graph_encoding.${channel} value "${value}".`,
      userMessage: `The map drawing's "${channel}" setting names something this app does not know, so nothing is drawn for it.`,
      hint: "Fix the seo.topical_map.graph_encoding knob, or teach features/marketing/seo/topical-map/views/graph/encoding.ts the new value.",
      callSite: "features/marketing/seo/topical-map/views/graph/encoding.ts",
    });
  } catch {
    // Capture is best-effort — it must never take the drawing down.
  }
}

const SIZE_TEXT: Record<GraphSizeChannel, string> = {
  pages: "Size — how many live pages the topic has.",
  planned: "Size — how many planned pages the topic has.",
  keywords: "Size — how many keywords the topic holds.",
  none: "Size — every topic is drawn the same size.",
};
const FILL_TEXT: Record<GraphFillChannel, string> = {
  status: "Fill — the topic's status: proposed topics are tinted, live ones are not.",
  none: "Fill — every topic is drawn on the same background.",
};
const RING_TEXT: Record<GraphRingChannel, string> = {
  tier: "Ring — how deep the topic sits in the tree.",
  none: "Ring — no outline is drawn.",
};
const HUE_TEXT: Record<GraphHueChannel, string> = {
  grouped_facet: "Hue — which value of the grouped facet the topic belongs to.",
  none: "Hue — no colour is applied.",
};

function resolveChannel<T extends string>(
  channel: GraphEncodingChannelKey,
  raw: string | undefined,
  allowed: readonly string[],
  text: Record<string, string>,
): { value: T; line: GraphLegendLine } {
  const value = raw ?? "none";
  if (allowed.includes(value)) {
    return {
      value: value as T,
      line: { channel, value, text: text[value] ?? value, known: true },
    };
  }
  captureUnknownEncoding(channel, value);
  return {
    value: "none" as T,
    line: {
      channel,
      value,
      // The person's own words for it, in the legend, where they are looking.
      text: `‘${value}’ is not a legend value this drawing knows, so nothing is drawn for ${channel}.`,
      known: false,
    },
  };
}

/**
 * Resolve `graph_encoding` into the four channels plus the legend the person
 * reads. `mode` only changes the FILL line: in convergence, fill is taken over
 * by the page-intent colours and the legend must say so instead of describing a
 * status tint that is no longer on the screen.
 */
export function resolveEncoding(
  encoding: MapGraphEncoding | null | undefined,
  mode: GraphEncodingMode,
): ResolvedGraphEncoding {
  const size = resolveChannel<GraphSizeChannel>("size", encoding?.size, SIZE_VALUES, SIZE_TEXT);
  const fill = resolveChannel<GraphFillChannel>("fill", encoding?.fill, FILL_VALUES, FILL_TEXT);
  const ring = resolveChannel<GraphRingChannel>("ring", encoding?.ring, RING_VALUES, RING_TEXT);
  const hue = resolveChannel<GraphHueChannel>("hue", encoding?.hue, HUE_VALUES, HUE_TEXT);

  const fillLine: GraphLegendLine =
    mode === "convergence"
      ? {
          channel: "fill",
          value: fill.line.value,
          text: "Fill — where each topic's pages are going, from the page intents below.",
          known: fill.line.known,
        }
      : fill.line;

  return {
    size: size.value,
    fill: mode === "convergence" ? "none" : fill.value,
    ring: ring.value,
    hue: hue.value,
    lines: [size.line, fillLine, ring.line, hue.line],
  };
}

/** The number the `size` channel reads off one topic. */
export function sizeValueOf(
  channel: GraphSizeChannel,
  counts: { page_count: number; planned_count: number; keyword_count: number },
): number {
  switch (channel) {
    case "pages":
      return counts.page_count;
    case "planned":
      return counts.planned_count;
    case "keywords":
      return counts.keyword_count;
    case "none":
      return 0;
  }
}

// ── Convergence ────────────────────────────────────────────────────────────

/**
 * The six keys of the `intent_colors` knob. The first four come from
 * `pageIntentTone`; `planned` and `missing` are derived from the topic's own
 * counts, because a topic with no pages has no intent row to read.
 */
export type ConvergenceTone =
  | "in_place"
  | "leaving"
  | "arriving"
  | "delete"
  | "missing"
  | "planned";

/**
 * One listed page, as this drawing needs it. Built from the bytes
 * `seo.list_page_intents` returned rather than from the store, the way
 * `pageTopicViewOf` does — a page is described by the row it is drawn from.
 */
export interface ConvergenceRow {
  pageId: string;
  /** The LIVE topics this page covers. `[]` is a real state. */
  currentTopicSlugs: string[];
  /** The page's intent, or null when it has none. */
  intent: {
    disposition: PageIntentDisposition;
    state: PageIntentState;
    /** Null when the intent's topic is no longer live (round 22). */
    topicSlug: string | null;
  } | null;
}

/**
 * Tie-break order when two tones have the same number of pages.
 *
 * Most-actionable first: a topic losing pages to a deletion is worse news than
 * one losing them to a move, which is worse than one gaining them, which is
 * worse than one that is simply settled. A topic is drawn by the worst true
 * thing about it, never by the friendliest.
 */
const TIE_BREAK: readonly ConvergenceTone[] = ["delete", "leaving", "arriving", "in_place"];

export type ConvergenceTally = Map<string, Record<ConvergenceTone, number>>;

function emptyTones(): Record<ConvergenceTone, number> {
  return { in_place: 0, leaving: 0, arriving: 0, delete: 0, missing: 0, planned: 0 };
}

/**
 * Every topic's tone counts, in ONE pass over the pages.
 *
 * Per topic × per page would be 200 × 5,552 string comparisons on All Green,
 * every render, for a colour. A page names at most a handful of topics, so the
 * work is proportional to the pages, and the drawing looks them up by slug.
 */
export function tallyTones(rows: readonly ConvergenceRow[]): ConvergenceTally {
  const tally: ConvergenceTally = new Map();
  const bump = (slug: string, tone: ConvergenceTone) => {
    let counts = tally.get(slug);
    if (!counts) {
      counts = emptyTones();
      tally.set(slug, counts);
    }
    counts[tone] += 1;
  };

  for (const row of rows) {
    const named = new Set(row.currentTopicSlugs);
    if (row.intent?.topicSlug) named.add(row.intent.topicSlug);
    for (const slug of named) {
      if (!row.intent) {
        // Coverage with no intent: the page is where it is and nothing is
        // moving it. `pageIntentTone` cannot answer this — it needs a
        // disposition — so the honest reading is stated here.
        bump(slug, "in_place");
        continue;
      }
      const tone = pageIntentTone(
        {
          pageId: row.pageId,
          disposition: row.intent.disposition,
          state: row.intent.state,
          intendedTopicSlug: row.intent.topicSlug,
          currentTopicSlugs: row.currentTopicSlugs,
        },
        slug,
      );
      if (tone) bump(slug, tone);
    }
  }
  return tally;
}

/** Counts of each tone among the pages that name one topic. */
export function tallyTopicTones(
  rows: readonly ConvergenceRow[],
  topicSlug: string,
): Record<ConvergenceTone, number> {
  return tallyTones(rows).get(topicSlug) ?? emptyTones();
}

export interface ConvergenceTopicCounts {
  slug: string;
  page_count: number;
  planned_count: number;
}

/**
 * The tone one topic is drawn in, or NULL when this drawing cannot yet say.
 *
 * ABSENT IS NOT ZERO, and this is where it bites hardest: a topic whose
 * `page_count` is 8 while no page has been listed yet is NOT "missing" — it is
 * unknown, and the answer is null so the node keeps its structural fill and the
 * legend's progress line explains why. Only a topic the server itself reports
 * as having no pages can be called `planned` or `missing`.
 */
export function dominantTone(
  topic: ConvergenceTopicCounts,
  rows: readonly ConvergenceRow[],
): ConvergenceTone | null {
  return dominantToneOf(topic, tallyTones(rows));
}

/** {@link dominantTone} against a tally already computed for the whole drawing. */
export function dominantToneOf(
  topic: ConvergenceTopicCounts,
  tally: ConvergenceTally,
): ConvergenceTone | null {
  if (topic.page_count === 0) {
    return topic.planned_count > 0 ? "planned" : "missing";
  }
  const counts = tally.get(topic.slug) ?? emptyTones();
  let winner: ConvergenceTone | null = null;
  let best = 0;
  for (const tone of TIE_BREAK) {
    const count = counts[tone];
    if (count === 0) continue;
    if (count > best) {
      best = count;
      winner = tone;
    }
    // Equal counts keep the earlier (more actionable) tone — TIE_BREAK order.
  }
  return winner;
}
