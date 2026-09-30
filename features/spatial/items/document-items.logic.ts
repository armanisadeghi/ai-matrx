/**
 * The pure half of the board's Document item (`document-items.tsx`): its key,
 * source shape, matching, the new-document placement, and the page it opens.
 * No React, no Supabase — unit-tested in `__tests__/document-items.logic.test.ts`.
 *
 * A Document is the `/documents` rich-text document (Univer, `udt_documents`),
 * not a spreadsheet (that is a Workbook). Saved sources:
 *   `{ kind: "entity", entity: "udt_document", id: documentId | null }` — the
 *     form every new tile gets (`id` null until the person presses Create);
 *   `{ kind: "document", documentId }` — an older shape `board/document.ts`
 *     still validates. It is rendered by this same item and rewritten to the
 *     entity form on first mount, so no tile ever shows "Unavailable".
 */

import type { NodeSource } from "../board/document";
import type { PlacedItem } from "./types";

/** The registry's key for a document (`entityRegistry` `udt_document`). */
export const DOCUMENT_ITEM_KEY = "udt_document";

/** The title a new document gets — the name `/documents` "New" gives it. */
export const NEW_DOCUMENT_NAME = "Untitled document";

export function documentSource(id: string | null): NodeSource {
  return { kind: "entity", entity: DOCUMENT_ITEM_KEY, id };
}

/** Does this saved source name a document (either shape)? */
export function matchesDocument(source: NodeSource): boolean {
  return (
    (source.kind === "entity" && source.entity === DOCUMENT_ITEM_KEY) ||
    source.kind === "document"
  );
}

/** The document's id, or null for a tile whose document is not created yet. */
export function documentIdOf(source: NodeSource): string | null {
  if (source.kind === "document") return source.documentId || null;
  if (source.kind === "entity" && source.entity === DOCUMENT_ITEM_KEY) return source.id;
  return null;
}

/** An older `{ kind: "document" }` source, in the form the board saves now; null when already current. */
export function currentDocumentSource(source: NodeSource): NodeSource | null {
  return source.kind === "document" && source.documentId ? documentSource(source.documentId) : null;
}

/**
 * "New document": placed at once, with no record. The tile creates the record
 * only when the person presses Create in it (never on mount — a reload or a
 * remount must not make a second document).
 */
export function newDocumentItem(): PlacedItem {
  return { title: NEW_DOCUMENT_NAME, source: documentSource(null) };
}

/** A picked document, placed under its own name. */
export function pickedDocumentItem(doc: { id: string; document_name: string | null }): PlacedItem {
  return { title: doc.document_name?.trim() || NEW_DOCUMENT_NAME, source: documentSource(doc.id) };
}

/** Where the tile's Open goes: the registry's door for `udt_document`. */
export function documentHref(source: NodeSource, door: (id: string) => string | null | undefined): string | null {
  const id = documentIdOf(source);
  return id ? (door(id) ?? null) : null;
}
