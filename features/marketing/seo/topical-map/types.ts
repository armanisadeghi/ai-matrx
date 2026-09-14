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

export interface MapTopicTreeNode {
  slug: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  status?: string;
  parent_slug?: string | null;
  children?: MapTopicTreeNode[];
}

export interface MapTopicsUpsertResult {
  created: Json[];
  updated: Json[];
  unchanged: Json[];
  errors: Json[];
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

export interface MapGraphTopicNode {
  id: string;
  type: "topic";
  position: { x: number; y: number };
  data: MapGraphNodeData;
}

export interface MapGraphFacetValueNode {
  id: string;
  type: "facet_value";
  position: { x: number; y: number };
  data: Record<string, Json>;
}

export interface MapGraphEdge {
  id: string;
  source: string;
  target: string;
  type: "tree" | "facet";
}

export interface MapGraphResult {
  map_id: string;
  group_by: string | null;
  site_id: string | null;
  nodes: Array<MapGraphTopicNode | MapGraphFacetValueNode>;
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
