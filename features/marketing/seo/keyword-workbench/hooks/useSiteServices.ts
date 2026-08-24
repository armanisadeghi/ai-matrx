"use client";

/**
 * THE OFFERING CATALOG the workbench picks from — the site's topic tree,
 * flattened parent → child so a person can SEE that "Data Destruction
 * Services" sits under "IT Asset Disposition (ITAD)".
 *
 * Reuse, not a second catalog: the reads (`listAllTopics`, `listTopicWorth`,
 * `getTopicStats`) and the tree math (`buildTopicTree`, `lineageOf`) are the
 * topic-tree screen's own, under the SAME query keys, so the two surfaces share
 * one cache and can never disagree about the tree. This hook adds only the one
 * thing a picker needs and a tree screen does not: a flat, depth-ordered option
 * list.
 */

import { useQuery } from "@tanstack/react-query";

import {
  getTopicStats,
  listAllTopics,
  listTopicWorth,
} from "@/features/marketing/seo/value-system/topics/data";
import {
  buildTopicTree,
  flattenTree,
  tallyByTopic,
  type TopicTreeNode,
} from "@/features/marketing/seo/value-system/topics/lib";

export interface ServiceOption {
  topicId: string;
  name: string;
  depth: number;
  rootName: string;
  rootType: string;
  /** Root › … › parent, for the type-ahead and the hint line. */
  lineage: string;
  /** Keywords whose primary topic is this node or anything under it. */
  keywords: number;
  /** True when this site already has keywords or a worth ruling here. */
  ownedByThisSite: boolean;
}

export interface SiteServices {
  options: ServiceOption[];
  byId: Map<string, ServiceOption>;
  /** The roots a new service can be filed under, biggest first. */
  roots: ServiceOption[];
  loading: boolean;
  error: unknown;
}

/**
 * `start`/`end` scope the keyword counts, so the picker's "312 kw" means the
 * same window as the table behind it.
 */
export function useSiteServices(
  siteId: string,
  start: string,
  end: string,
): SiteServices {
  const catalog = useQuery({
    queryKey: ["seo", "topics", "catalog"],
    queryFn: () => listAllTopics(),
    staleTime: 5 * 60_000,
  });
  const worth = useQuery({
    queryKey: ["seo", "topics", "worth", siteId],
    queryFn: () => listTopicWorth(siteId),
    staleTime: 5 * 60_000,
  });
  const stats = useQuery({
    queryKey: ["seo", "topics", "stats", siteId, start, end],
    queryFn: ({ signal }) => getTopicStats(siteId, start, end, signal),
    staleTime: 5 * 60_000,
  });

  // React Compiler is on — no manual memoization (CLAUDE.md core invariants).
  const tree = buildTopicTree(
    catalog.data ?? [],
    worth.data ?? [],
    tallyByTopic(stats.data ?? []),
  );
  const flat = flattenTree(tree.roots, {
    collapsed: new Set<string>(),
    scope: null,
  });

  const toOption = (node: TopicTreeNode, lineage: string): ServiceOption => ({
    topicId: node.topic.id,
    name: node.topic.name,
    depth: node.depth,
    rootName: node.rootName,
    rootType: node.rootType,
    lineage,
    keywords: node.subtree.keywords,
    ownedByThisSite: !!node.ownWorth || node.subtree.keywords > 0,
  });

  const lineageByTopic = new Map<string, string>();
  const options: ServiceOption[] = [];
  for (const node of flat) {
    const parentId = node.topic.parent_id;
    const parentLineage = parentId ? lineageByTopic.get(parentId) : undefined;
    const parentName = parentId
      ? tree.byId.get(parentId)?.topic.name
      : undefined;
    const lineage = parentName
      ? parentLineage
        ? `${parentLineage} › ${parentName}`
        : parentName
      : "";
    lineageByTopic.set(node.topic.id, lineage);
    options.push(toOption(node, lineage));
  }

  return {
    options,
    byId: new Map(options.map((option) => [option.topicId, option])),
    roots: options.filter((option) => option.depth === 0),
    loading: catalog.isLoading || worth.isLoading || stats.isLoading,
    error: catalog.error ?? worth.error ?? stats.error,
  };
}
