// features/marketing/seo/topical-map/map-author.ts
//
// HOW A TOPICAL MAP STARTS — the client half of the ONE server entry,
// `POST /seo/brands/{brand_id}/map/author` (aidream
// `aidream/services/seo/map_author.py`).
//
// Six sources, one entry: `data | documents | prompt | web_search |
// existing_research | new_research`. The server resolves the chosen source to
// text, runs the `seo.map_author` mandate, dry-runs the tree it gets back and
// writes it — `proposed` or `active` according to the resolved
// `map_agent_change_mode` knob. Authoring a map is MINUTES of paid work, so it
// is a durable SEO command: claimed on the server before the first paid call,
// streamed, and rejoinable after a reload (`useAuthorTopicalMap`).
//
// THIS FILE IS THE WIRE, NOT THE SCREEN. It owns the request body, the stage
// vocabulary and the result/proposal types; U4 owns every word a person reads,
// which is why `MAP_AUTHOR_SOURCE_KINDS` carries NO labels. A label here would
// be a second place to change the screen's copy.
//
// 🚨 THE BODY IS `extra=forbid`. A field belonging to another source kind is
// REFUSED (422), not ignored — the server's own rule, so that a body cannot
// silently drop the thing the person chose. `authorTopicalMapBody` therefore
// sends exactly the fields the chosen source owns and never a stale leftover
// from a tile the person switched away from.

import type { components } from "@/types/python-generated/api-types";
import { isJsonObject } from "@/types/json";

import type { MapTopicTreeNode } from "./types";

/** The generated contract for the one body this endpoint takes. */
export type AuthorMapRequestBody = components["schemas"]["AuthorMapRequest"];

export type MapAuthorSourceKind = AuthorMapRequestBody["source_kind"];

/**
 * The six sources, as a typed const a picker can iterate.
 *
 * NO LABELS, deliberately: the words a person reads belong to the screen (U4),
 * and a label parked here would be a second copy of them that drifts. The
 * ORDER is the order the requirements list them in (§2.4), not an opinion
 * about which one is best.
 */
export const MAP_AUTHOR_SOURCE_KINDS = [
  "data",
  "documents",
  "prompt",
  "web_search",
  "existing_research",
  "new_research",
] as const satisfies readonly MapAuthorSourceKind[];

/**
 * `apply | propose | ask`. `ask` is a SCREEN mode — it means the person is
 * asked BEFORE the call — so a request that reaches the server still set to
 * `ask` can only mean nobody asked, and the server resolves it to `propose`
 * and says so in `notes`. Send `ask` only if that is genuinely what you want
 * recorded; omit the field to let the `map_agent_change_mode` knob decide.
 */
export type MapAuthorChangeMode = NonNullable<AuthorMapRequestBody["change_mode"]>;

/**
 * What the caller chose, before it becomes a body. Every source's own field is
 * optional here and validated by {@link authorTopicalMapBody}, so a screen
 * cannot silently send a `prompt` under `source_kind: "data"`.
 */
export interface AuthorTopicalMapInput {
  /** The brand the map belongs to. A map is owned by a brand, never a site. */
  brandId: string;
  sourceKind: MapAuthorSourceKind;
  /** Omitted: the server creates a draft map for this brand first. */
  mapId?: string | null;
  mapName?: string | null;
  /** `prompt` — the person's own description of the business. */
  prompt?: string | null;
  /** `documents` — the extracted text the person has already seen and edited. */
  documentText?: string | null;
  documentFileIds?: string[];
  /** `web_search` — the resolved-and-edited text, plus what produced it. */
  webSearchText?: string | null;
  webSearchQuery?: string | null;
  /** `existing_research` — a finished `research.rs_topic`. */
  researchTopicId?: string | null;
  /** `data` — the one site whose crawl / keywords / plan to read. */
  siteId?: string | null;
  /** Adding ONE section instead of starting the map. */
  sectionParentSlug?: string | null;
  /** The person's free-text emphasis. Human-typed, so it rides `user_input`. */
  emphasis?: string | null;
  /** Omitted: the `map_agent_change_mode` knob decides. */
  changeMode?: MapAuthorChangeMode | null;
}

/** What each source kind REQUIRES, named the way the server names it. */
const REQUIRED_BY_SOURCE: Record<MapAuthorSourceKind, string | null> = {
  data: null, // the brand's own sites; `siteId` narrows but is optional
  documents: "documentText",
  prompt: "prompt",
  web_search: "webSearchText",
  existing_research: "researchTopicId",
  new_research: null, // commissions the research; nothing else is needed
};

/**
 * The typed client: one chosen source in, the exact `extra=forbid` body out.
 *
 * It refuses locally what the server would refuse remotely — a missing
 * required field, and any field belonging to a source kind other than the
 * chosen one — so a screen learns immediately instead of through a 422 with a
 * pydantic path in it. Throwing here is deliberate: a body that silently drops
 * the thing the person chose is the screen that lies.
 */
