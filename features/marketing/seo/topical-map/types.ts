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
  parent_slug?: string | null;
  children?: MapTopicTreeNode[];
}

/** Shape returned by seo.upsert_map_topics — each list holds topic slugs. */
export interface MapTopicsUpsertResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  // Always []: the function raises SQLSTATE 22023 with every validation error instead of returning them.
  errors: never[];
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
    ref: Json;
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
  ref: Json;
}

export type MapTopicFacetsResult = Record<string, MapFacetTopicValue>;
