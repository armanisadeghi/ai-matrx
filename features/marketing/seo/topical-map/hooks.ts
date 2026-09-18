// features/marketing/seo/topical-map/hooks.ts
//
// U1 — "hooks for every RPC in the doctrine §7.4 and §3".
//
// ONE HOOK PER WRAPPER in `./data.ts`, in the same order, with the same names
// pluralized into `use…`. Reads are TanStack `useQuery`, writes are
// `useMutation` that invalidate — the pattern `features/marketing/data/hooks.ts`
// already uses for the rest of Marketing. No third pattern is invented here.
//
// Three things every hook does that a bare `useQuery` would not:
//
//  1. It runs its call through `withTopicalMapErrors`, so a refusal arrives as
//     a `TopicalMapError` carrying the function's OWN sentence (see errors.ts)
//     and is captured for the Error Inspector on the way past.
//  2. The reads that feed a view dispatch into the topical-map slice, so
//     selection and expansion survive a refetch and a view switch.
//  3. The three optimistic writers (patch, move, layout) apply to the store
//     first and roll the exact previous rows back when the RPC refuses.

"use client";

import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppDispatch } from "@/lib/redux/hooks";
import type { Json } from "@/types/database.types";

import {
  createMapFacet,
  createMapFacetValue,
  createMapFacetValues,
  createMapTopic,
  createTopicalMap,
  deleteMapFacet,
  deleteMapFacetValue,
  deleteMapTopic,
  deleteTopicalMap,
  getMapFacet,
  getMapFacetValue,
  getMapTopic,
  getTopicalMap,
  listMapFacetValues,
  listMapFacets,
  listMapHistory,
  listMapTopicStats,
  listMapTopics,
  listPageIntents,
  listPagesWithoutTopic,
  listTopicGaps,
  listTopicalMaps,
  mapDiagnostics,
  mapDryRun,
  mapFacetValueRef,
  mapGraph,
  mapOutline,
  mapTopicAssociations,
  mapTopicFacets,
  mapTree,
  mergeMapTopics,
  moveMapTopic,
  pageMappingStatus,
  pageMappingWantedTopics,
  pageMappingWantedTopicsHeldBack,
  patchMapTopics,
  rejectMapTopics,
  replaceMapSection,
  retireMapTopics,
  searchMapTopics,
  setMapTopicFacet,
  setPageIntents,
  setPageMapFacet,
  setPageMapTopics,
  setPagesMapTopics,
  setSiteMap,
  siteMapId,
  splitMapTopic,
  updateMapFacet,
  updateMapFacetValue,
  updateMapTopic,
  updateTopicalMap,
  upsertMapTopics,
  type MapTreeOptions,
} from "./data";
import { withTopicalMapErrors } from "./errors";
import {
  mapTreeLoaded,
  optimisticCommitted,
  optimisticLayout,
  optimisticMove,
  optimisticPatch,
  optimisticRolledBack,
  pageIntentsLoaded,
  topicLayoutLoaded,
} from "./redux/slice";
import type {
  CreateMapFacetValueInput,
  MapDryRunFunction,
  MapFacetInsert,
  MapFacetListScope,
  MapFacetUpdate,
  MapFacetValueInsert,
  MapFacetValueUpdate,
  MapHistoryListOptions,
  MapOutlineOptions,
  MapTopicInsert,
  MapTopicPatch,
  MapTopicRejectionPolicy,
  MapTopicRemovalPolicy,
  MapTopicTreeNode,
  MapTopicUpdate,
  PageIntentSource,
  PageIntentsListOptions,
  PageMapTopicsInput,
  PageMapTopicsSource,
  SetPageIntentsItem,
  SetPagesMapTopicsItem,
  TopicalMapInsert,
  TopicalMapListScope,
  TopicalMapUpdate,
} from "./types";

/**
 * Query keys. Every map-scoped key descends from `map(mapId)` so one
 * `invalidateQueries({ queryKey: topicalMapKeys.map(id) })` after a write
 * refreshes the whole workspace without listing its reads.
 */
