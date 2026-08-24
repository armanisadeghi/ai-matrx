/**
 * Topic Tree Builder — pure tree math.
 *
 * 🚨 This file MIRRORS `seo.keyword_value_map`'s lineage walk exactly, and must
 * keep mirroring it:
 *   - a keyword's base weight comes from the NEAREST ancestor-or-self carrying
 *     a `seo.site_topic_value` row (`ORDER BY depth` in the resolver's
 *     `topic_base`), defaulting to 50 when no ancestor has one;
 *   - the root is the TOPMOST ancestor (`ORDER BY depth DESC` in `root_kind`);
 *   - `lead_quality='negative_value'` or `service_match IN
 *     ('not_offered','actively_avoided')` on that nearest row forces Negative.
 * It never re-derives a band or a score — bands always come from the resolver.
 * This exists so the screen can SHOW which ancestor a node inherits from, which
 * the resolver's `reasons` chain names but only per-keyword.
 */

import type { SiteTopicValue, TopicNode } from "../types";
import { isNegativeGuard, type TopicStatRow } from "./types";

/** The resolver's `COALESCE(stv.weight, 50)` — the same number, named once. */
export const DEFAULT_TOPIC_WEIGHT = 50;

export interface BandTally {
  keywords: number;
  clicks: number;
  impressions: number;
  bands: Record<string, number>;
}

export interface TopicTreeNode {
  topic: TopicNode;
  children: TopicTreeNode[];
  depth: number;
  /** node_type of the TOPMOST ancestor — what decides money vs authority. */
  rootType: string;
  rootName: string;
  /** This site's own ruling on this exact node, if any. */
  ownWorth: SiteTopicValue | null;
  /** Nearest ANCESTOR (never self) carrying a ruling — the source of inheritance. */
  inheritedFrom: TopicNode | null;
  inheritedWorth: SiteTopicValue | null;
  /** What the resolver will actually use as this node's base weight. */
  effectiveWeight: number;
  /** True when the effective ruling forces every keyword here to Negative. */
  negativeGuard: boolean;
  /** Keywords whose PRIMARY topic is exactly this node. */
  own: BandTally;
  /** This node plus everything under it. */
  subtree: BandTally;
}

function emptyTally(): BandTally {
  return { keywords: 0, clicks: 0, impressions: 0, bands: {} };
}

function addTally(target: BandTally, source: BandTally): void {
  target.keywords += source.keywords;
  target.clicks += source.clicks;
  target.impressions += source.impressions;
  for (const [band, count] of Object.entries(source.bands)) {
    target.bands[band] = (target.bands[band] ?? 0) + count;
  }
}

/** (topic × band) rows → one tally per topic. */
export function tallyByTopic(rows: TopicStatRow[]): Map<string, BandTally> {
  const map = new Map<string, BandTally>();
  for (const row of rows) {
    let tally = map.get(row.topic_id);
    if (!tally) {
      tally = emptyTally();
      map.set(row.topic_id, tally);
    }
    tally.keywords += Number(row.keywords ?? 0);
    tally.clicks += Number(row.clicks ?? 0);
    tally.impressions += Number(row.impressions ?? 0);
    tally.bands[row.value_band] =
      (tally.bands[row.value_band] ?? 0) + Number(row.keywords ?? 0);
  }
  return map;
}

export interface BuiltTree {
  roots: TopicTreeNode[];
  byId: Map<string, TopicTreeNode>;
  /** Topics whose parent id points at a topic we could not see (never expected). */
  orphanedParents: string[];
}

export type TopicTreeSortKey =
  "name" | "worth" | "keywords" | "clicks" | "impressions";

export interface TopicTreeSort {
  key: TopicTreeSortKey;
  direction: "asc" | "desc";
}

function compareTopicNodes(
  a: TopicTreeNode,
  b: TopicTreeNode,
  sort: TopicTreeSort,
): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  if (sort.key === "name") {
    return direction * a.topic.name.localeCompare(b.topic.name);
  }
  const aValue = sort.key === "worth" ? a.effectiveWeight : a.subtree[sort.key];
  const bValue = sort.key === "worth" ? b.effectiveWeight : b.subtree[sort.key];
  return (
    direction * (aValue - bValue) || a.topic.name.localeCompare(b.topic.name)
  );
}

