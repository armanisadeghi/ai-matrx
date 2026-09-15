import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import type { Json } from "@/types/database.types";
import type {
  CreateMapFacetValueInput,
  MapFacet,
  MapFacetInsert,
  MapFacetListScope,
  MapFacetUpdate,
  MapFacetValue,
  MapFacetValueInsert,
  MapFacetValueUpdate,
  MapGraphResult,
  MapMutationResult,
  MapOutlineOptions,
  MapTopic,
  MapTopicInsert,
  MapTopicStats,
  MapTopicTreeNode,
  MapTopicUpdate,
  MapTopicsUpsertResult,
  MapTopicFacetsResult,
  PageMapTopicsInput,
  PageMapTopicsSource,
  TopicalMap,
  TopicalMapInsert,
  TopicalMapListScope,
  TopicalMapUpdate,
} from "./types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("read topical-map data");

type TopicalMapEntityToken =
  | "seo_topical_map"
  | "seo_map_topic"
  | "seo_map_facet"
  | "seo_map_facet_value";

/** Soft delete through the canonical door (db-rules §8/§8a): stamps deleted_at so the row can be restored. */
async function softDelete(token: TopicalMapEntityToken, id: string): Promise<void> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase.rpc("entity_soft_delete", { p_token: token, p_id: id });
  const removed = assertData(response.data, response.error, "remove that record");
  if (!removed) throw new Error(`Could not remove that record: it was not found or is already removed (${token} ${id}).`);
}

export async function listTopicalMaps(scope: TopicalMapListScope, signal?: AbortSignal): Promise<TopicalMap[]> {
  const db = await seoDb();
  return readAllRows<TopicalMap>(
    ({ from, to }) => {
      let query = db.from("topical_map").select("*").eq("organization_id", scope.organizationId)
        .is("deleted_at", null);
      if (scope.brandId) query = query.eq("brand_id", scope.brandId);
      return query.order("name").order("id").range(from, to)
        .abortSignal(signal ?? new AbortController().signal);
    },
    { label: "seo.topical_map" },
  );
}

export async function getTopicalMap(id: string): Promise<TopicalMap> {
  const response = await (await seoDb()).from("topical_map").select("*")
    .eq("id", id).is("deleted_at", null).single();
  return assertData(response.data, response.error);
}

export async function createTopicalMap(input: TopicalMapInsert): Promise<TopicalMap> {
  const response = await (await seoDb()).from("topical_map").insert(input).select("*").single();
  return assertData(response.data, response.error);
}

export async function updateTopicalMap(id: string, patch: TopicalMapUpdate): Promise<TopicalMap> {
  const response = await (await seoDb()).from("topical_map").update(patch).eq("id", id)
    .is("deleted_at", null).select("*").single();
  return assertData(response.data, response.error);
}

export async function deleteTopicalMap(id: string): Promise<void> {
  await softDelete("seo_topical_map", id);
}

export async function listMapTopics(mapId: string, signal?: AbortSignal): Promise<MapTopic[]> {
  const db = await seoDb();
  return readAllRows<MapTopic>(
    ({ from, to }) => db.from("map_topic").select("*").eq("map_id", mapId)
      .is("deleted_at", null).order("sort_order").order("id").range(from, to)
      .abortSignal(signal ?? new AbortController().signal),
    { label: "seo.map_topic" },
  );
}

export async function getMapTopic(id: string): Promise<MapTopic> {
  const response = await (await seoDb()).from("map_topic").select("*").eq("id", id)
    .is("deleted_at", null).single();
  return assertData(response.data, response.error);
}

export async function createMapTopic(input: MapTopicInsert): Promise<MapTopic> {
  const response = await (await seoDb()).from("map_topic").insert(input).select("*").single();
  return assertData(response.data, response.error);
}