export const topicalMapKeys = {
  root: ["seo", "topical-map"] as const,
  maps: (scope: TopicalMapListScope) => [...topicalMapKeys.root, "maps", scope] as const,
  map: (mapId: string) => [...topicalMapKeys.root, "map", mapId] as const,
  topicRows: (mapId: string) => [...topicalMapKeys.map(mapId), "topic-rows"] as const,
  topicRow: (topicId: string) => [...topicalMapKeys.root, "topic-row", topicId] as const,
  tree: (mapId: string, options: MapTreeOptions) =>
    [...topicalMapKeys.map(mapId), "tree", options] as const,
  outline: (mapId: string, options: MapOutlineOptions) =>
    [...topicalMapKeys.map(mapId), "outline", options] as const,
  graph: (mapId: string, groupBy: string | null, siteId: string | null) =>
    [...topicalMapKeys.map(mapId), "graph", groupBy, siteId] as const,
  diagnostics: (mapId: string, siteId: string | null, limit: number | null) =>
    [...topicalMapKeys.map(mapId), "diagnostics", siteId, limit] as const,
  stats: (mapId: string, siteId: string | null) =>
    [...topicalMapKeys.map(mapId), "stats", siteId] as const,
  search: (mapId: string, query: string, limit: number | null) =>
    [...topicalMapKeys.map(mapId), "search", query, limit] as const,
  topicFacets: (mapId: string, slug: string) =>
    [...topicalMapKeys.map(mapId), "topic-facets", slug] as const,
  topicAssociations: (mapId: string, slug: string, kinds: readonly string[] | null) =>
    [...topicalMapKeys.map(mapId), "topic-associations", slug, kinds] as const,
  history: (mapId: string, options: MapHistoryListOptions) =>
    [...topicalMapKeys.map(mapId), "history", options] as const,
  pageIntents: (mapId: string, options: PageIntentsListOptions) =>
    [...topicalMapKeys.map(mapId), "page-intents", options] as const,
  topicGaps: (mapId: string, siteId: string | null) =>
    [...topicalMapKeys.map(mapId), "topic-gaps", siteId] as const,
  facets: (scope: MapFacetListScope) => [...topicalMapKeys.root, "facets", scope] as const,
  facet: (facetId: string) => [...topicalMapKeys.root, "facet", facetId] as const,
  facetValues: (facetId: string, scope: TopicalMapListScope) =>
    [...topicalMapKeys.facet(facetId), "values", scope] as const,
  facetValue: (valueId: string) => [...topicalMapKeys.root, "facet-value", valueId] as const,
  facetValueRef: (valueId: string) => [...topicalMapKeys.facetValue(valueId), "ref"] as const,
  siteMap: (siteId: string) => [...topicalMapKeys.root, "site-map", siteId] as const,
  /**
   * The feature's 53 `seo.topical_map` knob rows (CONTRACTS §7). ONE entry for
   * every surface, so the body, the topic panel and a peek mounted together
   * share one read rather than each running its own effect.
   */
  knobs: ["seo", "topical-map", "knobs"] as const,
  /** The page-mapping ledger of one SITE — not scoped to a map, because the ledger is not. */
  pageMappingStatus: (siteId: string) =>
    [...topicalMapKeys.root, "page-mapping-status", siteId] as const,
  pageMappingWantedTopics: (siteId: string, limit: number | null) =>
    [...topicalMapKeys.root, "page-mapping-wanted", siteId, limit] as const,
  pageMappingWantedTopicsHeldBack: (siteId: string, limit: number | null) =>
    [...topicalMapKeys.root, "page-mapping-wanted-held-back", siteId, limit] as const,
  pagesWithoutTopic: (siteId: string, limit: number | null, offset: number | null) =>
    [...topicalMapKeys.root, "pages-without-topic", siteId, limit, offset] as const,
};

/**
 * Every read that goes stale when a page-mapping, region or intent run lands.
 * The three run hooks invalidate exactly these plus `topicalMapKeys.map(mapId)`
 * — a run writes the site's LEDGER as well as the map, and the ledger keys do
 * not descend from `map(mapId)` because the ledger belongs to the site.
 */
export function siteMappingReaderKeys(siteId: string): readonly (readonly unknown[])[] {
  return [
    [...topicalMapKeys.root, "page-mapping-status", siteId],
    [...topicalMapKeys.root, "page-mapping-wanted", siteId],
    [...topicalMapKeys.root, "page-mapping-wanted-held-back", siteId],
    [...topicalMapKeys.root, "pages-without-topic", siteId],
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// Reads — one query hook per read wrapper
// ═══════════════════════════════════════════════════════════════════════════

/** `seo.topical_map` rows for one organization, optionally one brand. */
export function useTopicalMaps(scope: TopicalMapListScope, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.maps(scope),
    queryFn: ({ signal }) =>
      withTopicalMapErrors("seo.topical_map (list)", () => listTopicalMaps(scope, signal)),
    enabled: enabled && Boolean(scope.organizationId),
    placeholderData: keepPreviousData,
  });
}

