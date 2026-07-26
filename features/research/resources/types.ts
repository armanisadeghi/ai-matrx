/**
 * RESEARCH RESOURCE SYSTEM — the contract.
 *
 * A research topic accumulates a lot more than its final report: search
 * results, raw provider payloads, the page bodies we read, per-page AI write-ups,
 * page scoring, keyword syntheses, tag consolidations, topic reports,
 * documents, media. Until now exactly one of those (the report) could reach an
 * agent, because every output hard-coded a single markdown blob as its input.
 *
 * This module names the pieces so a human — or a system bundle — can curate
 * them: pick the kinds, see the real size, save the selection, run any agent
 * with it. Three concepts, in dependency order:
 *
 *   1. MANIFEST  — what exists, with char counts and no bodies. Produced by the
 *      `research_topic_resource_manifest` RPC in ONE round trip.
 *   2. SELECTOR  — a RULE describing which items of a kind to take. Rules, not
 *      frozen id lists: a bundle must keep working after the next pipeline run
 *      adds sources. Explicit ids exist for genuine hand-picking.
 *   3. BUNDLE    — a saved, named set of selectors plus the bindings that say
 *      which resources fill which agent variable. Persisted in
 *      `research.rs_context_bundle`; `entity_id === null` means a reusable
 *      template that applies to any topic.
 *
 * Resolution (selectors + manifest → agent variables) lives in `resolve.ts`
 * and is the ONLY place that fetches bodies.
 */

import type { JsonObject } from "@/types/json";

// ───────────────────────────────────────────────────────────────── kinds ─────

/**
 * Every resource kind an agent can be given. The string is persisted inside
 * bundles, so these values are a stable contract — rename one and every saved
 * bundle referencing it breaks.
 */
export type ResourceKey =
  // Framing
  | "topic.brief"
  | "topic.inventory"
  // Search
  | "search.result"
  | "search.raw"
  | "search.keyword_serp"
  // Pages
  | "page.content"
  | "page.analysis"
  | "page.scoring"
  | "page.links"
  | "page.images"
  // Synthesis
  | "synthesis.keyword"
  | "synthesis.tag"
  | "synthesis.topic"
  | "document.report"
  // Derived tables
  | "source.authority"
  | "source.importance"
  | "tag.map"
  // Media
  | "media.items";

export type ResourceGroup =
  | "brief"
  | "search"
  | "pages"
  | "synthesis"
  | "meta"
  | "media";

/** What one item of a kind represents — drives grouping in the picker. */
export type ResourceGranularity =
  | "topic"
  | "keyword"
  | "source"
  | "tag"
  | "asset";

// ────────────────────────────────────────────────────────────── manifest ─────

/**
 * One selectable item. Keys are terse because the largest live topic yields
 * 3,303 of them in a single payload (see the RPC's payload-discipline note).
 */
export interface ManifestItemRaw {
  /** Resource kind. */
  k: string;
  /** Row id (the resource's own primary key). */
  id: string;
  /** Parent id: source_id, keyword_id or tag_id depending on the kind. */
  p: string | null;
  /** Display label (truncated to 140 chars server-side). */
  l: string | null;
  /** Secondary label — hostname, agent type, media type, provider. */
  s: string | null;
  /** Measured character count of the underlying text. Never estimated. */
  c: number;
  /** Row status where the kind has one (scrape_status, analysis status…). */
  st: string | null;
  /** The row's own timestamp (ISO) — what "newest first" actually orders by. */
  t: string | null;
  /** Sparse per-kind flags (nulls stripped server-side). */
  f: JsonObject;
}

/** Normalized item — what every consumer above the boundary parser sees. */
export interface ResourceItem {
  kind: ResourceKey;
  id: string;
  parentId: string | null;
  label: string;
  sublabel: string | null;
  chars: number;
  status: string | null;
  /** The row's own timestamp (ISO), null when the table has none. */
  createdAt: string | null;
  flags: JsonObject;
  /** Source id when the item belongs to one (source-granular kinds). */
  sourceId: string | null;
  /** Search-position importance across every keyword this source ranks for. */
  importance: number | null;
  /** Best (lowest) rank across keywords. */
  bestRank: number | null;
  /** AI authority score 0–100 when the ranker has run. */
  authority: number | null;
  /** Keyword ids this item is reachable from (via its source). */
  keywordIds: string[];
  /** Tag ids this item is reachable from (via its source). */
  tagIds: string[];
  /** Whether the owning source is included in the curated set. */
  included: boolean;
}