export async function updateMapTopic(id: string, patch: MapTopicUpdate): Promise<MapTopic> {
  const response = await (await seoDb()).from("map_topic").update(patch).eq("id", id)
    .is("deleted_at", null).select("*").single();
  return assertData(response.data, response.error);
}

export async function deleteMapTopic(id: string): Promise<void> {
  await softDelete("seo_map_topic", id);
}

/** The organization's facets plus the builtins owned by the global system organization. */
export async function listMapFacets(scope: MapFacetListScope, signal?: AbortSignal): Promise<MapFacet[]> {
  const db = await seoDb();
  const systemOrgId = await resolveSystemOrgId();
  return readAllRows<MapFacet>(
    ({ from, to }) => db.from("map_facet").select("*")
      .in("organization_id", [scope.organizationId, systemOrgId])
      .is("deleted_at", null).order("key").order("id").range(from, to)
      .abortSignal(signal ?? new AbortController().signal),
    { label: "seo.map_facet" },
  );
}

export async function getMapFacet(id: string): Promise<MapFacet> {
  const response = await (await seoDb()).from("map_facet").select("*").eq("id", id).is("deleted_at", null).single();
  return assertData(response.data, response.error);
}

export async function createMapFacet(input: MapFacetInsert): Promise<MapFacet> {
  const response = await (await seoDb()).from("map_facet").insert(input).select("*").single();
  return assertData(response.data, response.error);
}

export async function updateMapFacet(id: string, patch: MapFacetUpdate): Promise<MapFacet> {
  const response = await (await seoDb()).from("map_facet").update(patch).eq("id", id).is("deleted_at", null).select("*").single();
  return assertData(response.data, response.error);
}

export async function deleteMapFacet(id: string): Promise<void> {
  await softDelete("seo_map_facet", id);
}

/**
 * Values visible to one brand, the same rule as seo._tm_visible_facet_values: the brand's own
 * values, plus brand-less values owned by the organization or the global system organization.
 * Without a brand, only the brand-less values.
 */
export async function listMapFacetValues(
  facetId: string,
  scope: TopicalMapListScope,
  signal?: AbortSignal,
): Promise<MapFacetValue[]> {
  const db = await seoDb();
  const systemOrgId = await resolveSystemOrgId();
  const orgs = `organization_id.in.(${scope.organizationId},${systemOrgId})`;
  const visible = scope.brandId
    ? `brand_id.eq.${scope.brandId},and(brand_id.is.null,${orgs})`
    : `and(brand_id.is.null,${orgs})`;
  return readAllRows<MapFacetValue>(
    ({ from, to }) => db.from("map_facet_value").select("*").eq("facet_id", facetId)
      .or(visible).is("deleted_at", null).order("name").order("id").range(from, to)
      .abortSignal(signal ?? new AbortController().signal),
    { label: "seo.map_facet_value" },
  );
}

export async function getMapFacetValue(id: string): Promise<MapFacetValue> {
  const response = await (await seoDb()).from("map_facet_value").select("*").eq("id", id).is("deleted_at", null).single();
  return assertData(response.data, response.error);
}

export async function createMapFacetValue(input: MapFacetValueInsert): Promise<MapFacetValue> {
  const response = await (await seoDb()).from("map_facet_value").insert(input).select("*").single();
  return assertData(response.data, response.error);
}

export async function updateMapFacetValue(id: string, patch: MapFacetValueUpdate): Promise<MapFacetValue> {
  const response = await (await seoDb()).from("map_facet_value").update(patch).eq("id", id).is("deleted_at", null).select("*").single();
  return assertData(response.data, response.error);
}

export async function deleteMapFacetValue(id: string): Promise<void> {
  await softDelete("seo_map_facet_value", id);
}

export async function listMapTopicStats(mapId: string, siteId?: string): Promise<MapTopicStats[]> {
  const db = await seoDb();
  return readAllRows<MapTopicStats>(
    ({ from, to }) => {
      let query = db.from("v_map_topic_stats").select("*").eq("map_id", mapId);
      if (siteId) query = query.eq("site_id", siteId);
      return query.range(from, to).abortSignal(new AbortController().signal);
    },
    { label: "seo.v_map_topic_stats" },
  );
}