export function useTopicalMap(mapId: string, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.map(mapId),
    queryFn: () => withTopicalMapErrors("seo.topical_map (read)", () => getTopicalMap(mapId)),
    enabled: enabled && Boolean(mapId),
  });
}

/** The raw `seo.map_topic` rows — the only read that carries `layout` and ids. */
export function useMapTopicRows(mapId: string, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.topicRows(mapId),
    queryFn: ({ signal }) =>
      withTopicalMapErrors("seo.map_topic (list)", () => listMapTopics(mapId, signal)),
    enabled: enabled && Boolean(mapId),
  });
}

export function useMapTopicRow(topicId: string, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.topicRow(topicId),
    queryFn: () => withTopicalMapErrors("seo.map_topic (read)", () => getMapTopic(topicId)),
    enabled: enabled && Boolean(topicId),
  });
}

export function useMapFacets(scope: MapFacetListScope, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.facets(scope),
    queryFn: ({ signal }) =>
      withTopicalMapErrors("seo.map_facet (list)", () => listMapFacets(scope, signal)),
    enabled: enabled && Boolean(scope.organizationId),
  });
}

export function useMapFacet(facetId: string, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.facet(facetId),
    queryFn: () => withTopicalMapErrors("seo.map_facet (read)", () => getMapFacet(facetId)),
    enabled: enabled && Boolean(facetId),
  });
}

export function useMapFacetValues(
  facetId: string,
  scope: TopicalMapListScope,
  enabled = true,
) {
  return useQuery({
    queryKey: topicalMapKeys.facetValues(facetId, scope),
    queryFn: ({ signal }) =>
      withTopicalMapErrors("seo.map_facet_value (list)", () =>
        listMapFacetValues(facetId, scope, signal),
      ),
    enabled: enabled && Boolean(facetId && scope.organizationId),
  });
}

export function useMapFacetValue(valueId: string, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.facetValue(valueId),
    queryFn: () =>
      withTopicalMapErrors("seo.map_facet_value (read)", () => getMapFacetValue(valueId)),
    enabled: enabled && Boolean(valueId),
  });
}

export function useMapTopicStats(mapId: string, siteId?: string | null, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.stats(mapId, siteId ?? null),
    queryFn: () =>
      withTopicalMapErrors("seo.v_map_topic_stats", () =>
        listMapTopicStats(mapId, siteId ?? undefined),
      ),
    enabled: enabled && Boolean(mapId),
  });
}

/**
 * `seo.map_outline` — exactly the text an agent receives. The text view renders
 * this unchanged; it is not a rendering of the tree, it IS the agent's input.
 */
export function useMapOutline(mapId: string, options: MapOutlineOptions = {}, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.outline(mapId, options),
    queryFn: () => withTopicalMapErrors("seo.map_outline", () => mapOutline(mapId, options)),
    enabled: enabled && Boolean(mapId),
  });
}

/** `seo.map_graph` — nodes and edges for the xy-flow view, optionally regrouped by a facet. */
export function useMapGraph(
  mapId: string,
  groupBy?: string | null,
  siteId?: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: topicalMapKeys.graph(mapId, groupBy ?? null, siteId ?? null),
    queryFn: () => withTopicalMapErrors("seo.map_graph", () => mapGraph(mapId, groupBy, siteId)),
    enabled: enabled && Boolean(mapId),
  });
}

/**
 * `seo.site_map_id` — the map a site uses, or null when it uses none.
 *
 * A caller with no viewer access on the site gets a 42501 REFUSAL, not a null.
 * `retry: false` keeps that refusal from being re-asked three times; the
 * surface renders the refusal.
 */
export function useSiteMapId(siteId: string, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.siteMap(siteId),
    queryFn: () => withTopicalMapErrors("seo.site_map_id", () => siteMapId(siteId)),
    enabled: enabled && Boolean(siteId),
    retry: false,
  });
}

