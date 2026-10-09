/**
 * THE CATALOG — every item type a board supports, in Add-menu order.
 *
 * Imported ONLY inside the board's one lazy edge (the Board page's `*Impl`),
 * so every tile body here compiles as one piece behind one boundary (the
 * code-splitting FRAGMENTATION LAW) — never `dynamic()` a body.
 *
 * Adding a feature to every board = one entry in the matching file:
 *   work-items.tsx     chat · note · file
 *   document-items.tsx document (the /documents rich-text editor)
 *   feature-items.tsx  task · War Room · meeting · workflow run · research…
 *   scope-items.tsx    scope (one scope: its page body and its own surface)
 *   education-items.tsx flashcard deck · study kit (/education)
 *   meeting-items.tsx  meeting notes (one part of a meeting: transcript, decisions…)
 *   data-items.tsx     data table · data record (the record store, /data)
 *   list-items.tsx     pick list (/pick-lists — a Table of choices in the record store)
 *   content-items.tsx  web page · image · write-up · label
 *   social-items.tsx   social post · social profile · outlier feed · ad · swipe collection
 *   page-items.tsx     any page of the app, framed (until its feature is a native item)
 */

import type { NodeSource } from "../board/document";
import type { BoardItemType } from "./types";
import { WORK_ITEMS } from "./work-items";
import { FEATURE_ITEMS } from "./feature-items";
import { CONTENT_ITEMS } from "./content-items";
import { DATA_ITEMS } from "./data-items";
import { LIST_ITEMS } from "./list-items";
import { EDUCATION_ITEMS } from "./education-items";
import { SCOPE_ITEMS } from "./scope-items";
import { DOCUMENT_ITEMS } from "./document-items";
import { MEETING_ITEMS } from "./meeting-items";
import { PAGE_ITEMS } from "./page-items";
import { SOCIAL_ITEMS } from "./social-items";

export const BOARD_ITEM_TYPES: readonly BoardItemType[] = [...WORK_ITEMS, ...DOCUMENT_ITEMS, ...DATA_ITEMS, ...LIST_ITEMS, ...FEATURE_ITEMS, ...EDUCATION_ITEMS, ...SCOPE_ITEMS, ...MEETING_ITEMS, ...CONTENT_ITEMS, ...SOCIAL_ITEMS, ...PAGE_ITEMS];

export function itemTypeFor(source: NodeSource): BoardItemType | null {
  return BOARD_ITEM_TYPES.find((t) => t.matches(source)) ?? null;
}

export function itemTypeByKey(key: string): BoardItemType | null {
  return BOARD_ITEM_TYPES.find((t) => t.key === key) ?? null;
}