export async function upsertMapTopics(mapId: string, tree: MapTopicTreeNode[]): Promise<MapTopicsUpsertResult> {
  const response = await (await seoDb()).rpc("upsert_map_topics", { p_map_id: mapId, p_tree: tree });
  return assertData(response.data as unknown as MapTopicsUpsertResult, response.error);
}

export async function mapOutline(mapId: string, options: MapOutlineOptions = {}): Promise<string> {
  const response = await (await seoDb()).rpc("map_outline", {
    p_map_id: mapId, p_focus_slug: options.focusSlug ?? undefined,
    p_site_id: options.siteId ?? undefined, p_overrides: options.overrides ?? {},
  });
  return assertData(response.data, response.error);
}

export async function mapGraph(mapId: string, groupBy?: string | null, siteId?: string | null): Promise<MapGraphResult> {
  const response = await (await seoDb()).rpc("map_graph", {
    p_map_id: mapId,
    ...(groupBy === null || groupBy === undefined ? {} : { p_group_by: groupBy }),
    ...(siteId === null || siteId === undefined ? {} : { p_site_id: siteId }),
  });
  return assertData(response.data as unknown as MapGraphResult, response.error);
}

export async function moveMapTopic(mapId: string, slug: string, newParentSlug: string | null): Promise<MapMutationResult> {
  // Supabase's generated Args type cannot represent nullable PostgreSQL
  // inputs; this RPC explicitly uses null to move a topic to the root.
  const response = await (await seoDb()).rpc("move_map_topic", { p_map_id: mapId, p_slug: slug, p_new_parent_slug: newParentSlug as unknown as string });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function mergeMapTopics(mapId: string, fromSlugs: string[], intoSlug: string): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("merge_map_topics", { p_map_id: mapId, p_from_slugs: fromSlugs, p_into_slug: intoSlug });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function splitMapTopic(mapId: string, slug: string, children: MapTopicTreeNode[]): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("split_map_topic", { p_map_id: mapId, p_slug: slug, p_children: children });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function setMapTopicFacet(mapId: string, slug: string, facetKey: string, valueSlug: string | null): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("set_map_topic_facet", { p_map_id: mapId, p_slug: slug, p_facet_key: facetKey, p_value_slug: valueSlug as unknown as string });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function setPageMapFacet(pageId: string, facetKey: string, valueSlug: string | null): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("set_page_map_facet", { p_page_id: pageId, p_facet_key: facetKey, p_value_slug: valueSlug as unknown as string });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function setSiteMap(siteId: string, mapId: string): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("set_site_map", { p_site_id: siteId, p_map_id: mapId });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function siteMapId(siteId: string): Promise<string | null> {
  const response = await (await seoDb()).rpc("site_map_id", { p_site_id: siteId });
  return assertData(response.data, response.error);
}

export async function setPageMapTopics(pageId: string, topics: PageMapTopicsInput[], source: PageMapTopicsSource = "mapper"): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("set_page_map_topics", { p_page_id: pageId, p_topics: topics, p_source: source });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function createMapFacetValues(brandId: string, facetKey: string, values: CreateMapFacetValueInput[]): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("create_map_facet_values", { p_brand_id: brandId, p_facet_key: facetKey, p_values: values });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function mapFacetValueRef(valueId: string): Promise<Json> {
  const response = await (await seoDb()).rpc("map_facet_value_ref", { p_value_id: valueId });
  return assertData(response.data, response.error);
}

export async function mapTopicFacets(mapId: string, slug: string): Promise<MapTopicFacetsResult> {
  const response = await (await seoDb()).rpc("map_topic_facets", { p_map_id: mapId, p_slug: slug });
  return assertData(response.data as unknown as MapTopicFacetsResult, response.error);
}