/** `seo.map_facet_value_ref` — whatever entity a facet value names. */
export function useMapFacetValueRef(valueId: string, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.facetValueRef(valueId),
    queryFn: () =>
      withTopicalMapErrors("seo.map_facet_value_ref", () => mapFacetValueRef(valueId)),
    enabled: enabled && Boolean(valueId),
    retry: false,
  });
}

/** `seo.map_topic_facets` — a topic's facets, inherited values included and flagged. */
export function useMapTopicFacets(mapId: string, slug: string, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.topicFacets(mapId, slug),
    queryFn: () =>
      withTopicalMapErrors("seo.map_topic_facets", () => mapTopicFacets(mapId, slug)),
    enabled: enabled && Boolean(mapId && slug),
  });
}

/**
 * `seo.map_tree` — THE read every view is built on, and the one that feeds the
 * slice. The `includes` the caller asked for are recorded alongside the rows so
 * a view can tell "not loaded" from "zero".
 */
export function useMapTree(mapId: string, options: MapTreeOptions = {}, enabled = true) {
  const dispatch = useAppDispatch();
  const query = useQuery({
    queryKey: topicalMapKeys.tree(mapId, options),
    queryFn: () => withTopicalMapErrors("seo.map_tree", () => mapTree(mapId, options)),
    enabled: enabled && Boolean(mapId),
    placeholderData: keepPreviousData,
  });

  const result = query.data;
  useEffect(() => {
    if (!result || !mapId) return;
    dispatch(mapTreeLoaded({ mapId, result, includes: options.include ?? [] }));
    // `options.include` is an array literal at most call sites, so it is
    // compared by its contents rather than its identity.
  }, [dispatch, mapId, result, options.include?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

/** `seo.search_map_topics` — substring search over slug, name and description. */
export function useMapTopicSearch(
  mapId: string,
  query: string,
  limit?: number,
  enabled = true,
) {
  return useQuery({
    queryKey: topicalMapKeys.search(mapId, query, limit ?? null),
    queryFn: () =>
      withTopicalMapErrors("seo.search_map_topics", () => searchMapTopics(mapId, query, limit)),
    enabled: enabled && Boolean(mapId),
    placeholderData: keepPreviousData,
  });
}

/**
 * `seo.map_topic_associations` — every edge on one topic, both directions,
 * the other end resolved. Edges the caller cannot open are COUNTED, never
 * listed; a renderer must handle the hidden rows rather than filter them away.
 */
export function useMapTopicAssociations(
  mapId: string,
  slug: string,
  kinds?: string[] | null,
  enabled = true,
) {
  return useQuery({
    queryKey: topicalMapKeys.topicAssociations(mapId, slug, kinds ?? null),
    queryFn: () =>
      withTopicalMapErrors("seo.map_topic_associations", () =>
        mapTopicAssociations(mapId, slug, kinds),
      ),
    enabled: enabled && Boolean(mapId && slug),
  });
}

/** `seo.map_diagnostics` — the map's health in one read. */
export function useMapDiagnostics(
  mapId: string,
  siteId?: string | null,
  limit?: number,
  enabled = true,
) {
  return useQuery({
    queryKey: topicalMapKeys.diagnostics(mapId, siteId ?? null, limit ?? null),
    queryFn: () =>
      withTopicalMapErrors("seo.map_diagnostics", () => mapDiagnostics(mapId, siteId, limit)),
    enabled: enabled && Boolean(mapId),
  });
}

/** `seo.list_map_history` — what left the map, and who sent it there. */
export function useMapHistory(
  mapId: string,
  options: MapHistoryListOptions = {},
  enabled = true,
) {
  return useQuery({
    queryKey: topicalMapKeys.history(mapId, options),
    queryFn: () =>
      withTopicalMapErrors("seo.list_map_history", () => listMapHistory(mapId, options)),
    enabled: enabled && Boolean(mapId),
    placeholderData: keepPreviousData,
  });
}

/**
 * `seo.list_page_intents` — the convergence screen's read. Feeds the slice so
 * the outline and graph can color a page without a second call.
 */
export function usePageIntents(
  mapId: string,
  options: PageIntentsListOptions = {},
  enabled = true,
) {
  const dispatch = useAppDispatch();
  const query = useQuery({
    queryKey: topicalMapKeys.pageIntents(mapId, options),
    queryFn: () =>
      withTopicalMapErrors("seo.list_page_intents", () => listPageIntents(mapId, options)),
    enabled: enabled && Boolean(mapId),
    placeholderData: keepPreviousData,
  });

  const result = query.data;
  useEffect(() => {
    if (!result || !mapId) return;
    dispatch(
      pageIntentsLoaded({ mapId, result, replace: (options.offset ?? 0) === 0 }),
    );
  }, [dispatch, mapId, result, options.offset]);

  return query;
}

/** `seo.list_topic_gaps` — topics that should have a page and have none. */
export function useTopicGaps(mapId: string, siteId?: string | null, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.topicGaps(mapId, siteId ?? null),
    queryFn: () =>
      withTopicalMapErrors("seo.list_topic_gaps", () => listTopicGaps(mapId, siteId)),
    enabled: enabled && Boolean(mapId),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Writes — one mutation hook per write wrapper
// ═══════════════════════════════════════════════════════════════════════════

/** Everything under one map, refetched. Used by every write that changes the tree. */
function useInvalidateMap(mapId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: topicalMapKeys.map(mapId) });
  };
}

export function useCreateTopicalMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TopicalMapInsert) =>
      withTopicalMapErrors("seo.topical_map (create)", () => createTopicalMap(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

export function useUpdateTopicalMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TopicalMapUpdate }) =>
      withTopicalMapErrors("seo.topical_map (update)", () => updateTopicalMap(id, patch)),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.map(variables.id) });
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

