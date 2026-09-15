import type { Database, Json } from "@/types/database.types";

export type TopicalMap = Database["seo"]["Tables"]["topical_map"]["Row"];
export type TopicalMapInsert = Database["seo"]["Tables"]["topical_map"]["Insert"];
export type TopicalMapUpdate = Database["seo"]["Tables"]["topical_map"]["Update"];
export type MapTopic = Database["seo"]["Tables"]["map_topic"]["Row"];
export type MapTopicInsert = Database["seo"]["Tables"]["map_topic"]["Insert"];
export type MapTopicUpdate = Database["seo"]["Tables"]["map_topic"]["Update"];
export type MapFacet = Database["seo"]["Tables"]["map_facet"]["Row"];
export type MapFacetInsert = Database["seo"]["Tables"]["map_facet"]["Insert"];
export type MapFacetUpdate = Database["seo"]["Tables"]["map_facet"]["Update"];
export type MapFacetValue = Database["seo"]["Tables"]["map_facet_value"]["Row"];
export type MapFacetValueInsert = Database["seo"]["Tables"]["map_facet_value"]["Insert"];
export type MapFacetValueUpdate = Database["seo"]["Tables"]["map_facet_value"]["Update"];
export type MapTopicStats = Database["seo"]["Views"]["v_map_topic_stats"]["Row"];

/**
 * Where a topical-map list lands. The registry declares `default_list_scope =
 * 'organization'` for seo_topical_map / seo_map_facet / seo_map_facet_value, so
 * every list names its organization; a brand narrows further where the table
 * carries `brand_id`.
 */
export interface TopicalMapListScope {
  organizationId: string;
  brandId?: string | null;
}

export interface MapFacetListScope {
  organizationId: string;
}

export interface MapTopicTreeNode {
  slug: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  status?: string;
  /**
   * Absent or null keeps the parent implied by nesting (or, at the top level,
   * the topic's current parent) — it never moves a topic to the root.
   */
  parent_slug?: string | null;
  children?: MapTopicTreeNode[];
}

/**
 * Shape returned by seo.upsert_map_topics — each list holds topic slugs.
 *
 * There is no `errors` key. The function is all-or-nothing: it raises SQLSTATE
 * 22023 carrying the whole error list instead of returning a partial success.
 */
export interface MapTopicsUpsertResult {
  created: string[];
  updated: string[];
  unchanged: string[];
}

/**
 * An entity reference as the topical-map functions return it (`seo._tm_ref`,
 * round 17). Two variants, and nothing else:
 *
 * - resolved: the row, through `platform.resolve_entity_ref`'s whitelist.
 *   `jsonb_strip_nulls`ed, so every optional key is simply absent when the
 *   underlying row has no value for it.
 * - hidden: a row the caller cannot open — forbidden, missing and unregistered
 *   are deliberately the same answer — is `{type, hidden: true}`. It carries no
 *   id, so the caller learns that something is there and never which row.
 */
export interface EntityRefHidden {
  type: string;
  hidden: true;
}

export interface EntityRefResolved {
  type: string;
  id: string;
  /** name / title / label / phrase / url / slug / key, first non-null wins. */
  label?: string;
  slug?: string;
  url?: string;
  status?: string;
  country_code?: string;
  region_code?: string;
  region?: string;
  city?: string;
}

export type EntityRef = EntityRefResolved | EntityRefHidden;

/** Narrows an {@link EntityRef} to the variant that actually carries row data. */
export function isResolvedEntityRef(ref: EntityRef | null | undefined): ref is EntityRefResolved {
  return !!ref && !("hidden" in ref);
}

/**
 * What still hangs off a topic, from seo._tm_attachments. Nulls are stripped,
 * so a kind with nothing attached is absent rather than 0, and `{}` means the
 * topic is free to retire.
 */
export interface MapTopicAttachments {
  pages?: number;
  planned?: number;
  keywords?: number;
  facets?: number;
  other?: number;
}

export interface MapOutlineOptions {
  focusSlug?: string | null;
  siteId?: string | null;
  overrides?: Json;
}

export interface MapGraphNodeData {
  slug: string;
  name: string;
  description: string | null;
  status: string;
  depth: number;
  sort_order: number;
  parent_id: string | null;
  page_count: number;
  planned_count: number;
  keyword_count: number;
  facets: Record<string, string>;
  auto_layout: boolean;
}

