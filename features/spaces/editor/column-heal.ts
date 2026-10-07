// features/spaces/editor/column-heal.ts — an emptied column leaves the layout at once (Notion).
//
// Select all in a column and delete: the column holds no block, draws zero high and can't take the
// caret; typing then nested a new column row inside it (round 27, D5). Notion removes a column the
// moment it is empty and merges what is left back: the other columns share its width, and a row left
// with one column melts into that column's blocks. columns.ts makes the same shape on save; this does
// it in the live editor, for this person's own edits only (a co-editor's change heals on their side —
// both healing one change would duplicate the merged blocks).

export interface HealBlock {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: HealBlock[];
}

export type HealOp =
  | { kind: "remove"; id: string }
  | { kind: "width"; id: string; width: number }
  /** Replace the row with these blocks (the one column left, melted; none = an empty line). */
  | { kind: "melt"; id: string; blocks: HealBlock[] };

const widthOf = (c: HealBlock, n: number) => {
  const w = Number(c.props?.width);
  return Number.isFinite(w) && w > 0 ? w : 1 / n;
};

/** What to change so no column is empty (an empty list = nothing to do). */
export function planColumnHeal(blocks: HealBlock[]): HealOp[] {
  const ops: HealOp[] = [];
  const walk = (list: HealBlock[]) => {
    for (const b of list) {
      if (b.type !== "columnList") {
        if (b.children?.length) walk(b.children);
        continue;
      }
      const cols = (b.children ?? []).filter((c) => c.type === "column");
      const left = cols.filter((c) => (c.children ?? []).length > 0);
      if (left.length === cols.length) {
        walk(cols);
        continue;
      }
      if (left.length >= 2) {
        for (const c of cols) if (!left.includes(c)) ops.push({ kind: "remove", id: c.id });
        const total = left.reduce((s, c) => s + widthOf(c, cols.length), 0) || 1;
        for (const c of left) ops.push({ kind: "width", id: c.id, width: widthOf(c, cols.length) / total });
        walk(left);
      } else {
        ops.push({ kind: "melt", id: b.id, blocks: left[0]?.children ?? [] });
      }
    }
  };
  walk(blocks);
  return ops;
}
