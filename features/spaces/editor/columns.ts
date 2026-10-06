// features/spaces/editor/columns.ts — columns are flat (Notion never puts columns inside a column).
//
// Runs on every page crossing the store boundary (convert.ts: stored → editor on load, editor → stored
// on save), so no snapshot can carry these shapes, whatever made them (a slash insert, a drag, an
// importer, an older page):
//  - a column list inside a column: its columns join the outer list where it sat; the column's blocks
//    above and below it stay in columns of their own (split around it, nothing dropped);
//  - a block straight inside a column list: it gets a column of its own;
//  - a column outside a column list, or a list left with one column: melts into its blocks.
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

/** One column split around the lists nested in it: [column | its blocks between lists], widths share its own. */
function splitColumn(column: SpaceBlock, width: number): SpaceBlock[] {
  const kids = column.children ?? [];
  if (!kids.some((k) => k.type === "columnList")) return [withWidth(column, width)];
  const parts: Array<{ blocks: SpaceBlock[] } | { list: SpaceBlock }> = [];
  let run: SpaceBlock[] = [];
  for (const k of kids) {
    if (k.type === "columnList") {
      if (run.length) parts.push({ blocks: run });
      run = [];
      parts.push({ list: k });
    } else run.push(k);
  }
  if (run.length) parts.push({ blocks: run });
  // Each part takes an equal share of the column's width; a nested list spreads its share over its columns.
  const share = width / parts.length;
  const out: SpaceBlock[] = [];
  let firstRun = true;
  parts.forEach((part, i) => {
    if ("blocks" in part) {
      const id = firstRun ? column.id : `${column.id}-${i}`;
      firstRun = false;
      out.push(withWidth({ ...column, id, children: part.blocks }, share));
      return;
    }
    const inner = part.list.children ?? [];
    const total = inner.reduce((s, c) => s + widthOf(c, inner.length), 0) || 1;
    for (const c of inner) out.push(withWidth(c, (share * widthOf(c, inner.length)) / total));
  });
  return out;
}

/** The column list's columns, flat: nested lists joined in, stray blocks wrapped, widths summing to 1. */
function flatColumns(list: SpaceBlock): SpaceBlock[] {
  const kids = list.children ?? [];
  const cols: SpaceBlock[] = [];
  for (const k of kids) {
    if (k.type === "column") cols.push(...splitColumn(k, widthOf(k, kids.length)));
    else if (k.type === "columnList") cols.push(...flatColumns(k).map((c) => withWidth(c, widthOf(c, 1) / kids.length)));
    else cols.push({ id: `${k.id}-column`, type: "column", props: { width: 1 / kids.length }, children: [k] });
  }
  const total = cols.reduce((s, c) => s + widthOf(c, cols.length), 0) || 1;
  return cols.map((c) => withWidth(c, widthOf(c, cols.length) / total));
}

/** The tree with flat columns (see the file header). Valid trees come back equal. */
export function normalizeColumns(blocks: SpaceBlock[]): SpaceBlock[] {
  const out: SpaceBlock[] = [];
  for (const b of blocks) {
    const children = b.children ? normalizeColumns(b.children) : undefined;
    const block = children ? { ...b, children } : b;
    if (b.type === "column") {
      // A column outside a column list.
      out.push(...(children ?? []));
      continue;
    }
    if (b.type !== "columnList") {
      out.push(block);
      continue;
    }
    // `children` above already melted every column here into blocks; work from the original columns.
    const cols = flatColumns({ ...b, children: (b.children ?? []).map((c) => (c.type === "column" ? { ...c, children: normalizeInColumn(c.children ?? []) } : c)) });
    if (cols.length >= 2) out.push({ ...b, children: cols });
    else out.push(...cols.flatMap((c) => c.children ?? []));
  }
  return out;
}

/** A column's blocks normalised, keeping a nested column list as a list (flatColumns joins it to the outer one). */
function normalizeInColumn(blocks: SpaceBlock[]): SpaceBlock[] {
  return blocks.map((b) => (b.type === "columnList" ? { ...b, children: flatColumns({ ...b, children: (b.children ?? []).map((c) => (c.type === "column" ? { ...c, children: normalizeInColumn(c.children ?? []) } : c)) }) } : { ...b, ...(b.children ? { children: normalizeColumns(b.children) } : {}) }));
}

/** True when the tree needs no change — the common case, checked before copying anything. */
export function columnsAreFlat(blocks: SpaceBlock[], parent: string | null = null): boolean {
  for (const b of blocks) {
    const kids = b.children ?? [];
    if (b.type === "column" && parent !== "columnList") return false;
    if (b.type === "columnList" && (parent === "column" || kids.length < 2 || kids.some((k) => k.type !== "column"))) return false;
    if (parent === "column" && b.type === "columnList") return false;
    if (kids.length && !columnsAreFlat(kids, b.type)) return false;
  }
  return true;
}