/**
 * Build the forest. `worthByTopic` and `statsByTopic` are per-site; the topic
 * rows themselves are the shared catalog.
 */
export function buildTopicTree(
  topics: TopicNode[],
  worth: SiteTopicValue[],
  stats: Map<string, BandTally>,
): BuiltTree {
  const worthByTopic = new Map(worth.map((row) => [row.topic_id, row]));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const byId = new Map<string, TopicTreeNode>();
  const orphanedParents: string[] = [];

  for (const topic of topics) {
    byId.set(topic.id, {
      topic,
      children: [],
      depth: 0,
      rootType: topic.node_type,
      rootName: topic.name,
      ownWorth: worthByTopic.get(topic.id) ?? null,
      inheritedFrom: null,
      inheritedWorth: null,
      effectiveWeight: DEFAULT_TOPIC_WEIGHT,
      negativeGuard: false,
      own: stats.get(topic.id) ?? emptyTally(),
      subtree: emptyTally(),
    });
  }

  const roots: TopicTreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.topic.parent_id;
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(parentId);
    if (!parent) {
      // The parent is soft-deleted or unreadable. Render the node as a root
      // rather than dropping it — a vanished node is the worse lie.
      orphanedParents.push(node.topic.id);
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  // One downward pass: depth, root type, and the inheritance chain.
  const walk = (node: TopicTreeNode, ancestors: TopicTreeNode[]): void => {
    node.depth = ancestors.length;
    const root = ancestors[0] ?? node;
    node.rootType = root.topic.node_type;
    node.rootName = root.topic.name;

    // Nearest ANCESTOR with a ruling — ancestors are ordered root-first, so
    // the last one that has worth is the nearest.
    let nearest: TopicTreeNode | null = null;
    for (const ancestor of ancestors) {
      if (ancestor.ownWorth) nearest = ancestor;
    }
    node.inheritedFrom = nearest ? nearest.topic : null;
    node.inheritedWorth = nearest ? nearest.ownWorth : null;

    const effective = node.ownWorth ?? node.inheritedWorth;
    node.effectiveWeight =
      effective?.weight === null || effective?.weight === undefined
        ? DEFAULT_TOPIC_WEIGHT
        : Number(effective.weight);
    node.negativeGuard = effective
      ? isNegativeGuard(effective.lead_quality, effective.service_match)
      : false;

    for (const child of node.children) walk(child, [...ancestors, node]);
  };
  for (const root of roots) walk(root, []);

  // One upward pass for subtree rollups.
  const roll = (node: TopicTreeNode): BandTally => {
    const total = emptyTally();
    addTally(total, node.own);
    for (const child of node.children) addTally(total, roll(child));
    node.subtree = total;
    return total;
  };
  for (const root of roots) roll(root);

  const byName = (a: TopicTreeNode, b: TopicTreeNode) =>
    b.subtree.keywords - a.subtree.keywords ||
    a.topic.name.localeCompare(b.topic.name);
  const sortDeep = (node: TopicTreeNode) => {
    node.children.sort(byName);
    node.children.forEach(sortDeep);
  };
  roots.sort(byName);
  roots.forEach(sortDeep);

  return { roots, byId, orphanedParents };
}

/**
 * The tree this SITE is actually about: every node that carries a worth ruling
 * or a keyword, plus their ancestors (so the lineage renders whole) and their
 * descendants (so nothing hides under a node you can see). The full 330-topic
 * catalog stays available for the parent picker; it is not a working tree.
 */
export function scopeToSite(tree: BuiltTree): Set<string> {
  const keep = new Set<string>();
  const seeds: TopicTreeNode[] = [];
  for (const node of tree.byId.values()) {
    if (node.ownWorth || node.own.keywords > 0) seeds.push(node);
  }
  const addUp = (node: TopicTreeNode) => {
    let current: TopicTreeNode | undefined = node;
    while (current) {
      keep.add(current.topic.id);
      const parentId: string | null = current.topic.parent_id;
      current = parentId ? tree.byId.get(parentId) : undefined;
    }
  };
  const addDown = (node: TopicTreeNode) => {
    keep.add(node.topic.id);
    node.children.forEach(addDown);
  };
  seeds.forEach(addUp);
  seeds.forEach(addDown);
  return keep;
}

/** Depth-first flatten, honouring a collapsed set and an optional scope filter. */
export function flattenTree(
  roots: TopicTreeNode[],
  options: {
    collapsed: Set<string>;
    scope: Set<string> | null;
    sort?: TopicTreeSort;
  },
): TopicTreeNode[] {
  const out: TopicTreeNode[] = [];
  const sort = options.sort;
  const visit = (node: TopicTreeNode) => {
    if (options.scope && !options.scope.has(node.topic.id)) return;
    out.push(node);
    if (options.collapsed.has(node.topic.id)) return;
    const children = sort
      ? [...node.children].sort((a, b) => compareTopicNodes(a, b, sort))
      : node.children;
    children.forEach(visit);
  };
  const sortedRoots = sort
    ? [...roots].sort((a, b) => compareTopicNodes(a, b, sort))
    : roots;
  sortedRoots.forEach(visit);
  return out;
}

/**
 * Search and keyword-presence filters never tear a tree apart: matching nodes
 * keep their full lineage, and a matching branch name keeps its descendants.
 */
export function filterTopicTreeScope(
  tree: BuiltTree,
  baseScope: Set<string> | null,
  search: string,
  keywordFilter: "all" | "with-keywords" | "without-keywords",
): Set<string> | null {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle && keywordFilter === "all") return baseScope;

  const keep = new Set<string>();
  const includeDown = (node: TopicTreeNode) => {
    if (!baseScope || baseScope.has(node.topic.id)) keep.add(node.topic.id);
    node.children.forEach(includeDown);
  };
  const includeUp = (node: TopicTreeNode) => {
    let current: TopicTreeNode | undefined = node;
    while (current) {
      if (!baseScope || baseScope.has(current.topic.id)) {
        keep.add(current.topic.id);
      }
      const parentId: string | null = current.topic.parent_id;
      current = parentId ? tree.byId.get(parentId) : undefined;
    }
  };

  for (const node of tree.byId.values()) {
    if (baseScope && !baseScope.has(node.topic.id)) continue;
    const matchesName =
      !needle || node.topic.name.toLocaleLowerCase().includes(needle);
    const matchesKeywords =
      keywordFilter === "all" ||
      (keywordFilter === "with-keywords" && node.subtree.keywords > 0) ||
      (keywordFilter === "without-keywords" && node.subtree.keywords === 0);
    if (!matchesName || !matchesKeywords) continue;
    includeUp(node);
    if (needle) includeDown(node);
  }
  return keep;
}

/** Root → … → node, for showing a lineage as one line of text. */
export function lineageOf(tree: BuiltTree, topicId: string): TopicNode[] {
  const chain: TopicNode[] = [];
  let current = tree.byId.get(topicId);
  let guard = 0;
  while (current && guard < 32) {
    chain.unshift(current.topic);
    const parentId: string | null = current.topic.parent_id;
    current = parentId ? tree.byId.get(parentId) : undefined;
    guard += 1;
  }
  return chain;
}

/**
 * Ids that may NOT be chosen as a parent for `topicId`: itself and everything
 * beneath it. The DB refuses these anyway — this only keeps the picker from
 * offering a choice that is guaranteed to fail.
 */
export function forbiddenParents(
  tree: BuiltTree,
  topicId: string,
): Set<string> {
  const out = new Set<string>([topicId]);
  const node = tree.byId.get(topicId);
  if (!node) return out;
  const visit = (current: typeof node) => {
    out.add(current.topic.id);
    current.children.forEach(visit);
  };
  visit(node);
  return out;
}

export function formatWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
}
