// features/spaces/editor/column-drop.ts — drag a block onto the left or right edge of another to make
// columns (Notion C16). The drop cursor turns into a vertical guide on that edge (BlockNote's
// `computeDropPosition` hook), and the drop is taken before ProseMirror's own move:
//   · a top-level block → it and the dragged block become a two-column list;
//   · a column's only block → a new column joins that list beside the column;
//   · a block sharing its column with others → the two become a column row inside that column;
//   · anywhere else, or away from an edge → BlockNote's ordinary move (a horizontal line).

import type { ComputeDropPositionContext } from "@blocknote/core/extensions";

import type { SpacesEditor } from "./schema";

type Side = "left" | "right";
export interface ColumnDrop {
  targetId: string;
  side: Side;
}
type Blockish = { id: string; type: string; props?: Record<string, unknown>; children?: Blockish[] };
type SpacesPartialBlock = Parameters<SpacesEditor["insertBlocks"]>[0][number];

/** The edge band of a block (px): inside its content, within this distance of the left / right edge. */
export function edgeBand(width: number): number {
  return Math.max(24, Math.min(72, width * 0.18));
}

/** Which edge of `rect` the pointer is on, if any. The gutter left of the block is the ordinary move. */
export function edgeSide(x: number, rect: { left: number; right: number }): Side | null {
  const band = edgeBand(rect.right - rect.left);
  if (x < rect.left || x > rect.right) return null;
  if (x <= rect.left + band) return "left";
  if (x >= rect.right - band) return "right";
  return null;
}

/** Widths after adding one column beside `at` in a list whose columns weigh `widths`. */
export function widthsWithNewColumn(widths: number[], at: number, side: Side): number[] {
  const n = widths.length;
  const total = widths.reduce((s, w) => s + w, 0) || 1;
  const scaled = widths.map((w) => (w / total) * (n / (n + 1)));
  const insertAt = side === "left" ? at : at + 1;
  return [...scaled.slice(0, insertAt), 1 / (n + 1), ...scaled.slice(insertAt)];
}

/**
 * The block arrangement a column drop produces, as a pure answer the editor then applies:
 * `replace` = put `with` where `targetId` is (top-level case); `columns` = rewrite the list.
 */
export function planColumnDrop(
  target: Blockish,
  parent: Blockish | undefined,
  grand: Blockish | undefined,
  dragged: Blockish[],
  side: Side,
): { kind: "wrap"; targetId: string; list: SpacesPartialBlock } | { kind: "addColumn"; listId: string; columns: SpacesPartialBlock[] } | null {
  if (!dragged.length || dragged.some((d) => d.id === target.id)) return null;
  if (target.type === "column" || target.type === "columnList" || target.type === "tab") return null;
  // A dragged column or column list keeps its ordinary above / below drop.
  if (dragged.some((d) => d.type === "column" || d.type === "columnList" || d.type === "tab")) return null;
  const strip = (b: Blockish): SpacesPartialBlock => ({ ...(b as object) }) as unknown as SpacesPartialBlock;
  const draggedIds = new Set(dragged.map((d) => d.id));
  // Beside a block that shares its column with others, the two become a column row inside that column
  // (Notion nests columns); beside a column's only block, the drop adds a column to the list instead.
  const sharesColumn = parent?.type === "column" && (parent.children ?? []).some((b) => b.id !== target.id && !draggedIds.has(b.id));
  if (!parent || sharesColumn) {
    const pair = side === "left" ? [dragged, [target]] : [[target], dragged];
    return {
      kind: "wrap",
      targetId: target.id,
      list: { type: "columnList", children: pair.map((blocks) => ({ type: "column", props: { width: 0.5 }, children: blocks.map(strip) })) } as unknown as SpacesPartialBlock,
    };
  }
  if (parent.type === "column" && grand?.type === "columnList") {
    const cols = grand.children ?? [];
    const at = cols.findIndex((c) => c.id === parent.id);
    if (at < 0) return null;
    const widths = widthsWithNewColumn(cols.map((c) => Number(c.props?.width ?? 1 / cols.length)), at, side);
    const kept = cols.map((c) => ({ ...c, children: (c.children ?? []).filter((b) => !draggedIds.has(b.id)) }));
    const fresh = { type: "column", children: dragged.map(strip) } as Blockish;
    const insertAt = side === "left" ? at : at + 1;
    const next = [...kept.slice(0, insertAt), fresh, ...kept.slice(insertAt)]
      .map((c, i) => ({ ...c, props: { ...(c.props ?? {}), width: widths[i] } }))
      // A column the drag emptied goes (Notion never leaves an empty column behind).
      .filter((c) => c === fresh || (c.children ?? []).length > 0);
    return { kind: "addColumn", listId: grand.id, columns: next.map((c) => (c.id ? (c as unknown as SpacesPartialBlock) : strip(c))) };
  }
  return null;
}

