"use client";

/**
 * The reads the topic panel stands on, in ONE hook, so every section reads
 * the same rows and the body decides once what to show while they land.
 *
 * SELF-LOADING (CONTRACTS §5, the peek's note): the body renders in five hosts,
 * and only the workspace has loaded the tree before it opens. When the slice
 * holds no workspace for this map, the panel asks `seo.map_tree` itself with
 * the same `include` set the harness uses, and `useMapTree` feeds the slice —
 * so a peek on `/chat` and the panel on the outline read the same store and
 * the same selectors. When the workspace IS loaded, nothing is fetched twice:
 * the query key is the same and TanStack answers from cache.
 *
 * Every read is a `seo.*` function's own answer; nothing here interprets.
 */

import { useAppSelector } from "@/lib/redux/hooks";

import {
  useMapTopicAssociations,
  useMapTopicRows,
  useMapTree,
  useTopicalMap,
} from "../hooks";
import { useTopicalMapKnobs } from "../knobs";
import { selectMapLoadedAt, selectMapTopic } from "../redux/selectors";
import type { MapTopic, MapTopicAssociation } from "../types";

/** The same keys `MapTreeHarness` loads with, so the cache is shared. */
export const PANEL_TREE_INCLUDE = ["description", "status", "counts", "facets"];

export interface TopicPanelData {
  /** The `seo.topical_map` row — organization and brand for the facet reads. */
  map: ReturnType<typeof useTopicalMap>;
  /** `seo.map_topic` rows, the ONLY read that carries topic ids (association writes need one). */
  topicRows: ReturnType<typeof useMapTopicRows>;
  /** The topic's own row, by slug, once `topicRows` has landed. */
  topicRow: MapTopic | null;
  /** `seo.map_tree`, only when this session has not loaded the map yet. */
  tree: ReturnType<typeof useMapTree>;
  /** `seo.map_topic_associations` for this slug — the generic section's whole source. */
  associations: ReturnType<typeof useMapTopicAssociations>;
  associationRows: readonly MapTopicAssociation[];
  knobs: ReturnType<typeof useTopicalMapKnobs>;
  /** True while the tree is being loaded BY THE PANEL (not by a workspace). */
  treeSelfLoading: boolean;
}

export function useTopicPanelData(mapId: string, slug: string, siteId: string | null): TopicPanelData {
  const topic = useAppSelector(selectMapTopic(mapId, slug));
  const loadedAt = useAppSelector(selectMapLoadedAt(mapId));

  // Load the tree ourselves only when nobody has. A workspace that is open
  // behind this panel already did, and re-asking would race its includes.
  const needsTree = loadedAt === null && topic === null;
  const tree = useMapTree(
    mapId,
    { include: PANEL_TREE_INCLUDE, siteId: siteId ?? undefined },
    needsTree,
  );

  const map = useTopicalMap(mapId);
  const topicRows = useMapTopicRows(mapId);
  const associations = useMapTopicAssociations(mapId, slug, null, topic !== null);
  const knobs = useTopicalMapKnobs();

  const topicRow = topicRows.data?.find((row) => row.slug === slug) ?? null;

  return {
    map,
    topicRows,
    topicRow,
    tree,
    associations,
    associationRows: associations.data ?? [],
    knobs,
    treeSelfLoading: needsTree && tree.isPending,
  };
}