/**
 * Soft delete through `entity_soft_delete`. The row stays and its topics go
 * with it (migration 20's cascade), so this is reversible — say that at the
 * call site rather than "permanently delete".
 */
export function useDeleteTopicalMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      withTopicalMapErrors("seo.topical_map (remove)", () => deleteTopicalMap(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

export function useCreateMapTopic(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: (input: MapTopicInsert) =>
      withTopicalMapErrors("seo.map_topic (create)", () => createMapTopic(input)),
    onSuccess: invalidate,
  });
}

export function useUpdateMapTopic(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MapTopicUpdate }) =>
      withTopicalMapErrors("seo.map_topic (update)", () => updateMapTopic(id, patch)),
    onSuccess: invalidate,
  });
}

export function useDeleteMapTopic(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: (id: string) =>
      withTopicalMapErrors("seo.map_topic (remove)", () => deleteMapTopic(id)),
    onSuccess: invalidate,
  });
}

export function useCreateMapFacet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MapFacetInsert) =>
      withTopicalMapErrors("seo.map_facet (create)", () => createMapFacet(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

export function useUpdateMapFacet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MapFacetUpdate }) =>
      withTopicalMapErrors("seo.map_facet (update)", () => updateMapFacet(id, patch)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

export function useDeleteMapFacet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      withTopicalMapErrors("seo.map_facet (remove)", () => deleteMapFacet(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

export function useCreateMapFacetValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MapFacetValueInsert) =>
      withTopicalMapErrors("seo.map_facet_value (create)", () => createMapFacetValue(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

export function useUpdateMapFacetValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MapFacetValueUpdate }) =>
      withTopicalMapErrors("seo.map_facet_value (update)", () => updateMapFacetValue(id, patch)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

export function useDeleteMapFacetValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      withTopicalMapErrors("seo.map_facet_value (remove)", () => deleteMapFacetValue(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

/**
 * `seo.upsert_map_topics` — ALL-OR-NOTHING. Every validation problem raises
 * 22023 carrying the whole list; the result has no `errors` key. Use
 * {@link usePatchMapTopics} when the good edits should still land.
 */
export function useUpsertMapTopics(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: (tree: MapTopicTreeNode[]) =>
      withTopicalMapErrors("seo.upsert_map_topics", () => upsertMapTopics(mapId, tree)),
    onSuccess: invalidate,
  });
}

/**
 * `seo.move_map_topic` — OPTIMISTIC. The tree reparents in the store the
 * instant the user drops the node; a refusal puts the exact previous rows back
 * rather than refetching, so the failure is visible instead of being hidden
 * behind a blink of fresh data.
 */
export function useMoveMapTopic(mapId: string) {
  const dispatch = useAppDispatch();
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: async ({
      slug,
      newParentSlug,
    }: {
      slug: string;
      newParentSlug: string | null;
    }) => {
      const opId = `move:${slug}:${Date.now()}`;
      dispatch(optimisticMove({ mapId, opId, slug, newParentSlug }));
      try {
        const result = await withTopicalMapErrors("seo.move_map_topic", () =>
          moveMapTopic(mapId, slug, newParentSlug),
        );
        dispatch(optimisticCommitted({ mapId, opId }));
        return result;
      } catch (error) {
        dispatch(optimisticRolledBack({ mapId, opId }));
        throw error;
      }
    },
    onSuccess: invalidate,
  });
}

/**
 * `seo.merge_map_topics` — retires topics and moves everything they carry.
 *
 * `foreign_org_attachments` counts rows ANOTHER organization filed under the
 * merged topics: they are left exactly where they are. A non-zero count must be
 * said out loud at the call site, never swallowed.
 */
export function useMergeMapTopics(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({ fromSlugs, intoSlug }: { fromSlugs: string[]; intoSlug: string }) =>
      withTopicalMapErrors("seo.merge_map_topics", () =>
        mergeMapTopics(mapId, fromSlugs, intoSlug),
      ),
    onSuccess: invalidate,
  });
}

