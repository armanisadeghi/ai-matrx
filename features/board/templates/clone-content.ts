/**
 * USING A SAVED BOARD TEMPLATE gives the person INDEPENDENT content, the way a page template does
 * (`content.space_duplicate` deep-copies the sub-pages): the records the template's tiles hold as the person's own
 * content are cloned, each through its feature's own copy service, so editing the new board's note never edits the
 * template's. A plain "Duplicate board" does NOT go through here (it keeps pointing at the same records).
 *
 * THE RULING, per item type (2026-10-09):
 *   note                  CLONE   (copyNote)        the person's own writing
 *   document (udt_document, legacy {kind:"document"}) CLONE (copyDocument)  the person's own writing
 *   chat, agent form      FRESH   id -> null        a template's conversation is its author's; the copy starts its own
 *                                                   (same agent), exactly like a built-in template's chat tile
 *   write-up, label, web page, image-by-url        nothing to do: the content lives in the tile's own saved source
 *   file, image-by-file   KEEP    shared library item, meant to stay linked
 *   record / table, pick list, research, project, scope, flashcard deck, study kit, page  KEEP  existing library
 *                         records the board only points at
 *   task, war room, meeting (+ parts), workflow run  KEEP  one real piece of work with its own people, status and
 *                         history; a silent duplicate would create real work in someone's lists
 *   sticky note (a canvas shape)  its Note id is CLEARED, the words stay: the board's sticky sync files the copy's own
 *                         Note when the copy opens (never a Note shared by two boards, never an empty Note). A plain
 *                         "Duplicate board" clears it too (`detachStickyNotes`).
 * Tile ids are minted fresh and every line / bound arrow is re-pointed at them. A failed clone throws BEFORE any board is written.
 */

import type { BoardDocument, BoardNode, NodeSource } from "../board/document";
import type { BoardShape } from "../engine/shapes";

/**
 * A copy of a board must not share a sticky note's Note with the original (two boards editing one Note).
 * Clearing `note` keeps the words on the sticky; `startStickyNoteSync` creates the copy's own Note once the
 * copy opens, so there is no shared Note and no empty Note. Pure; returns `doc` itself when no sticky has one.
 */
export function detachStickyNotes(doc: BoardDocument): BoardDocument {
  if (!doc.shapes.some((s) => s.kind === "sticky" && s.note)) return doc;
  return {
    ...doc,
    shapes: doc.shapes.map((s): BoardShape => {
      if (s.kind !== "sticky" || !s.note) return s;
      const { note: _note, ...rest } = s;
      void _note;
      return rest;
    }),
  };
}

export interface CloneServices {
  /** An independent copy of the note; `label` is the copy's name. */
  copyNote(id: string): Promise<{ id: string; label?: string | null }>;
  /** An independent copy of the document (row + latest snapshot). */
  copyDocument(id: string): Promise<{ id: string; name?: string | null }>;
}

export const defaultCloneServices: CloneServices = {
  async copyNote(id) {
    const { copyNote } = await import("@/features/notes/service/notesService");
    const note = await copyNote(id);
    return { id: note.id, label: note.label };
  },
  async copyDocument(id) {
    const { copyDocument } = await import("@/features/documents/document-service");
    const res = await copyDocument(id);
    if (!res.success) throw new Error(res.error);
    return { id: res.data.id, name: res.data.document_name };
  },
};

type Kind = "note" | "document" | "fresh-conversation";

function cloneKind(source: NodeSource): { kind: Kind; id: string | null } | null {
  if (source.kind === "document") return { kind: "document", id: source.documentId || null };
  if (source.kind !== "entity") return null;
  if (source.entity === "note") return { kind: "note", id: source.id };
  if (source.entity === "udt_document") return { kind: "document", id: source.id };
  if (source.entity === "chat" || source.entity === "agent-form") return { kind: "fresh-conversation", id: source.id };
  return null;
}

/** The records a template use would clone (for tests and any "this copies N notes" wording). */
export function clonableRecords(doc: BoardDocument): Array<{ kind: "note" | "document"; id: string }> {
  const seen = new Set<string>();
  const out: Array<{ kind: "note" | "document"; id: string }> = [];
  for (const n of doc.nodes) {
    const c = cloneKind(n.source);
    if (!c || c.kind === "fresh-conversation" || !c.id || seen.has(`${c.kind}:${c.id}`)) continue;
    seen.add(`${c.kind}:${c.id}`);
    out.push({ kind: c.kind, id: c.id });
  }
  return out;
}

/** The document a template use stores: independent records, fresh tile ids, lines re-pointed. */
export async function cloneBoardContent(
  doc: BoardDocument,
  services: CloneServices = defaultCloneServices,
  newId: () => string = () => crypto.randomUUID(),
): Promise<BoardDocument> {
  // One clone per record, even when two tiles hold it (a board holds each record once, but be exact).
  const clones = new Map<string, Promise<string>>();
  const cloneOnce = (kind: "note" | "document", id: string): Promise<string> => {
    const key = `${kind}:${id}`;
    let p = clones.get(key);
    if (!p) {
      p = kind === "note" ? services.copyNote(id).then((r) => r.id) : services.copyDocument(id).then((r) => r.id);
      clones.set(key, p);
    }
    return p;
  };

  const idMap = new Map<string, string>();
  const nodes: BoardNode[] = await Promise.all(
    doc.nodes.map(async (node) => {
      const id = newId();
      idMap.set(node.id, id);
      const c = cloneKind(node.source);
      const { basics: _basics, ...rest } = node;
      void _basics;
      if (!c) return { ...rest, id };
      if (c.kind === "fresh-conversation") {
        const source = node.source as Extract<NodeSource, { kind: "entity" }>;
        return { ...rest, id, source: { ...source, id: null } };
      }
      if (!c.id) return { ...rest, id };
      const cloned = await cloneOnce(c.kind, c.id);
      const source: NodeSource =
        node.source.kind === "document" ? { kind: "document", documentId: cloned } : { ...(node.source as Extract<NodeSource, { kind: "entity" }>), id: cloned };
      return { ...rest, id, source };
    }),
  );

  const groups = doc.groups.map((g) => ({ ...g, id: newId() }));
  const edges = doc.edges.flatMap((e) => {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    return from && to ? [{ ...e, id: newId(), from, to }] : [];
  });
  // Shapes get fresh ids too, and a connector's bound ends follow the NEW ids (tiles and shapes alike).
  for (const s of doc.shapes) idMap.set(s.id, newId());
  const shapes = detachStickyNotes({ ...doc, shapes: doc.shapes }).shapes.map((s): BoardShape => {
    const { bind, ...rest } = s;
    const start = bind?.start ? idMap.get(bind.start) : undefined;
    const end = bind?.end ? idMap.get(bind.end) : undefined;
    return { ...rest, id: idMap.get(s.id)!, ...(start || end ? { bind: { ...(start ? { start } : {}), ...(end ? { end } : {}) } } : {}) };
  });
  return { ...doc, nodes, groups, edges, shapes };
}
