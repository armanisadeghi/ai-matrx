/**
 * Pure helpers over the canvas layout tree. Every function returns a new tree
 * and never mutates its input.
 */

import {
  CANVAS_MIN_SPLIT_FRACTION,
  type CanvasLayoutNode,
  type CanvasOrientation,
  type CanvasPaneId,
  type CanvasSplitId,
} from "./types";

export function listPaneIds(node: CanvasLayoutNode): CanvasPaneId[] {
  if (node.type === "pane") return [node.paneId];
  return node.children.flatMap(listPaneIds);
}

export function containsPane(node: CanvasLayoutNode, paneId: CanvasPaneId): boolean {
  if (node.type === "pane") return node.paneId === paneId;
  return node.children.some((child) => containsPane(child, paneId));
}

function evenSizes(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

/** Renormalizes to sum 1; falls back to even sizes for garbage input. */
export function normalizeSizes(sizes: readonly number[], count: number): number[] {
  if (sizes.length !== count || sizes.some((s) => !Number.isFinite(s) || s <= 0)) {
    return evenSizes(count);
  }
  const total = sizes.reduce((sum, s) => sum + s, 0);
  return sizes.map((s) => s / total);
}

/**
 * Places `newPaneId` beside `paneId`. When the pane's parent already splits in
 * the same orientation the new pane becomes a sibling (sharing the pane's
 * space); otherwise the pane is replaced by a new two-way split.
 */
export function splitPane(
  node: CanvasLayoutNode,
  paneId: CanvasPaneId,
  newPaneId: CanvasPaneId,
  orientation: CanvasOrientation,
  newSplitId: CanvasSplitId,
): CanvasLayoutNode {
  if (node.type === "pane") {
    if (node.paneId !== paneId) return node;
    return {
      type: "split",
      id: newSplitId,
      orientation,
      children: [node, { type: "pane", paneId: newPaneId }],
      sizes: [0.5, 0.5],
    };
  }
  const index = node.children.findIndex(
    (child) => child.type === "pane" && child.paneId === paneId,
  );
  if (index >= 0 && node.orientation === orientation) {
    const share = node.sizes[index] ?? 1 / node.children.length;
    const children = [...node.children];
    children.splice(index + 1, 0, { type: "pane", paneId: newPaneId });
    const sizes = [...node.sizes];
    sizes.splice(index, 1, share / 2, share / 2);
    return { ...node, children, sizes: normalizeSizes(sizes, children.length) };
  }
  return {
    ...node,
    children: node.children.map((child) =>
      splitPane(child, paneId, newPaneId, orientation, newSplitId),
    ),
  };
}

/**
 * Removes a pane. A split left with one child collapses into that child, and
 * the removed pane's space goes to its siblings proportionally. Returns null
 * when the tree held only that pane.
 */
export function removePane(
  node: CanvasLayoutNode,
  paneId: CanvasPaneId,
): CanvasLayoutNode | null {
  if (node.type === "pane") return node.paneId === paneId ? null : node;
  const children: CanvasLayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, i) => {
    const next = removePane(child, paneId);
    if (next) {
      children.push(next);
      sizes.push(node.sizes[i] ?? 1 / node.children.length);
    }
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0] ?? null;
  return { ...node, children, sizes: normalizeSizes(sizes, children.length) };
}

export function resizeSplit(
  node: CanvasLayoutNode,
  splitId: CanvasSplitId,
  sizes: readonly number[],
): CanvasLayoutNode {
  if (node.type === "pane") return node;
  if (node.id === splitId) {
    const clamped = sizes.map((s) => Math.max(CANVAS_MIN_SPLIT_FRACTION, s));
    return { ...node, sizes: normalizeSizes(clamped, node.children.length) };
  }
  return {
    ...node,
    children: node.children.map((child) => resizeSplit(child, splitId, sizes)),
  };
}

/** True when the tree is well formed against the set of known panes. */
export function isValidLayout(
  node: unknown,
  knownPanes: ReadonlySet<string>,
  seen: Set<string> = new Set(),
): node is CanvasLayoutNode {
  if (!node || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  if (n.type === "pane") {
    const id = n.paneId;
    if (typeof id !== "string" || !knownPanes.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }
  if (n.type !== "split") return false;
  if (typeof n.id !== "string") return false;
  if (n.orientation !== "horizontal" && n.orientation !== "vertical") return false;
  if (!Array.isArray(n.children) || n.children.length < 2) return false;
  if (!Array.isArray(n.sizes) || n.sizes.length !== n.children.length) return false;
  return n.children.every((child) => isValidLayout(child, knownPanes, seen));
}
