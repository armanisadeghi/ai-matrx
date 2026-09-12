import type { LucideIcon } from "lucide-react";
import type { SettingsBadge } from "../types";

/**
 * A node in the settings hierarchy.
 * - Has children: renders as a category (expandable on desktop, push-nav on mobile)
 * - No children: renders as a leaf (clicking activates the tab)
 */
export type SettingsTreeNode = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Short summary shown under the label in mobile drawer and tree hover. */
  description?: string;
  /** When provided, the node is a category with sub-nodes. */
  children?: SettingsTreeNode[];
  /** Inline badge: built-in variants from SettingsBadge, or the special "unsaved" string for a dot indicator. */
  badge?: SettingsBadge | "unsaved";
  /** Disabled leaves/categories can't be activated/expanded. */
  disabled?: boolean;
  /** Free-text keywords searched alongside label/description. */
  searchKeywords?: string[];
};

/** Flatten the tree into an array of every leaf node. */
export function flattenLeaves(nodes: SettingsTreeNode[]): SettingsTreeNode[] {
  const out: SettingsTreeNode[] = [];
  const walk = (arr: SettingsTreeNode[]) => {
    for (const n of arr) {
      if (n.children && n.children.length > 0) walk(n.children);
      else out.push(n);
    }
  };
  walk(nodes);
  return out;
}

/** Returns the ancestor id path for a target node id (excluding the target itself). */
export function findAncestorPath(
  nodes: SettingsTreeNode[],
  targetId: string,
): string[] {
  const path: string[] = [];
  const visit = (arr: SettingsTreeNode[], trail: string[]): boolean => {
    for (const n of arr) {
      if (n.id === targetId) {
        path.push(...trail);
        return true;
      }
      if (n.children && visit(n.children, [...trail, n.id])) return true;
    }
    return false;
  };
  visit(nodes, []);
  return path;
}

/**
 * Build the mobile drawer stack for an externally selected setting.
 *
 * Deep links activate a leaf before the drawer mounts. The drawer must start
 * on that leaf, including every ancestor screen, rather than discarding the
 * active id and showing its root list.
 */
export function getDrawerPathForActiveId(
  nodes: SettingsTreeNode[],
  activeId: string | null,
): string[] {
  if (!activeId || !findNodeById(nodes, activeId)) return [];
  return [...findAncestorPath(nodes, activeId), activeId];
}

/** Find a single node by id anywhere in the tree. */
export function findNodeById(
  nodes: SettingsTreeNode[],
  id: string,
): SettingsTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Returns an array of [id, matchScore] pairs ranked by relevance.
 * Matches label (highest), keywords, description. Case-insensitive.
 */
export function searchTree(
  nodes: SettingsTreeNode[],
  query: string,
): Set<string> {
  const matches = new Set<string>();
  const q = query.trim().toLowerCase();
  if (!q) return matches;
  const walk = (arr: SettingsTreeNode[]) => {
    for (const n of arr) {
      const haystack = [
        n.label,
        n.description ?? "",
        ...(n.searchKeywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) matches.add(n.id);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return matches;
}

/**
 * Given a set of matching node ids, returns a set of every id that should be
 * visible — matching ids plus all their ancestors — so that the tree can keep
 * path structure when filtering.
 */
export function withAncestors(
  nodes: SettingsTreeNode[],
  ids: Set<string>,
): Set<string> {
  const visible = new Set(ids);
  for (const id of ids) {
    for (const anc of findAncestorPath(nodes, id)) visible.add(anc);
  }
  return visible;
}