export function authorTopicalMapBody(input: AuthorTopicalMapInput): AuthorMapRequestBody {
  const required = REQUIRED_BY_SOURCE[input.sourceKind];
  const body: AuthorMapRequestBody = { source_kind: input.sourceKind };

  // Fields that belong to no single source.
  if (input.mapId) body.map_id = input.mapId;
  if (input.mapName) body.map_name = input.mapName;
  if (input.sectionParentSlug) body.section_parent_slug = input.sectionParentSlug;
  if (input.emphasis && input.emphasis.trim()) body.emphasis = input.emphasis.trim();
  if (input.changeMode) body.change_mode = input.changeMode;

  switch (input.sourceKind) {
    case "prompt":
      if (input.prompt) body.prompt = input.prompt;
      break;
    case "documents":
      if (input.documentText) body.document_text = input.documentText;
      if (input.documentFileIds?.length) body.document_file_ids = input.documentFileIds;
      break;
    case "web_search":
      if (input.webSearchText) body.web_search_text = input.webSearchText;
      if (input.webSearchQuery) body.web_search_query = input.webSearchQuery;
      break;
    case "existing_research":
      if (input.researchTopicId) body.research_topic_id = input.researchTopicId;
      break;
    case "data":
      if (input.siteId) body.site_id = input.siteId;
      break;
    case "new_research":
      break;
  }

  if (required) {
    const present =
      (required === "documentText" && Boolean(body.document_text)) ||
      (required === "prompt" && Boolean(body.prompt)) ||
      (required === "webSearchText" && Boolean(body.web_search_text)) ||
      (required === "researchTopicId" && Boolean(body.research_topic_id));
    if (!present) {
      throw new Error(
        `A "${input.sourceKind}" map run needs ${required}. Nothing was sent, and the ` +
          "server would have refused the whole body rather than build a map from a " +
          "source the person did not supply.",
      );
    }
  }
  return body;
}

// ── The typed tree the author proposes ─────────────────────────────────────

/**
 * One node of `map_topic_proposal_v1`'s tree — the registered kind
 * `map_topic_node_v1`, in the exact shape `seo.upsert_map_topics` accepts.
 *
 * 🚨 FLAT, AND THAT IS NOT A SIMPLIFICATION. The kind carries `parent_slug`
 * rather than nested `children` because a self-referencing JSON schema is
 * REFUSED outright by Anthropic's structured-output gate ("Circular reference
 * detected in schema definitions") and by Gemini's restricted subset — a
 * recursive kind is a kind no model can be bound to. The parent must appear in
 * the same list, before its children. `MapTopicTreeNode` (the upsert's own
 * client type) accepts either form, which is why one converts to the other
 * with no reshaping.
 *
 * `__kind` is part of the data and travels with it (KINDS_EVERYWHERE §4.2) —
 * never stripped on its way to a renderer or a write.
 */
export interface MapTopicProposalNode {
  __kind: "map_topic_node_v1";
  slug: string;
  name: string;
  description?: string | null;
  status: "proposed" | "active";
  parent_slug?: string | null;
}

/** `map_topic_proposal_v1` — what the `seo.map_author` mandate returns. */
export interface MapTopicProposal {
  __kind: "map_topic_proposal_v1";
  /** One paragraph a person reads: what this tree covers and why. */
  summary: string;
  /** Which of the six sources this tree came from. */
  source_kind: string;
  /** The tree, EXACTLY as `upsert_map_topics` takes it. */
  topics: MapTopicProposalNode[];
  /**
   * What the source could NOT settle — the offerings, audiences or geographies
   * a person still has to supply. Empty when the source covered everything.
   */
  coverage_notes: string;
}

/**
 * The terminal `seo.map_author_complete` result.
 *
 * 🚨 `applied: false` WITH AN EMPTY TREE IS AN ANSWER, NOT A FAILURE. The
 * author's first rule is never to invent an offering the source does not
 * support, so a source with nothing in it MUST come back with zero topics —
 * and the server returns that as a normal result carrying the author's own
 * `coverage_notes`, rather than raising. A screen that renders it as an error
 * punishes the one behaviour we want.
 *
 * 🚨 `new_research` DOES NOT AUTHOR A MAP. It commissions a
 * `content_topic_map` research run and answers with `research_started: true`
 * and its `research_topic_id`, because the research IS the source and it has
 * to finish first. Say so; a tile that silently did nothing is the lying
 * screen.
 */
