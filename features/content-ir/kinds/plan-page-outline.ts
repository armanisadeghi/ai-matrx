/**
 * `plan_page_outline` (+ children `plan_deferred_topic`, `plan_planned_link`) —
 * one page's TERRITORY inside its family, as a Shape.
 *
 * Produced by the per-page pipeline's P3 family pass
 * (`aidream/services/content_plan/page_pipeline.py` → `FamilyPlacement`),
 * persisted as a `plan.node_artifact` on step `p3_family`.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"plan_page_outline", "differentiator":"…",
 *     "covers":[…], "must_not_cover":[…],
 *     "defer_to":[ { "topic":"…", "to_route":"/x" } ],
 *     "internal_links":[ { "to_route":"/x", "anchor_text":"…", "reason":"…" } ],
 *     "uncovered_gaps":[…] }
 *
 * FIELD PARITY is with `FamilyPlacement` / `DeferredTopic` / `PlannedLink`
 * (all `extra="forbid"`). The kind is named `plan_page_outline` — the step is
 * `p3_family` and the model is `FamilyPlacement`; the wire discriminator the
 * server already writes is the authority, and it is this.
 *
 * WHAT THIS SHAPE IS FOR, so a component never buries it: the whole point of
 * planning a family of pages is that each page owns something the others do
 * not. `must_not_cover` and `defer_to` are the anti-cannibalization contract,
 * and `uncovered_gaps` is a REAL PLANNING HOLE the family surfaced rather than
 * silently absorbing into whichever page ran last — it is a finding the plan
 * owner must see, not a footnote.
 *
 * A `defer_to` entry with an empty `to_route` means NO sibling owns that topic
 * yet — that is itself a gap, and the component says so rather than rendering
 * a blank route.
 *
 * The bridge is STREAMING; scalar arrays commit whole when they close, while
 * `defer_to` / `internal_links` are child-kind arrays and stream row by row.
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import { KIND_KEY } from "@ai-matrx/content-ir";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const planDeferredTopicKindSchema: KindSchema = {
  kind: "plan_deferred_topic",
  fields: {
    topic: {
      type: "string",
      required: true,
      description: "The topic this page deliberately does not cover.",
    },
    to_route: {
      type: "string",
      description:
        "The sibling page that owns it. Empty when no page owns it yet — a real gap.",
    },
  },
};

export const planPlannedLinkKindSchema: KindSchema = {
  kind: "plan_planned_link",
  fields: {
    to_route: {
      type: "string",
      required: true,
      description: "The route this page should link to.",
    },
    anchor_text: {
      type: "string",
      required: true,
      description: "The words the link should be wrapped around.",
    },
    reason: {
      type: "string",
      description: "Why this link belongs on this page.",
    },
  },
};

export const planPageOutlineKindSchema: KindSchema = {
  kind: "plan_page_outline",
  fields: {
    differentiator: {
      type: "string",
      required: true,
      description:
        "One sentence: why this page exists and its siblings do not cover it.",
    },
    covers: {
      type: "string[]",
      description: "What this page owns — the subjects it is responsible for.",
    },
    must_not_cover: {
      type: "string[]",
      description:
        "Subjects belonging to a sibling page — covering them here cannibalizes it.",
    },
    defer_to: {
      type: "array",
      itemKinds: ["plan_deferred_topic"],
      description: "Topics handed to a named sibling page.",
    },
    internal_links: {
      type: "array",
      itemKinds: ["plan_planned_link"],
      description: "Links this page should carry, with their anchor text.",
    },
    uncovered_gaps: {
      type: "string[]",
      description:
        "Topics the family plans that NO page owns — real planning gaps, surfaced rather than absorbed.",
    },
  },
};

export const PLAN_PAGE_OUTLINE_KIND_SCHEMAS: KindSchema[] = [
  planPageOutlineKindSchema,
  planDeferredTopicKindSchema,
  planPlannedLinkKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING.
// ---------------------------------------------------------------------------

export interface PlanDeferredTopicData {
  topic: string;
  toRoute: string;
}

export interface PlanPlannedLinkData {
  toRoute: string;
  anchorText: string;
  reason: string;
}

export interface PlanPageOutlineData {
  differentiator: string | null;
  covers: string[];
  mustNotCover: string[];
  deferTo: PlanDeferredTopicData[];
  internalLinks: PlanPlannedLinkData[];
  uncoveredGaps: string[];
  isComplete: boolean;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item !== "",
  );
}

export function readDeferredTopics(value: unknown): PlanDeferredTopicData[] {
  if (!Array.isArray(value)) return [];
  const out: PlanDeferredTopicData[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const topic = stringOr(entry.topic, "");
    if (!topic) continue;
    out.push({ topic, toRoute: stringOr(entry.to_route, "") });
  }
  return out;
}

export function readPlannedLinks(value: unknown): PlanPlannedLinkData[] {
  if (!Array.isArray(value)) return [];
  const out: PlanPlannedLinkData[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const toRoute = stringOr(entry.to_route, "");
    if (!toRoute) continue;
    out.push({
      toRoute,
      anchorText: stringOr(entry.anchor_text, ""),
      reason: stringOr(entry.reason, ""),
    });
  }
  return out;
}

export function planPageOutlineServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (PlanPageOutlineData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "plan_page_outline") return undefined;

  const value = envelope.root.value;
  const differentiator = stringOr(value.differentiator, "");

  return {
    differentiator: differentiator === "" ? null : differentiator,
    covers: strings(value.covers),
    mustNotCover: strings(value.must_not_cover),
    deferTo: readDeferredTopics(value.defer_to),
    internalLinks: readPlannedLinks(value.internal_links),
    uncoveredGaps: strings(value.uncovered_gaps),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "differentiator",
  "covers",
  "must_not_cover",
  "defer_to",
  "internal_links",
  "uncovered_gaps",
  KIND_KEY,
];

function bulletList(lines: string[]): string | null {
  if (lines.length === 0) return null;
  return lines.map((line) => `- ${line}`).join("\n");
}

export function planPageOutlineMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const covers = bulletList(strings(value.covers));
  const mustNot = bulletList(strings(value.must_not_cover));
  const gaps = bulletList(strings(value.uncovered_gaps));
  const deferTo = readDeferredTopics(value.defer_to).map((entry) =>
    entry.toRoute
      ? `- ${entry.topic} → \`${entry.toRoute}\``
      : `- ${entry.topic} → _no page owns this yet_`,
  );
  const links = readPlannedLinks(value.internal_links).map((link) => {
    const reason = link.reason ? ` — ${link.reason}` : "";
    return `- \`${link.toRoute}\`${link.anchorText ? ` ("${link.anchorText}")` : ""}${reason}`;
  });
  const differentiator = stringOr(value.differentiator, "");

  return joinBlocks([
    "# Where this page sits",
    differentiator ? `**What only this page does:** ${differentiator}` : null,
    covers ? joinBlocks(["## Covers", covers]) : null,
    mustNot ? joinBlocks(["## Must not cover", mustNot]) : null,
    deferTo.length > 0
      ? joinBlocks(["## Handed to other pages", deferTo.join("\n")])
      : null,
    links.length > 0
      ? joinBlocks(["## Links to add", links.join("\n")])
      : null,
    gaps ? joinBlocks(["## Gaps no page covers", gaps]) : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const PLAN_PAGE_OUTLINE_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "plan_page_outline",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "plan_page_outline",
    toLegacyServerData: planPageOutlineServerDataFromEnvelope,
    toMarkdown: planPageOutlineMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: planPageOutlineKindSchema,
  },
  {
    kind: "plan_deferred_topic",
    schemaSource: "system",
    tier: "eager",
    schema: planDeferredTopicKindSchema,
  },
  {
    kind: "plan_planned_link",
    schemaSource: "system",
    tier: "eager",
    schema: planPlannedLinkKindSchema,
  },
];