/** `seo.split_map_topic` — adds children under a topic; its attachments stay put. */
export function useSplitMapTopic(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({ slug, children }: { slug: string; children: MapTopicTreeNode[] }) =>
      withTopicalMapErrors("seo.split_map_topic", () => splitMapTopic(mapId, slug, children)),
    onSuccess: invalidate,
  });
}

/** `seo.set_map_topic_facet` — a null value slug still CLEARS the facet; the frontend always writes as `human`. */
export function useSetMapTopicFacet(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({
      slug,
      facetKey,
      valueSlug,
    }: {
      slug: string;
      facetKey: string;
      valueSlug: string | null;
    }) =>
      withTopicalMapErrors("seo.set_map_topic_facet", () =>
        setMapTopicFacet(mapId, slug, facetKey, valueSlug),
      ),
    onSuccess: invalidate,
  });
}

/** `seo.set_page_map_facet` — the same, on a page; the frontend always writes as `human`. */
export function useSetPageMapFacet(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({
      pageId,
      facetKey,
      valueSlug,
    }: {
      pageId: string;
      facetKey: string;
      valueSlug: string | null;
    }) =>
      withTopicalMapErrors("seo.set_page_map_facet", () =>
        setPageMapFacet(pageId, facetKey, valueSlug),
      ),
    onSuccess: invalidate,
  });
}

/** `seo.set_site_map` — binds a site to a map. Requires EDITOR on both. */
export function useSetSiteMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, mapId }: { siteId: string; mapId: string }) =>
      withTopicalMapErrors("seo.set_site_map", () => setSiteMap(siteId, mapId)),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.siteMap(variables.siteId) });
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.map(variables.mapId) });
    },
  });
}

/**
 * `seo.set_page_map_topics` — replaces ONE page's coverage for one source.
 * `topics: []` clears that source's coverage on purpose.
 */
export function useSetPageMapTopics(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({
      pageId,
      topics,
      source = "mapper",
    }: {
      pageId: string;
      topics: PageMapTopicsInput[];
      source?: PageMapTopicsSource;
    }) =>
      withTopicalMapErrors("seo.set_page_map_topics", () =>
        setPageMapTopics(pageId, topics, source),
      ),
    onSuccess: invalidate,
  });
}

/** `seo.create_map_facet_values` — creates or updates a brand's facet values. */
export function useCreateMapFacetValues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      facetKey,
      values,
    }: {
      brandId: string;
      facetKey: string;
      values: CreateMapFacetValueInput[];
    }) =>
      withTopicalMapErrors("seo.create_map_facet_values", () =>
        createMapFacetValues(brandId, facetKey, values),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
    },
  });
}

/**
 * `seo.patch_map_topics` — OPTIMISTIC, and PER-EDIT. A bad edit lands in
 * `errors` while the rest apply, so success is not all-or-nothing: the caller
 * must read `result.errors` and say what did not land. The rollback here fires
 * only when the whole call raised.
 */