export interface ManifestKeyword {
  id: string;
  keyword: string;
  position: number | null;
  searched_at: string | null;
  stale: boolean | null;
  result_count: number | null;
}

export interface ManifestTag {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
}

export interface ManifestTopic {
  id: string;
  name: string;
  description: string | null;
  tone_profile: string | null;
  status: string | null;
  created_at: string | null;
}

/** Per-kind rollup, straight from the RPC (never recomputed differently). */
export interface KindRollup {
  kind: ResourceKey;
  itemCount: number;
  chars: number;
}

/** The parsed manifest — the single source of truth for "what exists". */
export interface ResourceManifest {
  topicId: string;
  generatedAt: string;
  topic: ManifestTopic;
  keywords: ManifestKeyword[];
  tags: ManifestTag[];
  /** kind → its items, in RPC order. */
  itemsByKind: Map<ResourceKey, ResourceItem[]>;
  /** Rollups for EVERY catalog kind, including the synthetic/derived ones. */
  rollups: Map<ResourceKey, KindRollup>;
  /** Unrecognized kinds returned by the RPC — loud, never silently dropped. */
  unknownKinds: string[];
}

// ────────────────────────────────────────────────────────────── selector ─────

export type SelectorMode = "all" | "filtered" | "explicit";

export type SelectorOrder = "importance" | "authority" | "rank" | "recent";

export interface SelectorFilter {
  /** Only sources the user kept during curation. */
  includedOnly?: boolean;
  /** Only scrapes the pipeline judged good. */
  goodScrapeOnly?: boolean;
  /** Only the current/latest row of a versioned artifact. */
  currentOnly?: boolean;
  /** Only rows whose status is a success. */
  successOnly?: boolean;
  /** Minimum AI authority score (0–100). */
  minAuthority?: number;
  /** Restrict to these authority tiers. */
  tiers?: string[];
  /** Restrict to items reachable from these keywords. */
  keywordIds?: string[];
  /** Restrict to items reachable from these tags. */
  tagIds?: string[];
  /** Restrict to these hostnames. */
  hostnames?: string[];
  /** Take only the first N after ordering. */
  topN?: number;
}

export interface SelectorLimit {
  maxItems?: number;
  maxChars?: number;
  /**
   * Cap on the characters taken from EACH item, independent of how many items
   * there are.
   *
   * This is the right control for page content. Only high-authority sources get
   * read in the first place, so filtering reads by authority removes nothing —
   * and a topic rarely has enough reads for an item cap to bind. The real risk
   * is ONE enormous page eating the whole budget, which is a per-item problem
   * and needs a per-item answer. A trimmed item is always marked in the text;
   * it is never silently shortened.
   */
  maxCharsPerItem?: number;
}

/**
 * A rule for taking items of one kind.
 *
 * `mode: "explicit"` pins `ids` — the only shape that can go stale, and it is
 * the user's deliberate choice ("just these six pages"). Everything else is
 * re-evaluated against a fresh manifest on every run.
 */
export interface ResourceSelector {
  kind: ResourceKey;
  mode: SelectorMode;
  filter?: SelectorFilter;
  ids?: string[];
  order?: SelectorOrder;
  limit?: SelectorLimit;
}

