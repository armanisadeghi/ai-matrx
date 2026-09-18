/**
 * map_topic_proposal_v1 / map_topic_node_v1 → MapTopicProposalBlock bridge
 * (+ compiled definitions).
 *
 * What the `seo.map_author` mandate returns (and what the map author's
 * run result carries as `proposal`): the tree of topics a brand should cover,
 * in EXACTLY the shape `seo.upsert_map_topics` accepts. Canonical `__kind`
 * JSON shape (typed in `features/marketing/seo/topical-map/map-author.ts`):
 *
 *   { __kind:"map_topic_proposal_v1", summary, source_kind,
 *     topics: [ { __kind:"map_topic_node_v1", slug, name, description?,
 *                 status: "proposed"|"active", parent_slug? } ],
 *     coverage_notes }
 *
 * 🚨 FLAT, NOT NESTED. The node carries `parent_slug` rather than `children`
 * because a self-referencing JSON schema is refused outright by Anthropic's
 * structured-output gate and by Gemini's restricted subset — a recursive kind
 * is a kind no model can be bound to. The parent must appear before its
 * children; the renderer rebuilds the order defensively either way.
 *
 * THE DATABASE ROWS ARE THE SCHEMA OF RECORD: `content_ir.kind_definition`
 * holds `map_topic_proposal_v1` (v2) and `map_topic_node_v1` (v3), verified
 * live 2026-09-17. This file's schemas are the compiled BOOTSTRAP floor built
 * from the typed `MapTopicProposal` shape, and the warm registry's rows
 * override them the moment they load (kind-registry.ts) — so a field the
 * rows carry and this floor lacks still validates and renders.
 *
 * Complete-only bridge: the component renders a real `TopicTree` with live
 * accept / reject controls, so a partial payload never reaches it; the
 * dispatch entry's loading state stands while the tree streams. The bridge
 * hands the component the value VERBATIM — markers included, at every depth
 * (KINDS_EVERYWHERE §4.2) — plus the `map_id` a host may have attached.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";

import { isRecord, makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

export const MAP_TOPIC_PROPOSAL_KIND = "map_topic_proposal_v1";
export const MAP_TOPIC_NODE_KIND = "map_topic_node_v1";
/** The render key `kind-route` sets `block.type` to (SHAPE_BLOCK_DISPATCH). */
export const MAP_TOPIC_PROPOSAL_BLOCK_TYPE = "map_topic_proposal";

// ---------------------------------------------------------------------------
// Schemas — the compiled floor; the live rows win once warm.
// ---------------------------------------------------------------------------

