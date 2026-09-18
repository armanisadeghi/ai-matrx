// features/marketing/seo/topical-map/start/proposalRows.ts
//
// A `map_topic_proposal_v1` tree as `TopicTree` rows (CONTRACTS §4.1), for the
// READ-ONLY render the start screen shows until Lane G's compiled kind
// component lands (R12 — then this adapter is deleted and the screen renders
// the kind through the ONE pipeline). Store-free, expansion owned by the host.
//
// The proposal is FLAT with `parent_slug` (a recursive JSON schema is refused
// by every structured-output gate — see `map-author.ts`); the parent appears
// before its children, so one pass in order is enough. An orphan (a
// `parent_slug` naming a slug not in the list) is rendered at the ROOT and
// counted, never dropped: a proposal that silently lost a branch is the lying
// screen.

import type { TopicTreeRow } from "@/components/official/topic-tree/types";

import type { MapTopicProposalNode } from "../map-author";

export interface ProposalRowsResult {
  rows: TopicTreeRow[];
  /** Slugs whose `parent_slug` named nothing in the proposal — shown at the root. */
  orphans: string[];
  total: number;
}

export function proposalRows(
  topics: readonly MapTopicProposalNode[],
  expanded: ReadonlySet<string>,
  selected: string | null,
): ProposalRowsResult {
  const known = new Set(topics.map((t) => t.slug));
  const childrenOf = new Map<string | null, MapTopicProposalNode[]>();
  const orphans: string[] = [];
  for (const node of topics) {
    let parent = node.parent_slug ?? null;
    if (parent !== null && !known.has(parent)) {
      orphans.push(node.slug);
      parent = null;
    }
    const list = childrenOf.get(parent) ?? [];
    list.push(node);
    childrenOf.set(parent, list);
  }

  const rows: TopicTreeRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const node of childrenOf.get(parent) ?? []) {
      const kids = childrenOf.get(node.slug) ?? [];
      const isExpanded = expanded.has(node.slug);
      rows.push({
        id: node.slug,
        parentId: parent,
        depth,
        label: node.name,
        description: node.description ?? null,
        status: node.status,
        hasChildren: kids.length > 0,
        expanded: isExpanded,
        selected: selected === node.slug,
      });
      if (kids.length > 0 && isExpanded) walk(node.slug, depth + 1);
    }
  };
  walk(null, 0);

  return { rows, orphans, total: topics.length };
}