/**
 * Wires column drops into one editor. `hooks` goes to BlockNote's `dropCursor` option; `attach` adds
 * the drop handler (window capture — ahead of BlockNote's and ProseMirror's own drop) and returns its
 * cleanup.
 */
export function columnDropper() {
  let editor: SpacesEditor | null = null;
  let pending: ColumnDrop | null = null;

  const draggedBlocks = (ed: SpacesEditor): Blockish[] => {
    const sel = ed.getSelection()?.blocks as Blockish[] | undefined;
    if (sel?.length) return sel;
    try {
      return [ed.getTextCursorPosition().block as unknown as Blockish];
    } catch {
      return [];
    }
  };

  const containerPos = (ctx: ComputeDropPositionContext, id: string): number | null => {
    let found: number | null = null;
    ctx.view.state.doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.type.name === "blockContainer" && node.attrs.id === id) {
        found = pos;
        return false;
      }
      return true;
    });
    return found;
  };

  const computeDropPosition = (ctx: ComputeDropPositionContext) => {
    pending = null;
    const ed = ctx.editor as unknown as SpacesEditor;
    editor = ed;
    if (!ctx.view.dragging) return ctx.defaultPosition;
    const at = document.elementFromPoint(ctx.event.clientX, ctx.event.clientY);
    const outer = at?.closest?.(".spaces-editor .bn-block-outer[data-id]") as HTMLElement | null;
    const content = outer?.querySelector(":scope > .bn-block > .bn-block-content, :scope > .bn-block > .react-renderer > .bn-block-content") as HTMLElement | null;
    if (!outer || !content) return ctx.defaultPosition;
    const side = edgeSide(ctx.event.clientX, content.getBoundingClientRect());
    if (!side) return ctx.defaultPosition;
    const targetId = outer.getAttribute("data-id")!;
    const target = ed.getBlock(targetId) as unknown as Blockish | undefined;
    if (!target) return ctx.defaultPosition;
    const parent = ed.getParentBlock(targetId) as unknown as Blockish | undefined;
    const grand = parent ? (ed.getParentBlock(parent.id) as unknown as Blockish | undefined) : undefined;
    if (!planColumnDrop(target, parent, grand, draggedBlocks(ed), side)) return ctx.defaultPosition;
    const pos = containerPos(ctx, targetId);
    if (pos === null) return ctx.defaultPosition;
    pending = { targetId, side };
    return { pos, orientation: side === "left" ? ("block-vertical-left" as const) : ("block-vertical-right" as const) };
  };

  const onDrop = (event: DragEvent) => {
    const ed = editor;
    const drop = pending;
    pending = null;
    if (!ed || !drop || !ed.prosemirrorView?.dragging) return;
    const target = ed.getBlock(drop.targetId) as unknown as Blockish | undefined;
    if (!target) return;
    const parent = ed.getParentBlock(drop.targetId) as unknown as Blockish | undefined;
    const grand = parent ? (ed.getParentBlock(parent.id) as unknown as Blockish | undefined) : undefined;
    const dragged = draggedBlocks(ed);
    const plan = planColumnDrop(target, parent, grand, dragged, drop.side);
    if (!plan) return;
    event.preventDefault();
    event.stopPropagation();
    ed.prosemirrorView.dragging = null;
    ed.transact(() => {
      if (plan.kind === "wrap") {
        ed.removeBlocks(dragged.map((d) => d.id));
        ed.replaceBlocks([plan.targetId], [plan.list]);
      } else {
        const inList = new Set(((ed.getBlock(plan.listId) as unknown as Blockish | undefined)?.children ?? []).flatMap((c) => (c.children ?? []).map((b) => b.id)));
        const outside = dragged.filter((d) => !inList.has(d.id)).map((d) => d.id);
        if (outside.length) ed.removeBlocks(outside);
        ed.updateBlock(plan.listId, { type: "columnList", children: plan.columns } as never);
      }
    });
    // The drop cursor and the side menu's drag state end with the drag (dragend still fires).
  };

  return {
    hooks: { computeDropPosition },
    attach(): () => void {
      window.addEventListener("drop", onDrop, true);
      return () => window.removeEventListener("drop", onDrop, true);
    },
  };
}