export function usePatchMapTopics(mapId: string) {
  const dispatch = useAppDispatch();
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: async (edits: MapTopicPatch[]) => {
      const opId = `patch:${Date.now()}`;
      dispatch(optimisticPatch({ mapId, opId, edits }));
      try {
        const result = await withTopicalMapErrors("seo.patch_map_topics", () =>
          patchMapTopics(mapId, edits),
        );
        // Per-edit failures mean the store now shows changes the database
        // refused. Rolling the whole batch back would also undo the edits that
        // DID land; the refetch below is what reconciles, and the caller shows
        // `result.errors`.
        dispatch(optimisticCommitted({ mapId, opId }));
        return result;
      } catch (error) {
        dispatch(optimisticRolledBack({ mapId, opId }));
        throw error;
      }
    },
    onSuccess: invalidate,
  });
}

/**
 * `seo.replace_map_section` — makes one section look exactly like `children`.
 * `parentSlug: null` replaces the root level; `onRemoved` defaults to `error`,
 * which raises 23514 naming every topic that still carries attachments rather
 * than discarding the work hanging off it.
 */
export function useReplaceMapSection(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({
      parentSlug,
      children,
      onRemoved = "error",
    }: {
      parentSlug: string | null;
      children: MapTopicTreeNode[];
      onRemoved?: MapTopicRemovalPolicy;
    }) =>
      withTopicalMapErrors("seo.replace_map_section", () =>
        replaceMapSection(mapId, parentSlug, children, onRemoved),
      ),
    onSuccess: invalidate,
  });
}

/** `seo.retire_map_topics` — the door for an ACTIVE topic. `reject` is the one for a proposal. */
export function useRetireMapTopics(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({
      slugs,
      onAttachments = "error",
      liftChildren = true,
    }: {
      slugs: string[];
      onAttachments?: MapTopicRemovalPolicy;
      liftChildren?: boolean;
    }) =>
      withTopicalMapErrors("seo.retire_map_topics", () =>
        retireMapTopics(mapId, slugs, onAttachments, liftChildren),
      ),
    onSuccess: invalidate,
  });
}

/**
 * `seo.set_pages_map_topics` — coverage for many pages of ONE site.
 * `siteId` is required; per-page failures come back as rows with `ok: false`
 * and the batch's own `ok` is true only when `failed` is 0.
 *
 * 🚨 MIGRATION 23: a row can also carry `kept_existing` — pairs a HIGHER
 * source (human > agent > mapper) already held, left untouched rather than
 * overwritten. A caller that summarizes this result (toast, bulk-write report)
 * must show a kept item honestly ("kept — a person already decided this
 * page"), never lump it into `failed` and never silently count it as written.
 */
export function useSetPagesMapTopics(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({
      siteId,
      items,
      source = "mapper",
    }: {
      siteId: string;
      items: SetPagesMapTopicsItem[];
      source?: PageMapTopicsSource;
    }) =>
      withTopicalMapErrors("seo.set_pages_map_topics", () =>
        setPagesMapTopics(siteId, items, source),
      ),
    onSuccess: invalidate,
  });
}

/**
 * `seo.map_dry_run` — runs a mutating function for real and rolls it back.
 * THE PREVIEW HOOK (requirements §1.1, §4 U1). `args` are POSITIONAL, in the
 * order the target function declares them.
 *
 * A mutation rather than a query on purpose: a preview is something the user
 * ASKS for at a moment they choose, and re-running it on a window focus — which
 * is what a query would do — would repeat real work against the database.
 */
export function useMapDryRun() {
  return useMutation({
    mutationFn: ({ fn, args }: { fn: MapDryRunFunction; args: Json[] }) =>
      withTopicalMapErrors(`seo.map_dry_run (${fn})`, () => mapDryRun(fn, args)),
  });
}

/**
 * `seo.reject_map_topics` — the row STAYS and every reader hides it;
 * `list_map_history` lists it and it can be restored. Only a `proposed` topic
 * can be rejected — an active one raises 22023 and must be retired instead.
 */
export function useRejectMapTopics(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({
      slugs,
      onAttachments = "error",
    }: {
      slugs: string[];
      onAttachments?: MapTopicRejectionPolicy;
    }) =>
      withTopicalMapErrors("seo.reject_map_topics", () =>
        rejectMapTopics(mapId, slugs, onAttachments),
      ),
    onSuccess: invalidate,
  });
}

