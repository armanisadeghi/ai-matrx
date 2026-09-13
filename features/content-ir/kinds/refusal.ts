/**
 * The `refusal` kind — an honest "not yet", as a first-class RESULT.
 *
 * Server half: `aidream/kinds/masterwork.py::Refusal`, produced by
 * `aidream/services/masterworks/refusal.py` when a desk's declared
 * `refuse_until` condition is not satisfied.
 *
 * ## Why this is a registered kind and not an error state
 *
 * A frontier model answers the question it was asked, immediately and
 * agreeably. The expertise this platform is capturing lives in the opposite
 * move: the practitioner who will NOT produce until the frame holds, and who
 * says exactly what is missing and how to get it. That move had no shape here.
 * The three shapes a surface reaches for instead are all wrong:
 *
 * - an ERROR says the system broke — a lie, and it routes a developer to a
 *   thing that is working exactly as designed;
 * - a TOAST is a notification that disappears, for a result the person is
 *   supposed to act on;
 * - an EMPTY SCREEN is the silent failure THE FOURTH LAW forbids outright.
 *
 * So a refusal renders through the ONE pipeline like any other output, with
 * exactly one component, and reads as a finished answer: this is what I will
 * not do yet, this is precisely what I need, this is how you get it, and this
 * is what I can already tell you.
 *
 * Nothing here is Masterwork-specific — an SEO desk, a clinical desk and a
 * negotiation desk refuse in the same shape, which is why it lives in its own
 * file rather than beside the unfolding-case kinds.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";

import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

/** The registered slug — named once, never spelled by hand elsewhere. */
export const REFUSAL_KIND = "refusal";

export const refusalKindSchema: KindSchema = {
  kind: REFUSAL_KIND,
  fields: {
    headline: {
      type: "string",
      required: true,
      description:
        "One plain sentence: what the desk will not do yet, and the one reason.",
    },
    missing: {
      type: "json[]",
      description:
        "Every fact the frame is missing — each {fact, why_it_matters, how_to_get_it}. The server's `MissingFact`.",
    },
    what_i_can_say_now: {
      type: "string",
      description:
        "What holds regardless of the missing facts. Legitimately empty when nothing does.",
    },
    protocol_frame: {
      type: "string",
      description:
        "Which stage of the expert's entry protocol is not satisfied, in the source's own words.",
    },
    provenance: {
      type: "string[]",
      description: "The rule ids / source refs that REQUIRE this refusal.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

// ---------------------------------------------------------------------------
// serverData bridge
// ---------------------------------------------------------------------------

/** One fact the desk does not have, and what to do about it. */
export interface MissingFact {
  fact: string;
  /** What this fact rules in or out. Null when the desk did not say. */
  whyItMatters: string | null;
  /** The concrete next move that would supply it. */
  howToGetIt: string | null;
}

export interface RefusalData {
  headline: string;
  missing: MissingFact[];
  whatICanSayNow: string | null;
  protocolFrame: string | null;
  provenance: string[];
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item))
    .filter((item): item is string => item !== null);
}

function readMissing(value: unknown): MissingFact[] {
  if (!Array.isArray(value)) return [];
  const out: MissingFact[] = [];
  for (const item of value) {
    if (!isRecordValue(item)) continue;
    const fact = text(item.fact);
    // A missing fact with no name is not a missing fact — dropping it is
    // honest; rendering a blank row would read as a bug.
    if (!fact) continue;
    out.push({
      fact,
      whyItMatters: text(item.why_it_matters),
      howToGetIt: text(item.how_to_get_it),
    });
  }
  return out;
}

/**
 * The canonical reading of a `refusal` value — one implementation.
 *
 * A refusal with no headline is not a refusal: returning undefined sends the
 * payload to the floor rather than drawing an empty card that claims the desk
 * declined without ever saying what it declined to do.
 */
export function readRefusal(
  value: Record<string, unknown>,
): RefusalData | undefined {
  const headline = text(value.headline);
  if (!headline) return undefined;
  return {
    headline,
    missing: readMissing(value.missing),
    whatICanSayNow: text(value.what_i_can_say_now),
    protocolFrame: text(value.protocol_frame),
    provenance: strings(value.provenance),
  };
}

export const refusalServerData = makeCompleteEnvelopeBridge<
  RefusalData & Record<string, unknown>
>(
  REFUSAL_KIND,
  (value) =>
    readRefusal(value) as (RefusalData & Record<string, unknown>) | undefined,
);

// ---------------------------------------------------------------------------
// toMarkdown — the same refusal, in prose
// ---------------------------------------------------------------------------

const REFUSAL_KNOWN_KEYS = [
  "headline",
  "missing",
  "what_i_can_say_now",
  "protocol_frame",
  "provenance",
  KIND_KEY,
];

export function refusalMarkdown(value: Record<string, unknown>): string {
  const data = readRefusal(value);
  if (!data) return "";
  return joinBlocks([
    "## Not yet",
    data.headline,
    data.protocolFrame ? `*Frame not settled: ${data.protocolFrame}*` : null,
    "### What I need first",
    data.missing.length > 0
      ? data.missing
          .map((item) =>
            [
              `- **${item.fact}**`,
              item.whyItMatters ? `\n  - Why it matters: ${item.whyItMatters}` : "",
              item.howToGetIt ? `\n  - How to get it: ${item.howToGetIt}` : "",
            ].join(""),
          )
          .join("\n")
      : "The desk did not name what is missing — that is a defect in the refusal, not a complete one.",
    data.whatICanSayNow ? "### What I can say already" : null,
    data.whatICanSayNow,
    data.provenance.length > 0
      ? `*Required by: ${data.provenance.join(", ")}*`
      : null,
    additionalDetailsSection(collectExtras(value, REFUSAL_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definition
// ---------------------------------------------------------------------------

export const REFUSAL_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: REFUSAL_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: REFUSAL_KIND,
    toLegacyServerData: refusalServerData,
    toMarkdown: refusalMarkdown,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: refusalKindSchema,
  },
];
