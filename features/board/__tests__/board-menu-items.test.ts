/**
 * THE BOARD IS ONE ROW IN THE MENU; WHAT A BOARD HOLDS IS ADDED FROM ITS OWN ADD MENU.
 *
 * Arman, 2026-10-09 (follow-up to the Workspace menu): the 27 "add" rows under Board were clutter in
 * a home menu. So the nav carries no `/board?add=<key>` row at all, and every item type a person
 * can start or bring in has a row in the board's Add menu (`buildAddRows`, features/board/home).
 *
 * RED when: any `/board?add=` row comes back in the nav; Board stops being a single row to /board
 * (no children); or an item type loses its Add-menu row.
 */
import { primaryNavItems } from "@/features/shell/constants/nav-data";
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { startNewEntries } from "../items/types";
import { buildAddRows } from "../home/add-menu-rows";

type NavNode = { href?: string; label?: string; children?: readonly NavNode[] };

function everyNode(nodes: readonly NavNode[]): NavNode[] {
  return nodes.flatMap((n) => [n, ...everyNode(n.children ?? [])]);
}

describe("the Board is one row in the menu; its Add menu offers every item", () => {
  const workspace = primaryNavItems.find((item) => item.label === "Workspace") as unknown as NavNode;

  it("no nav row is a /board?add= row", () => {
    const addRows = everyNode(primaryNavItems as unknown as NavNode[]).filter((n) => n.href?.startsWith("/board?add="));
    expect(addRows.map((n) => n.href)).toEqual([]);
  });

  it("Board is a single Workspace row to /board with no children", () => {
    const board = (workspace.children ?? []).filter((n) => n.label === "Board");
    expect(board).toHaveLength(1);
    expect(board[0].href).toBe("/board");
    expect(board[0].children ?? []).toEqual([]);
  });

  it("every item type a person can start or bring in has a row in the board's Add menu", () => {
    const offered = BOARD_ITEM_TYPES.filter((t) => startNewEntries(t).length > 0 || t.bringIn).map((t) => t.key);
    const inAddMenu = new Set(buildAddRows(BOARD_ITEM_TYPES).flatMap((r) => (r.type ? [r.type.key] : [])));
    expect(offered.filter((k) => !inAddMenu.has(k))).toEqual([]);
  });
});
