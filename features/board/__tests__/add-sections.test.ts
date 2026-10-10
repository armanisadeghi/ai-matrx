/**
 * EVERY ITEM TYPE DECLARES ITS ADD-MENU SECTION. A new type with no (or an unknown) section fails
 * here. (The nav no longer lists add rows — board-menu-items.test.ts; section order in the board's own
 * Add menu is held by add-menu-rows.test.ts.)
 */
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { BOARD_SECTIONS } from "../items/types";

describe("Add menu sections", () => {
  it("every registered type declares one known section", () => {
    const known = new Set<string>(BOARD_SECTIONS.map((s) => s.key));
    const bad = BOARD_ITEM_TYPES.filter((t) => !t.section || !known.has(t.section)).map((t) => t.key);
    expect(bad).toEqual([]);
  });
});
