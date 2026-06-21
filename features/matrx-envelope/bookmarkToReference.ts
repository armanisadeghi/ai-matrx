/**
 * Bookmark → reference mapping.
 *
 * A bookmark IS a reference item (docs/protocol/MATRX_REFERENCES.md): the UI's
 * `input_table` / `input_list` bookmarks carry the exact identity ids + display
 * hints of a canonical reference item, under a bookmark-spelled `type`
 * discriminator. This module is the single seam that converts a bookmark into a
 * `{ matrx_version, kind:"reference", type, items }` envelope so the SAME live
 * `ReferenceRenderer` (chips that resolve from Supabase + open the entity) is
 * reused — no parallel renderer.
 *
 * Mirrors the backend `BOOKMARK_TYPE_TO_REFERENCE` map 1:1.
 */

import type {
  FullTableBookmark,
  TableColumnBookmark,
  TableRowBookmark,
  TableCellBookmark,
  FullListBookmark,
  ListGroupBookmark,
  ListItemBookmark,
} from "@/types/python-generated/stream-events";
import {
  MATRX_VERSION,
  type MatrxEnvelope,
  type ReferenceItem,
  type ReferenceType,
} from "@/features/matrx-envelope/envelope";
import { buildReferenceFence } from "@/features/matrx-envelope/referenceFence";

export type AnyBookmark =
  | FullTableBookmark
  | TableColumnBookmark
  | TableRowBookmark
  | TableCellBookmark
  | FullListBookmark
  | ListGroupBookmark
  | ListItemBookmark;

/** Bookmark `type` → reference `type` (mirror of backend BOOKMARK_TYPE_TO_REFERENCE). */
const BOOKMARK_TYPE_TO_REFERENCE: Record<string, ReferenceType> = {
  full_table: "table",
  table_schema: "table_schema",
  table_column: "table_column",
  table_row: "table_row",
  table_cell: "table_cell",
  full_list: "picklist",
  list_group: "picklist_group",
  list_item: "picklist_item",
};

/**
 * Convert one bookmark to `{ type, item }`. The item is the bookmark MINUS its
 * `type` discriminator — every remaining field (identity ids + display hints) is
 * already the canonical flat reference item. Returns `null` for an unknown type.
 */
export function bookmarkToReference(
  bookmark: unknown,
): { type: ReferenceType; item: ReferenceItem } | null {
  if (!bookmark || typeof bookmark !== "object") return null;
  const bmType = (bookmark as { type?: unknown }).type;
  if (typeof bmType !== "string") return null;
  const refType = BOOKMARK_TYPE_TO_REFERENCE[bmType];
  if (!refType) return null;
  const { type: _drop, ...item } = bookmark as Record<string, unknown>;
  return { type: refType, item: item as unknown as ReferenceItem };
}

/**
 * Group a bookmark list into one canonical `reference` envelope per reference
 * type (so a table carrying both columns + cells renders as two chip strips).
 */
export function bookmarksToReferenceEnvelopes(
  bookmarks: unknown,
): MatrxEnvelope<ReferenceItem>[] {
  if (!Array.isArray(bookmarks)) return [];
  const byType = new Map<ReferenceType, ReferenceItem[]>();
  for (const b of bookmarks) {
    const mapped = bookmarkToReference(b);
    if (!mapped) continue;
    const arr = byType.get(mapped.type) ?? [];
    arr.push(mapped.item);
    byType.set(mapped.type, arr);
  }
  return [...byType.entries()].map(([type, items]) => ({
    matrx_version: MATRX_VERSION,
    kind: "reference",
    type,
    items,
  }));
}

/**
 * Build the canonical ```matrx``` reference fence(s) for one or more bookmarks —
 * the single correct artifact to copy to the clipboard or show in a "copy this"
 * textarea. Pasted into chat it resolves to a live reference chip; pasted
 * anywhere else it is still self-describing canonical JSON.
 *
 * NEVER hand-roll `JSON.stringify(bookmark)` for a user-facing copy: a bare
 * bookmark object is NOT recognized by the chat envelope splitter and is the
 * exact legacy mistake this seam exists to kill. Always route through here.
 *
 * Returns one fence per distinct reference type (joined by a blank line), or an
 * empty string if nothing maps.
 */
export function buildBookmarkReferenceFence(bookmarks: unknown): string {
  const list = Array.isArray(bookmarks) ? bookmarks : [bookmarks];
  return bookmarksToReferenceEnvelopes(list)
    .map((env) => buildReferenceFence({ type: env.type, items: env.items }))
    .join("\n\n");
}
