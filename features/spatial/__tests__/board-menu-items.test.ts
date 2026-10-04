/**
 * THE BOARD MENU OFFERS EVERY ITEM A BOARD SUPPORTS (owner: "show all of the supported features as
 * suboptions… just get started on them immediately"). The menu row for each type is
 * `/board?add=<item key>`; UserBoard starts that type. This fails when a type is added to the
 * catalog without a menu row, or a menu row names a key the board no longer has.
 */
import { primaryNavItems } from "@/features/shell/constants/nav-data";
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { startNewEntries } from "../items/types";

function menuAddKeys(): string[] {
  const keys: string[] = [];
  const walk = (nodes: readonly { href?: string; children?: readonly unknown[] }[]) => {
    for (const n of nodes) {
      const m = n.href?.match(/^\/board\?add=([^&]+)$/);
      if (m) keys.push(decodeURIComponent(m[1]));
      if (n.children) walk(n.children as { href?: string; children?: readonly unknown[] }[]);
    }
  };
  walk(primaryNavItems as unknown as { href?: string; children?: readonly unknown[] }[]);
  return keys;
}

describe("the Board menu offers every item a board supports", () => {
  const offered = BOARD_ITEM_TYPES.filter((t) => startNewEntries(t).length > 0 || t.bringIn).map((t) => t.key);
  const inMenu = menuAddKeys();

  it("every item type a person can start or bring in has a menu row", () => {
    expect(offered.filter((k) => !inMenu.includes(k))).toEqual([]);
  });

  it("every menu row names an item type the board has", () => {
    expect(inMenu.filter((k) => !offered.includes(k))).toEqual([]);
  });

  it("no item type is listed twice", () => {
    expect(inMenu.length).toBe(new Set(inMenu).size);
  });
});