export const mapTopicNodeKindSchema: KindSchema = {
  kind: MAP_TOPIC_NODE_KIND,
  fields: {
    slug: {
      type: "string",
      required: true,
      description: "Lowercase kebab-case key, unique in the map. Topics are addressed by slug.",
    },
    name: { type: "string", required: true },
    description: {
      type: "string",
      nullable: true,
      description: "One or two sentences on what the topic covers.",
    },
    status: {
      type: "enum",
      values: ["proposed", "active"],
      required: true,
      description: "proposed = waiting for a person; active = live in the map.",
    },
    parent_slug: {
      type: "string",
      nullable: true,
      description: "The parent's slug, which must appear earlier in the list. Null at the root.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const mapTopicProposalKindSchema: KindSchema = {
  kind: MAP_TOPIC_PROPOSAL_KIND,
  fields: {
    summary: {
      type: "string",
      required: true,
      description: "One paragraph a person reads: what this tree covers and why.",
    },
    source_kind: {
      type: "string",
      required: true,
      description:
        "Which source the tree came from: data, documents, prompt, web_search, existing_research or new_research.",
    },
    topics: {
      type: "array",
      itemKinds: [MAP_TOPIC_NODE_KIND],
      required: true,
      description: "The tree, flat, parents before children — exactly what upsert_map_topics takes.",
    },
    coverage_notes: {
      type: "string",
      required: true,
      description:
        "What the source could NOT settle — the offerings, audiences or geographies a person still has to supply. Empty when nothing is missing.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

// ---------------------------------------------------------------------------
// serverData bridge — the value verbatim, plus the map a host attached.
// ---------------------------------------------------------------------------

/** What `MapTopicProposalBlock` receives. `proposal` is the payload, untouched. */
export interface MapTopicProposalServerData extends Record<string, unknown> {
  proposal: Record<string, unknown>;
  /** A `map_id` the payload carried (a tool result, a run result); else null. */
  map_id: string | null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export const mapTopicProposalServerDataFromEnvelope = makeCompleteEnvelopeBridge<
  MapTopicProposalServerData
>(MAP_TOPIC_PROPOSAL_KIND, (value) => {
  // The one thing the component cannot do without: a topics list. Its
  // EMPTINESS is a real answer (the author invents nothing the source does
  // not support), so only its absence declines.
  if (!Array.isArray(value.topics)) return undefined;
  return {
    proposal: value,
    map_id: nonEmptyString(value.map_id) ?? nonEmptyString(value.mapId),
  };
});

// ---------------------------------------------------------------------------
// toMarkdown facet — an indented outline, one line per topic.
// ---------------------------------------------------------------------------

const MD_PROPOSAL_KNOWN_KEYS = ["summary", "source_kind", "topics", "coverage_notes", KIND_KEY];
const MD_NODE_KNOWN_KEYS = ["slug", "name", "description", "status", "parent_slug", KIND_KEY];

function nodeLines(topics: Record<string, unknown>[]): string[] {
  const known = new Set(topics.map((t) => t.slug).filter((s): s is string => typeof s === "string"));
  const children = new Map<string | null, Record<string, unknown>[]>();
  for (const topic of topics) {
    const parent =
      typeof topic.parent_slug === "string" && known.has(topic.parent_slug)
        ? topic.parent_slug
        : null;
    const list = children.get(parent) ?? [];
    list.push(topic);
    children.set(parent, list);
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const topic of children.get(parent) ?? []) {
      const slug = typeof topic.slug === "string" ? topic.slug : "";
      if (slug && seen.has(slug)) continue;
      if (slug) seen.add(slug);
      const name = typeof topic.name === "string" ? topic.name : slug;
      const status = topic.status === "proposed" ? " (proposed)" : "";
      const description =
        typeof topic.description === "string" && topic.description !== ""
          ? ` — ${topic.description}`
          : "";
      const extras = Object.entries(collectExtras(topic, MD_NODE_KNOWN_KEYS))
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(", ");
      lines.push(
        `${"  ".repeat(depth)}- **${name}** \`${slug}\`${status}${description}${extras ? ` (${extras})` : ""}`,
      );
      if (slug) walk(slug, depth + 1);
    }
  };
  walk(null, 0);
  return lines;
}

export function mapTopicProposalMarkdownFromValue(value: Record<string, unknown>): string {
  const topics = Array.isArray(value.topics) ? value.topics.filter(isRecord) : [];
  const source =
    typeof value.source_kind === "string" && value.source_kind !== ""
      ? `Source: ${value.source_kind.replace(/_/g, " ")}`
      : null;
  return joinBlocks([
    "# Proposed topical map",
    typeof value.summary === "string" ? value.summary : null,
    source,
    topics.length > 0 ? nodeLines(topics).join("\n") : "_No topics were proposed._",
    typeof value.coverage_notes === "string" && value.coverage_notes !== ""
      ? `## Still to settle\n\n${value.coverage_notes}`
      : null,
    additionalDetailsSection(collectExtras(value, MD_PROPOSAL_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const MAP_TOPIC_PROPOSAL_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: MAP_TOPIC_PROPOSAL_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: MAP_TOPIC_PROPOSAL_BLOCK_TYPE,
    toLegacyServerData: mapTopicProposalServerDataFromEnvelope,
    toMarkdown: mapTopicProposalMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: mapTopicProposalKindSchema,
  },
  {
    kind: MAP_TOPIC_NODE_KIND,
    schemaSource: "system",
    tier: "eager",
    schema: mapTopicNodeKindSchema,
  },
];