export interface AuthorTopicalMapResult {
  result_kind: "seo.map_author";
  map_id: string;
  brand_id: string;
  source_kind: string;
  /** A research document id, file ids, a URL, site ids — so a claim is traceable. */
  source_reference: string | null;
  /** `apply` or `propose`, already resolved from the knob. Never `ask`. */
  change_mode: string;
  /** True when this call WROTE the tree; false when it only proposed it back. */
  applied: boolean;
  created: string[];
  updated: string[];
  unchanged: string[];
  /** What the rehearsal said would happen — populated whether applied or not. */
  dry_run: Record<string, unknown>;
  proposal: MapTopicProposal | null;
  summary: string;
  coverage_notes: string;
  /** Only for `new_research`: the research run this call started. */
  research_topic_id: string | null;
  research_started: boolean;
  notes: string[];
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function readProposalNode(value: unknown): MapTopicProposalNode | null {
  if (!isJsonObject(value)) return null;
  const slug = str(value.slug);
  const name = str(value.name);
  if (!slug || !name) return null;
  const status = value.status === "active" ? "active" : "proposed";
  return {
    __kind: "map_topic_node_v1",
    slug,
    name,
    description: str(value.description),
    status,
    parent_slug: str(value.parent_slug),
  };
}

function readProposal(value: unknown): MapTopicProposal | null {
  if (!isJsonObject(value)) return null;
  const topics = Array.isArray(value.topics)
    ? value.topics.map(readProposalNode).filter((n): n is MapTopicProposalNode => n !== null)
    : [];
  // A proposal with zero topics is REAL (see AuthorTopicalMapResult), so the
  // absence of `topics` is what rejects the payload, never its emptiness.
  if (!Array.isArray(value.topics)) return null;
  return {
    __kind: "map_topic_proposal_v1",
    summary: str(value.summary) ?? "",
    source_kind: str(value.source_kind) ?? "",
    topics,
    coverage_notes: str(value.coverage_notes) ?? "",
  };
}

/**
 * Narrow the streamed/persisted result onto {@link AuthorTopicalMapResult}.
 * Built field by field — no assertion — and returns null rather than half-type
 * a payload this build cannot read, so a malformed run is reported instead of
 * rendered.
 */
export function parseAuthorTopicalMapResult(raw: unknown): AuthorTopicalMapResult | null {
  if (!isJsonObject(raw)) return null;
  const mapId = str(raw.map_id);
  const brandId = str(raw.brand_id);
  const sourceKind = str(raw.source_kind);
  if (brandId === null || sourceKind === null) return null;
  const resultKind = str(raw.result_kind);
  if (resultKind !== null && resultKind !== "seo.map_author") return null;
  return {
    result_kind: "seo.map_author",
    // `new_research` answers with no map — it commissioned the source.
    map_id: mapId ?? "",
    brand_id: brandId,
    source_kind: sourceKind,
    source_reference: str(raw.source_reference),
    change_mode: str(raw.change_mode) ?? "",
    applied: raw.applied === true,
    created: strings(raw.created),
    updated: strings(raw.updated),
    unchanged: strings(raw.unchanged),
    dry_run: isJsonObject(raw.dry_run) ? raw.dry_run : {},
    proposal: readProposal(raw.proposal),
    summary: str(raw.summary) ?? "",
    coverage_notes: str(raw.coverage_notes) ?? "",
    research_topic_id: str(raw.research_topic_id),
    research_started: raw.research_started === true,
    notes: strings(raw.notes),
  };
}

/**
 * The proposal's tree in the shape `upsertMapTopics` / `replaceMapSection`
 * take. Same nodes, no reshaping — the kind was designed to be exactly that
 * payload — so a review screen that accepts a proposal writes the bytes the
 * author produced.
 */
export function proposalAsTopicTree(proposal: MapTopicProposal): MapTopicTreeNode[] {
  return proposal.topics.map((node) => ({
    slug: node.slug,
    name: node.name,
    description: node.description ?? null,
    status: node.status,
    parent_slug: node.parent_slug ?? null,
  }));
}

// ── The wire vocabulary ────────────────────────────────────────────────────

/** The command's streaming endpoint. `{brand_id}` is filled per launch. */
export const MAP_AUTHOR_PATH = "/seo/brands/{brand_id}/map/author" as const;

/** The event kind carrying the finished {@link AuthorTopicalMapResult}. */
export const MAP_AUTHOR_FINAL_KIND = "seo.map_author_complete";

/**
 * The server's OWN milestones, in the reader's words — one per `_emit` call in
 * `map_author.py`, never an invented stage. The four envelope events belong to
 * every durable SEO command.
 */
export const MAP_AUTHOR_STAGES: Record<string, string> = {
  "seo.map_author_started": "Starting this company's map…",
  "seo.map_author_resolving_source": "Reading the source you chose…",
  "seo.map_author_reading_map": "Reading the map as it stands today…",
  "seo.map_author_running": "Writing the topic tree…",
  "seo.map_author_proposed": "Tree proposed — rehearsing the change…",
  "seo.map_author_written": "Topics written to the map",
  "seo.command_run": "Durable run saved",
  "seo.run_in_progress": "Rejoining the run already in progress",
  "seo.run_snapshot": "Catching up on this run",
  "seo.command_failed": "The map run stopped",
};
