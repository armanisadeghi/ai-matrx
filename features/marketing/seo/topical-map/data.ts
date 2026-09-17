import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import type { Json } from "@/types/database.types";
import type {
  CreateMapFacetValueInput,
  EntityRef,
  MapDiagnosticsResult,
  MapDryRunFunction,
  MapDryRunResult,
  MapFacet,
  MapFacetInsert,
  MapFacetListScope,
  MapFacetUpdate,
  MapFacetValue,
  MapFacetValueInsert,
  MapFacetValueUpdate,
  MapGraphResult,
  MapHistoryListOptions,
  MapHistoryResult,
  MapMergeResult,
  MapMutationResult,
  MapOutlineOptions,
  MapSectionReplaceResult,
  MapTopic,
  MapTopicAssociation,
  MapTopicInsert,
  MapTopicPatch,
  MapTopicRemovalPolicy,
  MapTopicSearchHit,
  MapTopicGapsResult,
  MapTopicRejectionPolicy,
  MapTopicStats,
  MapTopicTreeNode,
  MapTopicUpdate,
  MapTopicsPatchResult,
  MapTopicsRejectResult,
  MapTopicsRetireResult,
  MapTopicsUpsertResult,
  MapTopicFacetsResult,
  MapTreeResult,
  PageIntentSource,
  PageIntentsListOptions,
  PageIntentsResult,
  PageMapTopicsInput,
  PageMapTopicsSource,
  SetPageIntentsItem,
  SetPageIntentsResult,
  SetPagesMapTopicsItem,
  SetPagesMapTopicsResult,
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

/**
 * All-or-nothing. Every validation problem raises SQLSTATE 22023 carrying the
 * whole list — the result has no `errors` key. Use {@link patchMapTopics} when
 * you want the good edits to land and the bad ones reported.
 *
 * `tree` is required (a NULL raises 22023); `[]` is a no-op.
 */
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

/**
 * Retires `fromSlugs` and moves everything they carry onto `intoSlug`.
 * `foreign_org_attachments` counts rows another organization filed under the
 * merged topics: they are left exactly where they are, so a non-zero count is
 * something the surface must say out loud rather than swallow.
 */
export async function mergeMapTopics(mapId: string, fromSlugs: string[], intoSlug: string): Promise<MapMergeResult> {
  const response = await (await seoDb()).rpc("merge_map_topics", { p_map_id: mapId, p_from_slugs: fromSlugs, p_into_slug: intoSlug });
  return assertData(response.data as unknown as MapMergeResult, response.error);
}

/**
 * Adds `children` under `slug` (upserted, parented to it); attachments stay on
 * the parent. `children` is required (a NULL raises 22023).
 */
export async function splitMapTopic(mapId: string, slug: string, children: MapTopicTreeNode[]): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("split_map_topic", { p_map_id: mapId, p_slug: slug, p_children: children });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function setMapTopicFacet(mapId: string, slug: string, facetKey: string, valueSlug: string | null): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("set_map_topic_facet", { p_map_id: mapId, p_slug: slug, p_facet_key: facetKey, p_value_slug: valueSlug as unknown as string, p_source: "human" });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function setPageMapFacet(pageId: string, facetKey: string, valueSlug: string | null): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("set_page_map_facet", { p_page_id: pageId, p_facet_key: facetKey, p_value_slug: valueSlug as unknown as string, p_source: "human" });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

export async function setSiteMap(siteId: string, mapId: string): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("set_site_map", { p_site_id: siteId, p_map_id: mapId });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

/**
 * The topical map a site uses, or null when it uses none.
 *
 * Raises SQLSTATE 42501 (`site_map_denied`) when the caller has no viewer
 * access to the site — a refusal, never a null. Callers that browse sites they
 * may not be able to see must handle that error rather than read "no map".
 * A null site id raises 22023: null is only ever "this site uses no map".
 */
export async function siteMapId(siteId: string): Promise<string | null> {
  const response = await (await seoDb()).rpc("site_map_id", { p_site_id: siteId });
  return assertData(response.data, response.error);
}

/**
 * Replaces one page's topic coverage for one `source`. `topics` is required:
 * `[]` clears that source's coverage on purpose (a NULL raises 22023 and
 * deletes nothing). `source` is never sent as null (that is 22023 too); it
 * defaults to `"mapper"`, the function's own declared default.
 */
export async function setPageMapTopics(pageId: string, topics: PageMapTopicsInput[], source: PageMapTopicsSource = "mapper"): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("set_page_map_topics", { p_page_id: pageId, p_topics: topics, p_source: source });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

/** Creates or updates facet values for a brand. `values` is required (a NULL raises 22023). */
export async function createMapFacetValues(brandId: string, facetKey: string, values: CreateMapFacetValueInput[]): Promise<MapMutationResult> {
  const response = await (await seoDb()).rpc("create_map_facet_values", { p_brand_id: brandId, p_facet_key: facetKey, p_values: values });
  return assertData(response.data as unknown as MapMutationResult, response.error);
}

/**
 * Whatever entity a facet value names, resolved through
 * `platform.resolve_entity_ref`. Null when the value names nothing (no
 * ref_type/ref_id).
 *
 * The facet value itself must be reachable, or the call raises 42501 — an
 * unreachable value and an id that is no value at all are the same refusal.
 * A reachable value pointing at a row this caller cannot open (forbidden,
 * missing or unregistered alike) comes back as `{type, hidden: true}`: never
 * that row's id, never a label. Narrow with `isResolvedEntityRef` before
 * reading `label`.
 */
export async function mapFacetValueRef(valueId: string): Promise<EntityRef | null> {
  const response = await (await seoDb()).rpc("map_facet_value_ref", { p_value_id: valueId });
  return assertData(response.data as unknown as EntityRef | null, response.error);
}

/**
 * Every facet that applies to one topic, keyed by facet key, inherited values
 * included (`inherited: true` means it came from an ancestor). Each entry's
 * `ref` is the same {@link EntityRef} {@link mapFacetValueRef} returns
 * (resolved, `{type, hidden: true}`, or null). Raises P0002 when the slug is
 * not in the map.
 */
export async function mapTopicFacets(mapId: string, slug: string): Promise<MapTopicFacetsResult> {
  const response = await (await seoDb()).rpc("map_topic_facets", { p_map_id: mapId, p_slug: slug });
  return assertData(response.data as unknown as MapTopicFacetsResult, response.error);
}

/** What `mapTree` may ask for beyond each topic's slug and name. */
export interface MapTreeOptions {
  /** Start at one topic instead of every root. Raises P0002 when it is unknown or retired. */
  rootSlug?: string | null;
  /** How many levels below the start to walk. Null/undefined walks the whole map. */
  depth?: number | null;
  /**
   * Opt-in keys: `description`, `status`, `counts`, `path`, `facets`,
   * `associations`, or any single association kind (`pages`, `facets`,
   * `keywords`, `planned`, or a raw entity token) to narrow the edges.
   * Omitted means the minimal projection (slug and name). Associations follow
   * {@link mapTopicAssociations}: what the caller cannot open is counted in a
   * hidden entry, never listed.
   */
  include?: string[];
  /** Narrows the `counts` to one site. */
  siteId?: string | null;
}

/**
 * The map as a tree. With a `rootSlug` the result carries one `topic`; without
 * one it carries every root in `topics` plus `total_topics`. Narrow with
 * `isRootedMapTree`. Retired topics are never in the tree.
 *
 * A node that has children but sits at the depth limit carries
 * `children_count` INSTEAD of `children` — absence of `children` is never
 * proof that a topic is a leaf.
 */
export async function mapTree(mapId: string, options: MapTreeOptions = {}): Promise<MapTreeResult> {
  const response = await (await seoDb()).rpc("map_tree", {
    p_map_id: mapId,
    ...(options.rootSlug === null || options.rootSlug === undefined ? {} : { p_root_slug: options.rootSlug }),
    ...(options.depth === null || options.depth === undefined ? {} : { p_depth: options.depth }),
    ...(options.include === undefined ? {} : { p_include: options.include }),
    ...(options.siteId === null || options.siteId === undefined ? {} : { p_site_id: options.siteId }),
  });
  return assertData(response.data as unknown as MapTreeResult, response.error);
}

/**
 * Applies one edit per topic and reports each outcome separately: a bad edit
 * lands in `errors` and the rest still apply. Only the keys present on an edit
 * are touched; `parent_slug: null` moves a topic to the root.
 */
export async function patchMapTopics(mapId: string, edits: MapTopicPatch[]): Promise<MapTopicsPatchResult> {
  const response = await (await seoDb()).rpc("patch_map_topics", {
    p_map_id: mapId,
    p_edits: edits as unknown as Json,
  });
  return assertData(response.data as unknown as MapTopicsPatchResult, response.error);
}

/**
 * Makes one section of the map look exactly like `children`: upserts the
 * payload under `parentSlug`, reports slugs pulled in from elsewhere in the map
 * as `moved_in`, and removes whatever is no longer there.
 *
 * `parentSlug: null` replaces the map's root level. `children` is required:
 * `[]` empties the section on purpose, and a NULL raises 22023 without
 * touching anything. `onRemoved` decides what happens to a removed topic that
 * still carries attachments — the default `"error"` raises SQLSTATE 23514
 * naming every blocking topic rather than silently discarding the work
 * hanging off it.
 */
export async function replaceMapSection(
  mapId: string,
  parentSlug: string | null,
  children: MapTopicTreeNode[],
  onRemoved: MapTopicRemovalPolicy = "error",
): Promise<MapSectionReplaceResult> {
  // Supabase's generated Args type cannot represent nullable PostgreSQL
  // inputs; this RPC explicitly uses null to replace the map's root level.
  const response = await (await seoDb()).rpc("replace_map_section", {
    p_map_id: mapId,
    p_parent_slug: parentSlug as unknown as string,
    p_children: children as unknown as Json,
    p_on_removed: onRemoved,
  });
  return assertData(response.data as unknown as MapSectionReplaceResult, response.error);
}

/**
 * Retires topics by slug. Raises P0002 when any slug is unknown or already
 * retired — nothing is retired in that case.
 *
 * `onAttachments` decides what happens to whatever still hangs off them; the
 * default `"error"` raises SQLSTATE 23514 listing every blocking topic and its
 * attachment counts. `liftChildren` (default true, which is also what the
 * function reads a NULL as) re-parents each retired topic's children onto its
 * parent instead of stranding them under a topic every reader hides.
 */
export async function retireMapTopics(
  mapId: string,
  slugs: string[],
  onAttachments: MapTopicRemovalPolicy = "error",
  liftChildren = true,
): Promise<MapTopicsRetireResult> {
  const response = await (await seoDb()).rpc("retire_map_topics", {
    p_map_id: mapId,
    p_slugs: slugs,
    p_on_attachments: onAttachments,
    p_lift_children: liftChildren,
  });
  return assertData(response.data as unknown as MapTopicsRetireResult, response.error);
}

/**
 * Substring search over slug, name and description of the map's live topics.
 * Exact slug/name matches sort first, then tree order. `query` is required
 * (a NULL raises 22023); `""` lists every live topic. `limit` defaults to 25
 * when omitted and is clamped to 1..200 by the function.
 */
export async function searchMapTopics(mapId: string, query: string, limit?: number): Promise<MapTopicSearchHit[]> {
  const response = await (await seoDb()).rpc("search_map_topics", {
    p_map_id: mapId,
    p_query: query,
    ...(limit === undefined ? {} : { p_limit: limit }),
  });
  return assertData(response.data as unknown as MapTopicSearchHit[], response.error);
}

/**
 * Sets topic coverage for many pages of one site in a single call. Each item
 * names its page by `page_id` or by `url` within the site and must carry a
 * `topics` array (`[]` clears; see {@link SetPagesMapTopicsItem}).
 *
 * Per-page failures do not stop the batch: they come back as rows with
 * `ok: false` and a message, and the result's own `ok` is true only when
 * `failed` is 0. A null or bad `source`, and a null `items`, are rejected
 * once, up front, as SQLSTATE 22023.
 *
 * 🚨 MIGRATION 23: precedence is human > agent > mapper. A pair a HIGHER
 * source already holds is left alone, not overwritten — that row carries
 * `kept_existing` (see {@link SetPagesMapTopicsSuccess}) instead of an error.
 * Kept means that source's decision stands; it is settled, never retry it.
 */
export async function setPagesMapTopics(
  siteId: string,
  items: SetPagesMapTopicsItem[],
  source: PageMapTopicsSource = "mapper",
): Promise<SetPagesMapTopicsResult> {
  const response = await (await seoDb()).rpc("set_pages_map_topics", {
    p_site_id: siteId,
    p_items: items as unknown as Json,
    p_source: source,
  });
  return assertData(response.data as unknown as SetPagesMapTopicsResult, response.error);
}

/**
 * Every edge attached to one topic, in both directions, with the other end
 * resolved through `platform.resolve_entity_ref`. Plan nodes and keywords are
 * column links rather than association rows, and are presented as edges too.
 *
 * An edge whose other end the caller cannot open is NOT listed — no id, no
 * role, no payload. Such edges are counted instead, one
 * {@link MapTopicAssociationHidden} row per (kind, direction), after the
 * resolved rows. Narrow with `isHiddenMapTopicAssociation`.
 *
 * `kinds` narrows to specific ends and accepts the friendly aliases `pages`,
 * `facets`, `keywords` and `planned` as well as raw entity tokens. Omit it
 * (or pass null) for every kind; `[]` asks for no kinds and returns `[]`.
 * Raises P0002 when the slug is not in the map.
 */
export async function mapTopicAssociations(
  mapId: string,
  slug: string,
  kinds?: string[] | null,
): Promise<MapTopicAssociation[]> {
  const response = await (await seoDb()).rpc("map_topic_associations", {
    p_map_id: mapId,
    p_slug: slug,
    ...(kinds === null || kinds === undefined ? {} : { p_kinds: kinds }),
  });
  return assertData(response.data as unknown as MapTopicAssociation[], response.error);
}

/**
 * The map's health in one read: empty and crowded topics, still-proposed
 * topics, pages spread across too many topics, pages on none, and retired
 * topics that still carry attachments.
 *
 * Without a `siteId` the page-side numbers cover every site associated with
 * the map; when no site uses it, `pages_on_no_topic` is 0 because there is
 * nothing to count — not because every page is mapped.
 */
export async function mapDiagnostics(
  mapId: string,
  siteId?: string | null,
  limit?: number,
): Promise<MapDiagnosticsResult> {
  const response = await (await seoDb()).rpc("map_diagnostics", {
    p_map_id: mapId,
    ...(siteId === null || siteId === undefined ? {} : { p_site_id: siteId }),
    ...(limit === undefined ? {} : { p_limit: limit }),
  });
  return assertData(response.data as unknown as MapDiagnosticsResult, response.error);
}

/**
 * Runs one of the map-mutating functions for real and then rolls it back,
 * returning what it would have returned. Nothing is written.
 *
 * `args` are POSITIONAL, in the order the target function declares them, and
 * must be JSON values (a uuid-looking string is passed as a uuid). An
 * unsupported function name or a non-array argument list raises 22023.
 *
 * `would_return` is deliberately `Json`: cast it to the target function's own
 * result type at the call site, where the function name is known.
 */
export async function mapDryRun(fn: MapDryRunFunction, args: Json[]): Promise<MapDryRunResult> {
  const response = await (await seoDb()).rpc("map_dry_run", {
    p_function: fn,
    p_args: args as unknown as Json,
  });
  return assertData(response.data as unknown as MapDryRunResult, response.error);
}

/**
 * Rejects PROPOSED topics: the row stays, every reader hides it, and
 * {@link listMapHistory} lists it. Only a `proposed` topic can be rejected —
 * an active one raises 22023 naming it, and {@link retireMapTopics} is that
 * topic's door instead. A slug of another map and an invented slug are the
 * same P0002, and nothing is rejected in that case.
 *
 * `onAttachments` decides what happens to whatever still hangs off the
 * proposals; the default `"error"` raises SQLSTATE 23514 listing every
 * blocking topic and its attachment counts rather than orphaning the work.
 * Children of a rejected topic are always lifted onto its parent.
 */
export async function rejectMapTopics(
  mapId: string,
  slugs: string[],
  onAttachments: MapTopicRejectionPolicy = "error",
): Promise<MapTopicsRejectResult> {
  const response = await (await seoDb()).rpc("reject_map_topics", {
    p_map_id: mapId,
    p_slugs: slugs,
    p_on_attachments: onAttachments,
  });
  return assertData(response.data as unknown as MapTopicsRejectResult, response.error);
}

/**
 * What left the map, and who sent it there — read from `history.row_versions`,
 * so `changed_at` / `changed_by` describe the version that set each topic's
 * CURRENT status. Omitting `status` lists exactly that: `rejected` and
 * `retired`. `changed_by` is a bare user uuid; the platform has no entity
 * token for a user, so the client's own user surface renders the name.
 */
export async function listMapHistory(
  mapId: string,
  options: MapHistoryListOptions = {},
): Promise<MapHistoryResult> {
  const response = await (await seoDb()).rpc("list_map_history", {
    p_map_id: mapId,
    ...(options.status === undefined ? {} : { p_status: options.status }),
    ...(options.limit === undefined ? {} : { p_limit: options.limit }),
    ...(options.offset === undefined ? {} : { p_offset: options.offset }),
  });
  return assertData(response.data as unknown as MapHistoryResult, response.error);
}

/**
 * Records where pages are GOING, for many pages of one site in a single call.
 * ONE INTENT PER PAGE: each item REPLACES that page's existing `intent` edge
 * rather than accumulating another one.
 *
 * `siteId` is the scope every item resolves against — editor on it is
 * re-checked per item, and a foreign, invented or off-site page is one
 * per-item 42501. Per-item failures do not stop the batch: they come back as
 * rows with `ok: false` and a message, and the result's own `ok` is true only
 * when `failed` is 0. A null `siteId`, `items` or `source` is rejected once,
 * up front, as SQLSTATE 22023, and a site that uses no topical map raises
 * P0002.
 *
 * {@link SetPageIntentsItem} carries the cross-rules: `merge` and `redirect`
 * need exactly one of `into_page_id` / `into_node_id` and a `topic_slug`;
 * `keep`, `rewrite` and `delete` take no destination and derive their topic
 * from the page's own coverage when none is given.
 *
 * Rehearse a batch without writing it with {@link mapDryRun}
 * (`"set_page_intents"`).
 *
 * 🚨 MIGRATION 23: precedence is human > agent > mapper, and an intent already
 * `accepted`/`done` is never replaced by a non-human write either way. A kept
 * item carries `kept_existing` (see {@link SetPageIntentsSuccess}) instead of
 * being written, and the result's `kept` count rises. Kept means that
 * decision stands; it is settled — never retry it and never report it as failed.
 */
export async function setPageIntents(
  siteId: string,
  items: SetPageIntentsItem[],
  source: PageIntentSource = "mapper",
): Promise<SetPageIntentsResult> {
  const response = await (await seoDb()).rpc("set_page_intents", {
    p_site_id: siteId,
    p_items: items as unknown as Json,
    p_source: source,
  });
  return assertData(response.data as unknown as SetPageIntentsResult, response.error);
}

/**
 * The bulk convergence screen's read: every page of the map's world that has
 * an intent, a coverage edge, or both — with its current topics, its one
 * intent, and its Search Console clicks and impressions over the
 * `performance_window_days` knob.
 *
 * Without a `siteId` the page set is the sites related to this map that the
 * caller may view — never every site. `topicSlug` matches a page related to
 * that topic EITHER WAY, by its intent or by its coverage.
 *
 * A page with no intent still appears, with `intent: null`. A non-zero
 * `duplicate_intents` means edges had to be collapsed and the surface must say
 * so rather than quietly show one of them.
 */
export async function listPageIntents(
  mapId: string,
  options: PageIntentsListOptions = {},
): Promise<PageIntentsResult> {
  const response = await (await seoDb()).rpc("list_page_intents", {
    p_map_id: mapId,
    ...(options.siteId === null || options.siteId === undefined ? {} : { p_site_id: options.siteId }),
    ...(options.topicSlug === null || options.topicSlug === undefined ? {} : { p_topic_slug: options.topicSlug }),
    ...(options.disposition === null || options.disposition === undefined ? {} : { p_disposition: options.disposition }),
    ...(options.state === null || options.state === undefined ? {} : { p_state: options.state }),
    ...(options.limit === undefined ? {} : { p_limit: options.limit }),
    ...(options.offset === undefined ? {} : { p_offset: options.offset }),
  });
  return assertData(response.data as unknown as PageIntentsResult, response.error);
}

/**
 * Topics that should have a page and have none: zero live pages AND zero
 * planned pages, counted only over the sites the caller may view — so a
 * stranger's page can never close a gap the caller can see.
 *
 * A gap is a property of a TOPIC, never a page-shaped row, which is why
 * {@link listPageIntents} carries no `gap` key. Not paged: `total` is the
 * whole answer.
 */
export async function listTopicGaps(mapId: string, siteId?: string | null): Promise<MapTopicGapsResult> {
  const response = await (await seoDb()).rpc("list_topic_gaps", {
    p_map_id: mapId,
    ...(siteId === null || siteId === undefined ? {} : { p_site_id: siteId }),
  });
  return assertData(response.data as unknown as MapTopicGapsResult, response.error);
}
