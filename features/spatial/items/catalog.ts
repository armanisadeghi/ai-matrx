/**
 * THE CATALOG — every item type a board supports, in Add-menu order.
 *
 * Imported ONLY inside the board's one lazy edge (the Board page's `*Impl`),
 * so every tile body here compiles as one piece behind one boundary (the
 * code-splitting FRAGMENTATION LAW) — never `dynamic()` a body.
 *
 * Adding a feature to every board = one entry in the matching file:
 *   work-items.tsx     chat · note · file
 *   feature-items.tsx  task · War Room · meeting · workflow run · research…
 *   content-items.tsx  web page · image · write-up · label
 */

import type { NodeSource } from "../board/document";
import type { BoardItemType } from "./types";
import { WORK_ITEMS } from "./work-items";
import { FEATURE_ITEMS } from "./feature-items";
import { CONTENT_ITEMS } from "./content-items";

export const BOARD_ITEM_TYPES: readonly BoardItemType[] = [...WORK_ITEMS, ...FEATURE_ITEMS, ...CONTENT_ITEMS];

export function itemTypeFor(source: NodeSource): BoardItemType | null {
  return BOARD_ITEM_TYPES.find((t) => t.matches(source)) ?? null;
}

export function itemTypeByKey(key: string): BoardItemType | null {
  return BOARD_ITEM_TYPES.find((t) => t.key === key) ?? null;
}
