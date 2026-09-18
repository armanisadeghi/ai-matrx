/**
 * features/marketing/seo/topical-map/proposals/topicRows.ts — ONE flattener
 * for a store-free tree (R11: the chat proposal renderer and the tool-result
 * renderer are ADAPTERS over `TopicTree`, never a second tree).
 *
 * Two arrival shapes, one row model:
 *   - `map_topic_proposal_v1` — FLAT with `parent_slug` (a recursive kind is
 *     refused by every structured-output gate; see map-author.ts).
 *   - `seo.map_tree` — NESTED `children` (what the `topical_map` tool's
 *     `tree` / `get` actions pass through).
 *
 * Both become `FlatTopic[]` in tree order (parent before children, siblings in
 * arrival order), and `topicTreeRows` turns that plus the host's expansion /
 * selection / checked sets into the `TopicTreeRow[]` the shared primitive
 * draws. Pure, so it is testable without a DOM.
 *
 * ABSENT IS NOT ZERO: counts are carried only when the source carried them.
 * A proposal never has counts; a `map_tree` read has them only with
 * `include: ["counts"]`.
 */

import type { TopicTreeRow } from "@/components/official/topic-tree/types";

import type { MapTopicProposalNode } from "../map-author";
import type { MapTreeNode } from "../types";

export interface FlatTopic {
  slug: string;
  name: string;
  description: string | null;
  status: string | null;
  parentSlug: string | null;
  depth: number;
  hasChildren: boolean;
  /** Only when the source carried counts. */
  counts?: { pages?: number; planned?: number; keywords?: number };
}

/**
 * A proposal's nodes in tree order. The kind's contract says a parent appears
 * before its children, but a model can break that, so the order is REBUILT
 * here from `parent_slug`: a node whose parent is not in the list is treated
 * as a root (it is still shown — dropping it would hide a topic the author
 * proposed), and a cycle cannot form because each node is emitted once.
 */
/**
 * The nodes whose `parent_slug` names a topic the proposal does not contain.
 * `flattenProposalNodes` shows them as roots so nothing proposed is hidden;
 * the screen says so, because a silently re-rooted branch is a tree that lies.
 */
export function orphanedProposalNodes(nodes: readonly MapTopicProposalNode[]): MapTopicProposalNode[] {
  const known = new Set(nodes.map((n) => n.slug));
  return nodes.filter((n) => Boolean(n.parent_slug) && !known.has(n.parent_slug as string));
}

export function flattenProposalNodes(nodes: readonly MapTopicProposalNode[]): FlatTopic[] {
  const known = new Set(nodes.map((n) => n.slug));
  const children = new Map<string | null, MapTopicProposalNode[]>();
  for (const node of nodes) {
    const parent = node.parent_slug && known.has(node.parent_slug) ? node.parent_slug : null;
    const list = children.get(parent) ?? [];
    list.push(node);
    children.set(parent, list);
  }
  const out: FlatTopic[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const node of children.get(parent) ?? []) {
      if (seen.has(node.slug)) continue;
      seen.add(node.slug);
      const kids = children.get(node.slug) ?? [];
      out.push({
        slug: node.slug,
        name: node.name,
        description: node.description ?? null,
        status: node.status ?? null,
        parentSlug: parent,
        depth,
        hasChildren: kids.length > 0,
      });
      walk(node.slug, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** A `seo.map_tree` payload's nodes in tree order, nesting unrolled. */
export function flattenTreeNodes(
  nodes: readonly MapTreeNode[],
  parentSlug: string | null = null,
  depth = 0,
): FlatTopic[] {
  const out: FlatTopic[] = [];
  for (const node of nodes) {
    const kids = node.children ?? [];
    const countsCarried =
      typeof node.pages === "number" ||
      typeof node.planned === "number" ||
      typeof node.keywords === "number";
    out.push({
      slug: node.slug,
      name: node.name,
      description: node.description ?? null,
      status: node.status ?? null,
      parentSlug,
      depth,
      // A walk the server stopped (`children_count`) still HAS children; the
      // row shows an expander that explains nothing more was read.
      hasChildren: kids.length > 0 || (node.children_count ?? 0) > 0,
      ...(countsCarried
        ? {
            counts: {
              ...(typeof node.pages === "number" ? { pages: node.pages } : {}),
              ...(typeof node.planned === "number" ? { planned: node.planned } : {}),
              ...(typeof node.keywords === "number" ? { keywords: node.keywords } : {}),
            },
          }
        : {}),
    });
    out.push(...flattenTreeNodes(kids, node.slug, depth + 1));
  }
  return out;
}

export interface TopicRowsState {
  expanded: ReadonlySet<string>;
  selected: string | null;
  checked?: ReadonlySet<string>;
}

/**
 * The VISIBLE rows: a topic is shown when every ancestor is expanded. Order
 * and depth come from the flat list, so this is one pass with a stack of the
 * collapsed ancestors' depths.
 */
export function topicTreeRows(
  topics: readonly FlatTopic[],
  state: TopicRowsState,
  decorate?: (topic: FlatTopic) => Pick<TopicTreeRow, "trailing" | "actions">,
): TopicTreeRow[] {
  const rows: TopicTreeRow[] = [];
  let hiddenBelowDepth: number | null = null;
  for (const topic of topics) {
    if (hiddenBelowDepth !== null) {
      if (topic.depth > hiddenBelowDepth) continue;
      hiddenBelowDepth = null;
    }
    const expanded = topic.hasChildren && state.expanded.has(topic.slug);
    if (topic.hasChildren && !expanded) hiddenBelowDepth = topic.depth;
    rows.push({
      id: topic.slug,
      parentId: topic.parentSlug,
      depth: topic.depth,
      label: topic.name,
      description: topic.description,
      ...(topic.status ? { status: topic.status } : {}),
      hasChildren: topic.hasChildren,
      expanded,
      selected: state.selected === topic.slug,
      ...(state.checked ? { checked: state.checked.has(topic.slug) } : {}),
      ...(topic.counts ? { counts: topic.counts } : {}),
      ...(decorate ? decorate(topic) : {}),
    });
  }
  return rows;
}

/** Every slug that has children — the "expand all" set. */
export function expandableSlugs(topics: readonly FlatTopic[]): Set<string> {
  return new Set(topics.filter((t) => t.hasChildren).map((t) => t.slug));
}

/** Root-first names for one topic, for a subtitle ("Recycling › Metals"). */
export function topicPathNames(topics: readonly FlatTopic[], slug: string): string[] {
  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const path: string[] = [];
  let cursor: string | null = slug;
  while (cursor) {
    const topic = bySlug.get(cursor);
    if (!topic) break;
    path.unshift(topic.name);
    cursor = topic.parentSlug;
  }
  return path;
}