/** Which resource kinds fill which agent variable. */
export interface BundleBinding {
  /** Agent `variable_definitions[].name`. */
  variable: string;
  kinds: ResourceKey[];
  /**
   * How multiple kinds share one variable.
   *
   * `"concat"` (default) appends every kind's blocks — the normal case.
   * `"first"` takes only the FIRST kind in this list that produced anything and
   * ignores the rest. That is a real modelling need, not a special case: "the
   * report" means the assembled document if one exists, otherwise the current
   * topic synthesis — sending both would duplicate the same content in one
   * variable, which is exactly what the pre-bundle code was careful not to do.
   */
  strategy?: "concat" | "first";
  /**
   * How this binding's resources reach the agent.
   *
   * `"direct"` (default) renders the text and injects it into the variable —
   * the agent always reads it. `"context"` sends each selected item as a
   * `resource_ref` in the request's per-turn `context` dict instead: the server
   * builds a small descriptor (label, size, table of contents) and the agent
   * pulls the body through its `context` tool ONLY if it decides to. Costs
   * near-zero injected tokens; the trade is that the agent may never look.
   *
   * Only kinds whose catalog entry declares a `resourceType` can travel this
   * way (a real row the server can load under RLS). Derived kinds — computed
   * text with no row — always deliver direct, whatever the binding says.
   */
  delivery?: "direct" | "context";
}

export interface BundleBudget {
  /** Hard ceiling for the whole resolution, enforced and reported. */
  maxTokens: number;
}

/** A saved curation. Row shape of `research.rs_context_bundle`. */
export interface ContextBundle {
  id: string;
  entityType: string;
  /** null = reusable template applying to any topic. */
  entityId: string | null;
  name: string;
  description: string | null;
  slug: string | null;
  selectors: ResourceSelector[];
  bindings: BundleBinding[];
  budget: BundleBudget | null;
  agentId: string | null;
  isSystem: boolean;
  organizationId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields a caller may write. */
export interface ContextBundleInput {
  entityType?: string;
  entityId?: string | null;
  name: string;
  description?: string | null;
  slug?: string | null;
  selectors: ResourceSelector[];
  bindings: BundleBinding[];
  budget?: BundleBudget | null;
  agentId?: string | null;
  organizationId?: string | null;
}

// ──────────────────────────────────────────────────────────── resolution ─────

/** Why an item did not make it into the resolved payload. */
export type DropReason =
  | "filtered"
  | "over_item_limit"
  | "over_char_limit"
  | "over_budget"
  | "empty_body"
  | "body_missing"
  /** A `strategy: "first"` binding was already satisfied by an earlier kind. */
  | "superseded";

export interface KindResolution {
  kind: ResourceKey;
  variable: string;
  /**
   * `"context"` when the binding delivered this kind as lazy resource_refs:
   * `included` then counts refs, and `chars`/`tokens` are 0 because nothing was
   * injected — the whole point of the path.
   */
  delivery?: "direct" | "context";
  selected: number;
  included: number;
  chars: number;
  tokens: number;
  /** Items kept but shortened by `maxCharsPerItem`. Always reported. */
  trimmed: number;
  /** Per-reason counts for everything left out. Empty = nothing dropped. */
  dropped: Partial<Record<DropReason, number>>;
}

/**
 * What actually happened. Truncation is ALWAYS reported: a silently trimmed
 * context is the difference between "the agent read our research" and "the
 * agent read the first third of it and we never knew".
 */
export interface ResolutionReport {
  topicId: string;
  bundleName: string;
  totalChars: number;
  totalTokens: number;
  budgetTokens: number | null;
  /** True when anything at all was left out. */
  truncated: boolean;
  /**
   * True when the assembled payload is STILL over the budget — the planner
   * never returns nothing, so one resource larger than the whole budget is kept
   * and flagged rather than silently dropped.
   */
  exceedsBudget: boolean;
  perKind: KindResolution[];
  /** Human-readable lines naming every drop, for the UI and the run log. */
  notes: string[];
  /** Selectors naming a kind with nothing to give. */
  emptyKinds: ResourceKey[];
}

export interface ResolvedBundle {
  /** Agent variable name → assembled text. Ready for `useRunAgent`. */
  variables: Record<string, string>;
  /**
   * Per-turn context entries for bindings with `delivery: "context"` — one
   * `resource_ref` envelope per selected item, keyed `variable` (single item)
   * or `variable_N` (the server takes exactly one ref per key). Passed through
   * `runtime.context` on launch; empty object when nothing travels lazily.
   */
  contextRefs: Record<string, unknown>;
  report: ResolutionReport;
}

/** A body fetched for rendering — the only time text leaves the database. */
export interface ResourceBody {
  id: string;
  text: string;
  /** Extra per-kind fields the renderer needs (url, title, keyword…). */
  meta?: JsonObject;
}