/** A topic (seo.map_topic id). `position` is the stored layout or {x:0,y:0}. */
export interface MapGraphTopicNode {
  id: string;
  type: "topic";
  position: { x: number; y: number };
  data: MapGraphNodeData;
}

/** A facet value (seo.map_facet_value id). Emitted only when grouping; no position. */
export interface MapGraphFacetValueNode {
  id: string;
  type: "facet_value";
  data: {
    slug: string;
    name: string;
    facet: string;
    parent_id: string | null;
    /** `seo.map_facet_value_ref` — null when the value names no entity. */
    ref: EntityRef | null;
  };
}

/** The synthetic bucket for topics with no value for the grouped facet. Its id is not a uuid. */
export interface MapGraphAllFacetValueNode {
  id: "all";
  type: "facet_value";
  data: {
    slug: "all";
    name: "All";
    facet: string;
  };
}

export type MapGraphNode =
  | MapGraphTopicNode
  | MapGraphFacetValueNode
  | MapGraphAllFacetValueNode;

/** Parent topic → child topic. id is `${parentId}-${childId}`. */
export interface MapGraphTreeEdge {
  id: string;
  source: string;
  target: string;
  type: "tree";
}

/** Facet value (or "all") → topic. `inherited` is true when the value comes from an ancestor. */
export interface MapGraphFacetEdge {
  id: string;
  source: string;
  target: string;
  type: "facet";
  inherited: boolean;
}

export type MapGraphEdge = MapGraphTreeEdge | MapGraphFacetEdge;

export interface MapGraphResult {
  map_id: string;
  group_by: string | null;
  site_id: string | null;
  nodes: MapGraphNode[];
  edges: MapGraphEdge[];
}

export interface MapMutationResult {
  [key: string]: Json;
}

export interface PageMapTopicsInput {
  slug: string;
  confidence: number;
  reason: string;
}

/** Allowed values of seo.set_page_map_topics p_source (the function raises 22023 otherwise). */
export type PageMapTopicsSource = "mapper" | "human" | "agent";

export interface CreateMapFacetValueInput {
  slug: string;
  name?: string;
  parent_slug?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
}

export interface MapFacetTopicValue {
  value_slug: string;
  value_name: string;
  inherited: boolean;
  /**
   * `seo.map_facet_value_ref` — null when the value names no entity,
   * `{type, hidden: true}` when it names a row this caller cannot open.
   */
  ref: EntityRef | null;
}

export type MapTopicFacetsResult = Record<string, MapFacetTopicValue>;

/** Result of seo.merge_map_topics. */
export interface MapMergeResult {
  ok: true;
  into: string;
  retired: string[];
  associations_moved: number;
  associations_dropped_as_duplicate: number;
  planned_pages_moved: number;
  keywords_moved: number;
  children_reparented: number;
  /**
   * Rows another organization filed under the merged topics. They are neither
   * moved nor dropped — only counted, so the caller can say so out loud.
   */
  foreign_org_attachments: number;
}

/** One topic in the `seo.map_tree` payload. Every key past slug/name is opt-in via `include`. */
export interface MapTreeNode {
  slug: string;
  name: string;
  /** `include: ["description"]`. */
  description?: string | null;
  /** `include: ["status"]`, and always present when the status is not `active`. */
  status?: string;
  /** `include: ["counts"]` — all three arrive together. */
  pages?: number;
  planned?: number;
  keywords?: number;
  /** `include: ["path"]` — root-first slugs ending with this topic. */
  path?: string[];
  /** `include: ["facets"]` — facet key → value slug, inherited values included. */
  facets?: Record<string, string>;
  /**
   * `include: ["associations"]` for everything, or any association kind
   * (`pages`, `facets`, `keywords`, `planned`, or a raw entity token) to narrow.
   * Same rows as `seo.map_topic_associations`: what the caller cannot open is
   * counted in a hidden entry, never listed.
   */
  associations?: MapTopicAssociation[];
  /** Present when the topic has children and `depth` has not run out. */
  children?: MapTreeNode[];
  /** Present INSTEAD of `children` when `depth` stopped the walk here. */
  children_count?: number;
}

/** `seo.map_tree` called with a `rootSlug`: one subtree. */
export interface MapTreeRootedResult {
  map_id: string;
  root: string;
  topic: MapTreeNode;
}