/**
 * `seo.set_page_intents` — where pages are GOING, in bulk. ONE INTENT PER PAGE:
 * each item REPLACES the page's existing intent edge.
 *
 * 🚨 MIGRATION 23: an intent a HIGHER source (human > agent > mapper) already
 * holds, or one already `accepted`/`done`, is left alone rather than
 * replaced — the result's `kept` count rises and that item carries
 * `kept_existing`. A caller that summarizes this result (toast, bulk-write
 * report) must show a kept item honestly ("kept — a person already decided
 * this page"), never lump it into `failed` and never silently count it as set.
 */
export function useSetPageIntents(mapId: string) {
  const invalidate = useInvalidateMap(mapId);
  return useMutation({
    mutationFn: ({
      siteId,
      items,
      source = "human",
    }: {
      siteId: string;
      items: SetPageIntentsItem[];
      source?: PageIntentSource;
    }) =>
      withTopicalMapErrors("seo.set_page_intents", () =>
        setPageIntents(siteId, items, source),
      ),
    onSuccess: invalidate,
  });
}

/**
 * Dragging a node in the graph view — OPTIMISTIC. `seo.map_topic.layout` is a
 * plain jsonb column, so this writes through the table wrapper rather than an
 * RPC; the node must not snap back to its old position while the write is in
 * flight, and must snap back if it fails.
 */
export function useSetMapTopicLayout(mapId: string) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      topicId,
      slug,
      layout,
    }: {
      topicId: string;
      slug: string;
      layout: Json;
    }) => {
      const opId = `layout:${slug}:${Date.now()}`;
      dispatch(optimisticLayout({ mapId, opId, slug, layout }));
      try {
        const row = await withTopicalMapErrors("seo.map_topic (layout)", () =>
          updateMapTopic(topicId, { layout }),
        );
        dispatch(optimisticCommitted({ mapId, opId }));
        dispatch(topicLayoutLoaded({ mapId, slug, layout: row.layout }));
        return row;
      } catch (error) {
        dispatch(optimisticRolledBack({ mapId, opId }));
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.topicRows(mapId) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// The page-mapping ledger — one hook per wrapper (CONTRACTS §8)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `seo.page_mapping_status` — one site's mapping ledger, rolled up. This is the
 * read the "map the pages" control shows before, during and after a run.
 *
 * `retry: false`: a caller with no access on the site gets a 42501 REFUSAL, and
 * re-asking a refusal three times only delays the sentence the person needs.
 */
export function usePageMappingStatus(siteId: string, enabled = true) {
  return useQuery({
    queryKey: topicalMapKeys.pageMappingStatus(siteId),
    queryFn: () =>
      withTopicalMapErrors("seo.page_mapping_status", () => pageMappingStatus(siteId)),
    enabled: enabled && Boolean(siteId),
    retry: false,
  });
}

/** `seo.page_mapping_wanted_topics` — the subjects this map is missing. */
export function usePageMappingWantedTopics(
  siteId: string,
  limit?: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: topicalMapKeys.pageMappingWantedTopics(siteId, limit ?? null),
    queryFn: () =>
      withTopicalMapErrors("seo.page_mapping_wanted_topics", () =>
        pageMappingWantedTopics(siteId, limit),
      ),
    enabled: enabled && Boolean(siteId),
    retry: false,
  });
}

/**
 * `seo.page_mapping_wanted_topics_held_back` — the suggestions the bar held
 * back, each with the sentence saying what would promote it. A surface that
 * renders the wanted list without this one hides a decision the system made.
 */
export function usePageMappingWantedTopicsHeldBack(
  siteId: string,
  limit?: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: topicalMapKeys.pageMappingWantedTopicsHeldBack(siteId, limit ?? null),
    queryFn: () =>
      withTopicalMapErrors("seo.page_mapping_wanted_topics_held_back", () =>
        pageMappingWantedTopicsHeldBack(siteId, limit),
      ),
    enabled: enabled && Boolean(siteId),
    retry: false,
  });
}

/**
 * `seo.list_pages_without_topic` — the site's bare pages, most clicks first.
 * Paged; `keepPreviousData` so paging does not blank the table under the
 * person's cursor.
 */
export function usePagesWithoutTopic(
  siteId: string,
  limit?: number | null,
  offset?: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: topicalMapKeys.pagesWithoutTopic(siteId, limit ?? null, offset ?? null),
    queryFn: () =>
      withTopicalMapErrors("seo.list_pages_without_topic", () =>
        listPagesWithoutTopic(siteId, limit, offset),
      ),
    enabled: enabled && Boolean(siteId),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
