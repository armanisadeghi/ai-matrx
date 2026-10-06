// features/spaces/editor/columns.ts — column lists are always well formed.
//
// Runs on every page crossing the store boundary (convert.ts: stored → editor on load, editor → stored
// on save), so no snapshot carries a shape the database refuses, whatever made it (a drag, an importer,
// an older page, an engine normalisation):
//  - a block straight inside a column list gets a column of its own;
//  - a column list straight inside a column list joins its columns to the outer list;
//  - a column outside a column list, or a list left with fewer than two columns, melts into its blocks.
// A column list inside a COLUMN is valid (BLOCK-SCHEMA; the sample's ring row above its client table) and
// is kept; the editor itself never makes one (slash-insert.ts, column-drop.ts — Notion's behaviour).
// Widths are fractions summing to 1. New ids derive from the old ones, so two co-editors normalising
// the same page get identical trees.

import type { SpaceBlock } from "../contract";

const widthOf = (c: SpaceBlock, n: number): number => {
  const w = Number(c.props?.width);
  return Number.isFinite(w) && w > 0 ? w : 1 / n;
};

function withWidth(c: SpaceBlock, width: number): SpaceBlock {
  return { ...c, props: { ...(c.props ?? {}), width } };
}

/** A list's columns, well formed: stray blocks wrapped, lists in the list joined, widths summing to 1. */
function listColumns(kids: SpaceBlock[]): SpaceBlock[] {
  const cols: SpaceBlock[] = [];
  for (const k of kids) {
    if (k.type === "column") cols.push(withWidth({ ...k, children: normalizeColumns(k.children ?? []) }, widthOf(k, kids.length)));
    else if (k.type === "columnList") cols.push(...listColumns(k.children ?? []).map((c) => withWidth(c, widthOf(c, 1) / kids.length)));
    else cols.push({ id: `${k.id}-column`, type: "column", props: { width: 1 / kids.length }, children: normalizeColumns([k]) });
  }
  const total = cols.reduce((s, c) => s + widthOf(c, cols.length), 0) || 1;
  return cols.map((c) => withWidth(c, widthOf(c, cols.length) / total));
}

/** The tree with well-formed columns (see the file header). Valid trees come back equal. */
export function normalizeColumns(blocks: SpaceBlock[]): SpaceBlock[] {
  const out: SpaceBlock[] = [];
  for (const b of blocks) {
    if (b.type === "column") {
      // A column outside a column list.
      out.push(...normalizeColumns(b.children ?? []));
      continue;
    }
    if (b.type !== "columnList") {
      out.push(b.children ? { ...b, children: normalizeColumns(b.children) } : b);
      continue;
    }
    const cols = listColumns(b.children ?? []);
    if (cols.length >= 2) out.push({ ...b, children: cols });
    else out.push(...cols.flatMap((c) => c.children ?? []));
  }
  return out;
}

/** True when the tree needs no change — the common case, checked before copying anything. */
export function columnsAreWellFormed(blocks: SpaceBlock[], parent: string | null = null): boolean {
  for (const b of blocks) {
    const kids = b.children ?? [];
    if (b.type === "column" && parent !== "columnList") return false;
    if (b.type === "columnList" && (kids.length < 2 || kids.some((k) => k.type !== "column"))) return false;
    if (kids.length && !columnsAreWellFormed(kids, b.type)) return false;
  }
  return true;
}