/** `seo.map_tree` called without a `rootSlug`: every root topic. */
export interface MapTreeWholeResult {
  map_id: string;
  root: null;
  topics: MapTreeNode[];
  total_topics: number;
}

export type MapTreeResult = MapTreeRootedResult | MapTreeWholeResult;

/** Narrows {@link MapTreeResult} by the `root` discriminant. */
export function isRootedMapTree(result: MapTreeResult): result is MapTreeRootedResult {
  return result.root !== null;
}

export type MapTopicAssociationDirection = "in" | "out";

/** One edge off a topic whose other end the caller can open. */
export interface MapTopicAssociationResolved {
  /** The topic slug the edge was read from. */
  topic: string;
  /** `jsonb_strip_nulls`ed: `role` and `payload` are absent when null. */
  association: {
    /** The other end's entity token (`web_page`, `seo_map_facet_value`, `plan_node`, `seo_keyword`, …). */
    kind: string;
    role?: string;
    direction: MapTopicAssociationDirection;
    payload?: Json;
  };
  /**
   * The other end, resolved. A facet value (`kind: "seo_map_facet_value"`)
   * also carries `facet` (its facet key) and `ref` (whatever entity the value
   * points at: null when it names none, hidden when the caller cannot open it).
   */
  item: EntityRefResolved & { facet?: string; ref?: EntityRef | null };
}

/**
 * Every edge of one (kind, direction) whose other end the caller cannot open —
 * forbidden, missing, unregistered, or a keyword edge naming a site the caller
 * cannot view. Those edges are never listed (no id, no role, no payload); they
 * are counted here, once per (kind, direction), so a screen can say that
 * something is there without saying what.
 */
export interface MapTopicAssociationHidden {
  topic: string;
  association: {
    kind: string;
    direction: MapTopicAssociationDirection;
  };
  item: {
    /** Always equal to `association.kind`. */
    type: string;
    /** How many edges were withheld; at least 1. */
    hidden: number;
  };
}

/**
 * One row of seo.map_topic_associations. Resolved rows come first (ordered by
 * kind, direction, age), then at most one hidden-count row per (kind,
 * direction). Narrow with {@link isHiddenMapTopicAssociation}.
 */
export type MapTopicAssociation = MapTopicAssociationResolved | MapTopicAssociationHidden;

export function isHiddenMapTopicAssociation(row: MapTopicAssociation): row is MapTopicAssociationHidden {
  return "hidden" in row.item;
}

/** One entry in `seo.search_map_topics`. */
export interface MapTopicSearchHit {
  slug: string;
  name: string;
  status: string;
  /** Root-first slugs ending with this topic. */
  path: string[];
}

export interface MapDiagnosticsCrowdedTopic {
  slug: string;
  pages: number;
}

export interface MapDiagnosticsPageRef {
  page_id: string;
  url: string;
}

export interface MapDiagnosticsOverloadedPage extends MapDiagnosticsPageRef {
  /** How many topics this page claims to cover (only pages with 3 or more appear). */
  topics: number;
}

export interface MapDiagnosticsRetiredTopic {
  slug: string;
  attachments: MapTopicAttachments;
}

/** Result of seo.map_diagnostics. Every sample list is capped by `limit`. */
export interface MapDiagnosticsResult {
  topics_total: number;
  /** Topics with no pages, no planned pages and no keywords. */
  topics_empty: number;
  topics_empty_sample: string[];
  topics_crowded: MapDiagnosticsCrowdedTopic[];
  topics_proposed: string[];
  pages_on_many_topics: MapDiagnosticsOverloadedPage[];
  /** 0 when no site is in scope — the count only means something per site. */
  pages_on_no_topic: number;
  pages_on_no_topic_sample: MapDiagnosticsPageRef[];
  /** Retired topics that still carry attachments. */
  retired_with_attachments: MapDiagnosticsRetiredTopic[];
  /** seo.topical_map ids of the sites using this map. */
  sites_using_map: string[];
}

/**
 * One edit in seo.patch_map_topics. An ABSENT key leaves that field alone.
 * `name`, `status`, `sort_order` and `new_slug` are omit-or-value: a JSON null
 * for any of them is a per-edit error (`"name cannot be null"`, …), so they are
 * typed optional, never `| null`. Only `description` (clears it) and
 * `parent_slug` (moves the topic to the root) take null on purpose.
 */
