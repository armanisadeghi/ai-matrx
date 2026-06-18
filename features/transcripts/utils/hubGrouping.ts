import type {
  HubTreeNode,
  RecordingHubItem,
  TranscriptHubItem,
} from "@/features/transcripts/types/hub";
import { hubItemKey } from "@/features/transcripts/types/hub";
import type { TranscriptSortKey } from "@/features/transcripts/components/TranscriptsSortMenu";
import {
  sortHubItems,
  hubItemMatchesQuery,
} from "@/features/transcripts/utils/hubSortFilter";

function compareChildren(a: TranscriptHubItem, b: TranscriptHubItem): number {
  if (a.kind === "recording" && b.kind === "recording") {
    return a.segmentIndex - b.segmentIndex;
  }
  if (a.kind === "unsorted" && b.kind === "unsorted") {
    return a.segmentIndex - b.segmentIndex;
  }
  return (b.updatedAt || "").localeCompare(a.updatedAt || "");
}

function sortTreeNodes(
  nodes: HubTreeNode[],
  sortKey: TranscriptSortKey,
): HubTreeNode[] {
  const ordered = sortHubItems(
    nodes.map((n) => n.item),
    sortKey,
  );
  const byItemKey = new Map(nodes.map((n) => [hubItemKey(n.item), n]));

  return ordered.map((item) => {
    const node = byItemKey.get(hubItemKey(item));
    if (!node) return { item, children: [] };
    return {
      item: node.item,
      children: [...node.children]
        .sort((a, b) => compareChildren(a.item, b.item))
        .map((child) => ({
          item: child.item,
          children: sortTreeNodes(child.children, sortKey),
        })),
    };
  });
}

/**
 * Build a parent → children tree for grouped hub views.
 *
 * - Recordings nest under their session/cleanup parent.
 * - Detached unsorted recordings nest under the parent session when loaded.
 * - Sessions/cleanup with `transcriptId` nest under the linked processor transcript.
 */
export function buildHubTree(
  items: TranscriptHubItem[],
  extraRecordings: RecordingHubItem[],
  sortKey: TranscriptSortKey,
): HubTreeNode[] {
  const byKey = new Map<string, TranscriptHubItem>();
  const sessionKindById = new Map<string, "session" | "cleanup">();
  const processorIds = new Set<string>();

  for (const item of items) {
    byKey.set(hubItemKey(item), item);
    if (item.kind === "session") sessionKindById.set(item.id, "session");
    if (item.kind === "cleanup") sessionKindById.set(item.id, "cleanup");
    if (item.kind === "processor") processorIds.add(item.id);
  }

  const childrenByParentKey = new Map<string, TranscriptHubItem[]>();
  const claimed = new Set<string>();

  const attach = (parentKey: string, child: TranscriptHubItem) => {
    const childKey = hubItemKey(child);
    if (claimed.has(childKey)) return;
    if (!byKey.has(parentKey)) return;
    const list = childrenByParentKey.get(parentKey) ?? [];
    list.push(child);
    childrenByParentKey.set(parentKey, list);
    claimed.add(childKey);
  };

  for (const recording of extraRecordings) {
    const parentKey = `${recording.parentKind}-${recording.sessionId}`;
    if (sessionKindById.has(recording.sessionId)) {
      attach(parentKey, recording);
    }
  }

  for (const item of items) {
    if (item.kind === "unsorted" && item.sessionId) {
      const kind = item.parentKind ?? sessionKindById.get(item.sessionId);
      if (kind) {
        attach(`${kind}-${item.sessionId}`, item);
      }
    }
  }

  for (const item of items) {
    if (
      (item.kind === "session" || item.kind === "cleanup") &&
      item.transcriptId &&
      processorIds.has(item.transcriptId)
    ) {
      attach(`processor-${item.transcriptId}`, item);
    }
  }

  const buildNode = (item: TranscriptHubItem): HubTreeNode => {
    const key = hubItemKey(item);
    const rawChildren = childrenByParentKey.get(key) ?? [];
    const childNodes = rawChildren.map((child) => buildNode(child));
    return { item, children: childNodes };
  };

  const roots: HubTreeNode[] = [];
  for (const item of items) {
    const key = hubItemKey(item);
    if (claimed.has(key)) continue;
    roots.push(buildNode(item));
  }

  for (const recording of extraRecordings) {
    const key = hubItemKey(recording);
    if (!claimed.has(key) && !sessionKindById.has(recording.sessionId)) {
      roots.push({ item: recording, children: [] });
    }
  }

  return sortTreeNodes(roots, sortKey);
}

export function flattenHubTree(nodes: HubTreeNode[]): TranscriptHubItem[] {
  const out: TranscriptHubItem[] = [];
  const walk = (list: HubTreeNode[]) => {
    for (const node of list) {
      out.push(node.item);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function countHubTreeNodes(nodes: HubTreeNode[]): number {
  return flattenHubTree(nodes).length;
}

export function filterHubTreeParents(
  nodes: HubTreeNode[],
  query: string,
): HubTreeNode[] {
  const q = query.trim();
  if (!q) return nodes;
  return nodes.filter((n) => hubItemMatchesQuery(n.item, q));
}

export function filterHubTree(
  nodes: HubTreeNode[],
  query: string,
): HubTreeNode[] {
  const q = query.trim();
  if (!q) return nodes;

  const filterNode = (node: HubTreeNode): HubTreeNode | null => {
    const children = node.children
      .map(filterNode)
      .filter((n): n is HubTreeNode => n != null);
    if (hubItemMatchesQuery(node.item, q) || children.length > 0) {
      return { ...node, children };
    }
    return null;
  };

  return nodes.map(filterNode).filter((n): n is HubTreeNode => n != null);
}