export interface MapTopicPatch {
  /** Which topic to edit. Required. */
  slug: string;
  name?: string;
  /** null clears the description. */
  description?: string | null;
  status?: MapTopicStatus;
  sort_order?: number;
  /** Rename: must match `^[a-z0-9]+(-[a-z0-9]+)*$`. */
  new_slug?: string;
  /** null moves the topic to the root. */
  parent_slug?: string | null;
}

export type MapTopicStatus = "proposed" | "active" | "retired";

/** One rejected edit. `slug` is whatever the caller sent, so it can be null. */
export interface MapTopicPatchError {
  slug: string | null;
  message: string;
}

/**
 * Result of seo.patch_map_topics. Unlike upsert, this one is per-edit: a bad
 * edit lands in `errors` and the rest still apply.
 */
export interface MapTopicsPatchResult {
  updated: string[];
  unchanged: string[];
  errors: MapTopicPatchError[];
}

/**
 * What to do with a topic that is being removed while attachments still hang
 * off it. `merge_into:<slug>` moves them onto that topic.
 */
export type MapTopicRemovalPolicy =
  | "error"
  | "retire"
  | "parent"
  | `merge_into:${string}`;

/** One line of the removal report from seo._tm_remove_topics. */
export interface MapTopicRemoval {
  slug: string;
  /**
   * `retired` (nothing was attached), `retired_with_attachments`,
   * `attachments_moved_to_parent`, or `attachments_merged_into_<slug>`.
   */
  action: string;
  attachments: MapTopicAttachments;
}

/** Result of seo.replace_map_section: the upsert's own report plus what left. */
export interface MapSectionReplaceResult extends MapTopicsUpsertResult {
  /** Slugs that lived elsewhere in the map and were moved into this section. */
  moved_in: string[];
  /** Topics that vanished from the section, and what happened to each. */
  removed: MapTopicRemoval[];
}

/** Result of seo.retire_map_topics. */
export interface MapTopicsRetireResult {
  ok: true;
  removed: MapTopicRemoval[];
}

/**
 * One page in seo.set_pages_map_topics. The page is named by `page_id` or by
 * `url` (id wins when both are given) and must be a live page OF the call's
 * site — foreign, invented and off-site pages are one per-item 42501.
 *
 * `topics` is required: `[]` clears this source's coverage on purpose, and an
 * item without a topics array comes back as a per-item 22023 failure row
 * rather than clearing anything.
 */
export type SetPagesMapTopicsItem =
  | { page_id: string; url?: string; topics: PageMapTopicsInput[] }
  | { page_id?: undefined; url: string; topics: PageMapTopicsInput[] };

/** One page that was mapped. Carries seo.set_page_map_topics' own report. */
export interface SetPagesMapTopicsSuccess {
  ok: true;
  page_id: string;
  /** Echoed from the item; null when the page was named by id. */
  url: string | null;
  map_id: string;
  covers: number;
  /** How many coverage rows from the same `source` were replaced. */
  replaced: number;
  unknown_slugs: string[];
}

/** One page that could not be mapped. The batch keeps going. */
export interface SetPagesMapTopicsFailure {
  ok: false;
  page_id: string | null;
  url: string | null;
  /** SQLERRM from the failed page — a message, never a code. */
  error: string;
}

export type SetPagesMapTopicsRow = SetPagesMapTopicsSuccess | SetPagesMapTopicsFailure;

/** Result of seo.set_pages_map_topics. `ok` is true only when nothing failed. */
export interface SetPagesMapTopicsResult {
  ok: boolean;
  mapped: number;
  failed: number;
  results: SetPagesMapTopicsRow[];
}

/** The functions seo.map_dry_run will rehearse. Anything else raises 22023. */
export type MapDryRunFunction =
  | "upsert_map_topics"
  | "replace_map_section"
  | "patch_map_topics"
  | "move_map_topic"
  | "merge_map_topics"
  | "split_map_topic"
  | "retire_map_topics"
  | "set_map_topic_facet"
  | "set_page_map_topics"
  | "set_pages_map_topics"
  | "create_map_facet_values"
  | "set_site_map"
  | "set_page_map_facet";

/**
 * Result of seo.map_dry_run. `would_return` is exactly what the rehearsed
 * function returned before the rollback, so narrow it to that function's own
 * result type at the call site.
 */
export interface MapDryRunResult {
  dry_run: true;
  function: MapDryRunFunction;
  would_return: Json;
}
